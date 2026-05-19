package auth_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/PiluVitu/api/internal/auth"
)

func newLoginHandlers(t *testing.T) *auth.Handlers {
	t.Helper()
	store := openTestDB(t)
	return auth.NewHandlers(auth.HandlersDeps{
		Store:     store,
		Sessions:  auth.NewSessionManager(store.DB()),
		Config:    auth.Config{ClientID: "cid", WebRedirectURL: "http://web/done"},
		Exchanger: &stubExchanger{authURLFmt: "https://google/auth?state="},
		Verifier:  &stubVerifier{},
	})
}

func TestLogin_RedirectsToGoogleWithState(t *testing.T) {
	h := newLoginHandlers(t)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/auth/google/login", nil)
	h.Login(rec, req)

	if rec.Code != http.StatusFound {
		t.Fatalf("status = %d, want 302", rec.Code)
	}
	loc := rec.Header().Get("Location")
	if !strings.HasPrefix(loc, "https://google/auth?state=") {
		t.Errorf("Location = %q", loc)
	}
	cookies := rec.Result().Cookies()
	var stateCookie *http.Cookie
	for _, c := range cookies {
		if c.Name == "piluvitu_oauth_state" {
			stateCookie = c
		}
	}
	if stateCookie == nil {
		t.Fatal("state cookie not set")
	}
	if !strings.HasSuffix(loc, stateCookie.Value) {
		t.Errorf("location state %q does not match cookie state %q", loc, stateCookie.Value)
	}
}
