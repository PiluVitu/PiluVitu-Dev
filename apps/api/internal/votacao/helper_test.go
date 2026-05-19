package votacao_test

import (
	"path/filepath"
	"testing"

	"github.com/PiluVitu/api/internal/votacao"
)

func newTestStore(t *testing.T) *votacao.Store {
	t.Helper()
	path := filepath.Join(t.TempDir(), "test.db")
	s, err := votacao.NewStore(path)
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	t.Cleanup(func() { _ = s.Close() })
	return s
}
