package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
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

// unwrapEnv decodes the standard {ok,data,notifications} envelope. If code is
// non-empty, it asserts notifications[0].code matches.
type envelope struct {
	OK            bool            `json:"ok"`
	Data          json.RawMessage `json:"data"`
	Notifications []struct {
		Code string `json:"code"`
	} `json:"notifications"`
}

func decodeEnv(t *testing.T, rec *httptest.ResponseRecorder) envelope {
	t.Helper()
	var env envelope
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
		t.Fatalf("decode envelope: %v (body=%s)", err, rec.Body.String())
	}
	return env
}

// ─── Proofread ──────────────────────────────────────────────────────────────

func TestProofreadHandlerOK(t *testing.T) {
	h := NewHandlers(Deps{LLM: stubLLM{corrected: "ok corrigido"}})
	req := httptest.NewRequest(http.MethodPost, "/admin/llm/proofread", bytes.NewBufferString(`{"text":"oi"}`))
	rec := httptest.NewRecorder()
	h.Proofread(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
	var env struct {
		Data struct {
			Corrected string `json:"corrected"`
		} `json:"data"`
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

func TestProofreadHandlerBadJSON(t *testing.T) {
	h := NewHandlers(Deps{LLM: stubLLM{corrected: "x"}})
	req := httptest.NewRequest(http.MethodPost, "/admin/llm/proofread", bytes.NewBufferString(`not json`))
	rec := httptest.NewRecorder()
	h.Proofread(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400; body=%s", rec.Code, rec.Body.String())
	}
	env := decodeEnv(t, rec)
	if len(env.Notifications) == 0 || env.Notifications[0].Code != "invalid_json" {
		t.Fatalf("expected code=invalid_json, got notifications=%+v", env.Notifications)
	}
}

func TestProofreadHandlerEmptyText(t *testing.T) {
	h := NewHandlers(Deps{LLM: stubLLM{corrected: "x"}})
	req := httptest.NewRequest(http.MethodPost, "/admin/llm/proofread", bytes.NewBufferString(`{"text":""}`))
	rec := httptest.NewRecorder()
	h.Proofread(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400; body=%s", rec.Code, rec.Body.String())
	}
	env := decodeEnv(t, rec)
	if len(env.Notifications) == 0 || env.Notifications[0].Code != "invalid_json" {
		t.Fatalf("expected code=invalid_json, got notifications=%+v", env.Notifications)
	}
}

func TestProofreadHandlerLLMError(t *testing.T) {
	h := NewHandlers(Deps{LLM: stubLLM{err: errors.New("ollama timeout")}})
	req := httptest.NewRequest(http.MethodPost, "/admin/llm/proofread", bytes.NewBufferString(`{"text":"test"}`))
	rec := httptest.NewRecorder()
	h.Proofread(rec, req)
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want 502; body=%s", rec.Code, rec.Body.String())
	}
	env := decodeEnv(t, rec)
	if len(env.Notifications) == 0 || env.Notifications[0].Code != "llm_failed" {
		t.Fatalf("expected code=llm_failed, got notifications=%+v", env.Notifications)
	}
}

// ─── Refine ─────────────────────────────────────────────────────────────────

func TestRefineHandlerOK(t *testing.T) {
	h := NewHandlers(Deps{LLM: stubLLM{refined: "tweet refinado"}})
	body := `{"platform":"bluesky","text":"rascunho","instruction":"mais curto"}`
	req := httptest.NewRequest(http.MethodPost, "/admin/llm/refine", bytes.NewBufferString(body))
	rec := httptest.NewRecorder()
	h.Refine(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
	var env struct {
		Data struct {
			Refined string `json:"refined"`
		} `json:"data"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &env)
	if env.Data.Refined != "tweet refinado" {
		t.Fatalf("refined = %q, want %q", env.Data.Refined, "tweet refinado")
	}
}

func TestRefineHandler503WhenNil(t *testing.T) {
	h := NewHandlers(Deps{LLM: nil})
	body := `{"platform":"bluesky","text":"test","instruction":"x"}`
	req := httptest.NewRequest(http.MethodPost, "/admin/llm/refine", bytes.NewBufferString(body))
	rec := httptest.NewRecorder()
	h.Refine(rec, req)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", rec.Code)
	}
}

// ─── Typed-nil normalization ─────────────────────────────────────────────────

func TestNewHandlersNormalizesTypedNil(t *testing.T) {
	// A (*pkgllm.Client)(nil) is a typed-nil interface value: the interface
	// is non-nil but wraps a nil pointer. NewHandlers must normalize it so
	// unavailable() returns 503 instead of panicking on the nil pointer call.
	var typedNil *pkgllm.Client // (*pkgllm.Client)(nil)
	h := NewHandlers(Deps{LLM: typedNil})
	req := httptest.NewRequest(http.MethodPost, "/admin/llm/proofread", bytes.NewBufferString(`{"text":"test"}`))
	rec := httptest.NewRecorder()
	h.Proofread(rec, req)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503 (typed-nil should be normalized); body=%s", rec.Code, rec.Body.String())
	}
}
