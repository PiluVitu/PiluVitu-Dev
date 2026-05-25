package admin

import (
	"net/http"

	"github.com/PiluVitu/api/internal/httpx"
)

// CreateBackup (admin) triggers a backup with trigger="manual". 200 ok or 500 on error.
func (h *Handlers) CreateBackup(w http.ResponseWriter, r *http.Request) {
	if h.deps.Runner == nil {
		httpx.Error(w, http.StatusServiceUnavailable, "backup_disabled", "Backup está desativado.")
		return
	}
	if err := h.deps.Runner.Run(r.Context(), "manual"); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "Falha ao executar o backup.")
		return
	}
	httpx.DataMsg(w, http.StatusOK, nil, httpx.Success("Backup executado."))
}

// ListBackups returns the recent backups stored in SQLite (newest first).
func (h *Handlers) ListBackups(w http.ResponseWriter, r *http.Request) {
	rows, err := h.deps.Store.ListBackups(r.Context(), 50)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "Falha ao listar os backups.")
		return
	}
	httpx.Data(w, http.StatusOK, map[string]any{"backups": rows})
}
