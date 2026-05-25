package admin

import (
	"net/http"

	"github.com/PiluVitu/api/internal/httpx"
)

// ListUsers (admin) returns every registered user, newest first.
func (h *Handlers) ListUsers(w http.ResponseWriter, r *http.Request) {
	users, err := h.deps.Store.ListUsers(r.Context())
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "Falha ao listar os usuários.")
		return
	}
	out := make([]map[string]any, 0, len(users))
	for _, u := range users {
		out = append(out, map[string]any{
			"id":         u.ID,
			"name":       u.Name,
			"email":      u.Email,
			"picture":    u.Picture,
			"is_admin":   u.IsAdmin,
			"created_at": u.CreatedAt,
		})
	}
	httpx.Data(w, http.StatusOK, map[string]any{"users": out})
}
