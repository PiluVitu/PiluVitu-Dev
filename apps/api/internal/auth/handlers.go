package auth

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/alexedwards/scs/v2"

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
		http.Error(w, "internal error", http.StatusInternalServerError)
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
		http.Error(w, "missing code or state", http.StatusBadRequest)
		return
	}
	stateCookie, err := ConsumeStateCookie(w, r)
	if err != nil {
		http.Error(w, "missing state cookie", http.StatusBadRequest)
		return
	}
	if stateCookie != stateQuery {
		http.Error(w, "state mismatch", http.StatusBadRequest)
		return
	}

	tok, err := h.deps.Exchanger.Exchange(r.Context(), code)
	if err != nil {
		http.Error(w, "exchange failed", http.StatusBadGateway)
		return
	}
	rawID, _ := tok.Extra("id_token").(string)
	if rawID == "" {
		http.Error(w, "no id_token in oauth response", http.StatusInternalServerError)
		return
	}
	claims, err := h.deps.Verifier.Verify(r.Context(), rawID, h.deps.Config.ClientID)
	if err != nil {
		http.Error(w, "invalid id token", http.StatusUnauthorized)
		return
	}

	user, err := h.deps.Store.UpsertUser(r.Context(), claims.Sub, claims.Email, claims.Name, claims.Picture, h.deps.Config.AdminEmails)
	if err != nil {
		http.Error(w, "upsert user failed", http.StatusInternalServerError)
		return
	}

	h.deps.Sessions.Put(r.Context(), sessionUserIDKey, user.ID)

	http.Redirect(w, r, h.deps.Config.WebRedirectURL, http.StatusFound)
}

// jsonError is a small helper used by future handlers. Kept private.
func jsonError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

// ErrSessionUserMissing is returned when a session does not carry a user_id.
var ErrSessionUserMissing = errors.New("auth: session has no user")

// Me returns the currently logged-in user as JSON, or 401 if no session.
func (h *Handlers) Me(w http.ResponseWriter, r *http.Request) {
	userID := h.deps.Sessions.GetInt64(r.Context(), sessionUserIDKey)
	if userID == 0 {
		jsonError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	user, err := h.deps.Store.GetUserByID(r.Context(), userID)
	if err != nil {
		jsonError(w, http.StatusUnauthorized, "user not found")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"id":       user.ID,
		"email":    user.Email,
		"name":     user.Name,
		"picture":  user.Picture,
		"is_admin": user.IsAdmin,
	})
}

// Logout destroys the current session, if any. Always returns 204.
func (h *Handlers) Logout(w http.ResponseWriter, r *http.Request) {
	if err := h.deps.Sessions.Destroy(r.Context()); err != nil {
		http.Error(w, "logout failed", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
