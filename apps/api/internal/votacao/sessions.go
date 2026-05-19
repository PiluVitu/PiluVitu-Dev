package votacao

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

type VotingSession struct {
	ID              int64
	Title           string
	Status          string // "open" | "closed"
	CreatedBy       int64
	CreatedAt       time.Time
	ClosedAt        *time.Time
	WinnerMovieID   *int64
	SortOptionsJSON string
}

func (s *Store) CreateVotingSession(ctx context.Context, title string, createdBy int64, sortOptionsJSON string) (*VotingSession, error) {
	if sortOptionsJSON == "" {
		sortOptionsJSON = "{}"
	}
	res, err := s.db.ExecContext(ctx, `
		INSERT INTO voting_sessions (title, status, created_by, sort_options_json)
		VALUES (?, 'open', ?, ?)
	`, title, createdBy, sortOptionsJSON)
	if err != nil {
		return nil, fmt.Errorf("votacao: create voting session: %w", err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return nil, fmt.Errorf("votacao: create voting session last id: %w", err)
	}
	return s.GetVotingSession(ctx, id)
}

func (s *Store) GetVotingSession(ctx context.Context, id int64) (*VotingSession, error) {
	return scanVotingSession(s.db.QueryRowContext(ctx, votingSessionSelect+`WHERE id = ?`, id))
}

func (s *Store) ListVotingSessions(ctx context.Context, limit, offset int) ([]VotingSession, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	rows, err := s.db.QueryContext(ctx, votingSessionSelect+`ORDER BY id DESC LIMIT ? OFFSET ?`, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("votacao: list voting sessions: %w", err)
	}
	defer rows.Close()

	out := make([]VotingSession, 0, limit)
	for rows.Next() {
		v, err := scanVotingSessionRow(rows)
		if err != nil {
			return nil, fmt.Errorf("votacao: list voting sessions: %w", err)
		}
		out = append(out, *v)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("votacao: list voting sessions rows: %w", err)
	}
	return out, nil
}

// CloseVotingSession sets status='closed', timestamps closed_at, and optionally records winner_movie_id.
// Returns ErrNotFound if the session does not exist or is already closed.
func (s *Store) CloseVotingSession(ctx context.Context, id int64, winnerMovieID *int64) error {
	var (
		res sql.Result
		err error
	)
	if winnerMovieID != nil {
		res, err = s.db.ExecContext(ctx, `
			UPDATE voting_sessions
			SET status='closed', closed_at=CURRENT_TIMESTAMP, winner_movie_id=?
			WHERE id=? AND status='open'
		`, *winnerMovieID, id)
	} else {
		res, err = s.db.ExecContext(ctx, `
			UPDATE voting_sessions
			SET status='closed', closed_at=CURRENT_TIMESTAMP
			WHERE id=? AND status='open'
		`, id)
	}
	if err != nil {
		return fmt.Errorf("votacao: close voting session: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("votacao: close voting session rows affected: %w", err)
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

const votingSessionSelect = `
	SELECT id, title, status, created_by, created_at, closed_at, winner_movie_id, sort_options_json
	FROM voting_sessions
`

type rowScanner interface {
	Scan(dest ...any) error
}

func scanVotingSession(row *sql.Row) (*VotingSession, error) {
	v, err := scanVotingSessionRow(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("votacao: scan voting session: %w", err)
	}
	return v, nil
}

func scanVotingSessionRow(r rowScanner) (*VotingSession, error) {
	var v VotingSession
	var closedAt sql.NullTime
	var winnerID sql.NullInt64
	if err := r.Scan(&v.ID, &v.Title, &v.Status, &v.CreatedBy, &v.CreatedAt, &closedAt, &winnerID, &v.SortOptionsJSON); err != nil {
		return nil, err
	}
	if closedAt.Valid {
		t := closedAt.Time
		v.ClosedAt = &t
	}
	if winnerID.Valid {
		id := winnerID.Int64
		v.WinnerMovieID = &id
	}
	return &v, nil
}
