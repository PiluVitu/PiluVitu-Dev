// Package distribution republica artigos e posta chamadas sociais, com estado em SQLite.
package distribution

import (
	"context"
	"database/sql"
	_ "embed"
	"time"
)

// Kind separa republicação de artigo de chamada social.
type Kind string

const (
	KindArticle Kind = "article_crosspost"
	KindSocial  Kind = "social_hook"
)

// Target é uma linha de distribuição (um destino de um post).
type Target struct {
	Slug      string `json:"slug"`
	Platform  string `json:"platform"`
	Kind      Kind   `json:"kind"`
	Content   string `json:"content"`
	Status    string `json:"status"` // pending | posted | failed | skipped
	RemoteURL string `json:"remote_url"`
	Error     string `json:"error"`
}

//go:embed schema.sql
var schema string

// Store persiste targets de distribuição em SQLite.
type Store struct{ db *sql.DB }

// NewStore aplica o schema idempotentemente e devolve o Store.
func NewStore(db *sql.DB) (*Store, error) {
	if _, err := db.Exec(schema); err != nil {
		return nil, err
	}
	return &Store{db: db}, nil
}

// statusOr devolve "pending" quando s está em branco.
func statusOr(s string) string {
	if s == "" {
		return "pending"
	}
	return s
}

// Upsert insere ou atualiza por (slug, platform).
// Preserva o status 'posted': um upsert não rebaixa uma linha já publicada.
func (s *Store) Upsert(ctx context.Context, t Target) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO distribution_targets (slug, platform, kind, content, status)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(slug, platform) DO UPDATE SET
			content = excluded.content,
			kind    = excluded.kind,
			status  = CASE WHEN distribution_targets.status='posted' THEN 'posted' ELSE excluded.status END`,
		t.Slug, t.Platform, string(t.Kind), t.Content, statusOr(t.Status))
	return err
}

// ListBySlug retorna todos os targets de um artigo, ordenados por kind e platform.
func (s *Store) ListBySlug(ctx context.Context, slug string) ([]Target, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT slug, platform, kind, content, status, remote_url, error
		FROM distribution_targets WHERE slug = ? ORDER BY kind, platform`, slug)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Target
	for rows.Next() {
		var t Target
		var kind string
		if err := rows.Scan(&t.Slug, &t.Platform, &kind, &t.Content, &t.Status, &t.RemoteURL, &t.Error); err != nil {
			return nil, err
		}
		t.Kind = Kind(kind)
		out = append(out, t)
	}
	return out, rows.Err()
}

// Get retorna um target específico por (slug, platform).
func (s *Store) Get(ctx context.Context, slug, platform string) (*Target, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT slug, platform, kind, content, status, remote_url, error
		FROM distribution_targets WHERE slug = ? AND platform = ?`, slug, platform)
	var t Target
	var kind string
	if err := row.Scan(&t.Slug, &t.Platform, &kind, &t.Content, &t.Status, &t.RemoteURL, &t.Error); err != nil {
		return nil, err
	}
	t.Kind = Kind(kind)
	return &t, nil
}

// MarkPosted marca um target como publicado, gravando o URL remoto e o horário.
func (s *Store) MarkPosted(ctx context.Context, slug, platform, remoteURL string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE distribution_targets SET status='posted', remote_url=?, error='', posted_at=?
		WHERE slug=? AND platform=?`, remoteURL, time.Now().UTC().Format(time.RFC3339), slug, platform)
	return err
}

// MarkFailed marca um target como falho, gravando a mensagem de erro.
func (s *Store) MarkFailed(ctx context.Context, slug, platform, errMsg string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE distribution_targets SET status='failed', error=? WHERE slug=? AND platform=?`,
		errMsg, slug, platform)
	return err
}
