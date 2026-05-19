package votacao

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

type Backup struct {
	ID            int64
	DriveFileID   string
	DriveFileName string
	SizeBytes     int64
	TriggerType   string // "cron" | "manual" | "session_close"
	CreatedAt     time.Time
}

func (s *Store) InsertBackup(ctx context.Context, fileID, fileName string, sizeBytes int64, trigger string) (*Backup, error) {
	res, err := s.db.ExecContext(ctx, `
		INSERT INTO backups (drive_file_id, drive_file_name, size_bytes, trigger_type)
		VALUES (?, ?, ?, ?)
	`, fileID, fileName, sizeBytes, trigger)
	if err != nil {
		return nil, fmt.Errorf("votacao: insert backup: %w", err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return nil, fmt.Errorf("votacao: insert backup last id: %w", err)
	}
	return s.getBackup(ctx, id)
}

func (s *Store) getBackup(ctx context.Context, id int64) (*Backup, error) {
	var b Backup
	err := s.db.QueryRowContext(ctx, `
		SELECT id, drive_file_id, drive_file_name, size_bytes, trigger_type, created_at
		FROM backups WHERE id = ?
	`, id).Scan(&b.ID, &b.DriveFileID, &b.DriveFileName, &b.SizeBytes, &b.TriggerType, &b.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("votacao: get backup: %w", err)
	}
	return &b, nil
}

func (s *Store) ListBackups(ctx context.Context, limit int) ([]Backup, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, drive_file_id, drive_file_name, size_bytes, trigger_type, created_at
		FROM backups
		ORDER BY created_at DESC, id DESC
		LIMIT ?
	`, limit)
	if err != nil {
		return nil, fmt.Errorf("votacao: list backups: %w", err)
	}
	defer rows.Close()

	out := make([]Backup, 0)
	for rows.Next() {
		var b Backup
		if err := rows.Scan(&b.ID, &b.DriveFileID, &b.DriveFileName, &b.SizeBytes, &b.TriggerType, &b.CreatedAt); err != nil {
			return nil, fmt.Errorf("votacao: scan backup: %w", err)
		}
		out = append(out, b)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("votacao: rows backups: %w", err)
	}
	return out, nil
}
