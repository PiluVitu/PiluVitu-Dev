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
			SessionID:  session.ID,
			Category:   m.movie.Category,
			Title:      m.movie.Title,
			Type:       m.movie.Type,
			PosterURL:  m.posterURL,
			WasWatched: m.movie.Watched,
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
// timeout each. Any failure is swallowed — the picked entry survives with
// empty poster/tmdbID. Fail-soft is the point.
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
