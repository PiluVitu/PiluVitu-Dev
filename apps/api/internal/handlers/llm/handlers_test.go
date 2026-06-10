package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	pkgllm "github.com/PiluVitu/api/internal/llm"
)

type stubLLM struct {
	corrected string
	refined   string
	err       error
}

func (s stubLLM) Proofread(_ context.Context, _ string) (string, error) { return s.corrected, s.err }
func (s stubLLM) GenerateHooks(_ context.Context, _ pkgllm.Article, _ []string) ([]pkgllm.Hook, error) {
	return nil, s.err
}
func (s stubLLM) Refine(_ context.Context, _, _, _ string) (string, error) { return s.refined, s.err }

func TestProofreadHandlerOK(t *testing.T) {
	h := NewHandlers(Deps{LLM: stubLLM{corrected: "ok corrigido"}})
	req := httptest.NewRequest(http.MethodPost, "/admin/llm/proofread", bytes.NewBufferString(`{"text":"oi"}`))
	rec := httptest.NewRecorder()
	h.Proofread(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
	var env struct {
		Data struct{ Corrected string `json:"corrected"` } `json:"data"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &env)
	if env.Data.Corrected != "ok corrigido" {
		t.Fatalf("corrected = %q", env.Data.Corrected)
	}
}

func TestProofreadHandler503WhenNil(t *testing.T) {
	h := NewHandlers(Deps{LLM: nil})
	req := httptest.NewRequest(http.MethodPost, "/admin/llm/proofread", bytes.NewBufferString(`{"text":"oi"}`))
	rec := httptest.NewRecorder()
	h.Proofread(rec, req)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", rec.Code)
	}
}
