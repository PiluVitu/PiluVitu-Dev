package admin_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/PiluVitu/api/internal/handlers/admin"
	"github.com/PiluVitu/api/internal/votacao"
)

type stubRunner struct {
	err     error
	calls   int
	trigger string
}

func (s *stubRunner) Run(ctx context.Context, trigger string) error {
	s.calls++
	s.trigger = trigger
	return s.err
}

func newStore(t *testing.T) *votacao.Store {
	t.Helper()
	s, _ := votacao.NewStore(filepath.Join(t.TempDir(), "x.db"))
	t.Cleanup(func() { _ = s.Close() })
	return s
}

func TestCreateBackup_HappyPath(t *testing.T) {
	store := newStore(t)
	runner := &stubRunner{}
	h := admin.NewHandlers(admin.Deps{Store: store, Runner: runner})
	rec := httptest.NewRecorder()
	h.CreateBackup(rec, httptest.NewRequest(http.MethodPost, "/admin/backup", nil))
	if rec.Code != http.StatusOK {
		t.Errorf("status = %d", rec.Code)
	}
	if runner.calls != 1 || runner.trigger != "manual" {
		t.Errorf("runner = %+v", runner)
	}
}

func TestCreateBackup_RunnerDisabled(t *testing.T) {
	store := newStore(t)
	h := admin.NewHandlers(admin.Deps{Store: store})
	rec := httptest.NewRecorder()
	h.CreateBackup(rec, httptest.NewRequest(http.MethodPost, "/admin/backup", nil))
	if rec.Code != http.StatusServiceUnavailable {
		t.Errorf("status = %d", rec.Code)
	}
}

func TestCreateBackup_RunnerError(t *testing.T) {
	store := newStore(t)
	runner := &stubRunner{err: errors.New("boom")}
	h := admin.NewHandlers(admin.Deps{Store: store, Runner: runner})
	rec := httptest.NewRecorder()
	h.CreateBackup(rec, httptest.NewRequest(http.MethodPost, "/admin/backup", nil))
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("status = %d", rec.Code)
	}
}

func TestListBackups_Empty(t *testing.T) {
	store := newStore(t)
	h := admin.NewHandlers(admin.Deps{Store: store})
	rec := httptest.NewRecorder()
	h.ListBackups(rec, httptest.NewRequest(http.MethodGet, "/admin/backups", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	var out struct {
		Data struct {
			Backups []votacao.Backup `json:"backups"`
		} `json:"data"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	if len(out.Data.Backups) != 0 {
		t.Errorf("got %d", len(out.Data.Backups))
	}
}

func TestListBackups_PopulatedAfterInsert(t *testing.T) {
	store := newStore(t)
	_, _ = store.InsertBackup(context.Background(), "fid", "n.db", 100, "cron")
	h := admin.NewHandlers(admin.Deps{Store: store})
	rec := httptest.NewRecorder()
	h.ListBackups(rec, httptest.NewRequest(http.MethodGet, "/admin/backups", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	var out struct {
		Data struct {
			Backups []votacao.Backup `json:"backups"`
		} `json:"data"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	if len(out.Data.Backups) != 1 || out.Data.Backups[0].TriggerType != "cron" {
		t.Errorf("backups = %+v", out.Data.Backups)
	}
}
