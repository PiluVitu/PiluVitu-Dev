package votacao_test

import (
	"database/sql"
	"path/filepath"
	"testing"

	"github.com/PiluVitu/api/internal/votacao"
	_ "modernc.org/sqlite"
)

func TestNewStore_CreatesAllTables(t *testing.T) {
	s := newTestStore(t)
	expected := []string{"users", "voting_sessions", "session_movies", "votes", "backups"}
	for _, table := range expected {
		var name string
		err := s.DB().QueryRow(
			`SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
			table,
		).Scan(&name)
		if err != nil {
			t.Errorf("table %q not created: %v", table, err)
		}
	}
}

func TestNewStore_ForeignKeysEnabled(t *testing.T) {
	s := newTestStore(t)
	var on int
	if err := s.DB().QueryRow(`PRAGMA foreign_keys`).Scan(&on); err != nil {
		t.Fatal(err)
	}
	if on != 1 {
		t.Errorf("foreign_keys = %d, want 1", on)
	}
}

func TestNewStore_Idempotent(t *testing.T) {
	path := filepath.Join(t.TempDir(), "x.db")
	s1, err := votacao.NewStore(path)
	if err != nil {
		t.Fatalf("first open: %v", err)
	}
	_ = s1.Close()

	s2, err := votacao.NewStore(path)
	if err != nil {
		t.Fatalf("second open: %v", err)
	}
	defer s2.Close()
}

func TestNewStore_FailsOnInvalidPath(t *testing.T) {
	_, err := votacao.NewStore("/nonexistent-dir/x.db")
	if err == nil {
		t.Error("expected error for invalid path")
	}
}

func TestMigrateRebuildsLegacyVotesUnique(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "legacy.db")

	// Simulate a legacy DB: votes with the OLD UNIQUE(session_id,user_id).
	raw, err := sql.Open("sqlite", "file:"+path)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	_, err = raw.Exec(`
		CREATE TABLE users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			google_sub TEXT NOT NULL UNIQUE,
			email TEXT NOT NULL,
			name TEXT NOT NULL,
			picture TEXT,
			is_admin INTEGER NOT NULL DEFAULT 0,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		);
		CREATE TABLE voting_sessions (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			title TEXT NOT NULL,
			status TEXT NOT NULL CHECK (status IN ('open','closed')),
			created_by INTEGER NOT NULL REFERENCES users(id),
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			closed_at DATETIME,
			winner_movie_id INTEGER,
			sort_options_json TEXT NOT NULL DEFAULT '{}'
		);
		CREATE TABLE session_movies (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			session_id INTEGER NOT NULL REFERENCES voting_sessions(id) ON DELETE CASCADE,
			category TEXT NOT NULL,
			title TEXT NOT NULL,
			type TEXT NOT NULL CHECK (type IN ('filme','serie')),
			poster_url TEXT,
			tmdb_id INTEGER,
			was_watched INTEGER NOT NULL DEFAULT 0,
			sheet_number INTEGER,
			UNIQUE (session_id, category)
		);
		CREATE TABLE votes (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			session_id INTEGER NOT NULL,
			user_id INTEGER NOT NULL,
			movie_id INTEGER NOT NULL,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			UNIQUE (session_id, user_id)
		);
		INSERT INTO users (id, google_sub, email, name) VALUES (1, 'sub-1', 'a@x.com', 'A');
		INSERT INTO voting_sessions (id, title, status, created_by) VALUES (1, 'X', 'open', 1);
		INSERT INTO session_movies (id, session_id, category, title, type) VALUES (10, 1, 'a', 'M10', 'filme');
		INSERT INTO session_movies (id, session_id, category, title, type) VALUES (11, 1, 'b', 'M11', 'filme');
		INSERT INTO votes (session_id, user_id, movie_id) VALUES (1, 1, 10);
	`)
	if err != nil {
		t.Fatalf("seed legacy: %v", err)
	}
	_ = raw.Close()

	// Opening via NewStore must migrate the table so a second movie for the
	// same (session,user) is now allowed (approval voting).
	s, err := votacao.NewStore(path)
	if err != nil {
		t.Fatalf("NewStore (migrate): %v", err)
	}
	defer s.Close()

	if _, err := s.DB().Exec(`INSERT INTO votes (session_id, user_id, movie_id) VALUES (1, 1, 11)`); err != nil {
		t.Fatalf("expected second approval to be allowed after migrate, got: %v", err)
	}
	// The original row must survive.
	var n int
	if err := s.DB().QueryRow(`SELECT COUNT(*) FROM votes WHERE session_id=1 AND user_id=1`).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 2 {
		t.Fatalf("expected 2 votes preserved+added, got %d", n)
	}
}
