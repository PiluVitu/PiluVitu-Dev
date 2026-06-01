package votacao

import (
	"context"
	"fmt"
	"time"
)

// TiebreakRecord is one audit row for a roulette draw.
type TiebreakRecord struct {
	ID            int64
	SessionID     int64
	TriggeredBy   int64
	TiedIDsJSON   string
	ClientEntropy string
	ServerNonce   string
	WinnerMovieID int64
	CreatedAt     time.Time
}

// CreateTiebreak persists a roulette draw for auditability.
func (s *Store) CreateTiebreak(ctx context.Context, t TiebreakRecord) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO tiebreaks
			(session_id, triggered_by, tied_ids_json, client_entropy, server_nonce, winner_movie_id)
		VALUES (?, ?, ?, ?, ?, ?)
	`, t.SessionID, t.TriggeredBy, t.TiedIDsJSON, t.ClientEntropy, t.ServerNonce, t.WinnerMovieID)
	if err != nil {
		return fmt.Errorf("votacao: insert tiebreak: %w", err)
	}
	return nil
}

// GetTiebreakBySession returns the most recent tiebreak for the session, if any.
func (s *Store) GetTiebreakBySession(ctx context.Context, sessionID int64) (*TiebreakRecord, error) {
	var t TiebreakRecord
	err := s.db.QueryRowContext(ctx, `
		SELECT id, session_id, triggered_by, tied_ids_json, client_entropy, server_nonce, winner_movie_id, created_at
		FROM tiebreaks WHERE session_id=? ORDER BY created_at DESC LIMIT 1
	`, sessionID).Scan(&t.ID, &t.SessionID, &t.TriggeredBy, &t.TiedIDsJSON, &t.ClientEntropy, &t.ServerNonce, &t.WinnerMovieID, &t.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

// SetSessionWinner records the winner and the method ('votes' | 'roulette')
// on an already-closed session.
func (s *Store) SetSessionWinner(ctx context.Context, sessionID, winnerMovieID int64, method string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE voting_sessions SET winner_movie_id=?, winner_method=? WHERE id=?
	`, winnerMovieID, method, sessionID)
	if err != nil {
		return fmt.Errorf("votacao: set session winner: %w", err)
	}
	return nil
}
