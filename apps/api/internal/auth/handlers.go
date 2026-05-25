package auth

import (
	"errors"
	"net/http"

	"github.com/alexedwards/scs/v2"

	"github.com/PiluVitu/api/internal/httpx"
	"github.com/PiluVitu/api/internal/votacao"
)

const sessionUserIDKey = "user_id"

// HandlersDeps wires up the auth handlers.
type HandlersDeps struct {
	Store     *votacao.Store
	Sessions  *scs.SessionManager
	Config    Config
	Exchanger TokenExchanger
	Verifier  IDTokenVerifier
}

// Handlers is the HTTP-layer entry point for /auth/* routes.
type Handlers struct {
	deps HandlersDeps
}

// NewHandlers constructs a Handlers with the given dependencies.
func NewHandlers(deps HandlersDeps) *Handlers { return &Handlers{deps: deps} }

// Sessions exposes the scs SessionManager so callers (e.g., router or tests)
// can mount LoadAndSave middleware.
func (h *Handlers) Sessions() *scs.SessionManager { return h.deps.Sessions }

// Login generates a state, sets it in a cookie, and redirects to Google.
func (h *Handlers) Login(w http.ResponseWriter, r *http.Request) {
	state, err := GenerateState()
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "Falha ao iniciar o login.")
		return
	}
	SetStateCookie(w, state)
	http.Redirect(w, r, h.deps.Exchanger.AuthCodeURL(state), http.StatusFound)
}

// Callback validates the OAuth state, exchanges the code, verifies the ID
// token, upserts the user, sets the session, and redirects to WebRedirectURL.
func (h *Handlers) Callback(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("code")
	stateQuery := r.URL.Query().Get("state")
	if code == "" || stateQuery == "" {
		httpx.Error(w, http.StatusBadRequest, "oauth_missing_params", "Requisição de login incompleta.")
		return
	}
	stateCookie, err := ConsumeStateCookie(w, r)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "oauth_state_missing", "Sessão de login expirada. Tente novamente.")
		return
	}
	if stateCookie != stateQuery {
		httpx.Error(w, http.StatusBadRequest, "oauth_state_mismatch", "Falha de validação do login. Tente novamente.")
		return
	}

	tok, err := h.deps.Exchanger.Exchange(r.Context(), code)
	if err != nil {
		httpx.Error(w, http.StatusBadGateway, "oauth_exchange_failed", "Não foi possível concluir o login com o Google.")
		return
	}
	rawID, _ := tok.Extra("id_token").(string)
	if rawID == "" {
		httpx.Error(w, http.StatusInternalServerError, "oauth_no_id_token", "Resposta de login inválida do Google.")
		return
	}
	claims, err := h.deps.Verifier.Verify(r.Context(), rawID, h.deps.Config.ClientID)
	if err != nil {
		httpx.Error(w, http.StatusUnauthorized, "oauth_invalid_token", "Não foi possível validar sua identidade.")
		return
	}

	user, err := h.deps.Store.UpsertUser(r.Context(), claims.Sub, claims.Email, claims.Name, claims.Picture, h.deps.Config.AdminEmails)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "Falha ao registrar o usuário.")
		return
	}

	h.deps.Sessions.Put(r.Context(), sessionUserIDKey, user.ID)

	http.Redirect(w, r, h.deps.Config.WebRedirectURL, http.StatusFound)
}

// ErrSessionUserMissing is returned when a session does not carry a user_id.
var ErrSessionUserMissing = errors.New("auth: session has no user")

// Me returns the currently logged-in user as JSON, or 401 if no session.
func (h *Handlers) Me(w http.ResponseWriter, r *http.Request) {
	userID := h.deps.Sessions.GetInt64(r.Context(), sessionUserIDKey)
	if userID == 0 {
		httpx.Error(w, http.StatusUnauthorized, "not_authenticated", "Você precisa estar logado.")
		return
	}
	user, err := h.deps.Store.GetUserByID(r.Context(), userID)
	if err != nil {
		httpx.Error(w, http.StatusUnauthorized, "user_not_found", "Usuário não encontrado.")
		return
	}
	httpx.Data(w, http.StatusOK, map[string]any{
		"id":       user.ID,
		"email":    user.Email,
		"name":     user.Name,
		"picture":  user.Picture,
		"is_admin": user.IsAdmin,
	})
}

// Logout destroys the current session, if any. Always returns 200.
func (h *Handlers) Logout(w http.ResponseWriter, r *http.Request) {
	if err := h.deps.Sessions.Destroy(r.Context()); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "Falha ao encerrar a sessão.")
		return
	}
	httpx.Data(w, http.StatusOK, nil)
}
