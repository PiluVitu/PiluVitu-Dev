package votacao

import (
	"context"
	"database/sql"
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
		if isVotesUniqueViolation(err) {
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

// VoteDetail is one vote enriched with the voter and the chosen movie, for the
// admin "who voted for what" view.
type VoteDetail struct {
	UserID     int64
	UserName   string
	UserEmail  string
	MovieID    int64
	MovieTitle string
	Category   string
	CreatedAt  time.Time
}

// ListSessionVotesWithUsers returns every vote in the session joined with the
// voter and the movie they picked, oldest first. Admin-only at the HTTP layer.
func (s *Store) ListSessionVotesWithUsers(ctx context.Context, sessionID int64) ([]VoteDetail, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT u.id, u.name, u.email, m.id, m.title, m.category, v.created_at
		FROM votes v
		JOIN users u ON u.id = v.user_id
		JOIN session_movies m ON m.id = v.movie_id
		WHERE v.session_id = ?
		ORDER BY v.created_at ASC
	`, sessionID)
	if err != nil {
		return nil, fmt.Errorf("votacao: list session votes: %w", err)
	}
	defer rows.Close()

	out := make([]VoteDetail, 0)
	for rows.Next() {
		var d VoteDetail
		if err := rows.Scan(&d.UserID, &d.UserName, &d.UserEmail, &d.MovieID, &d.MovieTitle, &d.Category, &d.CreatedAt); err != nil {
			return nil, fmt.Errorf("votacao: scan vote detail: %w", err)
		}
		out = append(out, d)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("votacao: rows vote detail: %w", err)
	}
	return out, nil
}

// GetUserVote returns the movie the user voted for in the session. voted is
// false (and movieID 0) when the user has not voted yet.
func (s *Store) GetUserVote(ctx context.Context, sessionID, userID int64) (movieID int64, voted bool, err error) {
	err = s.db.QueryRowContext(ctx,
		`SELECT movie_id FROM votes WHERE session_id=? AND user_id=?`,
		sessionID, userID,
	).Scan(&movieID)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, false, nil
	}
	if err != nil {
		return 0, false, err
	}
	return movieID, true, nil
}

// HasVoted returns true if the user has already voted in the session.
func (s *Store) HasVoted(ctx context.Context, sessionID, userID int64) (bool, error) {
	var exists int
	err := s.db.QueryRowContext(ctx,
		`SELECT EXISTS(SELECT 1 FROM votes WHERE session_id=? AND user_id=?)`,
		sessionID, userID,
	).Scan(&exists)
	if err != nil {
		return false, err
	}
	return exists == 1, nil
}

// isVotesUniqueViolation matches the specific UNIQUE constraint on (session_id, user_id)
// in the votes table. We match the SQLite error string rather than coupling to the
// modernc driver's internal error type. If schema.sql adds another UNIQUE to the votes
// table later, that one will NOT trigger ErrAlreadyVoted (it falls through to a wrapped error).
func isVotesUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "UNIQUE constraint failed") &&
		strings.Contains(msg, "votes.session_id") &&
		strings.Contains(msg, "votes.user_id")
}
