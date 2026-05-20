package votacao

import (
	"encoding/json"
	"net/http"
)

// GetCategorias returns the deduplicated list of categories present in the
// upstream Google Sheet. Returns 503 if no SheetsReader was wired (sheets
// disabled in dev), 502 on upstream error.
func (h *Handlers) GetCategorias(w http.ResponseWriter, r *http.Request) {
	if h.deps.Sheets == nil {
		jsonError(w, http.StatusServiceUnavailable, "sheets reader disabled")
		return
	}
	cats, err := h.deps.Sheets.GetCategories(r.Context())
	if err != nil {
		jsonError(w, http.StatusBadGateway, "sheets read failed")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"categories": cats})
}

func jsonError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
