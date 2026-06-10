package distribution

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"
)

// Bluesky posta chamadas sociais no Bluesky via AT Protocol.
type Bluesky struct {
	base     string
	handle   string
	password string
	http     *http.Client
}

// NewBluesky cria um adapter Bluesky com o handle e app password fornecidos.
func NewBluesky(handle, appPassword string) *Bluesky {
	return &Bluesky{
		base:     "https://bsky.social",
		handle:   handle,
		password: appPassword,
		http:     &http.Client{Timeout: 30 * time.Second},
	}
}

func (b *Bluesky) Platform() string { return "bluesky" }
func (b *Bluesky) Kind() Kind       { return KindSocial }

// Publish posta um toot no Bluesky. Rejeita textos > 300 runes.
// Retorna https://bsky.app/profile/<handle>/post/<rkey>.
func (b *Bluesky) Publish(ctx context.Context, p Payload) (string, error) {
	if utf8.RuneCountInString(p.Text) > 300 {
		return "", fmt.Errorf("bluesky: texto excede 300 caracteres")
	}
	// 1) Criar sessão: recebe accessJwt + did
	var sess struct {
		AccessJwt string `json:"accessJwt"`
		Did       string `json:"did"`
	}
	if err := b.post(ctx, "/xrpc/com.atproto.server.createSession", "",
		map[string]string{"identifier": b.handle, "password": b.password}, &sess); err != nil {
		return "", err
	}
	// 2) Criar record: recebe uri at://...
	var rec struct {
		URI string `json:"uri"`
	}
	record := map[string]any{
		"$type":     "app.bsky.feed.post",
		"text":      p.Text,
		"createdAt": time.Now().UTC().Format(time.RFC3339),
	}
	if err := b.post(ctx, "/xrpc/com.atproto.repo.createRecord", sess.AccessJwt,
		map[string]any{"repo": sess.Did, "collection": "app.bsky.feed.post", "record": record}, &rec); err != nil {
		return "", err
	}
	rkey := rec.URI[strings.LastIndex(rec.URI, "/")+1:]
	return fmt.Sprintf("https://bsky.app/profile/%s/post/%s", b.handle, rkey), nil
}

func (b *Bluesky) post(ctx context.Context, path, bearer string, body any, out any) error {
	buf, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, b.base+path, bytes.NewReader(buf))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	res, err := b.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return fmt.Errorf("bluesky: %s status %d", path, res.StatusCode)
	}
	return json.NewDecoder(res.Body).Decode(out)
}
