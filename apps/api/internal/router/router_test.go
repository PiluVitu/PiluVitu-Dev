package router

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHealthEndpoint(t *testing.T) {
	srv := httptest.NewServer(New())
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/health")
	if err != nil {
		t.Fatalf("GET /health: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

func TestCORS_AllowedOrigin_GET(t *testing.T) {
	srv := httptest.NewServer(New())
	defer srv.Close()

	req, _ := http.NewRequest(http.MethodGet, srv.URL+"/health", nil)
	req.Header.Set("Origin", "https://piluvitu.com.br")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer resp.Body.Close()

	got := resp.Header.Get("Access-Control-Allow-Origin")
	if got != "https://piluvitu.com.br" {
		t.Fatalf("expected ACAO=https://piluvitu.com.br, got %q", got)
	}
}

func TestCORS_BlockedOrigin_GET(t *testing.T) {
	srv := httptest.NewServer(New())
	defer srv.Close()

	req, _ := http.NewRequest(http.MethodGet, srv.URL+"/health", nil)
	req.Header.Set("Origin", "https://evil.example.com")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer resp.Body.Close()

	// Sem ACAO no response = browser bloqueia leitura.
	if got := resp.Header.Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("expected no ACAO header for blocked origin, got %q", got)
	}
}

func TestCORS_Preflight_AllowedOrigin(t *testing.T) {
	srv := httptest.NewServer(New())
	defer srv.Close()

	req, _ := http.NewRequest(http.MethodOptions, srv.URL+"/tools/cpf/validate", nil)
	req.Header.Set("Origin", "http://localhost:3333")
	req.Header.Set("Access-Control-Request-Method", "POST")
	req.Header.Set("Access-Control-Request-Headers", "Content-Type")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("preflight: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent && resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 204/200 from preflight, got %d", resp.StatusCode)
	}
	if got := resp.Header.Get("Access-Control-Allow-Origin"); got != "http://localhost:3333" {
		t.Fatalf("expected ACAO=http://localhost:3333, got %q", got)
	}
	if got := resp.Header.Get("Access-Control-Allow-Methods"); got == "" {
		t.Fatalf("expected Access-Control-Allow-Methods header, got empty")
	}
}

func TestAllowedOrigins_DefaultsWhenEnvUnset(t *testing.T) {
	t.Setenv("CORS_ALLOWED_ORIGINS", "")
	got := allowedOrigins()
	if len(got) != len(defaultAllowedOrigins) {
		t.Fatalf("expected defaults, got %v", got)
	}
}

func TestAllowedOrigins_ParsesEnv(t *testing.T) {
	t.Setenv("CORS_ALLOWED_ORIGINS", "https://a.com, https://b.com ,https://c.com")
	got := allowedOrigins()
	want := []string{"https://a.com", "https://b.com", "https://c.com"}
	if len(got) != len(want) {
		t.Fatalf("len mismatch: got %v want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("[%d] got %q want %q", i, got[i], want[i])
		}
	}
}
