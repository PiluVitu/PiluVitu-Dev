package votacao

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	_ "modernc.org/sqlite"
)

// ErrNotFound is returned when a row does not exist.
var ErrNotFound = errors.New("votacao: not found")

// Store wraps a SQLite database with the votacao schema.
// Methods are safe for concurrent use.
type Store struct {
	db *sql.DB
}

// NewStore opens (or creates) a SQLite database at path and applies
// the embedded schema idempotently. Foreign keys are enabled and
// journal mode is WAL.
func NewStore(path string) (*Store, error) {
	dsn := fmt.Sprintf("file:%s?_pragma=foreign_keys(1)&_pragma=journal_mode(wal)&_pragma=busy_timeout(5000)", path)
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("votacao: open db: %w", err)
	}
	if err := db.Ping(); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("votacao: ping db: %w", err)
	}
	if _, err := db.Exec(schemaSQL); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("votacao: apply schema: %w", err)
	}
	if err := migrate(db); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("votacao: migrate: %w", err)
	}
	return &Store{db: db}, nil
}

// migrate brings pre-existing databases up to the current schema. It is
// idempotent: on a fresh DB (already correct shape) every step is a no-op.
func migrate(db *sql.DB) error {
	if err := migrateVotesUnique(db); err != nil {
		return err
	}
	return migrateAddColumn(db, "voting_sessions", "winner_method", "TEXT")
}

// migrateVotesUnique rebuilds the votes table when it still carries the legacy
// UNIQUE(session_id,user_id) (single-vote) instead of the approval-voting
// UNIQUE(session_id,user_id,movie_id).
func migrateVotesUnique(db *sql.DB) error {
	legacy, err := hasTwoColVotesUnique(db)
	if err != nil {
		return err
	}
	if !legacy {
		return nil
	}

	// The standard SQLite "rebuild table" recipe requires foreign keys to be
	// OFF for the duration of the rebuild: the new table's FK references would
	// otherwise be checked against the in-flight copy. PRAGMA foreign_keys is a
	// no-op inside a transaction and is connection-scoped, so pin a single
	// connection, toggle FKs off there, run the rebuild, then turn them back on.
	ctx := context.Background()
	conn, err := db.Conn(ctx)
	if err != nil {
		return err
	}
	defer conn.Close()

	if _, err := conn.ExecContext(ctx, `PRAGMA foreign_keys=OFF`); err != nil {
		return err
	}
	defer func() { _, _ = conn.ExecContext(ctx, `PRAGMA foreign_keys=ON`) }()

	tx, err := conn.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck
	stmts := []string{
		`CREATE TABLE votes_new (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			session_id INTEGER NOT NULL REFERENCES voting_sessions(id) ON DELETE CASCADE,
			user_id INTEGER NOT NULL REFERENCES users(id),
			movie_id INTEGER NOT NULL REFERENCES session_movies(id),
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			UNIQUE (session_id, user_id, movie_id)
		)`,
		`INSERT OR IGNORE INTO votes_new (id, session_id, user_id, movie_id, created_at)
			SELECT id, session_id, user_id, movie_id, created_at FROM votes`,
		`DROP TABLE votes`,
		`ALTER TABLE votes_new RENAME TO votes`,
		`CREATE INDEX IF NOT EXISTS idx_votes_session ON votes(session_id)`,
	}
	for _, s := range stmts {
		if _, err := tx.ExecContext(ctx, s); err != nil {
			return fmt.Errorf("rebuild votes: %w", err)
		}
	}
	return tx.Commit()
}

// hasTwoColVotesUnique reports whether votes has a UNIQUE index spanning exactly
// (session_id, user_id) — the legacy single-vote constraint.
func hasTwoColVotesUnique(db *sql.DB) (bool, error) {
	rows, err := db.Query(`PRAGMA index_list('votes')`)
	if err != nil {
		return false, err
	}
	defer rows.Close()
	type idx struct {
		name   string
		unique int
	}
	var uniques []idx
	for rows.Next() {
		var seq int
		var name string
		var unique int
		var origin string
		var partial int
		if err := rows.Scan(&seq, &name, &unique, &origin, &partial); err != nil {
			return false, err
		}
		if unique == 1 {
			uniques = append(uniques, idx{name: name})
		}
	}
	if err := rows.Err(); err != nil {
		return false, err
	}
	for _, u := range uniques {
		cols, err := indexColumns(db, u.name)
		if err != nil {
			return false, err
		}
		if len(cols) == 2 && cols[0] == "session_id" && cols[1] == "user_id" {
			return true, nil
		}
	}
	return false, nil
}

func indexColumns(db *sql.DB, name string) ([]string, error) {
	rows, err := db.Query(fmt.Sprintf("PRAGMA index_info(%q)", name))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var cols []string
	for rows.Next() {
		var seqno, cid int
		var col sql.NullString
		if err := rows.Scan(&seqno, &cid, &col); err != nil {
			return nil, err
		}
		cols = append(cols, col.String)
	}
	return cols, rows.Err()
}

// migrateAddColumn adds a column if absent (idempotent ALTER).
func migrateAddColumn(db *sql.DB, table, column, decl string) error {
	rows, err := db.Query(fmt.Sprintf("PRAGMA table_info(%q)", table))
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var cid int
		var name string
		var ctype string
		var notnull int
		var dflt sql.NullString
		var pk int
		if err := rows.Scan(&cid, &name, &ctype, &notnull, &dflt, &pk); err != nil {
			return err
		}
		if name == column {
			return nil // already present
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	_, err = db.Exec(fmt.Sprintf("ALTER TABLE %q ADD COLUMN %s %s", table, column, decl))
	return err
}

// Close releases the underlying database connection.
func (s *Store) Close() error {
	return s.db.Close()
}

// DB returns the underlying *sql.DB. Intended for tests and
// for code that needs raw access (e.g. health checks).
func (s *Store) DB() *sql.DB {
	return s.db
}
