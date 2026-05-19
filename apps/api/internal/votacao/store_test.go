package votacao_test

import (
	"path/filepath"
	"testing"

	"github.com/PiluVitu/api/internal/votacao"
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
