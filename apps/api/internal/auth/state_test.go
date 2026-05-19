package auth_test

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/PiluVitu/api/internal/auth"
)

func TestGenerateState_UniqueAndHex(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 50; i++ {
		s, err := auth.GenerateState()
		if err != nil {
			t.Fatalf("GenerateState: %v", err)
		}
		if len(s) != 64 { // 32 bytes hex
			t.Errorf("len = %d, want 64", len(s))
		}
		if seen[s] {
			t.Errorf("collision on %q", s)
		}
		seen[s] = true
	}
}

func TestSetAndConsumeStateCookie_Roundtrip(t *testing.T) {
	rec := httptest.NewRecorder()
	auth.SetStateCookie(rec, "abc123")

	req := httptest.NewRequest(http.MethodGet, "/cb", nil)
	for _, c := range rec.Result().Cookies() {
		req.AddCookie(c)
	}

	rec2 := httptest.NewRecorder()
	got, err := auth.ConsumeStateCookie(rec2, req)
	if err != nil {
		t.Fatalf("ConsumeStateCookie: %v", err)
	}
	if got != "abc123" {
		t.Errorf("state = %q", got)
	}
	// Consume must clear the cookie via MaxAge=-1.
	cleared := rec2.Result().Cookies()
	if len(cleared) == 0 || cleared[0].MaxAge != -1 {
		t.Error("ConsumeStateCookie should send MaxAge=-1 to clear the cookie")
	}
}

func TestConsumeStateCookie_Missing(t *testing.T) {
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/cb", nil)
	_, err := auth.ConsumeStateCookie(rec, req)
	if !errors.Is(err, auth.ErrStateCookieMissing) {
		t.Errorf("err = %v, want ErrStateCookieMissing", err)
	}
}

func TestSetStateCookie_Attributes(t *testing.T) {
	rec := httptest.NewRecorder()
	auth.SetStateCookie(rec, "x")
	cookies := rec.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("got %d cookies", len(cookies))
	}
	c := cookies[0]
	if !c.HttpOnly {
		t.Error("state cookie should be HttpOnly")
	}
	if c.SameSite != http.SameSiteLaxMode {
		t.Errorf("state cookie SameSite = %v", c.SameSite)
	}
	if c.MaxAge <= 0 || c.MaxAge > 600 {
		t.Errorf("state cookie MaxAge = %d, want 1..600", c.MaxAge)
	}
}
