package backup_test

import (
	"context"
	"errors"
	"io"
	"path/filepath"
	"sync/atomic"
	"testing"

	"github.com/PiluVitu/api/internal/backup"
	"github.com/PiluVitu/api/internal/votacao"
)

type fakeUploader struct {
	uploadCalls int32
	rotateCalls int32
	wantFolder  string
	uploadErr   error
	rotateErr   error
	keepSeen    int
}

func (f *fakeUploader) Upload(ctx context.Context, folder, name string, body io.Reader) (string, int64, error) {
	atomic.AddInt32(&f.uploadCalls, 1)
	if f.wantFolder != "" && folder != f.wantFolder {
		return "", 0, errors.New("wrong folder")
	}
	if f.uploadErr != nil {
		return "", 0, f.uploadErr
	}
	// Drain body to avoid reader leak.
	_, _ = io.Copy(io.Discard, body)
	return "fake-id", 1234, nil
}

func (f *fakeUploader) Rotate(ctx context.Context, folder string, keep int) error {
	atomic.AddInt32(&f.rotateCalls, 1)
	f.keepSeen = keep
	return f.rotateErr
}

func newStore(t *testing.T) *votacao.Store {
	t.Helper()
	s, err := votacao.NewStore(filepath.Join(t.TempDir(), "x.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.Close() })
	return s
}

func TestRun_HappyPath(t *testing.T) {
	store := newStore(t)
	u := &fakeUploader{wantFolder: "fid"}
	r := &backup.Runner{Store: store, Uploader: u, FolderID: "fid", Keep: 5}
	if err := r.Run(context.Background(), "manual"); err != nil {
		t.Fatal(err)
	}
	if atomic.LoadInt32(&u.uploadCalls) != 1 {
		t.Errorf("upload calls = %d", u.uploadCalls)
	}
	if atomic.LoadInt32(&u.rotateCalls) != 1 {
		t.Errorf("rotate calls = %d", u.rotateCalls)
	}
	if u.keepSeen != 5 {
		t.Errorf("keep = %d", u.keepSeen)
	}
	rows, err := store.ListBackups(context.Background(), 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || rows[0].TriggerType != "manual" || rows[0].SizeBytes != 1234 {
		t.Errorf("backups row = %+v", rows)
	}
}

func TestRun_NoRotateWhenKeepZero(t *testing.T) {
	store := newStore(t)
	u := &fakeUploader{}
	r := &backup.Runner{Store: store, Uploader: u, FolderID: "fid", Keep: 0}
	if err := r.Run(context.Background(), "cron"); err != nil {
		t.Fatal(err)
	}
	if u.rotateCalls != 0 {
		t.Errorf("rotate should not be called when keep=0")
	}
}

func TestRun_MissingDeps(t *testing.T) {
	r := &backup.Runner{}
	if err := r.Run(context.Background(), "manual"); err == nil {
		t.Error("expected error on missing deps")
	}
}

func TestRun_UploadError(t *testing.T) {
	store := newStore(t)
	u := &fakeUploader{uploadErr: errors.New("net down")}
	r := &backup.Runner{Store: store, Uploader: u, FolderID: "fid", Keep: 5}
	if err := r.Run(context.Background(), "cron"); err == nil {
		t.Error("expected upload error to propagate")
	}
}
