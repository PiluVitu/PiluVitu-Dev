# Votação de Filmes — Fase 5: Vote + Close + Results

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Adicionar 3 endpoints: `POST /votacao/sessions/:id/votes` (vota), `POST /votacao/sessions/:id/close` (admin fecha + calcula winner), `GET /votacao/sessions/:id/results` (tally por filme). Estender `GetSession` para incluir `has_voted` quando o usuário já votou.

**Architecture:**
- Handlers reusam `votacao.Store` (já tem `InsertVote`, `ListVotesBySession`, `CloseVotingSession`).
- `tallyVotes(votes []Vote) → map[movieID]count` é função pura colocada em `votacao/results.go`.
- Cálculo de winner ao fechar: maior count vence; empate é resolvido por movie_id ASC (determinístico). Se zero votos, winner é nil (sessão pode ser fechada sem vencedor).
- `has_voted` derivado por SQL específico: `SELECT EXISTS(SELECT 1 FROM votes WHERE session_id=? AND user_id=?)`.

**Tech Stack:** Sem novas deps.

**Pré-requisitos:** Fases 1-4 commitadas. Branch `feat/votacao-fase5` partindo de `feat/votacao-fase4`.

---

## File Structure

```
apps/api/internal/votacao/
  results.go             # TallyVotes pure + Result struct + ComputeWinner
  results_test.go        # pure tests
  votes.go               # MODIFIED: + HasVoted(sessionID, userID) bool
  votes_test.go          # MODIFIED: + tests for HasVoted
apps/api/internal/handlers/votacao/
  votes.go               # CreateVote, GetResults, CloseSession handlers
  votes_test.go          # 6 handler tests
  sessions.go            # MODIFIED: GetSession includes has_voted
CLAUDE.md                # MODIFIED: document /votacao/sessions/:id/{votes,close,results}
```

---

## Task 1: TallyVotes pure helper

**Files:**
- Create: `apps/api/internal/votacao/results.go`
- Create: `apps/api/internal/votacao/results_test.go`

### 1.1 Failing tests

Create `apps/api/internal/votacao/results_test.go`:

```go
package votacao_test

import (
	"testing"

	"github.com/PiluVitu/api/internal/votacao"
)

func TestTallyVotes_Empty(t *testing.T) {
	got := votacao.TallyVotes(nil)
	if len(got) != 0 {
		t.Errorf("len = %d", len(got))
	}
}

func TestTallyVotes_Counts(t *testing.T) {
	votes := []votacao.Vote{
		{MovieID: 1}, {MovieID: 1}, {MovieID: 2}, {MovieID: 1}, {MovieID: 3},
	}
	got := votacao.TallyVotes(votes)
	want := map[int64]int{1: 3, 2: 1, 3: 1}
	if len(got) != len(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for k, v := range want {
		if got[k] != v {
			t.Errorf("movie %d = %d, want %d", k, got[k], v)
		}
	}
}

func TestComputeWinner_Empty(t *testing.T) {
	w := votacao.ComputeWinner(nil)
	if w != nil {
		t.Errorf("want nil, got %v", w)
	}
}

func TestComputeWinner_SingleWinner(t *testing.T) {
	votes := []votacao.Vote{{MovieID: 10}, {MovieID: 10}, {MovieID: 5}}
	w := votacao.ComputeWinner(votes)
	if w == nil || *w != 10 {
		t.Errorf("want 10, got %v", w)
	}
}

func TestComputeWinner_TieBreakerByLowestMovieID(t *testing.T) {
	// Each tied; lowest movie_id wins for determinism.
	votes := []votacao.Vote{{MovieID: 7}, {MovieID: 3}, {MovieID: 5}}
	w := votacao.ComputeWinner(votes)
	if w == nil || *w != 3 {
		t.Errorf("want 3 (lowest ID in tie), got %v", w)
	}
}
```

### 1.2 Implement results.go

Create `apps/api/internal/votacao/results.go`:

```go
package votacao

import "sort"

// TallyVotes counts votes per movie_id.
func TallyVotes(votes []Vote) map[int64]int {
	out := make(map[int64]int, len(votes))
	for _, v := range votes {
		out[v.MovieID]++
	}
	return out
}

// ComputeWinner returns the movie_id with the highest vote count.
// Ties are broken deterministically by lowest movie_id. Returns nil when
// there are no votes (allows closing a session with no winner).
func ComputeWinner(votes []Vote) *int64 {
	if len(votes) == 0 {
		return nil
	}
	tally := TallyVotes(votes)
	ids := make([]int64, 0, len(tally))
	for id := range tally {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	bestID := ids[0]
	bestCount := tally[bestID]
	for _, id := range ids[1:] {
		if tally[id] > bestCount {
			bestID = id
			bestCount = tally[id]
		}
	}
	return &bestID
}
```

### 1.3 Run tests, commit
```bash
cd apps/api && go test ./internal/votacao/... -run "Tally|Winner" -v
git add apps/api/internal/votacao/results.go apps/api/internal/votacao/results_test.go
git commit -m "feat(votacao): TallyVotes + ComputeWinner pure helpers"
```

---

## Task 2: Store.HasVoted

**Files:**
- Modify: `apps/api/internal/votacao/votes.go`
- Modify: `apps/api/internal/votacao/votes_test.go`

### 2.1 Append failing tests

Append to `apps/api/internal/votacao/votes_test.go`:

```go
func TestHasVoted_False(t *testing.T) {
	s, sess, _, user := setupVoteScenario(t)
	ok, err := s.HasVoted(context.Background(), sess.ID, user.ID)
	if err != nil {
		t.Fatal(err)
	}
	if ok {
		t.Error("HasVoted should be false before voting")
	}
}

func TestHasVoted_True(t *testing.T) {
	s, sess, movie, user := setupVoteScenario(t)
	_ = s.InsertVote(context.Background(), sess.ID, user.ID, movie.ID)
	ok, err := s.HasVoted(context.Background(), sess.ID, user.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !ok {
		t.Error("HasVoted should be true after voting")
	}
}
```

### 2.2 Implement HasVoted

Append to `apps/api/internal/votacao/votes.go`:

```go
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
```

### 2.3 Run, commit
```bash
cd apps/api && go test ./internal/votacao/... -v
git add apps/api/internal/votacao/votes.go apps/api/internal/votacao/votes_test.go
git commit -m "feat(votacao): Store.HasVoted(sessionID, userID) bool"
```

---

## Task 3: Vote / Close / Results HTTP handlers

**Files:**
- Create: `apps/api/internal/handlers/votacao/votes.go`
- Create: `apps/api/internal/handlers/votacao/votes_test.go`

### 3.1 Implement votes.go

Create `apps/api/internal/handlers/votacao/votes.go`:

```go
package votacao

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/PiluVitu/api/internal/auth"
	"github.com/PiluVitu/api/internal/votacao"
)

type voteBody struct {
	MovieID int64 `json:"movie_id"`
}

// CreateVote (logged) registers a vote. 409 on duplicate (UNIQUE).
func (h *Handlers) CreateVote(w http.ResponseWriter, r *http.Request) {
	sessionID, ok := parseID(w, r)
	if !ok {
		return
	}
	user := auth.UserFromContext(r.Context())
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	var body voteBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if body.MovieID <= 0 {
		jsonError(w, http.StatusBadRequest, "movie_id required")
		return
	}
	err := h.deps.Store.InsertVote(r.Context(), sessionID, user.ID, body.MovieID)
	if errors.Is(err, votacao.ErrAlreadyVoted) {
		jsonError(w, http.StatusConflict, "already voted")
		return
	}
	if err != nil {
		jsonError(w, http.StatusInternalServerError, "insert vote failed")
		return
	}
	w.WriteHeader(http.StatusCreated)
}

// CloseSession (admin) closes the session, computing winner from current votes.
func (h *Handlers) CloseSession(w http.ResponseWriter, r *http.Request) {
	sessionID, ok := parseID(w, r)
	if !ok {
		return
	}
	votes, err := h.deps.Store.ListVotesBySession(r.Context(), sessionID)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, "list votes failed")
		return
	}
	winner := votacao.ComputeWinner(votes)
	if err := h.deps.Store.CloseVotingSession(r.Context(), sessionID, winner); err != nil {
		if errors.Is(err, votacao.ErrNotFound) {
			jsonError(w, http.StatusNotFound, "session not open")
			return
		}
		jsonError(w, http.StatusInternalServerError, "close failed")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	if winner != nil {
		_ = json.NewEncoder(w).Encode(map[string]any{"winner_movie_id": *winner})
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]any{"winner_movie_id": nil})
}

// GetResults returns the tally as { movie_id: count }. Anyone authenticated
// can call it; the design says only after close, but we don't enforce that
// here — let the front decide what to show before close.
func (h *Handlers) GetResults(w http.ResponseWriter, r *http.Request) {
	sessionID, ok := parseID(w, r)
	if !ok {
		return
	}
	votes, err := h.deps.Store.ListVotesBySession(r.Context(), sessionID)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, "list votes failed")
		return
	}
	tally := votacao.TallyVotes(votes)
	// Convert to a slice for stable JSON output (Go map iteration is random).
	type row struct {
		MovieID int64 `json:"movie_id"`
		Count   int   `json:"count"`
	}
	rows := make([]row, 0, len(tally))
	for k, v := range tally {
		rows = append(rows, row{MovieID: k, Count: v})
	}
	// Sort by count desc then movie_id asc.
	for i := 0; i < len(rows); i++ {
		for j := i + 1; j < len(rows); j++ {
			if rows[j].Count > rows[i].Count || (rows[j].Count == rows[i].Count && rows[j].MovieID < rows[i].MovieID) {
				rows[i], rows[j] = rows[j], rows[i]
			}
		}
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"results": rows, "total_votes": len(votes)})
}

func parseID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		jsonError(w, http.StatusBadRequest, "invalid id")
		return 0, false
	}
	return id, true
}
```

### 3.2 Tests

Create `apps/api/internal/handlers/votacao/votes_test.go`:

```go
package votacao_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/PiluVitu/api/internal/auth"
	handlersvotacao "github.com/PiluVitu/api/internal/handlers/votacao"
	"github.com/PiluVitu/api/internal/votacao"
)

func reqWithID(method, id, body string, user *votacao.User) *http.Request {
	req := httptest.NewRequest(method, "/x", strings.NewReader(body))
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id)
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	if user != nil {
		ctx = auth.WithUserForTests(ctx, user)
	}
	return req.WithContext(ctx)
}

func setupSessionWithMovie(t *testing.T, store *votacao.Store, admin *votacao.User) (*votacao.VotingSession, *votacao.SessionMovie) {
	t.Helper()
	sess, err := store.CreateVotingSession(context.Background(), "X", admin.ID, "{}")
	if err != nil {
		t.Fatal(err)
	}
	if err := store.InsertSessionMovies(context.Background(), []votacao.SessionMovie{
		{SessionID: sess.ID, Category: "terror", Title: "M", Type: "filme"},
	}); err != nil {
		t.Fatal(err)
	}
	movies, _ := store.GetSessionMovies(context.Background(), sess.ID)
	return sess, &movies[0]
}

func TestCreateVote_HappyPath(t *testing.T) {
	store := openTestStore(t)
	user := makeAdmin(t, store)
	sess, movie := setupSessionWithMovie(t, store, user)
	h := newH(t, &stubSheets{}, &stubPosters{}, store)

	body := `{"movie_id":` + intStr(movie.ID) + `}`
	rec := httptest.NewRecorder()
	h.CreateVote(rec, reqWithID(http.MethodPost, intStr(sess.ID), body, user))
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
}

func TestCreateVote_DuplicateReturns409(t *testing.T) {
	store := openTestStore(t)
	user := makeAdmin(t, store)
	sess, movie := setupSessionWithMovie(t, store, user)
	h := newH(t, &stubSheets{}, &stubPosters{}, store)

	_ = store.InsertVote(context.Background(), sess.ID, user.ID, movie.ID)
	body := `{"movie_id":` + intStr(movie.ID) + `}`
	rec := httptest.NewRecorder()
	h.CreateVote(rec, reqWithID(http.MethodPost, intStr(sess.ID), body, user))
	if rec.Code != http.StatusConflict {
		t.Errorf("status = %d, want 409", rec.Code)
	}
}

func TestCreateVote_NoMovieID_400(t *testing.T) {
	store := openTestStore(t)
	user := makeAdmin(t, store)
	sess, _ := setupSessionWithMovie(t, store, user)
	h := newH(t, &stubSheets{}, &stubPosters{}, store)
	rec := httptest.NewRecorder()
	h.CreateVote(rec, reqWithID(http.MethodPost, intStr(sess.ID), `{}`, user))
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d", rec.Code)
	}
}

func TestCloseSession_ComputesWinner(t *testing.T) {
	store := openTestStore(t)
	admin := makeAdmin(t, store)
	sess, movie := setupSessionWithMovie(t, store, admin)
	_ = store.InsertVote(context.Background(), sess.ID, admin.ID, movie.ID)

	h := newH(t, &stubSheets{}, &stubPosters{}, store)
	rec := httptest.NewRecorder()
	h.CloseSession(rec, reqWithID(http.MethodPost, intStr(sess.ID), "", admin))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var out struct {
		Winner *int64 `json:"winner_movie_id"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	if out.Winner == nil || *out.Winner != movie.ID {
		t.Errorf("winner = %v, want %d", out.Winner, movie.ID)
	}

	got, _ := store.GetVotingSession(context.Background(), sess.ID)
	if got.Status != "closed" {
		t.Errorf("status = %q", got.Status)
	}
}

func TestCloseSession_AlreadyClosed_404(t *testing.T) {
	store := openTestStore(t)
	admin := makeAdmin(t, store)
	sess, _ := setupSessionWithMovie(t, store, admin)
	_ = store.CloseVotingSession(context.Background(), sess.ID, nil)

	h := newH(t, &stubSheets{}, &stubPosters{}, store)
	rec := httptest.NewRecorder()
	h.CloseSession(rec, reqWithID(http.MethodPost, intStr(sess.ID), "", admin))
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d", rec.Code)
	}
}

func TestGetResults_Tally(t *testing.T) {
	store := openTestStore(t)
	admin := makeAdmin(t, store)
	sess, movie := setupSessionWithMovie(t, store, admin)
	user2, _ := store.UpsertUser(context.Background(), "u2", "u2@x.com", "u2", "", nil)
	_ = store.InsertVote(context.Background(), sess.ID, admin.ID, movie.ID)
	_ = store.InsertVote(context.Background(), sess.ID, user2.ID, movie.ID)

	h := newH(t, &stubSheets{}, &stubPosters{}, store)
	rec := httptest.NewRecorder()
	h.GetResults(rec, reqWithID(http.MethodGet, intStr(sess.ID), "", admin))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	var out struct {
		Results []struct {
			MovieID int64 `json:"movie_id"`
			Count   int   `json:"count"`
		} `json:"results"`
		TotalVotes int `json:"total_votes"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	if out.TotalVotes != 2 {
		t.Errorf("total = %d", out.TotalVotes)
	}
	if len(out.Results) != 1 || out.Results[0].Count != 2 {
		t.Errorf("results = %+v", out.Results)
	}
}

func intStr(i int64) string {
	return strconvFormatInt(i)
}

// strconvFormatInt avoids re-importing strconv in this test file when other
// helpers already provide enough — keeps imports tidy.
func strconvFormatInt(i int64) string {
	const digits = "0123456789"
	if i == 0 {
		return "0"
	}
	negative := i < 0
	if negative {
		i = -i
	}
	out := ""
	for i > 0 {
		out = string(digits[i%10]) + out
		i /= 10
	}
	if negative {
		out = "-" + out
	}
	return out
}
```

### 3.3 Run + commit
```bash
cd apps/api && go vet ./... && go test ./internal/handlers/votacao/... -v
git add apps/api/internal/handlers/votacao/votes.go apps/api/internal/handlers/votacao/votes_test.go
git commit -m "feat(handlers): CreateVote/CloseSession/GetResults handlers"
```

---

## Task 4: GetSession includes `has_voted`

**Files:**
- Modify: `apps/api/internal/handlers/votacao/sessions.go`
- Modify: `apps/api/internal/handlers/votacao/sessions_test.go`

### 4.1 Update sessions.go

In `apps/api/internal/handlers/votacao/sessions.go`, change `GetSession` to:

```go
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

	hasVoted := false
	if user := auth.UserFromContext(r.Context()); user != nil {
		hasVoted, _ = h.deps.Store.HasVoted(r.Context(), session.ID, user.ID)
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"session":   session,
		"movies":    movies,
		"has_voted": hasVoted,
	})
}
```

Remove the old `writeSessionJSON` invocation from `GetSession`; CreateSession still uses it.

### 4.2 Append test

Append to `apps/api/internal/handlers/votacao/sessions_test.go`:

```go
func TestGetSession_HasVotedTrueAfterInsertVote(t *testing.T) {
	store := openTestStore(t)
	admin := makeAdmin(t, store)
	sess, _ := store.CreateVotingSession(context.Background(), "X", admin.ID, "{}")
	_ = store.InsertSessionMovies(context.Background(), []votacao.SessionMovie{
		{SessionID: sess.ID, Category: "terror", Title: "M", Type: "filme"},
	})
	movies, _ := store.GetSessionMovies(context.Background(), sess.ID)
	_ = store.InsertVote(context.Background(), sess.ID, admin.ID, movies[0].ID)

	h := newH(t, &stubSheets{}, &stubPosters{}, store)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/votacao/sessions/1", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "1")
	req = req.WithContext(auth.WithUserForTests(context.WithValue(req.Context(), chi.RouteCtxKey, rctx), admin))
	h.GetSession(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	var out struct {
		HasVoted bool `json:"has_voted"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	if !out.HasVoted {
		t.Error("has_voted should be true")
	}
}
```

### 4.3 Run + commit
```bash
cd apps/api && go test ./internal/handlers/votacao/... -v
git add apps/api/internal/handlers/votacao/sessions.go apps/api/internal/handlers/votacao/sessions_test.go
git commit -m "feat(handlers): GetSession includes has_voted for authenticated callers"
```

---

## Task 5: Mount /votes, /close, /results routes

**Files:**
- Modify: `apps/api/internal/router/router.go`

### 5.1 Add routes

Inside the `/votacao` route group (where `categorias`, `sessions`, etc. already live), add:

```go
		r.With(auth.RequireAuth(deps.Sessions, deps.Store)).Post("/sessions/{id}/votes", deps.VotacaoHandlers.CreateVote)
		r.With(auth.RequireAuth(deps.Sessions, deps.Store)).Get("/sessions/{id}/results", deps.VotacaoHandlers.GetResults)
		r.With(auth.RequireAdmin(deps.Sessions, deps.Store)).Post("/sessions/{id}/close", deps.VotacaoHandlers.CloseSession)
```

### 5.2 Verify + commit
```bash
cd apps/api && go vet ./... && go test ./... && go build ./...
git add apps/api/internal/router/router.go
git commit -m "feat(api): mount /votacao/sessions/{id}/(votes|close|results)"
```

---

## Task 6: CLAUDE.md + final sweep

Update Status line in CLAUDE.md:
```
- **Status:** em construção (Fase 5 concluída: voto + fechar + resultados; Fase 4 entregou TMDb+sessions; ... ).
```

Append to the "TMDb + handlers de sessions" sub-section:

```markdown
- **Votos (`POST /votacao/sessions/{id}/votes`, RequireAuth):** body `{"movie_id": <int>}`. 201 ok. 409 se já votou (UNIQUE no DB). 400 sem movie_id. Idempotência pela constraint.
- **Fechar (`POST /votacao/sessions/{id}/close`, RequireAdmin):** computa winner via `votacao.ComputeWinner` (maior contagem; empate por menor movie_id), grava `closed_at` e `winner_movie_id`. 404 se sessão já estava fechada. Retorna `{"winner_movie_id": id|null}`.
- **Resultados (`GET /votacao/sessions/{id}/results`, RequireAuth):** retorna `{"results":[{movie_id,count},...], "total_votes":N}` ordenado por count desc + movie_id asc.
- **GetSession agora inclui `has_voted`** quando o caller está autenticado.
```

```bash
cd apps/api && go vet ./... && go test ./... && go build ./...
git add CLAUDE.md
git commit -m "docs(claude): document Phase 5 endpoints (votes/close/results)"
```

---

## Phase 5 Exit Criteria

- [ ] TallyVotes + ComputeWinner pure tests (5 tests)
- [ ] Store.HasVoted tested (2 tests)
- [ ] Vote/Close/Results handler tests (6 tests)
- [ ] GetSession includes has_voted (1 new test)
- [ ] /votacao/sessions/{id}/votes/close/results mounted
- [ ] CLAUDE.md updated
- [ ] All tests pass; build clean

---

## Notes for the implementer

- `votacao.Vote` (struct), `Store.InsertVote`, `Store.ListVotesBySession`, `Store.CloseVotingSession`, `ErrAlreadyVoted`, `ErrNotFound` — all exist from Phase 1.
- `ComputeWinner` returns `*int64` because the design allows closing a session with zero votes (`nil` winner). The Store accepts `*int64` too — they match.
- 6 commits in this phase.
