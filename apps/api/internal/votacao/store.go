package votacao

import (
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
	return &Store{db: db}, nil
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
