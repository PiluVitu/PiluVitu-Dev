// Package llm é um cliente fail-soft do Ollama local (proofread, hooks, refine).
package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// ollamaTimeout allows for slow local LLM inference (cold model, long text).
const ollamaTimeout = 120 * time.Second

// Client fala com o Ollama local. Espelha o padrão dos clients externos (TMDb).
type Client struct {
	base           string
	http           *http.Client
	modelProofread string
	modelHooks     string
}

// NewClient aponta pro Ollama em base (ex.: http://localhost:11434).
// Em testes, base é a URL de um httptest.Server.
func NewClient(base, modelProofread, modelHooks string) *Client {
	return &Client{
		base:           strings.TrimRight(base, "/"),
		http:           &http.Client{Timeout: ollamaTimeout},
		modelProofread: modelProofread,
		modelHooks:     modelHooks,
	}
}

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// Health confirma que o Ollama responde (GET /api/tags).
func (c *Client) Health(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.base+"/api/tags", nil)
	if err != nil {
		return err
	}
	res, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("llm: ollama unreachable: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(res.Body, 512))
		return fmt.Errorf("llm: ollama health status %d: %s", res.StatusCode, bytes.TrimSpace(body))
	}
	return nil
}

// chat faz um turno não-streaming e devolve o texto da resposta (trimado).
func (c *Client) chat(ctx context.Context, model, system, user string) (string, error) {
	payload := map[string]any{
		"model":    model,
		"stream":   false,
		"messages": []chatMessage{{Role: "system", Content: system}, {Role: "user", Content: user}},
		"options":  map[string]any{"temperature": 0.3},
	}
	buf, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.base+"/api/chat", bytes.NewReader(buf))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := c.http.Do(req)
	if err != nil {
		return "", fmt.Errorf("llm: chat request: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(res.Body, 512))
		return "", fmt.Errorf("llm: chat status %d: %s", res.StatusCode, bytes.TrimSpace(body))
	}
	var out struct {
		Message chatMessage `json:"message"`
	}
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		return "", fmt.Errorf("llm: decode chat: %w", err)
	}
	return strings.TrimSpace(out.Message.Content), nil
}

// Proofread conserta typos/gramática preservando Markdown/MDX. Texto sem frontmatter.
func (c *Client) Proofread(ctx context.Context, text string) (string, error) {
	return c.chat(ctx, c.modelProofread, proofreadSystem, text)
}

// Article é o resumo do post usado para gerar chamadas.
type Article struct {
	Title   string
	Excerpt string
	URL     string
	Tags    []string
}

// Hook é uma chamada gerada para uma plataforma.
type Hook struct {
	Platform string
	Text     string
}

// platformLimit returns the character limit for the given social platform.
func platformLimit(p string) int {
	switch p {
	case "bluesky":
		return 300
	case "mastodon":
		return 500
	default:
		return 280
	}
}

// GenerateHooks gera uma chamada por plataforma (uma chamada de chat cada).
func (c *Client) GenerateHooks(ctx context.Context, a Article, platforms []string) ([]Hook, error) {
	hooks := make([]Hook, 0, len(platforms))
	for _, p := range platforms {
		limit := platformLimit(p)
		system := fmt.Sprintf(hooksSystemTmpl, p, limit)
		user := fmt.Sprintf("Título: %s\nResumo: %s\nLink: %s\nTags: %s",
			a.Title, a.Excerpt, a.URL, strings.Join(a.Tags, ", "))
		text, err := c.chat(ctx, c.modelHooks, system, user)
		if err != nil {
			return nil, fmt.Errorf("llm: hook %s: %w", p, err)
		}
		hooks = append(hooks, Hook{Platform: p, Text: text})
	}
	return hooks, nil
}

// Refine reescreve uma chamada conforme instruction (opcional).
func (c *Client) Refine(ctx context.Context, platform, text, instruction string) (string, error) {
	if instruction == "" {
		instruction = "Melhore o engajamento mantendo o sentido."
	}
	limit := platformLimit(platform)
	user := fmt.Sprintf("Plataforma: %s (limite %d chars)\nInstrução: %s\n\nTexto atual:\n%s",
		platform, limit, instruction, text)
	return c.chat(ctx, c.modelHooks, refineSystem, user)
}
