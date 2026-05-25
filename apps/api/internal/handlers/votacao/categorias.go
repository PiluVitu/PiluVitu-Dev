package votacao

import (
	"net/http"

	"github.com/PiluVitu/api/internal/httpx"
)

// GetCategorias returns the deduplicated list of categories present in the
// upstream Google Sheet. Returns 503 if no SheetsReader was wired (sheets
// disabled in dev), 502 on upstream error.
func (h *Handlers) GetCategorias(w http.ResponseWriter, r *http.Request) {
	if h.deps.Sheets == nil {
		httpx.Error(w, http.StatusServiceUnavailable, "sheets_disabled", "Integração com a planilha está desativada.")
		return
	}
	cats, err := h.deps.Sheets.GetCategories(r.Context())
	if err != nil {
		httpx.Error(w, http.StatusBadGateway, "sheets_read_failed", "Falha ao ler a planilha de filmes.")
		return
	}
	httpx.Data(w, http.StatusOK, map[string]any{"categories": cats})
}
