package votacao

import (
	"context"
	"errors"
	"fmt"
	"time"
)

// ErrMovieNotInSession is returned by ReplaceUserVotes when a movie_id does not
// belong to the target session.
var ErrMovieNotInSession = errors.New("votacao: movie not in session")

type Vote struct {
	ID        int64
	SessionID int64
	UserID    int64
	MovieID   int64
	CreatedAt time.Time
}

// ReplaceUserVotes sets the user's approvals for a session to exactly movieIDs
// (transactional: delete all then insert the new set). An empty/nil set clears
// the user's votes. Every movieID must belong to the session.
func (s *Store) ReplaceUserVotes(ctx context.Context, sessionID, userID int64, movieIDs []int64) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("votacao: begin replace votes: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck

	for _, mid := range movieIDs {
		var ok int
		if err := tx.QueryRowContext(ctx,
			`SELECT EXISTS(SELECT 1 FROM session_movies WHERE id=? AND session_id=?)`,
			mid, sessionID,
		).Scan(&ok); err != nil {
			return fmt.Errorf("votacao: validate movie: %w", err)
		}
		if ok == 0 {
			return ErrMovieNotInSession
		}
	}

	if _, err := tx.ExecContext(ctx,
		`DELETE FROM votes WHERE session_id=? AND user_id=?`, sessionID, userID,
	); err != nil {
		return fmt.Errorf("votacao: clear votes: %w", err)
	}
	for _, mid := range movieIDs {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO votes (session_id, user_id, movie_id) VALUES (?, ?, ?)`,
			sessionID, userID, mid,
		); err != nil {
			return fmt.Errorf("votacao: insert vote: %w", err)
		}
	}
	return tx.Commit()
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

// GetUserVotes returns the movie_ids the user approved in the session (asc),
// or an empty slice when they have not voted.
func (s *Store) GetUserVotes(ctx context.Context, sessionID, userID int64) ([]int64, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT movie_id FROM votes WHERE session_id=? AND user_id=? ORDER BY movie_id ASC`,
		sessionID, userID,
	)
	if err != nil {
		return nil, fmt.Errorf("votacao: get user votes: %w", err)
	}
	defer rows.Close()
	out := make([]int64, 0)
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

// CountVoters returns the number of distinct users who voted in the session.
func (s *Store) CountVoters(ctx context.Context, sessionID int64) (int, error) {
	var n int
	err := s.db.QueryRowContext(ctx,
		`SELECT COUNT(DISTINCT user_id) FROM votes WHERE session_id=?`, sessionID,
	).Scan(&n)
	return n, err
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
