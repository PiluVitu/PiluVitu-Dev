package auth_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/PiluVitu/api/internal/auth"
	"github.com/PiluVitu/api/internal/votacao"
)

func openTestDB(t *testing.T) *votacao.Store {
	t.Helper()
	s, err := votacao.NewStore(filepath.Join(t.TempDir(), "x.db"))
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	t.Cleanup(func() { _ = s.Close() })
	return s
}

func TestNewSessionManager_PutAndGetRoundtrip(t *testing.T) {
	store := openTestDB(t)
	sm := auth.NewSessionManager(store.DB())

	handler := sm.LoadAndSave(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/set" {
			sm.Put(r.Context(), "user_id", int64(42))
			w.WriteHeader(http.StatusOK)
			return
		}
		got := sm.GetInt64(r.Context(), "user_id")
		if got != 42 {
			t.Errorf("got user_id = %d, want 42", got)
		}
	}))

	srv := httptest.NewServer(handler)
	defer srv.Close()

	jar := newJar(t)
	client := &http.Client{Jar: jar}
	resp, err := client.Get(srv.URL + "/set")
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	resp, err = client.Get(srv.URL + "/get")
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
}

func TestNewSessionManager_CookieAttributes(t *testing.T) {
	store := openTestDB(t)
	sm := auth.NewSessionManager(store.DB())
	handler := sm.LoadAndSave(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sm.Put(r.Context(), "k", "v")
	}))

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	handler.ServeHTTP(rec, req)

	setCookie := rec.Result().Header.Get("Set-Cookie")
	if setCookie == "" {
		t.Fatal("expected Set-Cookie header")
	}
	if !contains(setCookie, "HttpOnly") {
		t.Error("session cookie must be HttpOnly")
	}
	if !contains(setCookie, "SameSite=Lax") {
		t.Error("session cookie must be SameSite=Lax")
	}
}

func TestSessionDataPersistsAcrossManagerInstances(t *testing.T) {
	store := openTestDB(t)
	sm1 := auth.NewSessionManager(store.DB())

	// Write via sm1 inside a managed request, capturing the cookie.
	srv := httptest.NewServer(sm1.LoadAndSave(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sm1.Put(r.Context(), "n", int64(7))
	})))
	jar := newJar(t)
	(&http.Client{Jar: jar}).Get(srv.URL)
	srv.Close()

	// Now build a fresh manager on the same DB and read back.
	sm2 := auth.NewSessionManager(store.DB())
	var got int64
	srv2 := httptest.NewServer(sm2.LoadAndSave(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = sm2.GetInt64(r.Context(), "n")
	})))
	defer srv2.Close()
	(&http.Client{Jar: jar}).Get(srv2.URL)

	if got != 7 {
		t.Errorf("got = %d, want 7 (cross-instance persistence broken)", got)
	}
	_ = context.Background()
}

func contains(s, sub string) bool { return len(s) >= len(sub) && (indexOf(s, sub) >= 0) }
func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}
