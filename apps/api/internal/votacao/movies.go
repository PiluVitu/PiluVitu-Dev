package votacao

import (
	"context"
	"database/sql"
	"fmt"
)

type SessionMovie struct {
	ID          int64
	SessionID   int64
	Category    string
	Title       string
	Type        string // "filme" | "serie"
	PosterURL   string
	TMDbID      *int64
	WasWatched  bool
	SheetNumber *int64
}

// InsertSessionMovies inserts movies in a single transaction.
// Returns error if any row violates a constraint (e.g. duplicate category in same session).
func (s *Store) InsertSessionMovies(ctx context.Context, movies []SessionMovie) error {
	if len(movies) == 0 {
		return nil
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("votacao: begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	stmt, err := tx.PrepareContext(ctx, `
		INSERT INTO session_movies (session_id, category, title, type, poster_url, tmdb_id, was_watched, sheet_number)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		return fmt.Errorf("votacao: prepare insert movie: %w", err)
	}
	defer stmt.Close()

	for _, m := range movies {
		if _, err := stmt.ExecContext(ctx,
			m.SessionID,
			m.Category,
			m.Title,
			m.Type,
			nullableStr(m.PosterURL),
			nullableInt64(m.TMDbID),
			boolToInt(m.WasWatched),
			nullableInt64(m.SheetNumber),
		); err != nil {
			return fmt.Errorf("votacao: insert movie: %w", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("votacao: commit movies: %w", err)
	}
	return nil
}

func (s *Store) GetSessionMovies(ctx context.Context, sessionID int64) ([]SessionMovie, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, session_id, category, title, type, poster_url, tmdb_id, was_watched, sheet_number
		FROM session_movies
		WHERE session_id = ?
		ORDER BY id ASC
	`, sessionID)
	if err != nil {
		return nil, fmt.Errorf("votacao: list session movies: %w", err)
	}
	defer rows.Close()

	out := make([]SessionMovie, 0)
	for rows.Next() {
		var m SessionMovie
		var poster sql.NullString
		var tmdbID sql.NullInt64
		var sheetNum sql.NullInt64
		var watched int
		if err := rows.Scan(&m.ID, &m.SessionID, &m.Category, &m.Title, &m.Type, &poster, &tmdbID, &watched, &sheetNum); err != nil {
			return nil, fmt.Errorf("votacao: scan movie: %w", err)
		}
		m.PosterURL = poster.String
		if tmdbID.Valid {
			v := tmdbID.Int64
			m.TMDbID = &v
		}
		if sheetNum.Valid {
			v := sheetNum.Int64
			m.SheetNumber = &v
		}
		m.WasWatched = watched == 1
		out = append(out, m)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("votacao: rows movies: %w", err)
	}
	return out, nil
}

func nullableInt64(p *int64) any {
	if p == nil {
		return nil
	}
	return *p
}
