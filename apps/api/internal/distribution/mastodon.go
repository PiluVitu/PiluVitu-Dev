package distribution

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"
)

// Mastodon posta chamadas sociais numa instância Mastodon via REST API.
type Mastodon struct {
	instance string
	token    string
	http     *http.Client
}

// NewMastodon cria um adapter Mastodon para a instância e token fornecidos.
func NewMastodon(instanceURL, token string) *Mastodon {
	return &Mastodon{
		instance: strings.TrimRight(instanceURL, "/"),
		token:    token,
		http:     &http.Client{Timeout: 30 * time.Second},
	}
}

func (m *Mastodon) Platform() string { return "mastodon" }
func (m *Mastodon) Kind() Kind       { return KindSocial }

// Publish posta um status no Mastodon. Rejeita textos > 500 runes.
// Retorna a URL pública do toot.
func (m *Mastodon) Publish(ctx context.Context, p Payload) (string, error) {
	if utf8.RuneCountInString(p.Text) > 500 {
		return "", fmt.Errorf("mastodon: texto excede 500 caracteres")
	}
	buf, _ := json.Marshal(map[string]string{"status": p.Text})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, m.instance+"/api/v1/statuses", bytes.NewReader(buf))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+m.token)
	res, err := m.http.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(res.Body, 4096))
		return "", fmt.Errorf("mastodon: status %d: %s", res.StatusCode, bytes.TrimSpace(body))
	}
	var out struct {
		URL string `json:"url"`
	}
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		return "", err
	}
	return out.URL, nil
}
