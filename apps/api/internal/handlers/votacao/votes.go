package votacao

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/PiluVitu/api/internal/auth"
	"github.com/PiluVitu/api/internal/httpx"
	"github.com/PiluVitu/api/internal/logging"
	"github.com/PiluVitu/api/internal/votacao"
)

type voteBody struct {
	MovieIDs []int64 `json:"movie_ids"`
}

// CreateVote (logged) replaces the caller's approvals for the session with the
// given movie_ids. Editable until the session closes. Empty set clears votes.
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
	session, err := h.deps.Store.GetVotingSession(r.Context(), sessionID)
	if err != nil {
		if errors.Is(err, votacao.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "session_not_found", "Sessão não encontrada.")
			return
		}
		logging.FromContext(r.Context()).Error("vote: load session", "err", err, "session_id", sessionID)
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "Falha ao carregar a sessão.")
		return
	}
	if session.Status == "closed" {
		httpx.Error(w, http.StatusConflict, "session_closed", "Sessão encerrada — votação fechada.")
		return
	}
	var body voteBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_json", "Corpo da requisição inválido.")
		return
	}
	if err := h.deps.Store.ReplaceUserVotes(r.Context(), sessionID, user.ID, body.MovieIDs); err != nil {
		if errors.Is(err, votacao.ErrMovieNotInSession) {
			httpx.Error(w, http.StatusBadRequest, "movie_not_in_session", "Um dos filmes não pertence a esta sessão.")
			return
		}
		logging.FromContext(r.Context()).Error("vote: replace", "err", err, "session_id", sessionID, "user_id", user.ID)
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "Não foi possível registrar o voto.")
		return
	}
	logging.With(r.Context(), "session_id", sessionID, "user_id", user.ID, "movie_ids", body.MovieIDs).
		Info("votes_replaced")
	httpx.DataMsg(w, http.StatusOK, map[string]any{"voted_movie_ids": body.MovieIDs}, httpx.Success("Voto registrado."))
}

// CloseSession (admin) closes the session, computing winner from current votes.
func (h *Handlers) CloseSession(w http.ResponseWriter, r *http.Request) {
	sessionID, ok := parseID(w, r)
	if !ok {
		return
	}
	votes, err := h.deps.Store.ListVotesBySession(r.Context(), sessionID)
	if err != nil {
		logging.FromContext(r.Context()).Error("close: tally", "err", err, "session_id", sessionID)
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "Falha ao apurar os votos.")
		return
	}
	// Approval voting: a clear top => winner now; a tie => leave it null for the
	// roulette tiebreak (the deterministic lowest-id break is gone).
	top, _ := votacao.ComputeTopMovies(votes)
	var winner *int64
	if len(top) == 1 {
		winner = &top[0]
	}
	if err := h.deps.Store.CloseVotingSession(r.Context(), sessionID, winner); err != nil {
		if errors.Is(err, votacao.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "session_not_open", "Sessão não está aberta.")
			return
		}
		logging.FromContext(r.Context()).Error("close: persist", "err", err, "session_id", sessionID)
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "Falha ao encerrar a sessão.")
		return
	}
	// Record winner_method='votes' when there was a clear winner.
	if winner != nil {
		_ = h.deps.Store.SetSessionWinner(r.Context(), sessionID, *winner, "votes")
	}
	logging.With(r.Context(), "session_id", sessionID, "tie", len(top) > 1, "top", top).Info("session_closed")
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
		logging.FromContext(r.Context()).Error("results: list votes failed", "err", err, "session_id", sessionID)
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
	voters, err := h.deps.Store.CountVoters(r.Context(), sessionID)
	if err != nil {
		logging.FromContext(r.Context()).Error("results: count voters", "err", err, "session_id", sessionID)
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "Falha ao carregar os resultados.")
		return
	}
	httpx.Data(w, http.StatusOK, map[string]any{
		"results":      rows,
		"total_votes":  len(votes),
		"total_voters": voters,
	})
}

type tiebreakBody struct {
	Entropy string `json:"entropy"`
}

// Tiebreak (admin) resolves a tie on a CLOSED session via a provably-fair draw:
// it mixes the client entropy (a hash; the photo never leaves the browser) with
// a server nonce, picks one tied movie without bias, persists the winner and an
// audit row, and returns the winner + nonce so anyone can recompute the draw.
func (h *Handlers) Tiebreak(w http.ResponseWriter, r *http.Request) {
	sessionID, ok := parseID(w, r)
	if !ok {
		return
	}
	user := auth.UserFromContext(r.Context())
	if user == nil {
		httpx.Error(w, http.StatusUnauthorized, "not_authenticated", "Você precisa estar logado.")
		return
	}
	var body tiebreakBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_json", "Corpo da requisição inválido.")
		return
	}
	clientEntropy, err := hex.DecodeString(body.Entropy)
	if err != nil || len(clientEntropy) < 16 {
		httpx.Error(w, http.StatusBadRequest, "invalid_entropy", "Entropia inválida.")
		return
	}

	session, err := h.deps.Store.GetVotingSession(r.Context(), sessionID)
	if err != nil {
		if errors.Is(err, votacao.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "session_not_found", "Sessão não encontrada.")
			return
		}
		logging.FromContext(r.Context()).Error("tiebreak: load session", "err", err, "session_id", sessionID)
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "Falha ao carregar a sessão.")
		return
	}
	if session.Status != "closed" {
		httpx.Error(w, http.StatusConflict, "session_not_closed", "Encerre a sessão antes do desempate.")
		return
	}

	votes, err := h.deps.Store.ListVotesBySession(r.Context(), sessionID)
	if err != nil {
		logging.FromContext(r.Context()).Error("tiebreak: tally", "err", err, "session_id", sessionID)
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "Falha ao apurar os votos.")
		return
	}
	tied, _ := votacao.ComputeTopMovies(votes)
	if len(tied) < 2 {
		httpx.Error(w, http.StatusUnprocessableEntity, "no_tie", "Não há empate para desempatar.")
		return
	}
	if session.WinnerMovieID != nil {
		httpx.Error(w, http.StatusConflict, "winner_already_set", "Esta sessão já tem vencedor.")
		return
	}

	serverNonce := make([]byte, 32)
	if _, err := rand.Read(serverNonce); err != nil {
		logging.FromContext(r.Context()).Error("tiebreak: nonce", "err", err, "session_id", sessionID)
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "Falha ao sortear.")
		return
	}
	seed := votacao.TiebreakSeed(clientEntropy, serverNonce, sessionID, tied)
	idx := votacao.PickTiebreakIndex(seed, len(tied))
	winner := tied[idx]

	tiedJSON, _ := json.Marshal(tied)
	nonceHex := hex.EncodeToString(serverNonce)
	if err := h.deps.Store.CreateTiebreak(r.Context(), votacao.TiebreakRecord{
		SessionID:     sessionID,
		TriggeredBy:   user.ID,
		TiedIDsJSON:   string(tiedJSON),
		ClientEntropy: body.Entropy,
		ServerNonce:   nonceHex,
		WinnerMovieID: winner,
	}); err != nil {
		logging.FromContext(r.Context()).Error("tiebreak: audit", "err", err, "session_id", sessionID)
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "Falha ao registrar o desempate.")
		return
	}
	if err := h.deps.Store.SetSessionWinner(r.Context(), sessionID, winner, "roulette"); err != nil {
		logging.FromContext(r.Context()).Error("tiebreak: set winner", "err", err, "session_id", sessionID)
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "Falha ao gravar o vencedor.")
		return
	}

	logging.With(r.Context(),
		"event", "tiebreak_draw",
		"session_id", sessionID,
		"user_id", user.ID,
		"tied_ids", tied,
		"client_entropy", body.Entropy,
		"server_nonce", nonceHex,
		"index", idx,
		"winner_movie_id", winner,
	).Info("tiebreak_draw")

	httpx.DataMsg(w, http.StatusOK, map[string]any{
		"winner_movie_id": winner,
		"tied_movie_ids":  tied,
		"server_nonce":    nonceHex,
	}, httpx.Success("Desempate concluído."))
}

// ListSessionVotes (admin) returns who voted for what in the session.
func (h *Handlers) ListSessionVotes(w http.ResponseWriter, r *http.Request) {
	sessionID, ok := parseID(w, r)
	if !ok {
		return
	}
	details, err := h.deps.Store.ListSessionVotesWithUsers(r.Context(), sessionID)
	if err != nil {
		logging.FromContext(r.Context()).Error("list-votes: store failed", "err", err, "session_id", sessionID)
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
