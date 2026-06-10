package distribution

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// DevTo publica artigos no dev.to via REST API.
type DevTo struct {
	base   string
	apiKey string
	http   *http.Client
}

// NewDevTo cria um adapter dev.to com a API key fornecida.
func NewDevTo(apiKey string) *DevTo {
	return &DevTo{
		base:   "https://dev.to",
		apiKey: apiKey,
		http:   &http.Client{Timeout: 30 * time.Second},
	}
}

func (d *DevTo) Platform() string { return "devto" }
func (d *DevTo) Kind() Kind       { return KindArticle }

// Publish cria um artigo no dev.to. Retorna a URL pública do artigo.
func (d *DevTo) Publish(ctx context.Context, p Payload) (string, error) {
	tags := p.Tags
	if len(tags) > 4 {
		tags = tags[:4]
	}
	body, _ := json.Marshal(map[string]any{
		"article": map[string]any{
			"title":         p.Title,
			"body_markdown": p.BodyMD,
			"published":     true,
			"canonical_url": p.CanonicalURL,
			"description":   p.Description,
			"tags":          tags,
		},
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, d.base+"/api/articles", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("api-key", d.apiKey)
	res, err := d.http.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusCreated && res.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(res.Body, 4096))
		return "", fmt.Errorf("devto: status %d: %s", res.StatusCode, bytes.TrimSpace(body))
	}
	var out struct {
		URL string `json:"url"`
	}
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		return "", err
	}
	return out.URL, nil
}
