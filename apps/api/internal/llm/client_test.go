package llm

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"unicode/utf8"
)

func newChatServer(t *testing.T, reply string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/tags" {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"models":[]}`))
			return
		}
		if r.URL.Path != "/api/chat" || r.Method != http.MethodPost {
			t.Errorf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		var body struct {
			Model    string `json:"model"`
			Stream   bool   `json:"stream"`
			Messages []struct {
				Role    string `json:"role"`
				Content string `json:"content"`
			} `json:"messages"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Errorf("decode request body: %v", err)
		}
		if body.Stream {
			t.Error("stream must be false")
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"message": map[string]string{"role": "assistant", "content": reply},
			"done":    true,
		})
	}))
}

func TestHealthOK(t *testing.T) {
	srv := newChatServer(t, "ok")
	defer srv.Close()
	c := NewClient(srv.URL, "m-proof", "m-careful", "m-hooks")
	if err := c.Health(context.Background()); err != nil {
		t.Fatalf("Health() = %v, want nil", err)
	}
}

func TestHealthError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write([]byte(`{"error":"not ready"}`))
	}))
	defer srv.Close()
	c := NewClient(srv.URL, "m-proof", "m-careful", "m-hooks")
	err := c.Health(context.Background())
	if err == nil {
		t.Fatal("Health() = nil, want non-nil error for 503")
	}
}

func TestChatTrimsReply(t *testing.T) {
	srv := newChatServer(t, "  resposta limpa\n")
	defer srv.Close()
	c := NewClient(srv.URL, "m-proof", "m-careful", "m-hooks")
	got, err := c.chat(context.Background(), "m-proof", "sys", "user", 0.1)
	if err != nil {
		t.Fatalf("chat() error: %v", err)
	}
	if got != "resposta limpa" {
		t.Fatalf("chat() = %q", got)
	}
}

func TestChatNon200ReturnsError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"error":"boom"}`))
	}))
	defer srv.Close()
	c := NewClient(srv.URL, "m-proof", "m-careful", "m-hooks")
	_, err := c.Proofread(context.Background(), "texto", false)
	if err == nil {
		t.Fatal("Proofread() = nil, want error for 500")
	}
	if !strings.Contains(err.Error(), "500") {
		t.Fatalf("error message does not contain '500': %v", err)
	}
}

func TestChatBadJSON(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{broken`))
	}))
	defer srv.Close()
	c := NewClient(srv.URL, "m-proof", "m-careful", "m-hooks")
	_, err := c.Proofread(context.Background(), "texto", false)
	if err == nil {
		t.Fatal("Proofread() = nil, want decode error for malformed JSON")
	}
}

func TestProofreadSendsTextAndModel(t *testing.T) {
	var gotModel, gotUser string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Model    string        `json:"model"`
			Messages []chatMessage `json:"messages"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Errorf("decode request body: %v", err)
		}
		gotModel = body.Model
		gotUser = body.Messages[len(body.Messages)-1].Content
		_ = json.NewEncoder(w).Encode(map[string]any{"message": map[string]string{"content": "texto corrigido"}})
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "m-proof", "m-careful", "m-hooks")
	got, err := c.Proofread(context.Background(), "txto com erro", false)
	if err != nil {
		t.Fatalf("Proofread() error: %v", err)
	}
	if got != "texto corrigido" {
		t.Fatalf("Proofread() = %q", got)
	}
	if gotModel != "m-proof" {
		t.Fatalf("model = %q, want m-proof", gotModel)
	}
	if !strings.Contains(gotUser, "txto com erro") {
		t.Fatalf("user message não contém o texto original: %q", gotUser)
	}
}

func TestGenerateHooksPerPlatform(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Messages []chatMessage `json:"messages"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Errorf("decode request body: %v", err)
		}
		// devolve a plataforma citada no system prompt p/ provar que variou
		reply := "chamada"
		if strings.Contains(body.Messages[0].Content, "bluesky") {
			reply = "chamada bluesky https://x"
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"message": map[string]string{"content": reply}})
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "m-proof", "m-careful", "m-hooks")
	art := Article{Title: "Meu Post", Excerpt: "resumo", URL: "https://blog/x", Tags: []string{"go"}}
	hooks, err := c.GenerateHooks(context.Background(), art, []string{"bluesky", "mastodon"})
	if err != nil {
		t.Fatalf("GenerateHooks() error: %v", err)
	}
	if len(hooks) != 2 {
		t.Fatalf("len(hooks) = %d, want 2", len(hooks))
	}
	if hooks[0].Platform != "bluesky" || hooks[0].Text != "chamada bluesky https://x" {
		t.Fatalf("hook[0] = %+v", hooks[0])
	}
}

func TestRefineUsesInstruction(t *testing.T) {
	var gotUser string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Messages []chatMessage `json:"messages"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Errorf("decode request body: %v", err)
		}
		gotUser = body.Messages[len(body.Messages)-1].Content
		_ = json.NewEncoder(w).Encode(map[string]any{"message": map[string]string{"content": "refinado"}})
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "m-proof", "m-careful", "m-hooks")
	got, err := c.Refine(context.Background(), "bluesky", "texto base", "deixa informal")
	if err != nil {
		t.Fatalf("Refine() error: %v", err)
	}
	if got != "refinado" {
		t.Fatalf("Refine() = %q", got)
	}
	if !strings.Contains(gotUser, "texto base") || !strings.Contains(gotUser, "deixa informal") {
		t.Fatalf("user message faltando texto/instrução: %q", gotUser)
	}
}

func TestProofreadCarefulUsesCarefulModel(t *testing.T) {
	var lastModel string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Model string `json:"model"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Errorf("decode request body: %v", err)
		}
		lastModel = body.Model
		_ = json.NewEncoder(w).Encode(map[string]any{"message": map[string]string{"content": "corrigido"}})
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "m-proof", "m-careful", "m-hooks")

	// careful=false deve usar o modelo padrão
	if _, err := c.Proofread(context.Background(), "txto", false); err != nil {
		t.Fatalf("Proofread(careful=false) error: %v", err)
	}
	if lastModel != "m-proof" {
		t.Fatalf("careful=false: model = %q, want m-proof", lastModel)
	}

	// careful=true deve usar o modelo cuidadoso
	if _, err := c.Proofread(context.Background(), "txto", true); err != nil {
		t.Fatalf("Proofread(careful=true) error: %v", err)
	}
	if lastModel != "m-careful" {
		t.Fatalf("careful=true: model = %q, want m-careful", lastModel)
	}
}

func TestGenerateHooksEnforcesCharLimit(t *testing.T) {
	long := strings.Repeat("palavra ", 60) // ~480 chars, acima do limite do bluesky (300)
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reply := long
		if calls.Add(1) >= 2 {
			reply = "versão curtinha" // passe de encurtar devolve algo dentro do limite
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"message": map[string]string{"content": reply}})
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "m-proof", "m-careful", "m-hooks")
	hooks, err := c.GenerateHooks(context.Background(), Article{Title: "T"}, []string{"bluesky"})
	if err != nil {
		t.Fatalf("GenerateHooks: %v", err)
	}
	if n := utf8.RuneCountInString(hooks[0].Text); n > 300 {
		t.Fatalf("hook = %d chars, want ≤300: %q", n, hooks[0].Text)
	}
}

func TestGenerateHooksTruncatesWhenShortenStillLong(t *testing.T) {
	long := strings.Repeat("x", 500) // o encurtar também devolve longo
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"message": map[string]string{"content": long}})
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "m-proof", "m-careful", "m-hooks")
	hooks, err := c.GenerateHooks(context.Background(), Article{Title: "T"}, []string{"bluesky"})
	if err != nil {
		t.Fatalf("GenerateHooks: %v", err)
	}
	if n := utf8.RuneCountInString(hooks[0].Text); n > 300 {
		t.Fatalf("hook não foi truncado p/ o limite: %d chars", n)
	}
}
