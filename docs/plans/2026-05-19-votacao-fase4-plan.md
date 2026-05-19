# Votação de Filmes — Fase 4: TMDb + Session Handlers

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Implementar o cliente TMDb (fail-soft) e os handlers HTTP `POST /votacao/sessions` (admin), `GET /votacao/sessions` (logged), `GET /votacao/sessions/:id` (logged), `GET /votacao/categorias` (logged). A criação de sessão lê Sheets, filtra+sorteia, busca pôsteres no TMDb (em paralelo, fail-soft), persiste no DB e devolve a sessão criada.

**Architecture:**
- `tmdb.Client` com dual constructor (prod usa API key + `https://api.themoviedb.org`; test usa `httptest.Server`). `SearchPoster(ctx, title, type) (url, tmdbID, error)` é fail-soft pra 404/empty → retorna `("", 0, nil)`. Apenas erros HTTP de transporte/parse retornam error.
- Handlers em `internal/handlers/votacao/` thin: parse JSON → chamam `gsheets` + `votacao.SortOnePerCategory` + `tmdb` + `votacao.Store`. Não inlineiam lógica de domínio.
- Pôsteres buscados em paralelo via `errgroup` (limit 5 concurrent) pra evitar latência sequencial em sessões com 10+ categorias.

**Tech Stack:** Go 1.25, `golang.org/x/sync/errgroup` (novo dep), `net/http` para TMDb (sem SDK — API simples).

**Reference design:** `docs/plans/2026-05-19-votacao-filmes-design.md` (seção "Endpoints", "Fluxos críticos: Criar sessão").

**Pré-requisitos:** Fases 1–3 commitadas (branch `feat/votacao-fase3` é o parent).

---

## File Structure

```
apps/api/internal/tmdb/
  client.go               # Client + NewClient + NewClientWithBase (test)
  search.go               # SearchPoster + types
  search_test.go          # httptest.Server fixtures
apps/api/internal/handlers/votacao/
  sessions.go             # CreateSession, ListSessions, GetSession handlers
  sessions_test.go        # tabela de handlers com gsheets/tmdb/store stubs
  categorias.go           # GetCategories handler
  categorias_test.go
  deps.go                 # Deps struct + sub-interfaces (SheetsReader, PosterSearcher)
apps/api/internal/router/router.go      # MODIFIED: mount /votacao/* under RequireAuth/RequireAdmin
apps/api/internal/router/router_test.go # MODIFIED: smoke test for /votacao/sessions
apps/api/cmd/api/main.go                # MODIFIED: build tmdb.Client + handlers.votacao Deps
apps/api/.env.example                   # MODIFIED: TMDB_API_KEY
infra/docker-compose.yml                # MODIFIED: TMDB_API_KEY passthrough
CLAUDE.md                               # MODIFIED: document tmdb + /votacao endpoints
```

---

## Task 1: tmdb.Client + SearchPoster

**Files:**
- Create: `apps/api/internal/tmdb/client.go`
- Create: `apps/api/internal/tmdb/search.go`
- Create: `apps/api/internal/tmdb/search_test.go`

### Step 1.1: Write failing tests

Create `apps/api/internal/tmdb/search_test.go`:

```go
package tmdb_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/PiluVitu/api/internal/tmdb"
)

func newServer(t *testing.T, handler http.HandlerFunc) *tmdb.Client {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	return tmdb.NewClientWithBase(srv.URL, "test-key")
}

func TestSearchPoster_FilmeHappy(t *testing.T) {
	c := newServer(t, func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/3/search/movie") {
			t.Errorf("path = %q, want /3/search/movie", r.URL.Path)
		}
		if r.URL.Query().Get("api_key") != "test-key" {
			t.Errorf("api_key missing")
		}
		_, _ = w.Write([]byte(`{"results":[{"id":550,"poster_path":"/abc.jpg"},{"id":777,"poster_path":"/xyz.jpg"}]}`))
	})
	url, id, err := c.SearchPoster(context.Background(), "Fight Club", "filme")
	if err != nil {
		t.Fatal(err)
	}
	if id != 550 {
		t.Errorf("id = %d, want 550 (first result)", id)
	}
	if url != "https://image.tmdb.org/t/p/w500/abc.jpg" {
		t.Errorf("url = %q", url)
	}
}

func TestSearchPoster_SerieHappy(t *testing.T) {
	c := newServer(t, func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/3/search/tv") {
			t.Errorf("path = %q, want /3/search/tv for serie type", r.URL.Path)
		}
		_, _ = w.Write([]byte(`{"results":[{"id":1396,"poster_path":"/breakingbad.jpg"}]}`))
	})
	url, id, _ := c.SearchPoster(context.Background(), "Breaking Bad", "serie")
	if id != 1396 || !strings.HasSuffix(url, "/breakingbad.jpg") {
		t.Errorf("got url=%q id=%d", url, id)
	}
}

func TestSearchPoster_NoResultsFailSoft(t *testing.T) {
	c := newServer(t, func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"results":[]}`))
	})
	url, id, err := c.SearchPoster(context.Background(), "Nope", "filme")
	if err != nil {
		t.Errorf("expected nil error on empty results (fail-soft), got %v", err)
	}
	if url != "" || id != 0 {
		t.Errorf("expected empty url+id, got %q %d", url, id)
	}
}

func TestSearchPoster_NullPosterFailSoft(t *testing.T) {
	c := newServer(t, func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"results":[{"id":1,"poster_path":null}]}`))
	})
	url, id, err := c.SearchPoster(context.Background(), "x", "filme")
	if err != nil {
		t.Fatal(err)
	}
	if id != 1 {
		t.Errorf("id should still come back when poster missing, got %d", id)
	}
	if url != "" {
		t.Errorf("url should be empty when poster_path is null, got %q", url)
	}
}

func TestSearchPoster_HTTP500Errors(t *testing.T) {
	c := newServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	})
	_, _, err := c.SearchPoster(context.Background(), "x", "filme")
	if err == nil {
		t.Error("expected error on 500 from TMDb")
	}
}

func TestSearchPoster_404FailSoft(t *testing.T) {
	c := newServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	})
	url, id, err := c.SearchPoster(context.Background(), "x", "filme")
	if err != nil {
		t.Errorf("404 should be soft, got err=%v", err)
	}
	if url != "" || id != 0 {
		t.Errorf("got %q %d", url, id)
	}
}

func TestSearchPoster_UnknownTypeDefaultsToMovie(t *testing.T) {
	c := newServer(t, func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/3/search/movie") {
			t.Errorf("default endpoint should be /3/search/movie, got %q", r.URL.Path)
		}
		_, _ = w.Write([]byte(`{"results":[]}`))
	})
	_, _, _ = c.SearchPoster(context.Background(), "x", "anything-else")
}
```

### Step 1.2: Run, confirm failure
```bash
cd apps/api && go test ./internal/tmdb/... -v
```
Expected: build error.

### Step 1.3: Implement client.go

Create `apps/api/internal/tmdb/client.go`:

```go
package tmdb

import "net/http"

const (
	defaultBase   = "https://api.themoviedb.org"
	posterCDNBase = "https://image.tmdb.org/t/p/w500"
)

// Client searches TMDb for movie/TV posters.
type Client struct {
	base   string
	apiKey string
	http   *http.Client
}

// NewClient returns a Client targeting the public TMDb endpoint.
func NewClient(apiKey string) *Client {
	return NewClientWithBase(defaultBase, apiKey)
}

// NewClientWithBase lets tests point the client at an httptest.Server.
func NewClientWithBase(base, apiKey string) *Client {
	return &Client{base: base, apiKey: apiKey, http: http.DefaultClient}
}
```

### Step 1.4: Implement search.go

Create `apps/api/internal/tmdb/search.go`:

```go
package tmdb

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
)

type searchResult struct {
	ID         int64   `json:"id"`
	PosterPath *string `json:"poster_path"`
}

type searchResponse struct {
	Results []searchResult `json:"results"`
}

// SearchPoster returns the first matching poster URL and TMDb ID for the given
// title and type ("serie" hits /search/tv; anything else hits /search/movie).
// Fail-soft: 404 or empty results return ("", 0, nil). Only HTTP 5xx or
// parse errors surface as errors.
func (c *Client) SearchPoster(ctx context.Context, title, mediaType string) (string, int64, error) {
	endpoint := "/3/search/movie"
	if mediaType == "serie" {
		endpoint = "/3/search/tv"
	}

	q := url.Values{}
	q.Set("api_key", c.apiKey)
	q.Set("query", title)
	q.Set("include_adult", "false")
	full := c.base + endpoint + "?" + q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, full, nil)
	if err != nil {
		return "", 0, fmt.Errorf("tmdb: build request: %w", err)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return "", 0, fmt.Errorf("tmdb: do request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return "", 0, nil
	}
	if resp.StatusCode >= 500 {
		return "", 0, fmt.Errorf("tmdb: status %d", resp.StatusCode)
	}
	if resp.StatusCode >= 400 {
		return "", 0, fmt.Errorf("tmdb: client error %d", resp.StatusCode)
	}

	var body searchResponse
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return "", 0, fmt.Errorf("tmdb: decode: %w", err)
	}
	if len(body.Results) == 0 {
		return "", 0, nil
	}
	r := body.Results[0]
	if r.PosterPath == nil || *r.PosterPath == "" {
		return "", r.ID, nil
	}
	return posterCDNBase + *r.PosterPath, r.ID, nil
}
```

### Step 1.5: Run, confirm pass
```bash
cd apps/api && go test ./internal/tmdb/... -v
```
Expected: 7 tests pass.

### Step 1.6: Commit
```bash
git add apps/api/internal/tmdb/
git commit -m "feat(tmdb): SearchPoster with fail-soft for empty/404"
```

---

## Task 2: handlers/votacao Deps + interfaces

**Files:**
- Create: `apps/api/internal/handlers/votacao/deps.go`

### Step 2.1: Implement deps.go

Create `apps/api/internal/handlers/votacao/deps.go`:

```go
package votacao

import (
	"context"

	"github.com/PiluVitu/api/internal/votacao"
)

// SheetsReader is the subset of gsheets.Client used by these handlers.
// Defined here so tests can inject a stub without depending on gsheets.
type SheetsReader interface {
	ReadMovies(ctx context.Context) ([]votacao.SheetMovie, error)
	GetCategories(ctx context.Context) ([]string, error)
}

// PosterSearcher is the subset of tmdb.Client used by these handlers.
type PosterSearcher interface {
	SearchPoster(ctx context.Context, title, mediaType string) (url string, tmdbID int64, err error)
}

// Deps wires the votacao HTTP handlers to their collaborators.
type Deps struct {
	Store   *votacao.Store
	Sheets  SheetsReader
	Posters PosterSearcher
}

// Handlers is the HTTP-layer entry point for /votacao/* routes.
type Handlers struct {
	deps Deps
}

// NewHandlers constructs a Handlers with the given dependencies.
func NewHandlers(deps Deps) *Handlers { return &Handlers{deps: deps} }
```

### Step 2.2: Verify build
```bash
cd apps/api && go build ./...
```

### Step 2.3: Commit
```bash
git add apps/api/internal/handlers/votacao/deps.go
git commit -m "feat(handlers): votacao Deps + interfaces for Sheets/Posters"
```

---

## Task 3: Categorias handler

**Files:**
- Create: `apps/api/internal/handlers/votacao/categorias.go`
- Create: `apps/api/internal/handlers/votacao/categorias_test.go`

### Step 3.1: Write failing tests

Create `apps/api/internal/handlers/votacao/categorias_test.go`:

```go
package votacao_test

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	handlersvotacao "github.com/PiluVitu/api/internal/handlers/votacao"
	"github.com/PiluVitu/api/internal/votacao"
)

type stubSheets struct {
	categories []string
	categErr   error
	movies     []votacao.SheetMovie
	moviesErr  error
}

func (s *stubSheets) GetCategories(ctx context.Context) ([]string, error) {
	return s.categories, s.categErr
}
func (s *stubSheets) ReadMovies(ctx context.Context) ([]votacao.SheetMovie, error) {
	return s.movies, s.moviesErr
}

type stubPosters struct {
	url string
	id  int64
	err error
}

func (s *stubPosters) SearchPoster(ctx context.Context, title, mediaType string) (string, int64, error) {
	return s.url, s.id, s.err
}

func newHandlers(t *testing.T, sheets handlersvotacao.SheetsReader, posters handlersvotacao.PosterSearcher) *handlersvotacao.Handlers {
	t.Helper()
	return handlersvotacao.NewHandlers(handlersvotacao.Deps{
		Sheets:  sheets,
		Posters: posters,
	})
}

func TestCategorias_ReturnsList(t *testing.T) {
	h := newHandlers(t, &stubSheets{categories: []string{"ação", "comédia", "drama"}}, &stubPosters{})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/votacao/categorias", nil)
	h.GetCategorias(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	var body struct {
		Categories []string `json:"categories"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if len(body.Categories) != 3 || body.Categories[0] != "ação" {
		t.Errorf("body = %+v", body)
	}
}

func TestCategorias_SheetsError(t *testing.T) {
	h := newHandlers(t, &stubSheets{categErr: errors.New("boom")}, &stubPosters{})
	rec := httptest.NewRecorder()
	h.GetCategorias(rec, httptest.NewRequest(http.MethodGet, "/votacao/categorias", nil))
	if rec.Code != http.StatusBadGateway {
		t.Errorf("status = %d, want 502", rec.Code)
	}
}

func TestCategorias_SheetsDisabled(t *testing.T) {
	// When deps.Sheets is nil, handler must respond 503 (not panic).
	h := handlersvotacao.NewHandlers(handlersvotacao.Deps{})
	rec := httptest.NewRecorder()
	h.GetCategorias(rec, httptest.NewRequest(http.MethodGet, "/votacao/categorias", nil))
	if rec.Code != http.StatusServiceUnavailable {
		t.Errorf("status = %d, want 503", rec.Code)
	}
}

// quiet linter
var (
	_ = io.Discard
	_ = strings.TrimSpace
)
```

### Step 3.2: Run, confirm failure
```bash
cd apps/api && go test ./internal/handlers/votacao/... -v
```
Expected: undefined method.

### Step 3.3: Implement categorias.go

Create `apps/api/internal/handlers/votacao/categorias.go`:

```go
package votacao

import (
	"encoding/json"
	"net/http"
)

// GetCategorias returns the deduplicated list of categories present in the
// upstream Google Sheet. Returns 503 if no SheetsReader was wired (sheets
// disabled in dev), 502 on upstream error.
func (h *Handlers) GetCategorias(w http.ResponseWriter, r *http.Request) {
	if h.deps.Sheets == nil {
		jsonError(w, http.StatusServiceUnavailable, "sheets reader disabled")
		return
	}
	cats, err := h.deps.Sheets.GetCategories(r.Context())
	if err != nil {
		jsonError(w, http.StatusBadGateway, "sheets read failed")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"categories": cats})
}

func jsonError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
```

### Step 3.4: Run, confirm pass
```bash
cd apps/api && go test ./internal/handlers/votacao/... -v
```
Expected: 3 tests pass.

### Step 3.5: Commit
```bash
git add apps/api/internal/handlers/votacao/categorias.go apps/api/internal/handlers/votacao/categorias_test.go
git commit -m "feat(handlers): GET /votacao/categorias handler"
```

---

## Task 4: Sessions handlers (Create / List / Get)

**Files:**
- Create: `apps/api/internal/handlers/votacao/sessions.go`
- Create: `apps/api/internal/handlers/votacao/sessions_test.go`

### Step 4.1: Implement sessions.go

Create `apps/api/internal/handlers/votacao/sessions.go`:

```go
package votacao

import (
	"context"
	"encoding/json"
	"errors"
	"math/rand"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"golang.org/x/sync/errgroup"

	"github.com/PiluVitu/api/internal/auth"
	"github.com/PiluVitu/api/internal/votacao"
)

// createSessionBody is the request payload for POST /votacao/sessions.
type createSessionBody struct {
	Title          string   `json:"title"`
	Types          []string `json:"types"`
	IncludeWatched bool     `json:"include_watched"`
	Categories     []string `json:"categories"`
}

// CreateSession (admin) reads sheets → filters+sorts → fetches TMDb posters → inserts session+movies.
func (h *Handlers) CreateSession(w http.ResponseWriter, r *http.Request) {
	if h.deps.Sheets == nil {
		jsonError(w, http.StatusServiceUnavailable, "sheets reader disabled")
		return
	}
	user := auth.UserFromContext(r.Context())
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	var body createSessionBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if body.Title == "" {
		jsonError(w, http.StatusBadRequest, "title required")
		return
	}

	movies, err := h.deps.Sheets.ReadMovies(r.Context())
	if err != nil {
		jsonError(w, http.StatusBadGateway, "sheets read failed")
		return
	}
	picked, err := votacao.SortOnePerCategory(movies, votacao.SortOptions{
		Types:          body.Types,
		IncludeWatched: body.IncludeWatched,
		Categories:     body.Categories,
	}, rand.New(rand.NewSource(time.Now().UnixNano())))
	if err != nil {
		if errors.Is(err, votacao.ErrNoCandidates) {
			jsonError(w, http.StatusUnprocessableEntity, "no movies match the filters")
			return
		}
		jsonError(w, http.StatusInternalServerError, "sort failed")
		return
	}

	withPosters := h.fetchPosters(r.Context(), picked)

	sortJSON, _ := json.Marshal(body)
	session, err := h.deps.Store.CreateVotingSession(r.Context(), body.Title, user.ID, string(sortJSON))
	if err != nil {
		jsonError(w, http.StatusInternalServerError, "create session failed")
		return
	}

	sessionMovies := make([]votacao.SessionMovie, 0, len(withPosters))
	for _, m := range withPosters {
		sm := votacao.SessionMovie{
			SessionID:   session.ID,
			Category:    m.movie.Category,
			Title:       m.movie.Title,
			Type:        m.movie.Type,
			PosterURL:   m.posterURL,
			WasWatched:  m.movie.Watched,
		}
		if m.tmdbID > 0 {
			id := m.tmdbID
			sm.TMDbID = &id
		}
		if m.movie.Number > 0 {
			n := int64(m.movie.Number)
			sm.SheetNumber = &n
		}
		sessionMovies = append(sessionMovies, sm)
	}
	if err := h.deps.Store.InsertSessionMovies(r.Context(), sessionMovies); err != nil {
		jsonError(w, http.StatusInternalServerError, "insert movies failed")
		return
	}

	stored, _ := h.deps.Store.GetSessionMovies(r.Context(), session.ID)
	writeSessionJSON(w, http.StatusCreated, session, stored)
}

type pickedMovie struct {
	movie     votacao.SheetMovie
	posterURL string
	tmdbID    int64
}

// fetchPosters issues parallel TMDb lookups (max 5 concurrent) with a 3s
// hard timeout each. Any failure is swallowed — the picked entry survives
// with empty poster/tmdbID. Fail-soft is the point.
func (h *Handlers) fetchPosters(ctx context.Context, picked []votacao.SheetMovie) []pickedMovie {
	out := make([]pickedMovie, len(picked))
	if h.deps.Posters == nil {
		for i, m := range picked {
			out[i] = pickedMovie{movie: m}
		}
		return out
	}
	g, gctx := errgroup.WithContext(ctx)
	g.SetLimit(5)
	var mu sync.Mutex
	for i, m := range picked {
		i, m := i, m
		g.Go(func() error {
			perReq, cancel := context.WithTimeout(gctx, 3*time.Second)
			defer cancel()
			url, id, err := h.deps.Posters.SearchPoster(perReq, m.Title, m.Type)
			mu.Lock()
			defer mu.Unlock()
			if err != nil {
				out[i] = pickedMovie{movie: m}
				return nil
			}
			out[i] = pickedMovie{movie: m, posterURL: url, tmdbID: id}
			return nil
		})
	}
	_ = g.Wait()
	return out
}

// ListSessions (logged) returns the latest sessions (newest first).
func (h *Handlers) ListSessions(w http.ResponseWriter, r *http.Request) {
	limit := atoiOr(r.URL.Query().Get("limit"), 20)
	offset := atoiOr(r.URL.Query().Get("offset"), 0)
	sessions, err := h.deps.Store.ListVotingSessions(r.Context(), limit, offset)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, "list failed")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"sessions": sessions})
}

// GetSession (logged) returns one session + movies + whether the caller voted.
func (h *Handlers) GetSession(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, http.StatusBadRequest, "invalid id")
		return
	}
	session, err := h.deps.Store.GetVotingSession(r.Context(), id)
	if err != nil {
		if errors.Is(err, votacao.ErrNotFound) {
			jsonError(w, http.StatusNotFound, "session not found")
			return
		}
		jsonError(w, http.StatusInternalServerError, "get session failed")
		return
	}
	movies, _ := h.deps.Store.GetSessionMovies(r.Context(), session.ID)
	writeSessionJSON(w, http.StatusOK, session, movies)
}

func writeSessionJSON(w http.ResponseWriter, status int, session *votacao.VotingSession, movies []votacao.SessionMovie) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"session": session,
		"movies":  movies,
	})
}

func atoiOr(s string, fallback int) int {
	if s == "" {
		return fallback
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		return fallback
	}
	return n
}
```

### Step 4.2: Write tests

Create `apps/api/internal/handlers/votacao/sessions_test.go`:

```go
package votacao_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/PiluVitu/api/internal/auth"
	handlersvotacao "github.com/PiluVitu/api/internal/handlers/votacao"
	"github.com/PiluVitu/api/internal/votacao"
)

func openTestStore(t *testing.T) *votacao.Store {
	t.Helper()
	s, err := votacao.NewStore(filepath.Join(t.TempDir(), "x.db"))
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	t.Cleanup(func() { _ = s.Close() })
	return s
}

func makeAdmin(t *testing.T, store *votacao.Store) *votacao.User {
	u, err := store.UpsertUser(context.Background(), "sub", "admin@x.com", "Admin", "", []string{"admin@x.com"})
	if err != nil {
		t.Fatal(err)
	}
	return u
}

func newH(t *testing.T, sheets handlersvotacao.SheetsReader, posters handlersvotacao.PosterSearcher, store *votacao.Store) *handlersvotacao.Handlers {
	return handlersvotacao.NewHandlers(handlersvotacao.Deps{
		Store: store, Sheets: sheets, Posters: posters,
	})
}

func TestCreateSession_HappyPath(t *testing.T) {
	store := openTestStore(t)
	admin := makeAdmin(t, store)

	sheets := &stubSheets{
		movies: []votacao.SheetMovie{
			{Number: 1, Title: "A", Type: "filme", Category: "terror"},
			{Number: 2, Title: "B", Type: "filme", Category: "drama"},
		},
	}
	posters := &stubPosters{url: "http://poster", id: 42}
	h := newH(t, sheets, posters, store)

	body := strings.NewReader(`{"title":"Sexta","types":["filme"],"include_watched":true}`)
	req := httptest.NewRequest(http.MethodPost, "/votacao/sessions", body)
	req = req.WithContext(context.WithValue(req.Context(), authUserCtxKey, admin))
	// Inject user via the auth.UserFromContext path — the test helper below mirrors it.
	rec := httptest.NewRecorder()
	h.CreateSession(rec, requestWithUser(req, admin))

	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var out struct {
		Session *votacao.VotingSession  `json:"session"`
		Movies  []votacao.SessionMovie  `json:"movies"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	if out.Session == nil || out.Session.Title != "Sexta" {
		t.Errorf("session = %+v", out.Session)
	}
	if len(out.Movies) != 2 {
		t.Fatalf("movies len = %d, want 2", len(out.Movies))
	}
	for _, m := range out.Movies {
		if m.PosterURL != "http://poster" {
			t.Errorf("poster missing: %+v", m)
		}
		if m.TMDbID == nil || *m.TMDbID != 42 {
			t.Errorf("tmdb id missing: %+v", m)
		}
	}
}

func TestCreateSession_NoCandidates_422(t *testing.T) {
	store := openTestStore(t)
	admin := makeAdmin(t, store)
	sheets := &stubSheets{movies: []votacao.SheetMovie{{Title: "x", Type: "filme", Category: "terror", Watched: true}}}
	h := newH(t, sheets, &stubPosters{}, store)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/votacao/sessions",
		bytes.NewReader([]byte(`{"title":"x","include_watched":false}`)))
	h.CreateSession(rec, requestWithUser(req, admin))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Errorf("status = %d", rec.Code)
	}
}

func TestCreateSession_InvalidJSON_400(t *testing.T) {
	store := openTestStore(t)
	admin := makeAdmin(t, store)
	h := newH(t, &stubSheets{}, &stubPosters{}, store)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/votacao/sessions", strings.NewReader("not json"))
	h.CreateSession(rec, requestWithUser(req, admin))
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d", rec.Code)
	}
}

func TestCreateSession_TitleRequired_400(t *testing.T) {
	store := openTestStore(t)
	admin := makeAdmin(t, store)
	h := newH(t, &stubSheets{movies: []votacao.SheetMovie{{Title: "x", Type: "filme", Category: "terror"}}}, &stubPosters{}, store)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/votacao/sessions", strings.NewReader(`{}`))
	h.CreateSession(rec, requestWithUser(req, admin))
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d", rec.Code)
	}
}

func TestListSessions(t *testing.T) {
	store := openTestStore(t)
	admin := makeAdmin(t, store)
	_, _ = store.CreateVotingSession(context.Background(), "S1", admin.ID, "{}")
	_, _ = store.CreateVotingSession(context.Background(), "S2", admin.ID, "{}")
	h := newH(t, &stubSheets{}, &stubPosters{}, store)
	rec := httptest.NewRecorder()
	h.ListSessions(rec, httptest.NewRequest(http.MethodGet, "/votacao/sessions", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	var out struct {
		Sessions []votacao.VotingSession `json:"sessions"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	if len(out.Sessions) != 2 {
		t.Errorf("got %d", len(out.Sessions))
	}
}

func TestGetSession_HappyPath(t *testing.T) {
	store := openTestStore(t)
	admin := makeAdmin(t, store)
	sess, _ := store.CreateVotingSession(context.Background(), "X", admin.ID, "{}")
	h := newH(t, &stubSheets{}, &stubPosters{}, store)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/votacao/sessions/1", nil)
	// chi.URLParam needs route context set:
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "1")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	h.GetSession(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	var out struct {
		Session *votacao.VotingSession `json:"session"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	if out.Session == nil || out.Session.ID != sess.ID {
		t.Errorf("session mismatch")
	}
}

func TestGetSession_NotFound_404(t *testing.T) {
	store := openTestStore(t)
	h := newH(t, &stubSheets{}, &stubPosters{}, store)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/votacao/sessions/999", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "999")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	h.GetSession(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d", rec.Code)
	}
}

// authUserCtxKey mirrors the unexported key in internal/auth — we re-create
// it here because the test attaches a User to the request the same way
// the auth.RequireAuth middleware does. The key MUST match the auth package's
// internal key; if auth.UserFromContext is used in production this test
// won't compile if it diverges (because requestWithUser uses auth.UserFromContext).
type ctxKey int

const authUserCtxKey ctxKey = 0

func requestWithUser(r *http.Request, u *votacao.User) *http.Request {
	// Use the same shape RequireAuth uses. Since the key type is unexported in
	// the auth package, we cannot import it directly — instead we set a value
	// the handler retrieves via auth.UserFromContext. Use the exported helper.
	return r.WithContext(auth.WithUserForTests(r.Context(), u))
}
```

> The test needs an `auth.WithUserForTests(ctx, u) context.Context` exported helper because the user-context key in `internal/auth/middleware.go` is unexported. Add it now in a separate small commit so this test compiles.

### Step 4.3: Add auth.WithUserForTests helper

Append to `apps/api/internal/auth/middleware.go`:

```go
// WithUserForTests attaches a user to the context exactly as RequireAuth would.
// Intended for downstream packages' tests; do not call from production code.
func WithUserForTests(ctx context.Context, u *votacao.User) context.Context {
	return context.WithValue(ctx, userCtxKey, u)
}
```

### Step 4.4: Run tests, confirm pass

```bash
cd apps/api && go test ./internal/handlers/votacao/... -v
cd apps/api && go test ./internal/auth/... -v
```

Expected: 7 new session tests + 3 categorias = 10 in handlers/votacao; 24 in auth (unchanged).

### Step 4.5: Commit
```bash
git add apps/api/internal/handlers/votacao/sessions.go apps/api/internal/handlers/votacao/sessions_test.go apps/api/internal/auth/middleware.go
git commit -m "feat(handlers): votacao session Create/List/Get + auth.WithUserForTests"
```

---

## Task 5: Mount /votacao routes + main.go wiring

**Files:**
- Modify: `apps/api/internal/router/router.go`
- Modify: `apps/api/internal/router/router_test.go`
- Modify: `apps/api/cmd/api/main.go`

### Step 5.1: Update router.go

Edit `apps/api/internal/router/router.go`. Add to the imports: `handlersvotacao "github.com/PiluVitu/api/internal/handlers/votacao"`, and update `Deps` + the routing block.

Add field to `Deps`:
```go
type Deps struct {
	DB              *sql.DB
	Sessions        *scs.SessionManager
	AuthHandlers    *auth.Handlers
	VotacaoHandlers *handlersvotacao.Handlers
	Store           *votacao.Store // needed by RequireAuth middleware constructors
}
```

(`votacao` import needs to be added too.)

After the `/auth` route block, add:

```go
if deps.VotacaoHandlers != nil && deps.Store != nil && deps.Sessions != nil {
    r.Route("/votacao", func(r chi.Router) {
        r.With(auth.RequireAuth(deps.Sessions, deps.Store)).Get("/categorias", deps.VotacaoHandlers.GetCategorias)
        r.With(auth.RequireAuth(deps.Sessions, deps.Store)).Get("/sessions", deps.VotacaoHandlers.ListSessions)
        r.With(auth.RequireAuth(deps.Sessions, deps.Store)).Get("/sessions/{id}", deps.VotacaoHandlers.GetSession)
        r.With(auth.RequireAdmin(deps.Sessions, deps.Store)).Post("/sessions", deps.VotacaoHandlers.CreateSession)
    })
}
```

### Step 5.2: Update router_test.go

Add a smoke test:

```go
func TestVotacaoSessions_RequiresAuth(t *testing.T) {
	store, _ := votacao.NewStore(filepath.Join(t.TempDir(), "x.db"))
	t.Cleanup(func() { _ = store.Close() })
	sm := auth.NewSessionManager(store.DB())
	authH := auth.NewHandlers(auth.HandlersDeps{
		Store: store, Sessions: sm,
		Config:    auth.Config{ClientID: "cid", WebRedirectURL: "http://web"},
		Exchanger: &fakeExchanger{}, Verifier: &fakeVerifier{},
	})
	votH := handlersvotacao.NewHandlers(handlersvotacao.Deps{Store: store})

	srv := httptest.NewServer(New(Deps{
		DB: store.DB(), Sessions: sm, AuthHandlers: authH,
		VotacaoHandlers: votH, Store: store,
	}))
	defer srv.Close()
	resp, _ := http.Get(srv.URL + "/votacao/sessions")
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", resp.StatusCode)
	}
}
```

Add `handlersvotacao "github.com/PiluVitu/api/internal/handlers/votacao"` to imports.

### Step 5.3: Update main.go

Add TMDb client construction + handlersvotacao wiring. Read TMDB_API_KEY env (optional; if empty, posters disabled — sessions still create, just without posters).

Replace the file with the updated version that builds:
- `tmdb.NewClient(apiKey)` if `TMDB_API_KEY` set, else nil
- A locally-stored `gsheets.Client` (instead of throwing away) if `GSHEETS_MOVIES_SPREADSHEET_ID` set
- `handlersvotacao.NewHandlers(Deps{Store, Sheets, Posters})`
- Pass to `router.New(Deps{..., VotacaoHandlers, Store})`

```go
package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"strings"

	"github.com/PiluVitu/api/internal/auth"
	"github.com/PiluVitu/api/internal/gsheets"
	handlersvotacao "github.com/PiluVitu/api/internal/handlers/votacao"
	"github.com/PiluVitu/api/internal/router"
	"github.com/PiluVitu/api/internal/tmdb"
	"github.com/PiluVitu/api/internal/votacao"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	dbPath := os.Getenv("SQLITE_PATH")
	if dbPath == "" {
		dbPath = "/data/votacao.db"
	}

	store, err := votacao.NewStore(dbPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "db: %v\n", err)
		os.Exit(1)
	}
	defer store.Close()

	cfg, err := auth.ConfigFromEnv()
	if err != nil {
		fmt.Fprintf(os.Stderr, "auth config: %v\n", err)
		os.Exit(1)
	}
	sm := auth.NewSessionManager(store.DB())
	if strings.EqualFold(os.Getenv("SESSION_COOKIE_SECURE"), "true") {
		sm.Cookie.Secure = true
	}
	authHandlers := auth.NewHandlers(auth.HandlersDeps{
		Store: store, Sessions: sm, Config: cfg,
		Exchanger: auth.NewGoogleTokenExchanger(cfg),
		Verifier:  auth.NewGoogleIDTokenVerifier(),
	})

	var sheetsClient handlersvotacao.SheetsReader
	if sheetID := os.Getenv("GSHEETS_MOVIES_SPREADSHEET_ID"); sheetID != "" {
		rangeA1 := os.Getenv("GSHEETS_MOVIES_RANGE")
		if rangeA1 == "" {
			rangeA1 = "A2:F"
		}
		c, gerr := gsheets.NewClient(context.Background(), sheetID, rangeA1)
		if gerr != nil {
			fmt.Fprintf(os.Stderr, "gsheets: %v (continuing without sheets)\n", gerr)
		} else {
			sheetsClient = c
		}
	}

	var postersClient handlersvotacao.PosterSearcher
	if key := os.Getenv("TMDB_API_KEY"); key != "" {
		postersClient = tmdb.NewClient(key)
	}

	votH := handlersvotacao.NewHandlers(handlersvotacao.Deps{
		Store: store, Sheets: sheetsClient, Posters: postersClient,
	})

	handler := router.New(router.Deps{
		DB: store.DB(), Sessions: sm,
		AuthHandlers: authHandlers, VotacaoHandlers: votH, Store: store,
	})

	addr := ":" + port
	fmt.Printf("API listening on %s (db=%s)\n", addr, dbPath)
	if err := http.ListenAndServe(addr, handler); err != nil {
		fmt.Fprintf(os.Stderr, "server error: %v\n", err)
		os.Exit(1)
	}
}
```

### Step 5.4: Verify build + tests
```bash
cd apps/api && go vet ./... && go test ./... && go build ./...
```
Expected: all green.

### Step 5.5: Commit
```bash
git add apps/api/internal/router/router.go apps/api/internal/router/router_test.go apps/api/cmd/api/main.go
git commit -m "feat(api): mount /votacao/* routes + main wires sheets+tmdb"
```

---

## Task 6: env + compose + CLAUDE.md

### Step 6.1: Append to `.env.example`

```dotenv

# TMDb — themoviedb.org API key (free tier, https://www.themoviedb.org/settings/api).
# When unset, sessions are created without posters (fail-soft).
TMDB_API_KEY=
```

### Step 6.2: Add to `infra/docker-compose.yml` api env

```yaml
      TMDB_API_KEY: ${TMDB_API_KEY:-}
```

### Step 6.3: Update CLAUDE.md

Update Status line to "Fase 4 concluída: TMDb + handlers de sessions". Add a new sub-section:

```markdown
#### TMDb + handlers de sessions (`internal/tmdb`, `internal/handlers/votacao`)

- **tmdb.Client (`SearchPoster`):** GET TMDb v3 `/search/movie` ou `/search/tv`. Fail-soft: 404 ou results vazio → `("", 0, nil)`. Apenas 5xx ou erro de parse propaga.
- **handlers/votacao.Handlers:**
  - `GetCategorias` (GET /votacao/categorias) — usa `SheetsReader.GetCategories`. 503 se sheets desligado, 502 se Sheets falha.
  - `CreateSession` (POST /votacao/sessions, admin) — lê Sheets → `SortOnePerCategory` → busca pôsteres TMDb em paralelo (errgroup limit=5, timeout 3s cada) → grava session + session_movies. 422 se nenhum filme bate filtros.
  - `ListSessions` (GET /votacao/sessions) — paginação via `limit`/`offset`.
  - `GetSession` (GET /votacao/sessions/{id}) — 404 se não existir.
- **Sub-interfaces:** `SheetsReader` e `PosterSearcher` são interfaces locais no pacote — desacoplam testes do gsheets/tmdb concretos. Stubs em `*_test.go`.
- **auth.WithUserForTests:** novo helper exportado em `internal/auth/middleware.go` permite que outros pacotes plantem o user no ctx do request nos testes sem reinventar a chave.
```

### Step 6.4: Final sweep + commit

```bash
cd apps/api && go vet ./... && go test ./... && go build ./...
git add apps/api/.env.example infra/docker-compose.yml CLAUDE.md
git commit -m "docs/infra(votacao): wire TMDB_API_KEY + document Phase 4"
```

---

## Phase 4 Exit Criteria

- [ ] tmdb.SearchPoster covered by 7 hermetic tests
- [ ] handlers/votacao 10+ tests (Categorias 3 + Sessions 5+)
- [ ] /votacao/* mounted with RequireAuth + RequireAdmin
- [ ] Sessions persist correctly with poster URL when TMDb succeeds
- [ ] All previous tests still pass
- [ ] CLAUDE.md updated

---

## Notes for the implementer

- `golang.org/x/sync/errgroup` will be promoted to direct dep when imported — Go does this automatically; commit `go.sum` if it changes.
- `pickedMovie.movie.Watched` carries the Sheets watched flag into `SessionMovie.WasWatched` — captures the snapshot at sortear time per design.
- The `requestWithUser` test helper relies on `auth.WithUserForTests`. Make sure that exported helper lands (Task 4 Step 4.3).
- Sessions are stored newest-first by ID DESC (existing votacao.ListVotingSessions).
- 6 commits in this phase.
