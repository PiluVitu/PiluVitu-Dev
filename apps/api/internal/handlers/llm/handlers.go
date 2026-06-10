// Package llm expõe os endpoints admin de correção/refino via Ollama.
package llm

import (
	"context"
	"encoding/json"
	"net/http"
	"reflect"

	"github.com/PiluVitu/api/internal/httpx"
	pkgllm "github.com/PiluVitu/api/internal/llm"
)

// LLM é a sub-interface consumida pelos handlers (desacopla do *llm.Client).
type LLM interface {
	Proofread(ctx context.Context, text string) (string, error)
	GenerateHooks(ctx context.Context, a pkgllm.Article, platforms []string) ([]pkgllm.Hook, error)
	Refine(ctx context.Context, platform, text, instruction string) (string, error)
}

// Deps agrupa as dependências do pacote de handlers.
type Deps struct{ LLM LLM }

// Handlers é o receptor dos endpoints LLM.
type Handlers struct{ llm LLM }

// NewHandlers constrói os Handlers a partir de Deps. A typed-nil LLM
// (e.g. a (*llm.Client)(nil)) is normalized to nil so the unavailable()
// guard reliably returns 503 regardless of how the dependency is wired.
func NewHandlers(d Deps) *Handlers {
	if d.LLM != nil {
		if v := reflect.ValueOf(d.LLM); v.Kind() == reflect.Ptr && v.IsNil() {
			d.LLM = nil
		}
	}
	return &Handlers{llm: d.LLM}
}

// unavailable escreve 503 se o cliente LLM não estiver disponível e retorna true.
func (h *Handlers) unavailable(w http.ResponseWriter) bool {
	if h.llm == nil {
		httpx.Error(w, http.StatusServiceUnavailable, "llm_unavailable", "LLM local indisponível (Ollama offline).")
		return true
	}
	return false
}

// Proofread corrige ortografia/gramática do texto preservando Markdown/MDX.
// POST /admin/llm/proofread  body: {"text":"..."}
// 200 {"data":{"corrected":"..."}} | 400 invalid_json | 503 llm_unavailable | 502 llm_failed
func (h *Handlers) Proofread(w http.ResponseWriter, r *http.Request) {
	if h.unavailable(w) {
		return
	}
	var in struct{ Text string `json:"text"` }
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Text == "" {
		httpx.Error(w, http.StatusBadRequest, "invalid_json", "Corpo inválido: 'text' é obrigatório.")
		return
	}
	out, err := h.llm.Proofread(r.Context(), in.Text)
	if err != nil {
		httpx.Error(w, http.StatusBadGateway, "llm_failed", "Falha ao corrigir o texto.")
		return
	}
	httpx.Data(w, http.StatusOK, map[string]string{"corrected": out})
}

// Refine reescreve uma chamada social conforme instrução.
// POST /admin/llm/refine  body: {"platform":"bluesky","text":"...","instruction":"..."}
// 200 {"data":{"refined":"..."}} | 400 invalid_json | 503 llm_unavailable | 502 llm_failed
func (h *Handlers) Refine(w http.ResponseWriter, r *http.Request) {
	if h.unavailable(w) {
		return
	}
	var in struct {
		Platform    string `json:"platform"`
		Text        string `json:"text"`
		Instruction string `json:"instruction"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Text == "" {
		httpx.Error(w, http.StatusBadRequest, "invalid_json", "Corpo inválido: 'text' é obrigatório.")
		return
	}
	out, err := h.llm.Refine(r.Context(), in.Platform, in.Text, in.Instruction)
	if err != nil {
		httpx.Error(w, http.StatusBadGateway, "llm_failed", "Falha ao refinar o texto.")
		return
	}
	httpx.Data(w, http.StatusOK, map[string]string{"refined": out})
}
