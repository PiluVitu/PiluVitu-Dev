package admin

import (
	"encoding/json"
	"net/http"
)

// CreateBackup (admin) triggers a backup with trigger="manual". 204 ok or 500 on error.
func (h *Handlers) CreateBackup(w http.ResponseWriter, r *http.Request) {
	if h.deps.Runner == nil {
		jsonError(w, http.StatusServiceUnavailable, "backup runner disabled")
		return
	}
	if err := h.deps.Runner.Run(r.Context(), "manual"); err != nil {
		jsonError(w, http.StatusInternalServerError, "backup failed")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ListBackups returns the recent backups stored in SQLite (newest first).
func (h *Handlers) ListBackups(w http.ResponseWriter, r *http.Request) {
	rows, err := h.deps.Store.ListBackups(r.Context(), 50)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, "list failed")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"backups": rows})
}

func jsonError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
