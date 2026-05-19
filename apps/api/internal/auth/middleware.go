package auth

import (
	"context"
	"net/http"

	"github.com/alexedwards/scs/v2"

	"github.com/PiluVitu/api/internal/votacao"
)

type ctxKey int

const userCtxKey ctxKey = 0

// UserFromContext returns the authenticated user attached to r.Context by
// RequireAuth or RequireAdmin, or nil if there is none.
func UserFromContext(ctx context.Context) *votacao.User {
	if v, ok := ctx.Value(userCtxKey).(*votacao.User); ok {
		return v
	}
	return nil
}

// RequireAuth loads the user_id from the session, fetches the user, and
// attaches it to the request context. Responds 401 if missing or invalid.
func RequireAuth(sm *scs.SessionManager, store *votacao.Store) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID := sm.GetInt64(r.Context(), sessionUserIDKey)
			if userID == 0 {
				jsonError(w, http.StatusUnauthorized, "not authenticated")
				return
			}
			user, err := store.GetUserByID(r.Context(), userID)
			if err != nil {
				jsonError(w, http.StatusUnauthorized, "user not found")
				return
			}
			ctx := context.WithValue(r.Context(), userCtxKey, user)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// WithUserForTests attaches a user to the context exactly as RequireAuth would.
// Intended for downstream packages' tests; do not call from production code.
func WithUserForTests(ctx context.Context, u *votacao.User) context.Context {
	return context.WithValue(ctx, userCtxKey, u)
}

// RequireAdmin first applies RequireAuth, then rejects non-admins with 403.
func RequireAdmin(sm *scs.SessionManager, store *votacao.Store) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return RequireAuth(sm, store)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user := UserFromContext(r.Context())
			if user == nil || !user.IsAdmin {
				jsonError(w, http.StatusForbidden, "admin only")
				return
			}
			next.ServeHTTP(w, r)
		}))
	}
}
