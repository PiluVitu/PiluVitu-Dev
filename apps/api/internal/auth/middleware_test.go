package auth_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/PiluVitu/api/internal/auth"
	"github.com/PiluVitu/api/internal/votacao"
	"golang.org/x/oauth2"
)

type mwScenario struct {
	t        *testing.T
	store    *votacao.Store
	handlers *auth.Handlers
}

func newMwScenario(t *testing.T) mwScenario {
	t.Helper()
	store := openTestDB(t)
	h := auth.NewHandlers(auth.HandlersDeps{
		Store:    store,
		Sessions: auth.NewSessionManager(store.DB()),
		Config:   auth.Config{ClientID: "cid", WebRedirectURL: "http://web", AdminEmails: []string{"admin@x.com"}},
		Exchanger: &stubExchanger{exchangeFn: func(ctx context.Context, code string) (*oauth2.Token, error) {
			return makeIDTokenWithToken("raw"), nil
		}},
		Verifier: &stubVerifier{claims: &auth.Claims{Sub: "s", Email: "user@x.com", Name: "User"}},
	})
	return mwScenario{t: t, store: store, handlers: h}
}

func (s mwScenario) loggedInClient(t *testing.T, srv *httptest.Server) *http.Client {
	t.Helper()
	jar := newJar(t)
	client := &http.Client{Jar: jar, CheckRedirect: func(req *http.Request, via []*http.Request) error { return http.ErrUseLastResponse }}
	cbReq, _ := http.NewRequest(http.MethodGet, srv.URL+"/cb?code=c&state=s", nil)
	cbReq.AddCookie(&http.Cookie{Name: "piluvitu_oauth_state", Value: "s"})
	resp, _ := client.Do(cbReq)
	resp.Body.Close()
	return client
}

func TestRequireAuth_BlocksAnonymous(t *testing.T) {
	s := newMwScenario(t)
	protected := auth.RequireAuth(s.handlers.Sessions(), s.store)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	srv := httptest.NewServer(s.handlers.Sessions().LoadAndSave(protected))
	defer srv.Close()
	resp, _ := http.Get(srv.URL + "/x")
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d", resp.StatusCode)
	}
}

func TestRequireAuth_AllowsLoggedIn(t *testing.T) {
	s := newMwScenario(t)
	protected := auth.RequireAuth(s.handlers.Sessions(), s.store)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u := auth.UserFromContext(r.Context())
		if u == nil || u.Email != "user@x.com" {
			t.Errorf("user from ctx = %+v", u)
		}
		w.WriteHeader(http.StatusOK)
	}))
	srv := httptest.NewServer(s.handlers.Sessions().LoadAndSave(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/cb" {
			s.handlers.Callback(w, r)
			return
		}
		protected.ServeHTTP(w, r)
	})))
	defer srv.Close()
	client := s.loggedInClient(t, srv)
	resp, _ := client.Get(srv.URL + "/x")
	if resp.StatusCode != http.StatusOK {
		t.Errorf("status = %d", resp.StatusCode)
	}
}

func TestRequireAdmin_NonAdminGets403(t *testing.T) {
	s := newMwScenario(t)
	protected := auth.RequireAdmin(s.handlers.Sessions(), s.store)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	srv := httptest.NewServer(s.handlers.Sessions().LoadAndSave(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/cb" {
			s.handlers.Callback(w, r)
			return
		}
		protected.ServeHTTP(w, r)
	})))
	defer srv.Close()
	client := s.loggedInClient(t, srv)
	resp, _ := client.Get(srv.URL + "/x")
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("status = %d", resp.StatusCode)
	}
}

func TestRequireAdmin_AdminAllowed(t *testing.T) {
	s := newMwScenario(t)
	// Replace handlers with admin claims; reuse the SessionManager so LoadAndSave + tests share state.
	s.handlers = auth.NewHandlers(auth.HandlersDeps{
		Store:    s.store,
		Sessions: s.handlers.Sessions(),
		Config:   auth.Config{ClientID: "cid", WebRedirectURL: "http://web", AdminEmails: []string{"admin@x.com"}},
		Exchanger: &stubExchanger{exchangeFn: func(ctx context.Context, code string) (*oauth2.Token, error) {
			return makeIDTokenWithToken("raw"), nil
		}},
		Verifier: &stubVerifier{claims: &auth.Claims{Sub: "s-admin", Email: "admin@x.com", Name: "Admin"}},
	})

	protected := auth.RequireAdmin(s.handlers.Sessions(), s.store)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	srv := httptest.NewServer(s.handlers.Sessions().LoadAndSave(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/cb" {
			s.handlers.Callback(w, r)
			return
		}
		protected.ServeHTTP(w, r)
	})))
	defer srv.Close()
	client := s.loggedInClient(t, srv)
	resp, _ := client.Get(srv.URL + "/x")
	if resp.StatusCode != http.StatusOK {
		t.Errorf("status = %d", resp.StatusCode)
	}
}
