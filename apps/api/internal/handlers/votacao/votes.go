package votacao

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/PiluVitu/api/internal/auth"
	"github.com/PiluVitu/api/internal/httpx"
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
		httpx.Error(w, http.StatusUnauthorized, "not_authenticated", "Você precisa estar logado.")
		return
	}
	var body voteBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_json", "Corpo da requisição inválido.")
		return
	}
	if body.MovieID <= 0 {
		httpx.Error(w, http.StatusBadRequest, "movie_id_required", "Selecione um filme para votar.")
		return
	}
	err := h.deps.Store.InsertVote(r.Context(), sessionID, user.ID, body.MovieID)
	if errors.Is(err, votacao.ErrAlreadyVoted) {
		httpx.Error(w, http.StatusConflict, "already_voted", "Você já votou nesta sessão.")
		return
	}
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "Não foi possível registrar o voto.")
		return
	}
	httpx.DataMsg(w, http.StatusCreated, nil, httpx.Success("Voto registrado."))
}

// CloseSession (admin) closes the session, computing winner from current votes.
func (h *Handlers) CloseSession(w http.ResponseWriter, r *http.Request) {
	sessionID, ok := parseID(w, r)
	if !ok {
		return
	}
	votes, err := h.deps.Store.ListVotesBySession(r.Context(), sessionID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "Falha ao apurar os votos.")
		return
	}
	winner := votacao.ComputeWinner(votes)
	if err := h.deps.Store.CloseVotingSession(r.Context(), sessionID, winner); err != nil {
		if errors.Is(err, votacao.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "session_not_open", "Sessão não está aberta.")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "Falha ao encerrar a sessão.")
		return
	}
	if h.deps.Backuper != nil {
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			_ = h.deps.Backuper.Run(ctx, "session_close")
		}()
	}
	if winner != nil {
		httpx.Data(w, http.StatusOK, map[string]any{"winner_movie_id": *winner})
		return
	}
	httpx.Data(w, http.StatusOK, map[string]any{"winner_movie_id": nil})
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
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "Falha ao carregar os resultados.")
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
	httpx.Data(w, http.StatusOK, map[string]any{"results": rows, "total_votes": len(votes)})
}

// ListSessionVotes (admin) returns who voted for what in the session.
func (h *Handlers) ListSessionVotes(w http.ResponseWriter, r *http.Request) {
	sessionID, ok := parseID(w, r)
	if !ok {
		return
	}
	details, err := h.deps.Store.ListSessionVotesWithUsers(r.Context(), sessionID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "Falha ao carregar os votos.")
		return
	}
	out := make([]map[string]any, 0, len(details))
	for _, d := range details {
		out = append(out, map[string]any{
			"user_id":     d.UserID,
			"user_name":   d.UserName,
			"user_email":  d.UserEmail,
			"movie_id":    d.MovieID,
			"movie_title": d.MovieTitle,
			"category":    d.Category,
			"created_at":  d.CreatedAt,
		})
	}
	httpx.Data(w, http.StatusOK, map[string]any{"votes": out, "total": len(out)})
}

func parseID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid_id", "Identificador inválido.")
		return 0, false
	}
	return id, true
}
