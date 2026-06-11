// Package distribution expõe os endpoints admin de propostas/publicação de artigos.
package distribution

import (
	"context"
	"encoding/json"
	"net/http"
	"reflect"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"

	dist "github.com/PiluVitu/api/internal/distribution"
	"github.com/PiluVitu/api/internal/httpx"
	pkgllm "github.com/PiluVitu/api/internal/llm"
)

// DistService desacopla os handlers do *distribution.Service concreto.
type DistService interface {
	BuildProposals(ctx context.Context, slug string, art pkgllm.Article, bodyMD string) ([]dist.Target, error)
	Publish(ctx context.Context, slug string, selected []dist.Selected) ([]dist.Target, error)
	List(ctx context.Context, slug string) ([]dist.Target, error)
}

// Deps agrupa as dependências dos handlers de distribuição.
type Deps struct{ Service DistService }

// Handlers é o receptor dos endpoints de distribuição.
type Handlers struct{ svc DistService }

// NewHandlers constrói os Handlers a partir de Deps. Typed-nil pointers are
// normalized to nil so the down() guard reliably returns 503 regardless of
// how the dependency is wired — same pattern as internal/handlers/llm.
func NewHandlers(d Deps) *Handlers {
	if d.Service != nil {
		if v := reflect.ValueOf(d.Service); v.Kind() == reflect.Ptr && v.IsNil() {
			d.Service = nil
		}
	}
	return &Handlers{svc: d.Service}
}

// down writes 503 when the distribution service is unavailable and returns true.
func (h *Handlers) down(w http.ResponseWriter) bool {
	if h.svc == nil {
		httpx.Error(w, http.StatusServiceUnavailable, "distribution_unavailable", "Distribuição indisponível.")
		return true
	}
	return false
}

// Proposals gera propostas de distribuição para um artigo.
// POST /admin/distribution/proposals
// body: {"slug","title","excerpt","url","body","tags"}
// 200 {"data":{"targets":[...]}} | 400 invalid_json | 502 proposals_failed | 503 distribution_unavailable
func (h *Handlers) Proposals(w http.ResponseWriter, r *http.Request) {
	if h.down(w) {
		return
	}
	var in struct {
		Slug    string   `json:"slug"`
		Title   string   `json:"title"`
		Excerpt string   `json:"excerpt"`
		URL     string   `json:"url"`
		Body    string   `json:"body"`
		Tags    []string `json:"tags"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Slug == "" {
		httpx.Error(w, http.StatusBadRequest, "invalid_json", "Corpo inválido: 'slug' é obrigatório.")
		return
	}
	art := pkgllm.Article{Title: in.Title, Excerpt: in.Excerpt, URL: in.URL, Tags: in.Tags, VoiceSample: firstRunes(in.Body, 800)}
	targets, err := h.svc.BuildProposals(r.Context(), in.Slug, art, in.Body)
	if err != nil {
		httpx.Error(w, http.StatusBadGateway, "proposals_failed", "Falha ao gerar propostas.")
		return
	}
	httpx.Data(w, http.StatusOK, map[string]any{"targets": targets})
}

// Get retorna o estado atual dos alvos de distribuição de um artigo.
// GET /admin/distribution/{slug}
// 200 {"data":{"targets":[...]}} | 500 internal_error | 503 distribution_unavailable
func (h *Handlers) Get(w http.ResponseWriter, r *http.Request) {
	if h.down(w) {
		return
	}
	slug := chi.URLParam(r, "slug")
	targets, err := h.svc.List(r.Context(), slug)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "Falha ao ler distribuição.")
		return
	}
	httpx.Data(w, http.StatusOK, map[string]any{"targets": targets})
}

// Publish posta os alvos selecionados e devolve o estado atualizado.
// POST /admin/distribution/{slug}/publish
// body: {"targets":[{"platform","content",...}]}
// 200 {"data":{"targets":[...]}} | 400 invalid_json | 502 publish_failed | 503 distribution_unavailable
func (h *Handlers) Publish(w http.ResponseWriter, r *http.Request) {
	if h.down(w) {
		return
	}
	slug := chi.URLParam(r, "slug")
	var in struct {
		Targets []dist.Selected `json:"targets"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_json", "Corpo inválido.")
		return
	}
	targets, err := h.svc.Publish(r.Context(), slug, in.Targets)
	if err != nil {
		httpx.Error(w, http.StatusBadGateway, "publish_failed", "Falha ao publicar.")
		return
	}
	httpx.Data(w, http.StatusOK, map[string]any{"targets": targets})
}

// firstRunes returns up to n runes from s, slicing on a rune boundary.
func firstRunes(s string, n int) string {
	i := 0
	for count := 0; count < n && i < len(s); count++ {
		_, size := utf8.DecodeRuneInString(s[i:])
		i += size
	}
	return s[:i]
}
