package votacao

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"
)

type User struct {
	ID        int64
	GoogleSub string
	Email     string
	Name      string
	Picture   string
	IsAdmin   bool
	CreatedAt time.Time
}

// UpsertUser inserts a user by google_sub or updates email/name/picture/is_admin if it exists.
// adminEmails (case-insensitive) determines IsAdmin.
func (s *Store) UpsertUser(ctx context.Context, sub, email, name, picture string, adminEmails []string) (*User, error) {
	isAdmin := isInAdminList(email, adminEmails)
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO users (google_sub, email, name, picture, is_admin)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(google_sub) DO UPDATE SET
			email    = excluded.email,
			name     = excluded.name,
			picture  = excluded.picture,
			is_admin = excluded.is_admin
	`, sub, email, name, nullableStr(picture), boolToInt(isAdmin))
	if err != nil {
		return nil, err
	}
	return s.GetUserByGoogleSub(ctx, sub)
}

func (s *Store) GetUserByGoogleSub(ctx context.Context, sub string) (*User, error) {
	return scanUser(s.db.QueryRowContext(ctx, userSelect+`WHERE google_sub = ?`, sub))
}

func (s *Store) GetUserByID(ctx context.Context, id int64) (*User, error) {
	return scanUser(s.db.QueryRowContext(ctx, userSelect+`WHERE id = ?`, id))
}

const userSelect = `
	SELECT id, google_sub, email, name, picture, is_admin, created_at
	FROM users
`

func scanUser(row *sql.Row) (*User, error) {
	var u User
	var picture sql.NullString
	var isAdminInt int
	err := row.Scan(&u.ID, &u.GoogleSub, &u.Email, &u.Name, &picture, &isAdminInt, &u.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	u.Picture = picture.String
	u.IsAdmin = isAdminInt == 1
	return &u, nil
}

func isInAdminList(email string, admins []string) bool {
	target := strings.ToLower(strings.TrimSpace(email))
	for _, a := range admins {
		if strings.ToLower(strings.TrimSpace(a)) == target {
			return true
		}
	}
	return false
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

func nullableStr(s string) any {
	if s == "" {
		return nil
	}
	return s
}
