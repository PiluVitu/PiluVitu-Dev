package auth

import (
	"net/http"

	"github.com/alexedwards/scs/v2"

	"github.com/PiluVitu/api/internal/votacao"
)

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
