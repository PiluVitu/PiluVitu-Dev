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
