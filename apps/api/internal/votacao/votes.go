package votacao

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"
)

// ErrAlreadyVoted is returned by InsertVote when the user already voted in this session.
var ErrAlreadyVoted = errors.New("votacao: already voted")

type Vote struct {
	ID        int64
	SessionID int64
	UserID    int64
	MovieID   int64
	CreatedAt time.Time
}

func (s *Store) InsertVote(ctx context.Context, sessionID, userID, movieID int64) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO votes (session_id, user_id, movie_id) VALUES (?, ?, ?)
	`, sessionID, userID, movieID)
	if err != nil {
		if isUniqueViolation(err) {
			return ErrAlreadyVoted
		}
		return fmt.Errorf("votacao: insert vote: %w", err)
	}
	return nil
}

func (s *Store) ListVotesBySession(ctx context.Context, sessionID int64) ([]Vote, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, session_id, user_id, movie_id, created_at
		FROM votes
		WHERE session_id = ?
		ORDER BY created_at ASC
	`, sessionID)
	if err != nil {
		return nil, fmt.Errorf("votacao: list votes: %w", err)
	}
	defer rows.Close()

	out := make([]Vote, 0)
	for rows.Next() {
		var v Vote
		if err := rows.Scan(&v.ID, &v.SessionID, &v.UserID, &v.MovieID, &v.CreatedAt); err != nil {
			return nil, fmt.Errorf("votacao: scan vote: %w", err)
		}
		out = append(out, v)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("votacao: rows votes: %w", err)
	}
	return out, nil
}

// isUniqueViolation matches modernc.org/sqlite UNIQUE constraint errors.
// We fall back to string matching to avoid coupling to the driver's internal types.
func isUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	return strings.Contains(err.Error(), "UNIQUE constraint failed")
}
