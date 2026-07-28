package distribution

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"

	dist "github.com/PiluVitu/api/internal/distribution"
	pkgllm "github.com/PiluVitu/api/internal/llm"
)

// stubSvc implements DistService, returning a fixed fixture.
type stubSvc struct {
	fixture []dist.Target
}

func (s *stubSvc) BuildProposals(_ context.Context, _ string, _ pkgllm.Article, _ string) ([]dist.Target, error) {
	return s.fixture, nil
}

func (s *stubSvc) Publish(_ context.Context, _ string, _ []dist.Selected) ([]dist.Target, error) {
	return s.fixture, nil
}

func (s *stubSvc) List(_ context.Context, _ string) ([]dist.Target, error) {
	return s.fixture, nil
}

// fixture used across all positive tests: one pending bluesky target.
var oneTarget = []dist.Target{
	{Slug: "my-post", Platform: "bluesky", Kind: dist.KindSocial, Content: "hello world", Status: "pending"},
}

// decodeEnvelope decodes the standard httpx envelope.
func decodeEnvelope(t *testing.T, body []byte) map[string]any {
	t.Helper()
	var env map[string]any
	if err := json.Unmarshal(body, &env); err != nil {
		t.Fatalf("envelope decode: %v (body=%s)", err, body)
	}
	return env
}

// targetsFromEnv extracts data.targets from the decoded envelope.
func targetsFromEnv(t *testing.T, env map[string]any) []any {
	t.Helper()
	data, ok := env["data"].(map[string]any)
	if !ok {
		t.Fatalf("data not a map: %T", env["data"])
	}
	targets, ok := data["targets"].([]any)
	if !ok {
		t.Fatalf("targets not a slice: %T", data["targets"])
	}
	return targets
}

// TestProposalsHandler: valid body → 200, data.targets has fixture length.
func TestProposalsHandler(t *testing.T) {
	h := NewHandlers(Deps{Service: &stubSvc{fixture: oneTarget}})
	body := bytes.NewBufferString(`{"slug":"my-post","title":"My Post","excerpt":"summary","url":"https://blog/my-post","body":"article body","tags":["go","api"]}`)
	req := httptest.NewRequest(http.MethodPost, "/admin/distribution/proposals", body)
	rec := httptest.NewRecorder()

	h.Proposals(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
	env := decodeEnvelope(t, rec.Body.Bytes())
	targets := targetsFromEnv(t, env)
	if len(targets) != len(oneTarget) {
		t.Fatalf("targets len = %d, want %d", len(targets), len(oneTarget))
	}
}

// TestProposalsHandlerBadBody: missing slug → 400 invalid_json.
func TestProposalsHandlerBadBody(t *testing.T) {
	h := NewHandlers(Deps{Service: &stubSvc{fixture: oneTarget}})
	// slug is absent — the handler must reject it
	body := bytes.NewBufferString(`{"title":"My Post","body":"article body"}`)
	req := httptest.NewRequest(http.MethodPost, "/admin/distribution/proposals", body)
	rec := httptest.NewRecorder()

	h.Proposals(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400; body=%s", rec.Code, rec.Body.String())
	}
	env := decodeEnvelope(t, rec.Body.Bytes())
	notifs, _ := env["notifications"].([]any)
	if len(notifs) == 0 {
		t.Fatal("expected at least one notification")
	}
	first := notifs[0].(map[string]any)
	if first["code"] != "invalid_json" {
		t.Fatalf("code = %q, want invalid_json", first["code"])
	}
}

// TestGetHandler: slug via chi URL param → 200, returns fixture.
func TestGetHandler(t *testing.T) {
	h := NewHandlers(Deps{Service: &stubSvc{fixture: oneTarget}})

	r := chi.NewRouter()
	r.Get("/admin/distribution/{slug}", h.Get)

	req := httptest.NewRequest(http.MethodGet, "/admin/distribution/my-post", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
	env := decodeEnvelope(t, rec.Body.Bytes())
	targets := targetsFromEnv(t, env)
	if len(targets) != len(oneTarget) {
		t.Fatalf("targets len = %d, want %d", len(targets), len(oneTarget))
	}
}

// TestPublishHandler: slug via chi URL param → 200.
func TestPublishHandler(t *testing.T) {
	h := NewHandlers(Deps{Service: &stubSvc{fixture: oneTarget}})

	r := chi.NewRouter()
	r.Post("/admin/distribution/{slug}/publish", h.Publish)

	body := bytes.NewBufferString(`{"targets":[{"platform":"bluesky","content":"hello world"}]}`)
	req := httptest.NewRequest(http.MethodPost, "/admin/distribution/my-post/publish", body)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
	env := decodeEnvelope(t, rec.Body.Bytes())
	targets := targetsFromEnv(t, env)
	if len(targets) != len(oneTarget) {
		t.Fatalf("targets len = %d, want %d", len(targets), len(oneTarget))
	}
}

// TestPublishHandler503WhenNil: Deps{Service:nil} → 503 distribution_unavailable.
func TestPublishHandler503WhenNil(t *testing.T) {
	h := NewHandlers(Deps{Service: nil})

	r := chi.NewRouter()
	r.Post("/admin/distribution/{slug}/publish", h.Publish)

	body := bytes.NewBufferString(`{"targets":[]}`)
	req := httptest.NewRequest(http.MethodPost, "/admin/distribution/my-post/publish", body)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503; body=%s", rec.Code, rec.Body.String())
	}
	env := decodeEnvelope(t, rec.Body.Bytes())
	notifs, _ := env["notifications"].([]any)
	if len(notifs) == 0 {
		t.Fatal("expected notification for 503")
	}
	first := notifs[0].(map[string]any)
	if first["code"] != "distribution_unavailable" {
		t.Fatalf("code = %q, want distribution_unavailable", first["code"])
	}
}
