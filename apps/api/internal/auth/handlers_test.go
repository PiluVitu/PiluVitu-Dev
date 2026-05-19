package auth_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"golang.org/x/oauth2"

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

func newCallbackHandlersWith(t *testing.T, ex *stubExchanger, vr *stubVerifier) *auth.Handlers {
	t.Helper()
	store := openTestDB(t)
	return auth.NewHandlers(auth.HandlersDeps{
		Store:     store,
		Sessions:  auth.NewSessionManager(store.DB()),
		Config:    auth.Config{ClientID: "cid", WebRedirectURL: "http://web/done", AdminEmails: []string{"admin@example.com"}},
		Exchanger: ex,
		Verifier:  vr,
	})
}

func makeIDTokenWithToken(idToken string) *oauth2.Token {
	t := &oauth2.Token{AccessToken: "ignored"}
	return t.WithExtra(map[string]any{"id_token": idToken})
}

func TestCallback_HappyPath_AdminUserUpsertedAndSessionSet(t *testing.T) {
	ex := &stubExchanger{
		exchangeFn: func(ctx context.Context, code string) (*oauth2.Token, error) {
			if code != "good-code" {
				t.Errorf("code = %q", code)
			}
			return makeIDTokenWithToken("raw-id-token"), nil
		},
	}
	vr := &stubVerifier{claims: &auth.Claims{Sub: "google-sub-1", Email: "admin@example.com", Name: "Admin", Picture: "http://p"}}
	h := newCallbackHandlersWith(t, ex, vr)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/auth/google/callback?code=good-code&state=s1", nil)
	req.AddCookie(&http.Cookie{Name: "piluvitu_oauth_state", Value: "s1"})

	withSessions(t, h)(http.HandlerFunc(h.Callback)).ServeHTTP(rec, req)

	if rec.Code != http.StatusFound {
		t.Fatalf("status = %d, want 302", rec.Code)
	}
	if got := rec.Header().Get("Location"); got != "http://web/done" {
		t.Errorf("Location = %q", got)
	}
	if !hasSessionCookie(rec.Result().Cookies()) {
		t.Error("expected piluvitu_session cookie to be set")
	}
}

func TestCallback_StateMismatch_Returns400(t *testing.T) {
	h := newCallbackHandlersWith(t, &stubExchanger{}, &stubVerifier{})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/auth/google/callback?code=c&state=mismatch", nil)
	req.AddCookie(&http.Cookie{Name: "piluvitu_oauth_state", Value: "expected"})
	withSessions(t, h)(http.HandlerFunc(h.Callback)).ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d", rec.Code)
	}
}

func TestCallback_MissingStateCookie_Returns400(t *testing.T) {
	h := newCallbackHandlersWith(t, &stubExchanger{}, &stubVerifier{})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/auth/google/callback?code=c&state=s", nil)
	withSessions(t, h)(http.HandlerFunc(h.Callback)).ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d", rec.Code)
	}
}

func TestCallback_MissingCode_Returns400(t *testing.T) {
	h := newCallbackHandlersWith(t, &stubExchanger{}, &stubVerifier{})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/auth/google/callback?state=s", nil)
	req.AddCookie(&http.Cookie{Name: "piluvitu_oauth_state", Value: "s"})
	withSessions(t, h)(http.HandlerFunc(h.Callback)).ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d", rec.Code)
	}
}

func TestCallback_VerifierError_Returns401(t *testing.T) {
	ex := &stubExchanger{
		exchangeFn: func(ctx context.Context, code string) (*oauth2.Token, error) {
			return makeIDTokenWithToken("bad-id"), nil
		},
	}
	vr := &stubVerifier{err: errors.New("invalid token")}
	h := newCallbackHandlersWith(t, ex, vr)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/auth/google/callback?code=c&state=s", nil)
	req.AddCookie(&http.Cookie{Name: "piluvitu_oauth_state", Value: "s"})
	withSessions(t, h)(http.HandlerFunc(h.Callback)).ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d", rec.Code)
	}
}

func TestCallback_NoIDToken_Returns500(t *testing.T) {
	ex := &stubExchanger{
		exchangeFn: func(ctx context.Context, code string) (*oauth2.Token, error) {
			return &oauth2.Token{AccessToken: "x"}, nil // no id_token extra
		},
	}
	h := newCallbackHandlersWith(t, ex, &stubVerifier{})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/auth/google/callback?code=c&state=s", nil)
	req.AddCookie(&http.Cookie{Name: "piluvitu_oauth_state", Value: "s"})
	withSessions(t, h)(http.HandlerFunc(h.Callback)).ServeHTTP(rec, req)
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("status = %d", rec.Code)
	}
}

func hasSessionCookie(cookies []*http.Cookie) bool {
	for _, c := range cookies {
		if c.Name == "piluvitu_session" {
			return true
		}
	}
	return false
}

// withSessions wraps a handler in the scs LoadAndSave middleware for the given Handlers.
func withSessions(t *testing.T, h *auth.Handlers) func(http.Handler) http.Handler {
	t.Helper()
	return h.Sessions().LoadAndSave
}
