# Distribuição de artigos — Fase 1 (Backend Go) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar à Go API (atrás do Cloudflare Tunnel) os endpoints admin que (a) corrigem/geram/refinam texto via Ollama local e (b) republicam o artigo em dev.to/Hashnode e postam chamadas no Bluesky/Mastodon, persistindo o estado em SQLite — além do stack `process-compose` que sobe Ollama + API + túnel juntos.

**Architecture:** Dois pacotes novos no padrão "client externo fail-soft" já usado (TMDb/Sheets/Drive): `internal/llm` (cliente Ollama) e `internal/distribution` (porta `Publisher` + 4 adapters + `Store` SQLite + `Service`). Handlers em `internal/handlers/{llm,distribution}` gated por `auth.RequireAdmin`, respondendo no envelope `httpx`. Tudo opcional por env — ausência desliga a feature (503), nunca aborta o boot.

**Tech Stack:** Go 1.23, chi v5, `modernc.org/sqlite`, `net/http`, `httptest` para os testes. Ollama HTTP API (`/api/chat`, `/api/tags`). `process-compose` para o stack local.

---

## Pré-requisitos (rodar uma vez, fora do código)

Estes passos preparam o ambiente local. **Não são código** — execute no terminal antes/ durante a Parte A.

```bash
brew install ollama process-compose
ollama pull qwen2.5:7b-instruct
ollama pull qwen2.5:14b-instruct
```

> Ollama roda **nativo** (não Docker) para usar a GPU/Metal do M4. Em Docker no macOS ele cai pra CPU.

---

## File Structure

**Criar:**

| Arquivo                                                            | Responsabilidade                                                                                                    |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `apps/api/internal/llm/client.go`                                  | Cliente HTTP do Ollama: `chat()`, `Health()`, `Proofread()`, `GenerateHooks()`, `Refine()`; tipos `Article`, `Hook` |
| `apps/api/internal/llm/prompts.go`                                 | Strings de system-prompt (proofread, hooks, refine)                                                                 |
| `apps/api/internal/llm/client_test.go`                             | Testes do cliente contra `httptest.Server`                                                                          |
| `apps/api/internal/handlers/llm/handlers.go`                       | Endpoints `Proofread`/`Refine` (envelope, 503 se Ollama off)                                                        |
| `apps/api/internal/handlers/llm/handlers_test.go`                  | Testes de handler (decode do envelope)                                                                              |
| `apps/api/internal/distribution/schema.sql`                        | `CREATE TABLE IF NOT EXISTS distribution_targets`                                                                   |
| `apps/api/internal/distribution/store.go`                          | `Store` (Upsert/ListBySlug/Get/MarkPosted/MarkFailed) + tipo `Target`                                               |
| `apps/api/internal/distribution/store_test.go`                     | Testes do store (SQLite em memória/temp)                                                                            |
| `apps/api/internal/distribution/publisher.go`                      | Interface `Publisher`, tipos `Kind`/`Payload`                                                                       |
| `apps/api/internal/distribution/devto.go` + `_test.go`             | Adapter dev.to (`article_crosspost`)                                                                                |
| `apps/api/internal/distribution/hashnode.go` + `_test.go`          | Adapter Hashnode (`article_crosspost`)                                                                              |
| `apps/api/internal/distribution/bluesky.go` + `_test.go`           | Adapter Bluesky (`social_hook`)                                                                                     |
| `apps/api/internal/distribution/mastodon.go` + `_test.go`          | Adapter Mastodon (`social_hook`)                                                                                    |
| `apps/api/internal/distribution/service.go` + `_test.go`           | `Service`: `BuildProposals`, `Publish` (idempotente)                                                                |
| `apps/api/internal/handlers/distribution/handlers.go` + `_test.go` | Endpoints `Proposals`/`Get`/`Publish`                                                                               |
| `process-compose.yaml` (raiz)                                      | Sobe Ollama + API + cloudflared com health-gating                                                                   |

**Modificar:**

- `apps/api/cmd/api/main.go` — construir `llm.Client`, adapters, `distribution.Service` fail-soft; injetar nos handlers e no router.
- `apps/api/internal/router/router.go` — `Deps` ganha `LLMHandlers`/`DistributionHandlers`; novas rotas no grupo `/admin`.
- `apps/api/.env.example` — novas envs.
- `Makefile` (raiz) — alvo `stack`.
- `apps/api/CLAUDE.md` e `CLAUDE.md` (raiz) — documentação (última task).

---

# PARTE A — Ollama (`internal/llm`) + endpoints

### Task 1: Cliente Ollama — esqueleto, `chat()` e `Health()`

**Files:**

- Create: `apps/api/internal/llm/client.go`
- Test: `apps/api/internal/llm/client_test.go`

- [ ] **Step 1: Escrever o teste que falha**

```go
package llm

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func newChatServer(t *testing.T, reply string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/tags" {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"models":[]}`))
			return
		}
		if r.URL.Path != "/api/chat" || r.Method != http.MethodPost {
			t.Errorf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		var body struct {
			Model    string `json:"model"`
			Stream   bool   `json:"stream"`
			Messages []struct {
				Role    string `json:"role"`
				Content string `json:"content"`
			} `json:"messages"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body.Stream {
			t.Error("stream must be false")
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"message": map[string]string{"role": "assistant", "content": reply},
			"done":    true,
		})
	}))
}

func TestHealthOK(t *testing.T) {
	srv := newChatServer(t, "ok")
	defer srv.Close()
	c := NewClient(srv.URL, "m-proof", "m-hooks")
	if err := c.Health(context.Background()); err != nil {
		t.Fatalf("Health() = %v, want nil", err)
	}
}

func TestChatTrimsReply(t *testing.T) {
	srv := newChatServer(t, "  resposta limpa\n")
	defer srv.Close()
	c := NewClient(srv.URL, "m-proof", "m-hooks")
	got, err := c.chat(context.Background(), "m-proof", "sys", "user")
	if err != nil {
		t.Fatalf("chat() error: %v", err)
	}
	if strings.TrimSpace(got) != "resposta limpa" {
		t.Fatalf("chat() = %q", got)
	}
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd apps/api && go test ./internal/llm/ -run 'TestHealthOK|TestChatTrimsReply' -v`
Expected: FAIL (`undefined: NewClient`).

- [ ] **Step 3: Implementação mínima**

```go
// Package llm é um cliente fail-soft do Ollama local (proofread, hooks, refine).
package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

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
		http:           &http.Client{Timeout: 120 * time.Second},
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
		return fmt.Errorf("llm: ollama health status %d", res.StatusCode)
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
		return "", fmt.Errorf("llm: chat status %d", res.StatusCode)
	}
	var out struct {
		Message chatMessage `json:"message"`
	}
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		return "", fmt.Errorf("llm: decode chat: %w", err)
	}
	return strings.TrimSpace(out.Message.Content), nil
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd apps/api && go test ./internal/llm/ -run 'TestHealthOK|TestChatTrimsReply' -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/internal/llm/client.go apps/api/internal/llm/client_test.go
git commit -m "feat(api): cliente Ollama (internal/llm) com chat e health"
```

---

### Task 2: `Proofread`

**Files:**

- Create: `apps/api/internal/llm/prompts.go`
- Modify: `apps/api/internal/llm/client.go` (adicionar método)
- Test: `apps/api/internal/llm/client_test.go` (adicionar)

- [ ] **Step 1: Teste que falha**

Adicione em `client_test.go`:

```go
func TestProofreadSendsTextAndModel(t *testing.T) {
	var gotModel, gotUser string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Model    string        `json:"model"`
			Messages []chatMessage `json:"messages"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		gotModel = body.Model
		gotUser = body.Messages[len(body.Messages)-1].Content
		_ = json.NewEncoder(w).Encode(map[string]any{"message": map[string]string{"content": "texto corrigido"}})
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "m-proof", "m-hooks")
	got, err := c.Proofread(context.Background(), "txto com erro")
	if err != nil {
		t.Fatalf("Proofread() error: %v", err)
	}
	if got != "texto corrigido" {
		t.Fatalf("Proofread() = %q", got)
	}
	if gotModel != "m-proof" {
		t.Fatalf("model = %q, want m-proof", gotModel)
	}
	if !strings.Contains(gotUser, "txto com erro") {
		t.Fatalf("user message não contém o texto original: %q", gotUser)
	}
}
```

- [ ] **Step 2: Ver falhar**

Run: `cd apps/api && go test ./internal/llm/ -run TestProofread -v`
Expected: FAIL (`c.Proofread undefined`).

- [ ] **Step 3: Implementar**

Crie `apps/api/internal/llm/prompts.go`:

```go
package llm

const proofreadSystem = `Você é um revisor de texto em português do Brasil.
Conserte APENAS erros de digitação, ortografia, acentuação e gramática.
NÃO reescreva no seu estilo, NÃO mude o tom, NÃO traduza, NÃO adicione conteúdo.
Preserve EXATAMENTE a formatação Markdown/MDX: títulos, listas, links, blocos de código (não toque no conteúdo entre crases) e componentes JSX.
Responda SOMENTE com o texto corrigido, sem comentários nem cercas de código extras.`

const hooksSystemTmpl = `Você escreve chamadas curtas e envolventes para redes sociais, em português do Brasil, divulgando um artigo de blog.
Plataforma: %s. Limite rígido: %d caracteres (inclua o link na contagem).
Inclua o link do artigo no fim. Use no máximo 2 hashtags relevantes. Sem aspas em volta. Sem emojis em excesso.
Responda SOMENTE com o texto da chamada.`

const refineSystem = `Você refina uma chamada de rede social em português do Brasil mantendo o link e a intenção.
Aplique a instrução do usuário. Responda SOMENTE com o texto refinado, sem comentários.`
```

Adicione em `client.go`:

```go
// Proofread conserta typos/gramática preservando Markdown/MDX. Texto sem frontmatter.
func (c *Client) Proofread(ctx context.Context, text string) (string, error) {
	return c.chat(ctx, c.modelProofread, proofreadSystem, text)
}
```

- [ ] **Step 4: Ver passar**

Run: `cd apps/api && go test ./internal/llm/ -run TestProofread -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/internal/llm/
git commit -m "feat(api): llm.Proofread + prompts pt-BR"
```

---

### Task 3: `GenerateHooks` + tipos `Article`/`Hook`

**Files:**

- Modify: `apps/api/internal/llm/client.go`
- Test: `apps/api/internal/llm/client_test.go`

- [ ] **Step 1: Teste que falha**

```go
func TestGenerateHooksPerPlatform(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Messages []chatMessage `json:"messages"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		// devolve a plataforma citada no system prompt p/ provar que variou
		reply := "chamada"
		if strings.Contains(body.Messages[0].Content, "bluesky") {
			reply = "chamada bluesky https://x"
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"message": map[string]string{"content": reply}})
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "m-proof", "m-hooks")
	art := Article{Title: "Meu Post", Excerpt: "resumo", URL: "https://blog/x", Tags: []string{"go"}}
	hooks, err := c.GenerateHooks(context.Background(), art, []string{"bluesky", "mastodon"})
	if err != nil {
		t.Fatalf("GenerateHooks() error: %v", err)
	}
	if len(hooks) != 2 {
		t.Fatalf("len(hooks) = %d, want 2", len(hooks))
	}
	if hooks[0].Platform != "bluesky" || hooks[0].Text != "chamada bluesky https://x" {
		t.Fatalf("hook[0] = %+v", hooks[0])
	}
}
```

- [ ] **Step 2: Ver falhar**

Run: `cd apps/api && go test ./internal/llm/ -run TestGenerateHooks -v`
Expected: FAIL (`undefined: Article`).

- [ ] **Step 3: Implementar**

Adicione em `client.go`:

```go
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

// platformLimit é o limite de caracteres por plataforma social.
var platformLimit = map[string]int{"bluesky": 300, "mastodon": 500}

// GenerateHooks gera uma chamada por plataforma (uma chamada de chat cada).
func (c *Client) GenerateHooks(ctx context.Context, a Article, platforms []string) ([]Hook, error) {
	hooks := make([]Hook, 0, len(platforms))
	for _, p := range platforms {
		limit := platformLimit[p]
		if limit == 0 {
			limit = 280
		}
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
```

Adicione `"fmt"` ao import se ainda não estiver (já está pelo Task 1).

- [ ] **Step 4: Ver passar**

Run: `cd apps/api && go test ./internal/llm/ -run TestGenerateHooks -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/internal/llm/
git commit -m "feat(api): llm.GenerateHooks (uma chamada por plataforma)"
```

---

### Task 4: `Refine`

**Files:**

- Modify: `apps/api/internal/llm/client.go`
- Test: `apps/api/internal/llm/client_test.go`

- [ ] **Step 1: Teste que falha**

```go
func TestRefineUsesInstruction(t *testing.T) {
	var gotUser string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct{ Messages []chatMessage `json:"messages"` }
		_ = json.NewDecoder(r.Body).Decode(&body)
		gotUser = body.Messages[len(body.Messages)-1].Content
		_ = json.NewEncoder(w).Encode(map[string]any{"message": map[string]string{"content": "refinado"}})
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "m-proof", "m-hooks")
	got, err := c.Refine(context.Background(), "bluesky", "texto base", "deixa informal")
	if err != nil {
		t.Fatalf("Refine() error: %v", err)
	}
	if got != "refinado" {
		t.Fatalf("Refine() = %q", got)
	}
	if !strings.Contains(gotUser, "texto base") || !strings.Contains(gotUser, "deixa informal") {
		t.Fatalf("user message faltando texto/instrução: %q", gotUser)
	}
}
```

- [ ] **Step 2: Ver falhar**

Run: `cd apps/api && go test ./internal/llm/ -run TestRefine -v`
Expected: FAIL.

- [ ] **Step 3: Implementar**

Adicione em `client.go`:

```go
// Refine reescreve uma chamada conforme instruction (opcional).
func (c *Client) Refine(ctx context.Context, platform, text, instruction string) (string, error) {
	if instruction == "" {
		instruction = "Melhore o engajamento mantendo o sentido."
	}
	limit := platformLimit[platform]
	if limit == 0 {
		limit = 280
	}
	user := fmt.Sprintf("Plataforma: %s (limite %d chars)\nInstrução: %s\n\nTexto atual:\n%s",
		platform, limit, instruction, text)
	return c.chat(ctx, c.modelHooks, refineSystem, user)
}
```

- [ ] **Step 4: Ver passar**

Run: `cd apps/api && go test ./internal/llm/ -v`
Expected: PASS (todos do pacote).

- [ ] **Step 5: Commit**

```bash
git add apps/api/internal/llm/
git commit -m "feat(api): llm.Refine"
```

---

### Task 5: Handlers `proofread` + `refine`

**Files:**

- Create: `apps/api/internal/handlers/llm/handlers.go`
- Test: `apps/api/internal/handlers/llm/handlers_test.go`

> Padrão de envelope: `httpx.Data(w, status, payload)` / `httpx.Error(w, status, code, msg)`. Veja `internal/httpx`. Códigos snake_case (`llm_unavailable`, `invalid_json`).

- [ ] **Step 1: Teste que falha**

```go
package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	pkgllm "github.com/PiluVitu/api/internal/llm"
)

type stubLLM struct {
	corrected string
	refined   string
	err       error
}

func (s stubLLM) Proofread(_ context.Context, _ string) (string, error) { return s.corrected, s.err }
func (s stubLLM) GenerateHooks(_ context.Context, _ pkgllm.Article, _ []string) ([]pkgllm.Hook, error) {
	return nil, s.err
}
func (s stubLLM) Refine(_ context.Context, _, _, _ string) (string, error) { return s.refined, s.err }

func TestProofreadHandlerOK(t *testing.T) {
	h := NewHandlers(Deps{LLM: stubLLM{corrected: "ok corrigido"}})
	req := httptest.NewRequest(http.MethodPost, "/admin/llm/proofread", bytes.NewBufferString(`{"text":"oi"}`))
	rec := httptest.NewRecorder()
	h.Proofread(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
	var env struct {
		Data struct{ Corrected string `json:"corrected"` } `json:"data"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &env)
	if env.Data.Corrected != "ok corrigido" {
		t.Fatalf("corrected = %q", env.Data.Corrected)
	}
}

func TestProofreadHandler503WhenNil(t *testing.T) {
	h := NewHandlers(Deps{LLM: nil})
	req := httptest.NewRequest(http.MethodPost, "/admin/llm/proofread", bytes.NewBufferString(`{"text":"oi"}`))
	rec := httptest.NewRecorder()
	h.Proofread(rec, req)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", rec.Code)
	}
}
```

- [ ] **Step 2: Ver falhar**

Run: `cd apps/api && go test ./internal/handlers/llm/ -v`
Expected: FAIL (`undefined: NewHandlers`).

- [ ] **Step 3: Implementar**

```go
// Package llm expõe os endpoints admin de correção/refino via Ollama.
package llm

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/PiluVitu/api/internal/httpx"
	pkgllm "github.com/PiluVitu/api/internal/llm"
)

// LLM é a sub-interface consumida pelos handlers (desacopla do *llm.Client).
type LLM interface {
	Proofread(ctx context.Context, text string) (string, error)
	GenerateHooks(ctx context.Context, a pkgllm.Article, platforms []string) ([]pkgllm.Hook, error)
	Refine(ctx context.Context, platform, text, instruction string) (string, error)
}

type Deps struct{ LLM LLM }

type Handlers struct{ llm LLM }

func NewHandlers(d Deps) *Handlers { return &Handlers{llm: d.LLM} }

func (h *Handlers) unavailable(w http.ResponseWriter) bool {
	if h.llm == nil {
		httpx.Error(w, http.StatusServiceUnavailable, "llm_unavailable", "LLM local indisponível (Ollama offline).")
		return true
	}
	return false
}

func (h *Handlers) Proofread(w http.ResponseWriter, r *http.Request) {
	if h.unavailable(w) {
		return
	}
	var in struct{ Text string `json:"text"` }
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Text == "" {
		httpx.Error(w, http.StatusBadRequest, "invalid_json", "Corpo inválido: 'text' é obrigatório.")
		return
	}
	out, err := h.llm.Proofread(r.Context(), in.Text)
	if err != nil {
		httpx.Error(w, http.StatusBadGateway, "llm_failed", "Falha ao corrigir o texto.")
		return
	}
	httpx.Data(w, http.StatusOK, map[string]string{"corrected": out})
}

func (h *Handlers) Refine(w http.ResponseWriter, r *http.Request) {
	if h.unavailable(w) {
		return
	}
	var in struct {
		Platform    string `json:"platform"`
		Text        string `json:"text"`
		Instruction string `json:"instruction"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Text == "" {
		httpx.Error(w, http.StatusBadRequest, "invalid_json", "Corpo inválido: 'text' é obrigatório.")
		return
	}
	out, err := h.llm.Refine(r.Context(), in.Platform, in.Text, in.Instruction)
	if err != nil {
		httpx.Error(w, http.StatusBadGateway, "llm_failed", "Falha ao refinar o texto.")
		return
	}
	httpx.Data(w, http.StatusOK, map[string]string{"refined": out})
}
```

- [ ] **Step 4: Ver passar**

Run: `cd apps/api && go test ./internal/handlers/llm/ -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/internal/handlers/llm/
git commit -m "feat(api): handlers /admin/llm/proofread e /refine"
```

---

### Task 6: Wiring — `main.go` + router + rotas

**Files:**

- Modify: `apps/api/cmd/api/main.go`
- Modify: `apps/api/internal/router/router.go`

- [ ] **Step 1: Adicionar deps no router**

Em `router.go`, no struct `Deps` (linha ~26), adicione os campos:

```go
	LLMHandlers          *handlersllm.Handlers
	DistributionHandlers *handlersdistribution.Handlers
```

E os imports:

```go
	handlersdistribution "github.com/PiluVitu/api/internal/handlers/distribution"
	handlersllm "github.com/PiluVitu/api/internal/handlers/llm"
```

> `handlersdistribution` só será usado na Parte B (Task 16). Para compilar agora sem a Parte B, adicione **apenas** `handlersllm` neste task e o campo `LLMHandlers`; deixe `DistributionHandlers` e seu import para a Task 16.

- [ ] **Step 2: Adicionar as rotas LLM**

Dentro do bloco `r.Route("/admin", ...)` (linha ~78), depois das rotas existentes, adicione:

```go
			if deps.LLMHandlers != nil {
				r.With(auth.RequireAdmin(deps.Sessions, deps.Store)).Post("/llm/proofread", deps.LLMHandlers.Proofread)
				r.With(auth.RequireAdmin(deps.Sessions, deps.Store)).Post("/llm/refine", deps.LLMHandlers.Refine)
			}
```

- [ ] **Step 3: Construir o cliente em `main.go`**

Em `main.go`, depois do bloco do TMDb (linha ~73), adicione:

```go
	var llmClient *llm.Client
	if base := os.Getenv("OLLAMA_BASE_URL"); base != "" {
		mp := envOr("OLLAMA_MODEL_PROOFREAD", "qwen2.5:7b-instruct")
		mh := envOr("OLLAMA_MODEL_HOOKS", "qwen2.5:14b-instruct")
		llmClient = llm.NewClient(base, mp, mh)
		if err := llmClient.Health(context.Background()); err != nil {
			slog.Warn("ollama health check failed (LLM endpoints will 503)", "err", err)
		} else {
			slog.Info("ollama connected", "base", base, "proofread", mp, "hooks", mh)
		}
	}
	llmH := handlersllm.NewHandlers(handlersllm.Deps{LLM: llmClient})
```

> `llmClient` é `*llm.Client`. Quando `nil` (env ausente), o handler responde 503. Passar `llmClient` (mesmo nil) satisfaz a interface — mas cuidado com nil de interface: passe via a Deps que checa `if d.LLM == nil`. Como `Deps.LLM` é interface e recebemos `*llm.Client` nil, o handler precisa checar o ponteiro. **Para evitar o nil-de-interface, só construa o handler com o cliente quando não-nil:**

```go
	var llmH *handlersllm.Handlers
	if llmClient != nil {
		llmH = handlersllm.NewHandlers(handlersllm.Deps{LLM: llmClient})
	} else {
		llmH = handlersllm.NewHandlers(handlersllm.Deps{LLM: nil})
	}
```

Adicione o helper no fim de `main.go`:

```go
func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
```

Adicione aos imports de `main.go`:

```go
	handlersllm "github.com/PiluVitu/api/internal/handlers/llm"
	"github.com/PiluVitu/api/internal/llm"
```

E passe ao router (no `router.New(router.Deps{...}`):

```go
		LLMHandlers: llmH,
```

> **Nota nil-de-interface:** se `Deps.LLM` for um `*llm.Client` nil embrulhado em interface, `h.llm == nil` no handler dá **false**. Garanta no `NewHandlers`/`unavailable` que tratamos isso: o caminho acima passa `nil` literal quando o cliente não existe, então `h.llm == nil` é true. Mantenha esse padrão.

- [ ] **Step 4: Compilar + testar**

Run: `cd apps/api && go build ./... && go vet ./... && go test ./...`
Expected: build OK, vet limpo, testes PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/cmd/api/main.go apps/api/internal/router/router.go
git commit -m "feat(api): wire llm.Client + rotas /admin/llm/* (fail-soft)"
```

---

### Task 7: Stack local — `process-compose.yaml`, `make stack`, env

**Files:**

- Create: `process-compose.yaml` (raiz)
- Modify: `Makefile` (raiz)
- Modify: `apps/api/.env.example`

- [ ] **Step 1: Criar `process-compose.yaml`**

```yaml
version: '0.5'

processes:
  ollama:
    command: 'ollama serve'
    readiness_probe:
      http_get:
        host: '127.0.0.1'
        port: 11434
        path: '/api/tags'
      initial_delay_seconds: 2
      period_seconds: 3
      failure_threshold: 20
    availability:
      restart: 'on_failure'

  ollama-pull:
    command: 'ollama pull ${OLLAMA_MODEL_PROOFREAD:-qwen2.5:7b-instruct} && ollama pull ${OLLAMA_MODEL_HOOKS:-qwen2.5:14b-instruct}'
    depends_on:
      ollama:
        condition: process_healthy
    availability:
      restart: 'no'

  api:
    command: 'make dev-api'
    working_dir: '.'
    depends_on:
      ollama-pull:
        condition: process_completed_successfully
    readiness_probe:
      http_get:
        host: '127.0.0.1'
        port: 8081
        path: '/health'
      initial_delay_seconds: 3
      period_seconds: 3
      failure_threshold: 20
    availability:
      restart: 'on_failure'

  tunnel:
    command: 'make tunnel-up'
    depends_on:
      api:
        condition: process_healthy
    availability:
      restart: 'on_failure'
```

> **Verificar antes de confiar cego:** `process-compose` evolui o schema do YAML. Rode `process-compose version` e confira em `https://f1bonacc1.github.io/process-compose/` se `readiness_probe.http_get` e `depends_on.condition` batem com a versão instalada. Ajuste a porta da API (`8081` em dev via air, conforme `apps/api/CLAUDE.md`).

- [ ] **Step 2: Alvo no Makefile**

Adicione ao `Makefile` da raiz:

```makefile
.PHONY: stack
stack: ## Sobe Ollama + Go API + Cloudflare Tunnel (process-compose)
	process-compose up
```

- [ ] **Step 3: Envs no `.env.example`**

Adicione ao fim de `apps/api/.env.example`:

```bash
# --- LLM local (Ollama) ---
# Vazio => endpoints /admin/llm/* respondem 503 (feature desligada).
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL_PROOFREAD=qwen2.5:7b-instruct
OLLAMA_MODEL_HOOKS=qwen2.5:14b-instruct
```

- [ ] **Step 4: Smoke test manual**

Run: `process-compose up` (em outro terminal: `curl localhost:8081/health`)
Expected: os 3 processos sobem em ordem (ollama → pull → api → tunnel); `/health` responde `{"ok":true,...}`. `Ctrl+C` derruba todos.

> Se ainda não tiver o tunnel configurado (`infra/.env`), comente o processo `tunnel` no YAML pra validar o resto.

- [ ] **Step 5: Commit**

```bash
git add process-compose.yaml Makefile apps/api/.env.example
git commit -m "feat: stack local process-compose (ollama+api+tunnel) + envs llm"
```

---

# PARTE B — Distribuição (`internal/distribution`)

### Task 8: Schema + `Store`

**Files:**

- Create: `apps/api/internal/distribution/schema.sql`
- Create: `apps/api/internal/distribution/store.go`
- Test: `apps/api/internal/distribution/store_test.go`

> O schema é aplicado **idempotentemente no boot** (`CREATE TABLE IF NOT EXISTS`), igual ao `votacao.NewStore`. **Não há comando de migration manual** — roda sozinho.

- [ ] **Step 1: Teste que falha**

```go
package distribution

import (
	"context"
	"database/sql"
	"testing"

	_ "modernc.org/sqlite"
)

func newTestStore(t *testing.T) *Store {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	s, err := NewStore(db)
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	return s
}

func TestUpsertAndList(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	err := s.Upsert(ctx, Target{Slug: "post-1", Platform: "bluesky", Kind: KindSocial, Content: "oi", Status: "pending"})
	if err != nil {
		t.Fatalf("Upsert: %v", err)
	}
	// upsert de novo na mesma (slug,platform) não duplica:
	_ = s.Upsert(ctx, Target{Slug: "post-1", Platform: "bluesky", Kind: KindSocial, Content: "oi v2", Status: "pending"})

	got, err := s.ListBySlug(ctx, "post-1")
	if err != nil {
		t.Fatalf("ListBySlug: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("len = %d, want 1", len(got))
	}
	if got[0].Content != "oi v2" {
		t.Fatalf("content = %q, want atualizado", got[0].Content)
	}
}

func TestMarkPosted(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	_ = s.Upsert(ctx, Target{Slug: "p", Platform: "devto", Kind: KindArticle, Content: "x", Status: "pending"})
	if err := s.MarkPosted(ctx, "p", "devto", "https://dev.to/a"); err != nil {
		t.Fatalf("MarkPosted: %v", err)
	}
	got, _ := s.Get(ctx, "p", "devto")
	if got.Status != "posted" || got.RemoteURL != "https://dev.to/a" {
		t.Fatalf("got = %+v", got)
	}
}
```

- [ ] **Step 2: Ver falhar**

Run: `cd apps/api && go test ./internal/distribution/ -run 'TestUpsert|TestMark' -v`
Expected: FAIL (`undefined: Store`).

- [ ] **Step 3: Implementar**

`schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS distribution_targets (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slug       TEXT NOT NULL,
  platform   TEXT NOT NULL,
  kind       TEXT NOT NULL,
  content    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending',
  remote_url TEXT NOT NULL DEFAULT '',
  error      TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  posted_at  TEXT NOT NULL DEFAULT '',
  UNIQUE(slug, platform)
);
```

`store.go`:

```go
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

type Store struct{ db *sql.DB }

// NewStore aplica o schema idempotentemente e devolve o Store.
func NewStore(db *sql.DB) (*Store, error) {
	if _, err := db.Exec(schema); err != nil {
		return nil, err
	}
	return &Store{db: db}, nil
}

// Upsert insere ou atualiza por (slug, platform), resetando status p/ pending.
func (s *Store) Upsert(ctx context.Context, t Target) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO distribution_targets (slug, platform, kind, content, status)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(slug, platform) DO UPDATE SET
			content = excluded.content,
			kind = excluded.kind,
			status = CASE WHEN distribution_targets.status='posted' THEN 'posted' ELSE excluded.status END`,
		t.Slug, t.Platform, string(t.Kind), t.Content, statusOr(t.Status))
	return err
}

func statusOr(s string) string {
	if s == "" {
		return "pending"
	}
	return s
}

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

func (s *Store) MarkPosted(ctx context.Context, slug, platform, remoteURL string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE distribution_targets SET status='posted', remote_url=?, error='', posted_at=?
		WHERE slug=? AND platform=?`, remoteURL, time.Now().UTC().Format(time.RFC3339), slug, platform)
	return err
}

func (s *Store) MarkFailed(ctx context.Context, slug, platform, errMsg string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE distribution_targets SET status='failed', error=? WHERE slug=? AND platform=?`,
		errMsg, slug, platform)
	return err
}
```

- [ ] **Step 4: Ver passar**

Run: `cd apps/api && go test ./internal/distribution/ -run 'TestUpsert|TestMark' -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/internal/distribution/schema.sql apps/api/internal/distribution/store.go apps/api/internal/distribution/store_test.go
git commit -m "feat(api): distribution.Store (SQLite) + schema idempotente"
```

---

### Task 9: Interface `Publisher` + tipos

**Files:**

- Create: `apps/api/internal/distribution/publisher.go`

- [ ] **Step 1: Implementar (sem teste — só tipos/contrato)**

```go
package distribution

import "context"

// Payload é o que se envia a um Publisher.
type Payload struct {
	// Artigo (article_crosspost):
	Title       string
	BodyMD      string
	Description string
	CanonicalURL string
	Tags        []string
	// Social (social_hook):
	Text string
}

// Publisher publica num destino. Implementado por cada adapter.
type Publisher interface {
	Platform() string
	Kind() Kind
	Publish(ctx context.Context, p Payload) (remoteURL string, err error)
}
```

- [ ] **Step 2: Compilar**

Run: `cd apps/api && go build ./internal/distribution/`
Expected: OK.

- [ ] **Step 3: Commit**

```bash
git add apps/api/internal/distribution/publisher.go
git commit -m "feat(api): interface Publisher + Payload"
```

---

### Task 10: Adapter dev.to

**Files:**

- Create: `apps/api/internal/distribution/devto.go`
- Test: `apps/api/internal/distribution/devto_test.go`

> **Contrato dev.to:** `POST https://dev.to/api/articles`, header `api-key: <key>`, corpo `{"article":{title, body_markdown, published:true, canonical_url, tags:[...], description}}` → 201 `{"url":"...","id":...}`. Tags: array de strings alfanuméricas, máx. 4. Verifique em `https://developers.forem.com/api/v1#tag/articles`.

- [ ] **Step 1: Teste que falha**

```go
package distribution

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestDevToPublish(t *testing.T) {
	var gotKey string
	var gotBody map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotKey = r.Header.Get("api-key")
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"url":"https://dev.to/me/post-123","id":1}`))
	}))
	defer srv.Close()

	a := NewDevTo("KEY")
	a.base = srv.URL
	url, err := a.Publish(context.Background(), Payload{
		Title: "T", BodyMD: "corpo", CanonicalURL: "https://blog/p", Tags: []string{"go", "ai"},
	})
	if err != nil {
		t.Fatalf("Publish: %v", err)
	}
	if url != "https://dev.to/me/post-123" {
		t.Fatalf("url = %q", url)
	}
	if gotKey != "KEY" {
		t.Fatalf("api-key = %q", gotKey)
	}
	art := gotBody["article"].(map[string]any)
	if art["canonical_url"] != "https://blog/p" || art["published"] != true {
		t.Fatalf("article = %+v", art)
	}
}
```

- [ ] **Step 2: Ver falhar**

Run: `cd apps/api && go test ./internal/distribution/ -run TestDevTo -v`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```go
package distribution

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type DevTo struct {
	base   string
	apiKey string
	http   *http.Client
}

func NewDevTo(apiKey string) *DevTo {
	return &DevTo{base: "https://dev.to", apiKey: apiKey, http: &http.Client{Timeout: 30 * time.Second}}
}

func (d *DevTo) Platform() string { return "devto" }
func (d *DevTo) Kind() Kind       { return KindArticle }

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
		return "", fmt.Errorf("devto: status %d", res.StatusCode)
	}
	var out struct {
		URL string `json:"url"`
	}
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		return "", err
	}
	return out.URL, nil
}
```

- [ ] **Step 4: Ver passar**

Run: `cd apps/api && go test ./internal/distribution/ -run TestDevTo -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/internal/distribution/devto.go apps/api/internal/distribution/devto_test.go
git commit -m "feat(api): adapter dev.to (article_crosspost + canonical)"
```

---

### Task 11: Adapter Hashnode

**Files:**

- Create: `apps/api/internal/distribution/hashnode.go`
- Test: `apps/api/internal/distribution/hashnode_test.go`

> **Contrato Hashnode (GraphQL):** `POST https://gql.hashnode.com/`, header `Authorization: <token>`, `mutation publishPost(input: PublishPostInput!)`. `input`: `{ title, contentMarkdown, publicationId, originalArticleURL, tags:[{slug,name}] }` → `{data:{publishPost:{post:{url}}}}`. Verifique em `https://apidocs.hashnode.com/`. Tags exigem `{slug,name}` — no MVP mande `[]` se não houver mapeamento, pra não quebrar.

- [ ] **Step 1: Teste que falha**

```go
package distribution

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHashnodePublish(t *testing.T) {
	var gotAuth string
	var gotBody map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		_, _ = w.Write([]byte(`{"data":{"publishPost":{"post":{"url":"https://hn.dev/p"}}}}`))
	}))
	defer srv.Close()

	a := NewHashnode("TOK", "PUBID")
	a.base = srv.URL
	url, err := a.Publish(context.Background(), Payload{Title: "T", BodyMD: "corpo", CanonicalURL: "https://blog/p"})
	if err != nil {
		t.Fatalf("Publish: %v", err)
	}
	if url != "https://hn.dev/p" {
		t.Fatalf("url = %q", url)
	}
	if gotAuth != "TOK" {
		t.Fatalf("auth = %q", gotAuth)
	}
	q := gotBody["query"].(string)
	if !strings.Contains(q, "publishPost") {
		t.Fatalf("query sem publishPost: %q", q)
	}
}
```

- [ ] **Step 2: Ver falhar**

Run: `cd apps/api && go test ./internal/distribution/ -run TestHashnode -v`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```go
package distribution

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type Hashnode struct {
	base          string
	token         string
	publicationID string
	http          *http.Client
}

func NewHashnode(token, publicationID string) *Hashnode {
	return &Hashnode{base: "https://gql.hashnode.com", token: token, publicationID: publicationID, http: &http.Client{Timeout: 30 * time.Second}}
}

func (h *Hashnode) Platform() string { return "hashnode" }
func (h *Hashnode) Kind() Kind       { return KindArticle }

const hashnodeMutation = `mutation publishPost($input: PublishPostInput!) {
  publishPost(input: $input) { post { url } }
}`

func (h *Hashnode) Publish(ctx context.Context, p Payload) (string, error) {
	vars := map[string]any{
		"input": map[string]any{
			"title":              p.Title,
			"contentMarkdown":    p.BodyMD,
			"publicationId":      h.publicationID,
			"originalArticleURL": p.CanonicalURL,
			"tags":               []any{},
		},
	}
	body, _ := json.Marshal(map[string]any{"query": hashnodeMutation, "variables": vars})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, h.base+"/", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", h.token)
	res, err := h.http.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	var out struct {
		Data struct {
			PublishPost struct {
				Post struct {
					URL string `json:"url"`
				} `json:"post"`
			} `json:"publishPost"`
		} `json:"data"`
		Errors []struct {
			Message string `json:"message"`
		} `json:"errors"`
	}
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		return "", err
	}
	if len(out.Errors) > 0 {
		return "", fmt.Errorf("hashnode: %s", out.Errors[0].Message)
	}
	if out.Data.PublishPost.Post.URL == "" {
		return "", fmt.Errorf("hashnode: resposta sem url (status %d)", res.StatusCode)
	}
	return out.Data.PublishPost.Post.URL, nil
}
```

- [ ] **Step 4: Ver passar**

Run: `cd apps/api && go test ./internal/distribution/ -run TestHashnode -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/internal/distribution/hashnode.go apps/api/internal/distribution/hashnode_test.go
git commit -m "feat(api): adapter Hashnode (GraphQL publishPost + canonical)"
```

---

### Task 12: Adapter Bluesky

**Files:**

- Create: `apps/api/internal/distribution/bluesky.go`
- Test: `apps/api/internal/distribution/bluesky_test.go`

> **Contrato Bluesky (AT Protocol):** (1) `POST {service}/xrpc/com.atproto.server.createSession` `{identifier, password}` → `{accessJwt, did}`. (2) `POST {service}/xrpc/com.atproto.repo.createRecord` (Bearer accessJwt) `{repo:did, collection:"app.bsky.feed.post", record:{$type, text, createdAt}}` → `{uri:"at://did/app.bsky.feed.post/<rkey>"}`. `service` default `https://bsky.social`. URL pública: `https://bsky.app/profile/<handle>/post/<rkey>`. Verifique em `https://docs.bsky.app/`.

- [ ] **Step 1: Teste que falha**

```go
package distribution

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestBlueskyPublish(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.HasSuffix(r.URL.Path, "createSession"):
			_, _ = w.Write([]byte(`{"accessJwt":"JWT","did":"did:plc:abc"}`))
		case strings.HasSuffix(r.URL.Path, "createRecord"):
			if r.Header.Get("Authorization") != "Bearer JWT" {
				t.Errorf("authorization = %q", r.Header.Get("Authorization"))
			}
			_, _ = w.Write([]byte(`{"uri":"at://did:plc:abc/app.bsky.feed.post/rkey9","cid":"c"}`))
		}
	}))
	defer srv.Close()

	a := NewBluesky("me.bsky.social", "app-pass")
	a.base = srv.URL
	url, err := a.Publish(context.Background(), Payload{Text: "olá mundo"})
	if err != nil {
		t.Fatalf("Publish: %v", err)
	}
	if url != "https://bsky.app/profile/me.bsky.social/post/rkey9" {
		t.Fatalf("url = %q", url)
	}
}

func TestBlueskyRejectsTooLong(t *testing.T) {
	a := NewBluesky("h", "p")
	_, err := a.Publish(context.Background(), Payload{Text: strings.Repeat("x", 301)})
	if err == nil {
		t.Fatal("esperava erro de limite de 300 chars")
	}
}
```

- [ ] **Step 2: Ver falhar**

Run: `cd apps/api && go test ./internal/distribution/ -run TestBluesky -v`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```go
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

type Bluesky struct {
	base     string
	handle   string
	password string
	http     *http.Client
}

func NewBluesky(handle, appPassword string) *Bluesky {
	return &Bluesky{base: "https://bsky.social", handle: handle, password: appPassword, http: &http.Client{Timeout: 30 * time.Second}}
}

func (b *Bluesky) Platform() string { return "bluesky" }
func (b *Bluesky) Kind() Kind       { return KindSocial }

func (b *Bluesky) Publish(ctx context.Context, p Payload) (string, error) {
	if utf8.RuneCountInString(p.Text) > 300 {
		return "", fmt.Errorf("bluesky: texto excede 300 caracteres")
	}
	// 1) sessão
	var sess struct {
		AccessJwt string `json:"accessJwt"`
		Did       string `json:"did"`
	}
	if err := b.post(ctx, "/xrpc/com.atproto.server.createSession", "",
		map[string]string{"identifier": b.handle, "password": b.password}, &sess); err != nil {
		return "", err
	}
	// 2) record
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
```

- [ ] **Step 4: Ver passar**

Run: `cd apps/api && go test ./internal/distribution/ -run TestBluesky -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/internal/distribution/bluesky.go apps/api/internal/distribution/bluesky_test.go
git commit -m "feat(api): adapter Bluesky (AT Protocol createSession+createRecord)"
```

---

### Task 13: Adapter Mastodon

**Files:**

- Create: `apps/api/internal/distribution/mastodon.go`
- Test: `apps/api/internal/distribution/mastodon_test.go`

> **Contrato Mastodon:** `POST {instance}/api/v1/statuses` (Bearer token) `{"status":"..."}` → `{"url":"https://instance/@me/123","id":"123"}`. Verifique em `https://docs.joinmastodon.org/methods/statuses/#create`.

- [ ] **Step 1: Teste que falha**

```go
package distribution

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestMastodonPublish(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer TOK" {
			t.Errorf("auth = %q", r.Header.Get("Authorization"))
		}
		_, _ = w.Write([]byte(`{"url":"https://mast.odon/@me/9","id":"9"}`))
	}))
	defer srv.Close()

	a := NewMastodon(srv.URL, "TOK")
	url, err := a.Publish(context.Background(), Payload{Text: "toot!"})
	if err != nil {
		t.Fatalf("Publish: %v", err)
	}
	if url != "https://mast.odon/@me/9" {
		t.Fatalf("url = %q", url)
	}
}

func TestMastodonRejectsTooLong(t *testing.T) {
	a := NewMastodon("https://x", "t")
	_, err := a.Publish(context.Background(), Payload{Text: strings.Repeat("x", 501)})
	if err == nil {
		t.Fatal("esperava erro de limite de 500 chars")
	}
}
```

- [ ] **Step 2: Ver falhar**

Run: `cd apps/api && go test ./internal/distribution/ -run TestMastodon -v`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```go
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

type Mastodon struct {
	instance string
	token    string
	http     *http.Client
}

func NewMastodon(instanceURL, token string) *Mastodon {
	return &Mastodon{instance: strings.TrimRight(instanceURL, "/"), token: token, http: &http.Client{Timeout: 30 * time.Second}}
}

func (m *Mastodon) Platform() string { return "mastodon" }
func (m *Mastodon) Kind() Kind       { return KindSocial }

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
		return "", fmt.Errorf("mastodon: status %d", res.StatusCode)
	}
	var out struct {
		URL string `json:"url"`
	}
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		return "", err
	}
	return out.URL, nil
}
```

- [ ] **Step 4: Ver passar**

Run: `cd apps/api && go test ./internal/distribution/ -run TestMastodon -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/internal/distribution/mastodon.go apps/api/internal/distribution/mastodon_test.go
git commit -m "feat(api): adapter Mastodon (POST /api/v1/statuses)"
```

---

### Task 14: `Service.BuildProposals`

**Files:**

- Create: `apps/api/internal/distribution/service.go`
- Test: `apps/api/internal/distribution/service_test.go`

- [ ] **Step 1: Teste que falha**

```go
package distribution

import (
	"context"
	"testing"

	pkgllm "github.com/PiluVitu/api/internal/llm"
)

type fakeHooks struct{}

func (fakeHooks) GenerateHooks(_ context.Context, _ pkgllm.Article, platforms []string) ([]pkgllm.Hook, error) {
	out := make([]pkgllm.Hook, 0, len(platforms))
	for _, p := range platforms {
		out = append(out, pkgllm.Hook{Platform: p, Text: "hook-" + p})
	}
	return out, nil
}

func TestBuildProposals(t *testing.T) {
	s := newTestStore(t)
	// adapters: 1 artigo (devto) + 1 social (bluesky)
	svc := NewService(s, fakeHooks{}, []Publisher{NewDevTo("k"), NewBluesky("h", "p")})

	art := pkgllm.Article{Title: "T", Excerpt: "e", URL: "https://blog/p", Tags: []string{"go"}}
	targets, err := svc.BuildProposals(context.Background(), "p", art, "corpo do artigo")
	if err != nil {
		t.Fatalf("BuildProposals: %v", err)
	}
	if len(targets) != 2 {
		t.Fatalf("len = %d, want 2", len(targets))
	}
	byPlat := map[string]Target{}
	for _, t := range targets {
		byPlat[t.Platform] = t
	}
	if byPlat["devto"].Content != "corpo do artigo" || byPlat["devto"].Kind != KindArticle {
		t.Fatalf("devto = %+v", byPlat["devto"])
	}
	if byPlat["bluesky"].Content != "hook-bluesky" || byPlat["bluesky"].Kind != KindSocial {
		t.Fatalf("bluesky = %+v", byPlat["bluesky"])
	}
	// persistiu?
	stored, _ := s.ListBySlug(context.Background(), "p")
	if len(stored) != 2 {
		t.Fatalf("stored = %d, want 2", len(stored))
	}
}
```

- [ ] **Step 2: Ver falhar**

Run: `cd apps/api && go test ./internal/distribution/ -run TestBuildProposals -v`
Expected: FAIL (`undefined: NewService`).

- [ ] **Step 3: Implementar**

```go
package distribution

import (
	"context"

	pkgllm "github.com/PiluVitu/api/internal/llm"
)

// HookGenerator é satisfeito por *llm.Client.
type HookGenerator interface {
	GenerateHooks(ctx context.Context, a pkgllm.Article, platforms []string) ([]pkgllm.Hook, error)
}

// Service orquestra geração de propostas e publicação.
type Service struct {
	store *Store
	hooks HookGenerator
	pubs  map[string]Publisher
}

func NewService(store *Store, hooks HookGenerator, pubs []Publisher) *Service {
	m := make(map[string]Publisher, len(pubs))
	for _, p := range pubs {
		m[p.Platform()] = p
	}
	return &Service{store: store, hooks: hooks, pubs: m}
}

// socialPlatforms devolve as plataformas social_hook ativas.
func (s *Service) socialPlatforms() []string {
	var out []string
	for name, p := range s.pubs {
		if p.Kind() == KindSocial {
			out = append(out, name)
		}
	}
	return out
}

// BuildProposals monta os alvos (artigo = bodyMD; social = hook gerado), persiste e retorna.
func (s *Service) BuildProposals(ctx context.Context, slug string, art pkgllm.Article, bodyMD string) ([]Target, error) {
	var targets []Target

	// 1) artigos (republicação): conteúdo = corpo completo
	for name, p := range s.pubs {
		if p.Kind() == KindArticle {
			targets = append(targets, Target{Slug: slug, Platform: name, Kind: KindArticle, Content: bodyMD, Status: "pending"})
		}
	}

	// 2) sociais: gerar chamadas (uma chamada por plataforma)
	social := s.socialPlatforms()
	if len(social) > 0 && s.hooks != nil {
		hooks, err := s.hooks.GenerateHooks(ctx, art, social)
		if err != nil {
			return nil, err
		}
		for _, hk := range hooks {
			targets = append(targets, Target{Slug: slug, Platform: hk.Platform, Kind: KindSocial, Content: hk.Text, Status: "pending"})
		}
	}

	for _, t := range targets {
		if err := s.store.Upsert(ctx, t); err != nil {
			return nil, err
		}
	}
	return targets, nil
}
```

- [ ] **Step 4: Ver passar**

Run: `cd apps/api && go test ./internal/distribution/ -run TestBuildProposals -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/internal/distribution/service.go apps/api/internal/distribution/service_test.go
git commit -m "feat(api): Service.BuildProposals (artigo=corpo, social=hook+persist)"
```

---

### Task 15: `Service.Publish` (idempotente, por alvo)

**Files:**

- Modify: `apps/api/internal/distribution/service.go`
- Test: `apps/api/internal/distribution/service_test.go`

- [ ] **Step 1: Teste que falha**

Adicione em `service_test.go`:

```go
type fakePub struct {
	platform string
	kind     Kind
	calls    *int
	url      string
}

func (f fakePub) Platform() string { return f.platform }
func (f fakePub) Kind() Kind       { return f.kind }
func (f fakePub) Publish(_ context.Context, _ Payload) (string, error) {
	*f.calls++
	return f.url, nil
}

func TestPublishMarksPostedAndIsIdempotent(t *testing.T) {
	s := newTestStore(t)
	calls := 0
	pub := fakePub{platform: "mastodon", kind: KindSocial, calls: &calls, url: "https://m/1"}
	svc := NewService(s, fakeHooks{}, []Publisher{pub})

	// alvo pré-existente pending
	_ = s.Upsert(context.Background(), Target{Slug: "p", Platform: "mastodon", Kind: KindSocial, Content: "oi", Status: "pending"})

	sel := []Selected{{Platform: "mastodon", Content: "oi editado"}}
	out, err := svc.Publish(context.Background(), "p", sel)
	if err != nil {
		t.Fatalf("Publish: %v", err)
	}
	if calls != 1 {
		t.Fatalf("calls = %d, want 1", calls)
	}
	if got := find(out, "mastodon"); got.Status != "posted" || got.RemoteURL != "https://m/1" {
		t.Fatalf("target = %+v", got)
	}

	// segunda chamada não reposta (idempotência: já está posted)
	_, _ = svc.Publish(context.Background(), "p", sel)
	if calls != 1 {
		t.Fatalf("calls após 2ª = %d, want 1 (idempotente)", calls)
	}
}

func find(ts []Target, plat string) Target {
	for _, t := range ts {
		if t.Platform == plat {
			return t
		}
	}
	return Target{}
}
```

- [ ] **Step 2: Ver falhar**

Run: `cd apps/api && go test ./internal/distribution/ -run TestPublish -v`
Expected: FAIL (`undefined: Selected`).

- [ ] **Step 3: Implementar**

Adicione em `service.go`:

```go
// Selected é um alvo escolhido para publicar, com o conteúdo final (editado na UI).
type Selected struct {
	Platform string `json:"platform"`
	Content  string `json:"content"`
}

// Publish posta os alvos selecionados (pulando os já 'posted') e devolve o estado atual.
func (s *Service) Publish(ctx context.Context, slug string, selected []Selected) ([]Target, error) {
	for _, sel := range selected {
		pub, ok := s.pubs[sel.Platform]
		if !ok {
			continue
		}
		existing, err := s.store.Get(ctx, slug, sel.Platform)
		if err == nil && existing.Status == "posted" {
			continue // idempotência
		}
		// atualiza o conteúdo final antes de postar
		kind := pub.Kind()
		_ = s.store.Upsert(ctx, Target{Slug: slug, Platform: sel.Platform, Kind: kind, Content: sel.Content, Status: "pending"})

		payload := Payload{Text: sel.Content, BodyMD: sel.Content}
		if existing != nil {
			// para artigos, o conteúdo é o corpo; metadados vêm de proposals (mantidos no Content)
		}
		url, perr := pub.Publish(ctx, payload)
		if perr != nil {
			_ = s.store.MarkFailed(ctx, slug, sel.Platform, perr.Error())
			continue
		}
		_ = s.store.MarkPosted(ctx, slug, sel.Platform, url)
	}
	return s.store.ListBySlug(ctx, slug)
}
```

> **Nota de design (artigo vs social):** para `social_hook`, `Content` é o texto e `Payload.Text` basta. Para `article_crosspost`, o adapter precisa de `Title`/`CanonicalURL`/`Tags` além do corpo. No MVP, o handler `Publish` (Task 16) recebe esses metadados do `/admin` (que tem o post) e os injeta no `Payload` — veja a Task 16, que estende `Selected` com os campos de artigo. **Ajuste aqui:** troque a montagem do `Payload` para usar os campos de `sel` (próximo passo).

- [ ] **Step 4: Estender `Selected` com metadados de artigo e usar no Payload**

Substitua o tipo `Selected` e a montagem do payload:

```go
type Selected struct {
	Platform     string   `json:"platform"`
	Content      string   `json:"content"`       // social: texto; artigo: corpo MD
	Title        string   `json:"title"`         // artigo
	CanonicalURL string   `json:"canonical_url"` // artigo
	Description  string   `json:"description"`   // artigo
	Tags         []string `json:"tags"`          // artigo
}
```

E no loop, monte:

```go
		payload := Payload{
			Text:         sel.Content,
			BodyMD:       sel.Content,
			Title:        sel.Title,
			CanonicalURL: sel.CanonicalURL,
			Description:  sel.Description,
			Tags:         sel.Tags,
		}
```

(Remova o bloco `if existing != nil {}` vazio.)

- [ ] **Step 5: Ver passar**

Run: `cd apps/api && go test ./internal/distribution/ -v`
Expected: PASS (todos do pacote).

- [ ] **Step 6: Commit**

```bash
git add apps/api/internal/distribution/service.go apps/api/internal/distribution/service_test.go
git commit -m "feat(api): Service.Publish idempotente (por alvo, marca posted/failed)"
```

---

### Task 16: Handlers de distribuição + rotas

**Files:**

- Create: `apps/api/internal/handlers/distribution/handlers.go`
- Test: `apps/api/internal/handlers/distribution/handlers_test.go`
- Modify: `apps/api/internal/router/router.go` (rotas + import + campo `DistributionHandlers`)

> **Slug na URL:** chi expõe via `chi.URLParam(r, "slug")`.

- [ ] **Step 1: Teste que falha**

```go
package distribution

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
)

type stubSvc struct {
	proposals []dist.Target
}

func TestProposalsHandler(t *testing.T) {
	// ver helper svcStub abaixo; este teste valida o status 200 + shape
	h := NewHandlers(Deps{Service: okSvc{}})
	req := httptest.NewRequest(http.MethodPost, "/admin/distribution/proposals",
		bytes.NewBufferString(`{"slug":"p","title":"T","excerpt":"e","url":"https://b/p","body":"corpo","tags":["go"]}`))
	rec := httptest.NewRecorder()
	h.Proposals(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d; body=%s", rec.Code, rec.Body.String())
	}
	var env struct {
		Data struct{ Targets []map[string]any `json:"targets"` } `json:"data"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &env)
	if len(env.Data.Targets) != 1 {
		t.Fatalf("targets = %d, want 1", len(env.Data.Targets))
	}
}

func TestPublishHandler503WhenNil(t *testing.T) {
	h := NewHandlers(Deps{Service: nil})
	r := chi.NewRouter()
	r.Post("/admin/distribution/{slug}/publish", h.Publish)
	req := httptest.NewRequest(http.MethodPost, "/admin/distribution/p/publish", bytes.NewBufferString(`{"targets":[]}`))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", rec.Code)
	}
}
```

> Defina os stubs `okSvc`/imports (`dist "github.com/PiluVitu/api/internal/distribution"`, `pkgllm`) conforme a interface `DistService` criada no Step 3. Ajuste o teste para implementar `BuildProposals`/`Publish`/`List` devolvendo 1 target.

- [ ] **Step 2: Ver falhar**

Run: `cd apps/api && go test ./internal/handlers/distribution/ -v`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```go
// Package distribution expõe os endpoints admin de propostas/publicação.
package distribution

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	dist "github.com/PiluVitu/api/internal/distribution"
	"github.com/PiluVitu/api/internal/httpx"
	pkgllm "github.com/PiluVitu/api/internal/llm"
)

// DistService desacopla os handlers do *distribution.Service.
type DistService interface {
	BuildProposals(ctx context.Context, slug string, art pkgllm.Article, bodyMD string) ([]dist.Target, error)
	Publish(ctx context.Context, slug string, selected []dist.Selected) ([]dist.Target, error)
	List(ctx context.Context, slug string) ([]dist.Target, error)
}

type Deps struct{ Service DistService }

type Handlers struct{ svc DistService }

func NewHandlers(d Deps) *Handlers { return &Handlers{svc: d.Service} }

func (h *Handlers) down(w http.ResponseWriter) bool {
	if h.svc == nil {
		httpx.Error(w, http.StatusServiceUnavailable, "distribution_unavailable", "Distribuição indisponível.")
		return true
	}
	return false
}

func (h *Handlers) Proposals(w http.ResponseWriter, r *http.Request) {
	if h.down(w) {
		return
	}
	var in struct {
		Slug    string   `json:"slug"`
		Title   string   `json:"title"`
		Excerpt string   `json:"excerpt"`
		URL     string   `json:"url"`
		Body    string   `json:"body"`
		Tags    []string `json:"tags"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Slug == "" {
		httpx.Error(w, http.StatusBadRequest, "invalid_json", "Corpo inválido: 'slug' é obrigatório.")
		return
	}
	art := pkgllm.Article{Title: in.Title, Excerpt: in.Excerpt, URL: in.URL, Tags: in.Tags}
	targets, err := h.svc.BuildProposals(r.Context(), in.Slug, art, in.Body)
	if err != nil {
		httpx.Error(w, http.StatusBadGateway, "proposals_failed", "Falha ao gerar propostas.")
		return
	}
	httpx.Data(w, http.StatusOK, map[string]any{"targets": targets})
}

func (h *Handlers) Get(w http.ResponseWriter, r *http.Request) {
	if h.down(w) {
		return
	}
	slug := chi.URLParam(r, "slug")
	targets, err := h.svc.List(r.Context(), slug)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "Falha ao ler distribuição.")
		return
	}
	httpx.Data(w, http.StatusOK, map[string]any{"targets": targets})
}

func (h *Handlers) Publish(w http.ResponseWriter, r *http.Request) {
	if h.down(w) {
		return
	}
	slug := chi.URLParam(r, "slug")
	var in struct {
		Targets []dist.Selected `json:"targets"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_json", "Corpo inválido.")
		return
	}
	targets, err := h.svc.Publish(r.Context(), slug, in.Targets)
	if err != nil {
		httpx.Error(w, http.StatusBadGateway, "publish_failed", "Falha ao publicar.")
		return
	}
	httpx.Data(w, http.StatusOK, map[string]any{"targets": targets})
}
```

Adicione o método `List` ao `Service` em `internal/distribution/service.go`:

```go
// List devolve o estado atual dos alvos do slug.
func (s *Service) List(ctx context.Context, slug string) ([]Target, error) {
	return s.store.ListBySlug(ctx, slug)
}
```

- [ ] **Step 4: Rotas no router**

Em `router.go`, adicione o campo (se não fez na Task 6) e o import `handlersdistribution`. Dentro de `r.Route("/admin", ...)`:

```go
			if deps.DistributionHandlers != nil {
				r.With(auth.RequireAdmin(deps.Sessions, deps.Store)).Post("/distribution/proposals", deps.DistributionHandlers.Proposals)
				r.With(auth.RequireAdmin(deps.Sessions, deps.Store)).Get("/distribution/{slug}", deps.DistributionHandlers.Get)
				r.With(auth.RequireAdmin(deps.Sessions, deps.Store)).Post("/distribution/{slug}/publish", deps.DistributionHandlers.Publish)
			}
```

- [ ] **Step 5: Ver passar + compilar**

Run: `cd apps/api && go test ./internal/handlers/distribution/ -v && go build ./...`
Expected: PASS + build OK (router ainda não recebe os handlers até a Task 17, mas compila com o campo nil-guardado).

- [ ] **Step 6: Commit**

```bash
git add apps/api/internal/handlers/distribution/ apps/api/internal/distribution/service.go apps/api/internal/router/router.go
git commit -m "feat(api): handlers /admin/distribution/{proposals,get,publish} + rotas"
```

---

### Task 17: Wiring final em `main.go` + envs + docs

**Files:**

- Modify: `apps/api/cmd/api/main.go`
- Modify: `apps/api/.env.example`
- Modify: `apps/api/CLAUDE.md`, `CLAUDE.md` (raiz)

- [ ] **Step 1: Construir adapters + service em `main.go`**

Depois do bloco do `llmClient` (Task 6), adicione:

```go
	var pubs []distribution.Publisher
	if k := os.Getenv("DEVTO_API_KEY"); k != "" {
		pubs = append(pubs, distribution.NewDevTo(k))
	}
	if t := os.Getenv("HASHNODE_API_TOKEN"); t != "" {
		pubs = append(pubs, distribution.NewHashnode(t, os.Getenv("HASHNODE_PUBLICATION_ID")))
	}
	if h := os.Getenv("BLUESKY_HANDLE"); h != "" {
		pubs = append(pubs, distribution.NewBluesky(h, os.Getenv("BLUESKY_APP_PASSWORD")))
	}
	if inst := os.Getenv("MASTODON_INSTANCE_URL"); inst != "" {
		pubs = append(pubs, distribution.NewMastodon(inst, os.Getenv("MASTODON_ACCESS_TOKEN")))
	}

	var distH *handlersdistribution.Handlers
	if len(pubs) > 0 {
		distStore, derr := distribution.NewStore(store.DB())
		if derr != nil {
			slog.Error("distribution store init failed", "err", derr)
		} else {
			var hookGen distribution.HookGenerator
			if llmClient != nil {
				hookGen = llmClient
			}
			distSvc := distribution.NewService(distStore, hookGen, pubs)
			distH = handlersdistribution.NewHandlers(handlersdistribution.Deps{Service: distSvc})
			slog.Info("distribution enabled", "platforms", len(pubs))
		}
	}
```

> **nil-de-interface:** `distH` fica nil quando não há adapters → o router guarda com `if deps.DistributionHandlers != nil`. Como passamos `*handlersdistribution.Handlers` nil, o guard `!= nil` no router precisa ser sobre o ponteiro concreto — está correto porque `router.Deps.DistributionHandlers` é o tipo concreto `*handlersdistribution.Handlers`, não interface.

Adicione aos imports e passe ao router:

```go
	handlersdistribution "github.com/PiluVitu/api/internal/handlers/distribution"
	"github.com/PiluVitu/api/internal/distribution"
```

```go
		DistributionHandlers: distH,
```

- [ ] **Step 2: Envs**

Adicione ao `apps/api/.env.example`:

```bash
# --- Distribuição (todos opcionais; ausência desliga o adapter) ---
DEVTO_API_KEY=
HASHNODE_API_TOKEN=
HASHNODE_PUBLICATION_ID=
BLUESKY_HANDLE=
BLUESKY_APP_PASSWORD=
MASTODON_INSTANCE_URL=
MASTODON_ACCESS_TOKEN=
```

- [ ] **Step 3: Build + vet + test completos**

Run: `cd apps/api && go build ./... && go vet ./... && go test -race ./...`
Expected: tudo verde.

- [ ] **Step 4: Documentar**

Em `apps/api/CLAUDE.md`, adicione uma seção "### LLM local + Distribuição (`internal/llm`, `internal/distribution`)" descrevendo: endpoints, envs, tabela `distribution_targets` (schema idempotente no boot), fail-soft, Ollama nativo. Em `CLAUDE.md` (raiz), adicione `make stack`/`process-compose` e o stack Ollama+API+túnel na seção Commands.

- [ ] **Step 5: Commit**

```bash
git add apps/api/cmd/api/main.go apps/api/.env.example apps/api/CLAUDE.md CLAUDE.md
git commit -m "feat(api): wire distribution (adapters fail-soft + service) + docs + envs"
```

---

## Self-Review (preencher ao final da execução)

- [ ] **Spec coverage:** endpoints proofread/refine/proposals/get/publish ✅ (Tasks 5,16); adapters dev.to/Hashnode/Bluesky/Mastodon ✅ (10–13); persistência+idempotência ✅ (8,15); stack process-compose ✅ (7); fail-soft/503 ✅ (5,16,6,17). A UI fica no plano web (Fase 1b).
- [ ] **Placeholder scan:** nenhum "TBD". Os blocos "verifique o contrato live" nos adapters são **intencionais** (APIs de terceiros mudam) — confirme o contrato com um `curl` antes de implementar cada um.
- [ ] **Type consistency:** `Target`, `Kind`, `Payload`, `Selected`, `Publisher`, `Article`, `Hook`, `Service` consistentes entre store/service/handlers. `HookGenerator` satisfeito por `*llm.Client` (assinatura `GenerateHooks(ctx, llm.Article, []string) ([]llm.Hook, error)` idêntica).

## Próximo plano

`docs/superpowers/plans/2026-06-10-distribuicao-fase1-web-admin.md` — botão "Corrigir texto" (diff), tela "Distribuição" (editável + refino), api-client web, hooks TanStack Query, stories e E2E. Consome os endpoints `/admin/llm/*` e `/admin/distribution/*` desta fase.
