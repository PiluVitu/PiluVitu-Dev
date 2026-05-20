package backup

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/PiluVitu/api/internal/gdrive"
	"github.com/PiluVitu/api/internal/votacao"
)

// Runner ties the SQLite store, the Drive uploader, and the config knobs
// (folder ID, retention count) together.
type Runner struct {
	Store    *votacao.Store
	Uploader gdrive.Uploader
	FolderID string
	Keep     int
}

// Run does VACUUM INTO + Upload + INSERT backups + Rotate. The trigger label
// is one of "cron", "manual", "session_close".
func (r *Runner) Run(ctx context.Context, trigger string) error {
	if r.Uploader == nil || r.Store == nil || r.FolderID == "" {
		return fmt.Errorf("backup: runner not fully configured")
	}
	snapPath := filepath.Join(os.TempDir(), fmt.Sprintf("votacao-snapshot-%d.db", time.Now().UnixNano()))
	defer os.Remove(snapPath)

	if _, err := r.Store.DB().ExecContext(ctx, "VACUUM INTO ?", snapPath); err != nil {
		return fmt.Errorf("backup: vacuum into: %w", err)
	}

	f, err := os.Open(snapPath)
	if err != nil {
		return fmt.Errorf("backup: open snapshot: %w", err)
	}
	defer f.Close()

	name := fmt.Sprintf("votacao-%s-%s.db", time.Now().UTC().Format("2006-01-02-150405"), trigger)
	fileID, size, err := r.Uploader.Upload(ctx, r.FolderID, name, f)
	if err != nil {
		return fmt.Errorf("backup: upload: %w", err)
	}

	if _, err := r.Store.InsertBackup(ctx, fileID, name, size, trigger); err != nil {
		return fmt.Errorf("backup: insert row: %w", err)
	}

	if r.Keep > 0 {
		if err := r.Uploader.Rotate(ctx, r.FolderID, r.Keep); err != nil {
			return fmt.Errorf("backup: rotate: %w", err)
		}
	}
	return nil
}
