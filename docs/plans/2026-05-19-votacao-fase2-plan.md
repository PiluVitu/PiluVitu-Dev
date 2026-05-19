# Votação de Filmes — Fase 2: Auth Google (OAuth + scs)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar Google OAuth ao Go API com sessões persistidas em SQLite via `alexedwards/scs`, expondo `/auth/google/login`, `/auth/google/callback`, `/auth/me`, `POST /auth/logout`, e middleware `RequireAuth` / `RequireAdmin` para uso nas fases seguintes.

**Architecture:** OAuth confidencial server-side (`golang.org/x/oauth2/google`), state CSRF via cookie HttpOnly de curto prazo. ID token validado por `google.golang.org/api/idtoken`. Sessões em cookie HttpOnly Lax persistidas em SQLite (`scs/sqlite3store` cria tabela `sessions` automaticamente — não está no `schema.sql` da Fase 1). Trocadores e verificador definidos via interface para permitir stub em testes sem chamar Google.

**Tech Stack:** Go 1.25, `github.com/alexedwards/scs/v2`, `github.com/alexedwards/scs/sqlite3store`, `golang.org/x/oauth2`, `google.golang.org/api/idtoken`, chi v5.

**Reference design:** `docs/plans/2026-05-19-votacao-filmes-design.md` (seções "Endpoints" e "Estrutura de pacotes Go").

**Pré-requisito de Fase 1:** `votacao.Store` + `UpsertUser` + `GetUserByGoogleSub` já existem.

---

## File Structure

```
apps/api/internal/auth/
  config.go              # Config{ClientID, ClientSecret, RedirectURL, WebRedirectURL, AdminEmails}
  config_test.go
  session.go             # NewSessionManager(*sql.DB) *scs.SessionManager
  session_test.go
  state.go               # generateState, setStateCookie, consumeStateCookie
  state_test.go
  google.go              # TokenExchanger + IDTokenVerifier interfaces + Google impls + Claims
  handlers.go            # Handlers struct (Login, Callback, Me, Logout)
  handlers_test.go
  middleware.go          # RequireAuth, RequireAdmin
  middleware_test.go
  helper_test.go         # stubs (stubExchanger, stubVerifier) + newTestHandlers helper
apps/api/cmd/api/main.go             # MODIFIED: build auth.Config, SessionManager, Handlers
apps/api/internal/router/router.go   # MODIFIED: Deps gets SessionManager + AuthHandlers; CORS AllowCredentials=true; LoadAndSave middleware
apps/api/internal/router/router_test.go # MODIFIED: pass new Deps fields
apps/api/go.mod                      # MODIFIED: + scs/v2, scs/sqlite3store, oauth2, idtoken
apps/api/go.sum                      # MODIFIED
apps/api/.env.example                # CREATE
infra/docker-compose.yml             # MODIFIED: pass-through OAuth env vars
CLAUDE.md                            # MODIFIED: document /auth/* endpoints + scs setup
```

**Why this split:** Cada arquivo tem 1 responsabilidade (config, session, state cookie, Google adapters, handlers, middleware). Teste colocado ao lado. Interfaces (`TokenExchanger`, `IDTokenVerifier`) tornam os handlers testáveis sem chamar o Google real.

---

## Task 1: Add OAuth + scs dependencies

**Files:**
- Modify: `apps/api/go.mod`, `apps/api/go.sum`

- [ ] **Step 1.1: Add dependencies**

Run:
```bash
cd apps/api && go get \
  github.com/alexedwards/scs/v2@latest \
  github.com/alexedwards/scs/sqlite3store@latest \
  golang.org/x/oauth2@latest \
  google.golang.org/api@latest
```

Expected: `go.mod` ganha 4 novas linhas `require`. `go.sum` atualizado.

- [ ] **Step 1.2: Verify build still passes**

Run:
```bash
cd apps/api && go build ./...
```

Expected: build OK (sem novos consumidores ainda).

- [ ] **Step 1.3: Commit**

```bash
git add apps/api/go.mod apps/api/go.sum
git commit -m "feat(api): add scs + oauth2 + idtoken deps for auth phase 2"
```

---

## Task 2: auth.Config + FromEnv

**Files:**
- Create: `apps/api/internal/auth/config.go`
- Create: `apps/api/internal/auth/config_test.go`

- [ ] **Step 2.1: Write failing tests**

Create `apps/api/internal/auth/config_test.go`:

```go
package auth_test

import (
	"errors"
	"testing"

	"github.com/PiluVitu/api/internal/auth"
)

func TestConfigFromEnv_AllSet(t *testing.T) {
	t.Setenv("GOOGLE_OAUTH_CLIENT_ID", "cid")
	t.Setenv("GOOGLE_OAUTH_CLIENT_SECRET", "csecret")
	t.Setenv("GOOGLE_OAUTH_REDIRECT_URL", "http://localhost:8080/auth/google/callback")
	t.Setenv("WEB_REDIRECT_URL", "http://localhost:3333/votacao")
	t.Setenv("ADMIN_EMAILS", "paulo@example.com, OTHER@example.com")

	cfg, err := auth.ConfigFromEnv()
	if err != nil {
		t.Fatalf("ConfigFromEnv: %v", err)
	}
	if cfg.ClientID != "cid" {
		t.Errorf("ClientID = %q", cfg.ClientID)
	}
	if cfg.WebRedirectURL != "http://localhost:3333/votacao" {
		t.Errorf("WebRedirectURL = %q", cfg.WebRedirectURL)
	}
	if len(cfg.AdminEmails) != 2 {
		t.Errorf("AdminEmails len = %d, want 2", len(cfg.AdminEmails))
	}
	if cfg.AdminEmails[1] != "OTHER@example.com" {
		t.Errorf("AdminEmails[1] = %q (trimming only, casing preserved)", cfg.AdminEmails[1])
	}
}

func TestConfigFromEnv_MissingClientID(t *testing.T) {
	t.Setenv("GOOGLE_OAUTH_CLIENT_ID", "")
	t.Setenv("GOOGLE_OAUTH_CLIENT_SECRET", "csecret")
	t.Setenv("GOOGLE_OAUTH_REDIRECT_URL", "http://localhost:8080/auth/google/callback")
	t.Setenv("WEB_REDIRECT_URL", "http://localhost:3333/votacao")

	_, err := auth.ConfigFromEnv()
	if !errors.Is(err, auth.ErrConfigMissing) {
		t.Errorf("err = %v, want ErrConfigMissing", err)
	}
}

func TestConfigFromEnv_AdminEmailsOptional(t *testing.T) {
	t.Setenv("GOOGLE_OAUTH_CLIENT_ID", "cid")
	t.Setenv("GOOGLE_OAUTH_CLIENT_SECRET", "csecret")
	t.Setenv("GOOGLE_OAUTH_REDIRECT_URL", "http://localhost:8080/auth/google/callback")
	t.Setenv("WEB_REDIRECT_URL", "http://localhost:3333/votacao")
	t.Setenv("ADMIN_EMAILS", "")

	cfg, err := auth.ConfigFromEnv()
	if err != nil {
		t.Fatal(err)
	}
	if len(cfg.AdminEmails) != 0 {
		t.Errorf("AdminEmails should be empty, got %v", cfg.AdminEmails)
	}
}
```

- [ ] **Step 2.2: Run tests, confirm failure**

Run:
```bash
cd apps/api && go test ./internal/auth/... 2>&1 | head -10
```

Expected: build error — `auth` package does not exist.

- [ ] **Step 2.3: Implement config.go**

Create `apps/api/internal/auth/config.go`:

```go
package auth

import (
	"errors"
	"fmt"
	"os"
	"strings"
)

// ErrConfigMissing is returned by ConfigFromEnv when a required env var is empty.
var ErrConfigMissing = errors.New("auth: required env var missing")

// Config holds OAuth + redirect settings for the Google auth flow.
type Config struct {
	ClientID       string
	ClientSecret   string
	RedirectURL    string   // OAuth callback URL registered at Google.
	WebRedirectURL string   // Where to send the browser after successful login.
	AdminEmails    []string // Case-insensitive allowlist (compared via votacao.UpsertUser).
}

// ConfigFromEnv reads OAuth settings from the environment.
// Required: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET,
// GOOGLE_OAUTH_REDIRECT_URL, WEB_REDIRECT_URL.
// Optional: ADMIN_EMAILS (comma-separated; whitespace trimmed; casing preserved).
func ConfigFromEnv() (Config, error) {
	cfg := Config{
		ClientID:       os.Getenv("GOOGLE_OAUTH_CLIENT_ID"),
		ClientSecret:   os.Getenv("GOOGLE_OAUTH_CLIENT_SECRET"),
		RedirectURL:    os.Getenv("GOOGLE_OAUTH_REDIRECT_URL"),
		WebRedirectURL: os.Getenv("WEB_REDIRECT_URL"),
	}
	for _, f := range []struct {
		name, value string
	}{
		{"GOOGLE_OAUTH_CLIENT_ID", cfg.ClientID},
		{"GOOGLE_OAUTH_CLIENT_SECRET", cfg.ClientSecret},
		{"GOOGLE_OAUTH_REDIRECT_URL", cfg.RedirectURL},
		{"WEB_REDIRECT_URL", cfg.WebRedirectURL},
	} {
		if strings.TrimSpace(f.value) == "" {
			return Config{}, fmt.Errorf("%w: %s", ErrConfigMissing, f.name)
		}
	}
	if raw := strings.TrimSpace(os.Getenv("ADMIN_EMAILS")); raw != "" {
		parts := strings.Split(raw, ",")
		cfg.AdminEmails = make([]string, 0, len(parts))
		for _, p := range parts {
			if v := strings.TrimSpace(p); v != "" {
				cfg.AdminEmails = append(cfg.AdminEmails, v)
			}
		}
	}
	return cfg, nil
}
```

- [ ] **Step 2.4: Run tests, confirm pass**

Run:
```bash
cd apps/api && go test ./internal/auth/... -v
```

Expected: 3 tests pass.

- [ ] **Step 2.5: Commit**

```bash
git add apps/api/internal/auth/config.go apps/api/internal/auth/config_test.go
git commit -m "feat(auth): Config.FromEnv with required-field validation"
```

---

## Task 3: scs SessionManager

**Files:**
- Create: `apps/api/internal/auth/session.go`
- Create: `apps/api/internal/auth/session_test.go`

- [ ] **Step 3.1: Write failing tests**

Create `apps/api/internal/auth/session_test.go`:

```go
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
```

Create `apps/api/internal/auth/helper_test.go` (shared across this package's tests):

```go
package auth_test

import (
	"net/http/cookiejar"
	"testing"
)

func newJar(t *testing.T) *cookiejar.Jar {
	t.Helper()
	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatalf("cookiejar: %v", err)
	}
	return jar
}
```

- [ ] **Step 3.2: Run tests, confirm failure**

Run:
```bash
cd apps/api && go test ./internal/auth/... -run SessionManager -v
```

Expected: build error — `auth.NewSessionManager` undefined.

- [ ] **Step 3.3: Implement session.go**

Create `apps/api/internal/auth/session.go`:

```go
package auth

import (
	"database/sql"
	"net/http"
	"time"

	"github.com/alexedwards/scs/sqlite3store"
	"github.com/alexedwards/scs/v2"
)

// NewSessionManager returns a SessionManager backed by SQLite. The session
// cookie is HttpOnly + SameSite=Lax + Path=/. Secure must be flipped on in
// production by the caller via env (defaulted off here for local HTTP dev).
//
// sqlite3store.New creates its own `sessions` table on first use; the votacao
// schema does NOT define one (intentional — see phase 1 plan).
func NewSessionManager(db *sql.DB) *scs.SessionManager {
	sm := scs.New()
	sm.Store = sqlite3store.New(db)
	sm.Lifetime = 7 * 24 * time.Hour
	sm.IdleTimeout = 0
	sm.Cookie.Name = "piluvitu_session"
	sm.Cookie.Path = "/"
	sm.Cookie.HttpOnly = true
	sm.Cookie.SameSite = http.SameSiteLaxMode
	sm.Cookie.Secure = false // promoted to true via env in main.go for prod.
	return sm
}
```

- [ ] **Step 3.4: Run tests, confirm pass**

Run:
```bash
cd apps/api && go test ./internal/auth/... -v
```

Expected: session tests pass alongside config tests.

- [ ] **Step 3.5: Commit**

```bash
git add apps/api/internal/auth/session.go apps/api/internal/auth/session_test.go apps/api/internal/auth/helper_test.go
git commit -m "feat(auth): scs SessionManager backed by SQLite (sqlite3store)"
```

---

## Task 4: OAuth state cookie helpers

**Files:**
- Create: `apps/api/internal/auth/state.go`
- Create: `apps/api/internal/auth/state_test.go`

- [ ] **Step 4.1: Write failing tests**

Create `apps/api/internal/auth/state_test.go`:

```go
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
```

- [ ] **Step 4.2: Run tests, confirm failure**

Run:
```bash
cd apps/api && go test ./internal/auth/... -run State -v
```

Expected: undefined.

- [ ] **Step 4.3: Implement state.go**

Create `apps/api/internal/auth/state.go`:

```go
package auth

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"net/http"
)

// ErrStateCookieMissing is returned by ConsumeStateCookie when no state
// cookie is present on the request.
var ErrStateCookieMissing = errors.New("auth: state cookie missing")

const stateCookieName = "piluvitu_oauth_state"

// GenerateState returns a 32-byte hex-encoded random string for use as the
// OAuth state parameter.
func GenerateState() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

// SetStateCookie writes a short-lived (10 min) HttpOnly cookie carrying the
// OAuth state value. The cookie is consumed (deleted) on the callback.
func SetStateCookie(w http.ResponseWriter, state string) {
	http.SetCookie(w, &http.Cookie{
		Name:     stateCookieName,
		Value:    state,
		Path:     "/",
		MaxAge:   600,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
}

// ConsumeStateCookie reads and clears the state cookie. Returns
// ErrStateCookieMissing if the cookie is not present.
func ConsumeStateCookie(w http.ResponseWriter, r *http.Request) (string, error) {
	c, err := r.Cookie(stateCookieName)
	if err != nil {
		return "", ErrStateCookieMissing
	}
	http.SetCookie(w, &http.Cookie{
		Name:     stateCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
	return c.Value, nil
}
```

- [ ] **Step 4.4: Run tests, confirm pass**

Run:
```bash
cd apps/api && go test ./internal/auth/... -v
```

Expected: all state tests pass.

- [ ] **Step 4.5: Commit**

```bash
git add apps/api/internal/auth/state.go apps/api/internal/auth/state_test.go
git commit -m "feat(auth): OAuth state cookie helpers (gen/set/consume)"
```

---

## Task 5: TokenExchanger + IDTokenVerifier interfaces

**Files:**
- Create: `apps/api/internal/auth/google.go`

- [ ] **Step 5.1: Implement google.go**

No tests for the thin Google adapters in this task — they wrap third-party calls that require live Google credentials. The interfaces are exercised in Task 7 via stubs.

Create `apps/api/internal/auth/google.go`:

```go
package auth

import (
	"context"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
	"google.golang.org/api/idtoken"
)

// Claims holds the fields we read off the validated Google ID token.
type Claims struct {
	Sub     string
	Email   string
	Name    string
	Picture string
}

// TokenExchanger abstracts the OAuth code-exchange step.
// It is implemented by *oauth2.Config in production and stubbed in tests.
type TokenExchanger interface {
	AuthCodeURL(state string) string
	Exchange(ctx context.Context, code string) (*oauth2.Token, error)
}

// IDTokenVerifier validates a Google-issued ID token and returns the claims.
type IDTokenVerifier interface {
	Verify(ctx context.Context, idToken, audience string) (*Claims, error)
}

// NewGoogleTokenExchanger returns a TokenExchanger using golang.org/x/oauth2
// configured for the Google OIDC endpoint with the openid/email/profile scopes.
func NewGoogleTokenExchanger(cfg Config) TokenExchanger {
	return &oauth2.Config{
		ClientID:     cfg.ClientID,
		ClientSecret: cfg.ClientSecret,
		RedirectURL:  cfg.RedirectURL,
		Scopes:       []string{"openid", "email", "profile"},
		Endpoint:     google.Endpoint,
	}
}

// NewGoogleIDTokenVerifier returns an IDTokenVerifier backed by
// google.golang.org/api/idtoken.
func NewGoogleIDTokenVerifier() IDTokenVerifier { return googleIDTokenVerifier{} }

type googleIDTokenVerifier struct{}

func (googleIDTokenVerifier) Verify(ctx context.Context, raw, audience string) (*Claims, error) {
	payload, err := idtoken.Validate(ctx, raw, audience)
	if err != nil {
		return nil, err
	}
	claims := &Claims{Sub: payload.Subject}
	if v, ok := payload.Claims["email"].(string); ok {
		claims.Email = v
	}
	if v, ok := payload.Claims["name"].(string); ok {
		claims.Name = v
	}
	if v, ok := payload.Claims["picture"].(string); ok {
		claims.Picture = v
	}
	return claims, nil
}
```

- [ ] **Step 5.2: Verify build**

Run:
```bash
cd apps/api && go build ./...
```

Expected: build success.

- [ ] **Step 5.3: Commit**

```bash
git add apps/api/internal/auth/google.go
git commit -m "feat(auth): Google token exchanger + ID token verifier interfaces"
```

---

## Task 6: LoginHandler

**Files:**
- Create: `apps/api/internal/auth/handlers.go` (partial — only `Handlers` struct + `Login`)
- Create: `apps/api/internal/auth/handlers_test.go` (Login portion)

- [ ] **Step 6.1: Add stub exchanger to helper_test.go**

Append the stub types below to `apps/api/internal/auth/helper_test.go`. **Merge the existing `import` block** so it contains: `context`, `errors`, `net/http/cookiejar`, `testing`, `golang.org/x/oauth2`, `github.com/PiluVitu/api/internal/auth`. (Don't add a second `import (...)` block — Go won't compile two.)

```go
type stubExchanger struct {
	authURLFmt string                                            // e.g. "https://accounts.example.com/o?state=%s"
	exchangeFn func(ctx context.Context, code string) (*oauth2.Token, error)
}

func (s *stubExchanger) AuthCodeURL(state string) string {
	if s.authURLFmt == "" {
		return "https://accounts.example.com/o?state=" + state
	}
	// only support a single %s formatter to avoid pulling fmt
	return s.authURLFmt + state
}

func (s *stubExchanger) Exchange(ctx context.Context, code string) (*oauth2.Token, error) {
	if s.exchangeFn != nil {
		return s.exchangeFn(ctx, code)
	}
	return nil, errors.New("stubExchanger.Exchange not configured")
}

type stubVerifier struct {
	claims *auth.Claims
	err    error
}

func (s *stubVerifier) Verify(ctx context.Context, idToken, audience string) (*auth.Claims, error) {
	if s.err != nil {
		return nil, s.err
	}
	return s.claims, nil
}
```

(Adjust the existing `helper_test.go` so its imports merge cleanly. If the file already has an `import (...)` block, add to it instead of duplicating.)

- [ ] **Step 6.2: Write failing test for Login**

Create `apps/api/internal/auth/handlers_test.go`:

```go
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
		Store:          store,
		Sessions:       auth.NewSessionManager(store.DB()),
		Config:         auth.Config{ClientID: "cid", WebRedirectURL: "http://web/done"},
		Exchanger:      &stubExchanger{authURLFmt: "https://google/auth?state="},
		Verifier:       &stubVerifier{},
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
```

- [ ] **Step 6.3: Implement Handlers + Login**

Create `apps/api/internal/auth/handlers.go`:

```go
package auth

import (
	"net/http"

	"github.com/alexedwards/scs/v2"

	"github.com/PiluVitu/api/internal/votacao"
)

// HandlersDeps wires up the auth handlers.
type HandlersDeps struct {
	Store     *votacao.Store
	Sessions  *scs.SessionManager
	Config    Config
	Exchanger TokenExchanger
	Verifier  IDTokenVerifier
}

// Handlers is the HTTP-layer entry point for /auth/* routes.
type Handlers struct {
	deps HandlersDeps
}

// NewHandlers constructs a Handlers with the given dependencies.
func NewHandlers(deps HandlersDeps) *Handlers { return &Handlers{deps: deps} }

// Login generates a state, sets it in a cookie, and redirects to Google.
func (h *Handlers) Login(w http.ResponseWriter, r *http.Request) {
	state, err := GenerateState()
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	SetStateCookie(w, state)
	http.Redirect(w, r, h.deps.Exchanger.AuthCodeURL(state), http.StatusFound)
}
```

- [ ] **Step 6.4: Run tests, confirm pass**

Run:
```bash
cd apps/api && go test ./internal/auth/... -v -run Login
```

Expected: `TestLogin_RedirectsToGoogleWithState` passes.

- [ ] **Step 6.5: Commit**

```bash
git add apps/api/internal/auth/handlers.go apps/api/internal/auth/handlers_test.go apps/api/internal/auth/helper_test.go
git commit -m "feat(auth): Login handler — state cookie + redirect to Google"
```

---

## Task 7: CallbackHandler

**Files:**
- Modify: `apps/api/internal/auth/handlers.go` (add `Callback`)
- Modify: `apps/api/internal/auth/handlers_test.go` (add Callback tests)

- [ ] **Step 7.1: Write failing tests**

Append the helpers + tests below to `apps/api/internal/auth/handlers_test.go`. Then **merge the existing `import` block** so it contains: `context`, `errors`, `net/http`, `net/http/httptest`, `strings`, `testing`, `golang.org/x/oauth2`, `github.com/PiluVitu/api/internal/auth`.

```go
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

	// Drive request through the LoadAndSave middleware so scs can write the session cookie.
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
```

Note: the test calls `h.Sessions()` — we need to expose the session manager from `Handlers` so the test middleware wrapping works. Add the accessor in Step 7.2.

- [ ] **Step 7.2: Implement Callback in handlers.go**

Replace `apps/api/internal/auth/handlers.go`:

```go
package auth

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/alexedwards/scs/v2"

	"github.com/PiluVitu/api/internal/votacao"
)

const sessionUserIDKey = "user_id"

// HandlersDeps wires up the auth handlers.
type HandlersDeps struct {
	Store     *votacao.Store
	Sessions  *scs.SessionManager
	Config    Config
	Exchanger TokenExchanger
	Verifier  IDTokenVerifier
}

// Handlers is the HTTP-layer entry point for /auth/* routes.
type Handlers struct {
	deps HandlersDeps
}

// NewHandlers constructs a Handlers with the given dependencies.
func NewHandlers(deps HandlersDeps) *Handlers { return &Handlers{deps: deps} }

// Sessions exposes the scs SessionManager so callers (e.g., router or tests)
// can mount LoadAndSave middleware.
func (h *Handlers) Sessions() *scs.SessionManager { return h.deps.Sessions }

// Login generates a state, sets it in a cookie, and redirects to Google.
func (h *Handlers) Login(w http.ResponseWriter, r *http.Request) {
	state, err := GenerateState()
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	SetStateCookie(w, state)
	http.Redirect(w, r, h.deps.Exchanger.AuthCodeURL(state), http.StatusFound)
}

// Callback validates the OAuth state, exchanges the code, verifies the ID
// token, upserts the user, sets the session, and redirects to WebRedirectURL.
func (h *Handlers) Callback(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("code")
	stateQuery := r.URL.Query().Get("state")
	if code == "" || stateQuery == "" {
		http.Error(w, "missing code or state", http.StatusBadRequest)
		return
	}
	stateCookie, err := ConsumeStateCookie(w, r)
	if err != nil {
		http.Error(w, "missing state cookie", http.StatusBadRequest)
		return
	}
	if stateCookie != stateQuery {
		http.Error(w, "state mismatch", http.StatusBadRequest)
		return
	}

	tok, err := h.deps.Exchanger.Exchange(r.Context(), code)
	if err != nil {
		http.Error(w, "exchange failed", http.StatusBadGateway)
		return
	}
	rawID, _ := tok.Extra("id_token").(string)
	if rawID == "" {
		http.Error(w, "no id_token in oauth response", http.StatusInternalServerError)
		return
	}
	claims, err := h.deps.Verifier.Verify(r.Context(), rawID, h.deps.Config.ClientID)
	if err != nil {
		http.Error(w, "invalid id token", http.StatusUnauthorized)
		return
	}

	user, err := h.deps.Store.UpsertUser(r.Context(), claims.Sub, claims.Email, claims.Name, claims.Picture, h.deps.Config.AdminEmails)
	if err != nil {
		http.Error(w, "upsert user failed", http.StatusInternalServerError)
		return
	}

	h.deps.Sessions.Put(r.Context(), sessionUserIDKey, user.ID)

	http.Redirect(w, r, h.deps.Config.WebRedirectURL, http.StatusFound)
}

// jsonError is a small helper used by future handlers. Kept private.
func jsonError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

// ErrSessionUserMissing is returned when a session does not carry a user_id.
var ErrSessionUserMissing = errors.New("auth: session has no user")
```

- [ ] **Step 7.3: Run tests, confirm pass**

Run:
```bash
cd apps/api && go test ./internal/auth/... -v
```

Expected: all callback tests + previous tests pass.

- [ ] **Step 7.4: Commit**

```bash
git add apps/api/internal/auth/handlers.go apps/api/internal/auth/handlers_test.go apps/api/internal/auth/helper_test.go
git commit -m "feat(auth): Callback handler — state, exchange, verify, upsert, session"
```

---

## Task 8: Me + Logout handlers

**Files:**
- Modify: `apps/api/internal/auth/handlers.go`
- Modify: `apps/api/internal/auth/handlers_test.go`

- [ ] **Step 8.1: Write failing tests**

Append to `apps/api/internal/auth/handlers_test.go`:

```go
func TestMe_NotLoggedIn_Returns401(t *testing.T) {
	h := newCallbackHandlersWith(t, &stubExchanger{}, &stubVerifier{})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/auth/me", nil)
	withSessions(t, h)(http.HandlerFunc(h.Me)).ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d", rec.Code)
	}
}

func TestMe_LoggedIn_ReturnsUser(t *testing.T) {
	// Seed a user via Store, then plant user_id in the session.
	ex := &stubExchanger{
		exchangeFn: func(ctx context.Context, code string) (*oauth2.Token, error) {
			return makeIDTokenWithToken("raw"), nil
		},
	}
	vr := &stubVerifier{claims: &auth.Claims{Sub: "s", Email: "u@x.com", Name: "U"}}
	h := newCallbackHandlersWith(t, ex, vr)

	// Run callback to populate session.
	jar := newJar(t)
	srv := httptest.NewServer(withSessions(t, h)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/cb":
			h.Callback(w, r)
		case "/me":
			h.Me(w, r)
		}
	})))
	defer srv.Close()
	client := &http.Client{Jar: jar, CheckRedirect: func(req *http.Request, via []*http.Request) error { return http.ErrUseLastResponse }}

	// First load /cb to set state cookie via Login pathway — easier: hand-build the cookie.
	cbReq, _ := http.NewRequest(http.MethodGet, srv.URL+"/cb?code=c&state=s", nil)
	cbReq.AddCookie(&http.Cookie{Name: "piluvitu_oauth_state", Value: "s"})
	resp, err := client.Do(cbReq)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()

	// Now /me with the session cookie that came back.
	resp, err = client.Get(srv.URL + "/me")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d", resp.StatusCode)
	}
	body := make([]byte, 1024)
	n, _ := resp.Body.Read(body)
	if !strings.Contains(string(body[:n]), `"email":"u@x.com"`) {
		t.Errorf("body = %s", body[:n])
	}
}

func TestLogout_DestroysSession(t *testing.T) {
	ex := &stubExchanger{
		exchangeFn: func(ctx context.Context, code string) (*oauth2.Token, error) {
			return makeIDTokenWithToken("raw"), nil
		},
	}
	vr := &stubVerifier{claims: &auth.Claims{Sub: "s2", Email: "u2@x.com", Name: "U2"}}
	h := newCallbackHandlersWith(t, ex, vr)

	jar := newJar(t)
	srv := httptest.NewServer(withSessions(t, h)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/cb":
			h.Callback(w, r)
		case "/logout":
			h.Logout(w, r)
		case "/me":
			h.Me(w, r)
		}
	})))
	defer srv.Close()
	client := &http.Client{Jar: jar, CheckRedirect: func(req *http.Request, via []*http.Request) error { return http.ErrUseLastResponse }}

	cbReq, _ := http.NewRequest(http.MethodGet, srv.URL+"/cb?code=c&state=s", nil)
	cbReq.AddCookie(&http.Cookie{Name: "piluvitu_oauth_state", Value: "s"})
	resp, _ := client.Do(cbReq)
	resp.Body.Close()

	logoutReq, _ := http.NewRequest(http.MethodPost, srv.URL+"/logout", nil)
	resp, err := client.Do(logoutReq)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Errorf("status = %d", resp.StatusCode)
	}

	// Subsequent /me should now be 401.
	resp, _ = client.Get(srv.URL + "/me")
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("after logout /me = %d, want 401", resp.StatusCode)
	}
}
```

- [ ] **Step 8.2: Implement Me + Logout**

Append to `apps/api/internal/auth/handlers.go`:

```go
// Me returns the currently logged-in user as JSON, or 401 if no session.
func (h *Handlers) Me(w http.ResponseWriter, r *http.Request) {
	userID := h.deps.Sessions.GetInt64(r.Context(), sessionUserIDKey)
	if userID == 0 {
		jsonError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	user, err := h.deps.Store.GetUserByID(r.Context(), userID)
	if err != nil {
		jsonError(w, http.StatusUnauthorized, "user not found")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"id":       user.ID,
		"email":    user.Email,
		"name":     user.Name,
		"picture":  user.Picture,
		"is_admin": user.IsAdmin,
	})
}

// Logout destroys the current session, if any. Always returns 204.
func (h *Handlers) Logout(w http.ResponseWriter, r *http.Request) {
	if err := h.deps.Sessions.Destroy(r.Context()); err != nil {
		http.Error(w, "logout failed", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
```

- [ ] **Step 8.3: Run tests, confirm pass**

Run:
```bash
cd apps/api && go test ./internal/auth/... -v
```

Expected: all tests pass.

- [ ] **Step 8.4: Commit**

```bash
git add apps/api/internal/auth/handlers.go apps/api/internal/auth/handlers_test.go
git commit -m "feat(auth): Me + Logout handlers"
```

---

## Task 9: RequireAuth + RequireAdmin middleware

**Files:**
- Create: `apps/api/internal/auth/middleware.go`
- Create: `apps/api/internal/auth/middleware_test.go`

- [ ] **Step 9.1: Write failing tests**

Create `apps/api/internal/auth/middleware_test.go`:

```go
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

func (s mwScenario) loggedInClient(t *testing.T, srv *httptest.Server, email string) *http.Client {
	t.Helper()
	// Swap the verifier output for this scenario by reaching into the handlers? No — just use the stub
	// already returning user@x.com and rely on UpsertUser for admin via env. For admin case, mutate
	// store directly:
	_ = email
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
	client := s.loggedInClient(t, srv, "user@x.com")
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
	client := s.loggedInClient(t, srv, "user@x.com")
	resp, _ := client.Get(srv.URL + "/x")
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("status = %d", resp.StatusCode)
	}
}

func TestRequireAdmin_AdminAllowed(t *testing.T) {
	s := newMwScenario(t)
	// Make the user that gets upserted match the admin allowlist by mutating the verifier in place.
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
	client := s.loggedInClient(t, srv, "admin@x.com")
	resp, _ := client.Get(srv.URL + "/x")
	if resp.StatusCode != http.StatusOK {
		t.Errorf("status = %d", resp.StatusCode)
	}
}
```

- [ ] **Step 9.2: Implement middleware.go**

Create `apps/api/internal/auth/middleware.go`:

```go
package auth

import (
	"context"
	"net/http"

	"github.com/alexedwards/scs/v2"

	"github.com/PiluVitu/api/internal/votacao"
)

type ctxKey int

const userCtxKey ctxKey = 0

// UserFromContext returns the authenticated user attached to r.Context by
// RequireAuth or RequireAdmin, or nil if there is none.
func UserFromContext(ctx context.Context) *votacao.User {
	if v, ok := ctx.Value(userCtxKey).(*votacao.User); ok {
		return v
	}
	return nil
}

// RequireAuth loads the user_id from the session, fetches the user, and
// attaches it to the request context. Responds 401 if missing or invalid.
func RequireAuth(sm *scs.SessionManager, store *votacao.Store) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID := sm.GetInt64(r.Context(), sessionUserIDKey)
			if userID == 0 {
				jsonError(w, http.StatusUnauthorized, "not authenticated")
				return
			}
			user, err := store.GetUserByID(r.Context(), userID)
			if err != nil {
				jsonError(w, http.StatusUnauthorized, "user not found")
				return
			}
			ctx := context.WithValue(r.Context(), userCtxKey, user)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// RequireAdmin first applies RequireAuth, then rejects non-admins with 403.
func RequireAdmin(sm *scs.SessionManager, store *votacao.Store) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return RequireAuth(sm, store)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user := UserFromContext(r.Context())
			if user == nil || !user.IsAdmin {
				jsonError(w, http.StatusForbidden, "admin only")
				return
			}
			next.ServeHTTP(w, r)
		}))
	}
}
```

- [ ] **Step 9.3: Run tests, confirm pass**

Run:
```bash
cd apps/api && go test ./internal/auth/... -v
```

Expected: all middleware tests pass.

- [ ] **Step 9.4: Commit**

```bash
git add apps/api/internal/auth/middleware.go apps/api/internal/auth/middleware_test.go
git commit -m "feat(auth): RequireAuth + RequireAdmin middleware"
```

---

## Task 10: Wire into router + main.go (CORS AllowCredentials, /auth routes)

**Files:**
- Modify: `apps/api/internal/router/router.go`
- Modify: `apps/api/internal/router/router_test.go`
- Modify: `apps/api/cmd/api/main.go`

- [ ] **Step 10.1: Update router.New() to accept auth Deps**

Replace `apps/api/internal/router/router.go`:

```go
package router

import (
	"context"
	"database/sql"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/alexedwards/scs/v2"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"github.com/PiluVitu/api/internal/auth"
	"github.com/PiluVitu/api/internal/handlers"
)

// Deps holds external dependencies injected into the router.
type Deps struct {
	DB           *sql.DB
	Sessions     *scs.SessionManager
	AuthHandlers *auth.Handlers
}

var defaultAllowedOrigins = []string{
	"http://localhost:3333",
	"https://piluvitu.com.br",
}

func New(deps Deps) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(corsOptions()))

	if deps.Sessions != nil {
		r.Use(deps.Sessions.LoadAndSave)
	}

	r.Get("/health", healthHandler(deps.DB))

	if deps.AuthHandlers != nil {
		r.Route("/auth", func(r chi.Router) {
			r.Get("/google/login", deps.AuthHandlers.Login)
			r.Get("/google/callback", deps.AuthHandlers.Callback)
			r.Get("/me", deps.AuthHandlers.Me)
			r.Post("/logout", deps.AuthHandlers.Logout)
		})
	}

	r.Route("/tools", func(r chi.Router) {
		r.Post("/cpf/validate", handlers.ValidateCPF)
		r.Get("/cpf/generate", handlers.GenerateCPF)
		r.Post("/cnpj/validate", handlers.ValidateCNPJ)
		r.Get("/cnpj/generate", handlers.GenerateCNPJ)
		r.Post("/base64/encode", handlers.EncodeBase64)
		r.Post("/base64/decode", handlers.DecodeBase64)
		r.Post("/jwt/decode", handlers.DecodeJWT)
		r.Post("/json/format", handlers.FormatJSON)
		r.Post("/json/minify", handlers.MinifyJSON)
		r.Post("/json/validate", handlers.ValidateJSON)
		r.Get("/uuid", handlers.GenerateUUID)
		r.Post("/qr/encode", handlers.EncodeQR)
		r.Post("/qr/decode", handlers.DecodeQR)
	})

	return r
}

func healthHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if db != nil {
			ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
			defer cancel()
			if err := db.PingContext(ctx); err != nil {
				w.WriteHeader(http.StatusServiceUnavailable)
				_, _ = w.Write([]byte(`{"ok":false,"db":"down"}`))
				return
			}
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"ok":true,"db":"up"}`))
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}
}

func corsOptions() cors.Options {
	return cors.Options{
		AllowedOrigins:   allowedOrigins(),
		AllowedMethods:   []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}
}

func allowedOrigins() []string {
	raw := strings.TrimSpace(os.Getenv("CORS_ALLOWED_ORIGINS"))
	if raw == "" {
		return defaultAllowedOrigins
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if v := strings.TrimSpace(p); v != "" {
			out = append(out, v)
		}
	}
	if len(out) == 0 {
		return defaultAllowedOrigins
	}
	return out
}
```

- [ ] **Step 10.2: Add router test for /auth/me unauthenticated**

Append to `apps/api/internal/router/router_test.go`:

```go
func TestAuthMe_Unauthenticated_Returns401(t *testing.T) {
	store, err := votacao.NewStore(filepath.Join(t.TempDir(), "x.db"))
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })

	sm := auth.NewSessionManager(store.DB())
	h := auth.NewHandlers(auth.HandlersDeps{
		Store:     store,
		Sessions:  sm,
		Config:    auth.Config{ClientID: "cid", WebRedirectURL: "http://web"},
		Exchanger: &fakeExchanger{},
		Verifier:  &fakeVerifier{},
	})

	srv := httptest.NewServer(New(Deps{DB: store.DB(), Sessions: sm, AuthHandlers: h}))
	defer srv.Close()
	resp, err := http.Get(srv.URL + "/auth/me")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d", resp.StatusCode)
	}
}

type fakeExchanger struct{}

func (fakeExchanger) AuthCodeURL(state string) string {
	return "https://example/o?state=" + state
}
func (fakeExchanger) Exchange(ctx context.Context, code string) (*oauth2.Token, error) {
	return nil, nil
}

type fakeVerifier struct{}

func (fakeVerifier) Verify(ctx context.Context, idToken, audience string) (*auth.Claims, error) {
	return nil, nil
}
```

Update the existing import block at the top of `router_test.go` to add:

```go
"context"

"github.com/PiluVitu/api/internal/auth"
"golang.org/x/oauth2"
```

(Keep `votacao`, `filepath`, `io`, `strings`, `net/http`, `net/http/httptest`, `testing` already present.)

- [ ] **Step 10.3: Update main.go**

Replace `apps/api/cmd/api/main.go`:

```go
package main

import (
	"fmt"
	"net/http"
	"os"
	"strings"

	"github.com/PiluVitu/api/internal/auth"
	"github.com/PiluVitu/api/internal/router"
	"github.com/PiluVitu/api/internal/votacao"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	dbPath := os.Getenv("SQLITE_PATH")
	if dbPath == "" {
		dbPath = "/data/votacao.db"
	}

	store, err := votacao.NewStore(dbPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "db: %v\n", err)
		os.Exit(1)
	}
	defer store.Close()

	cfg, err := auth.ConfigFromEnv()
	if err != nil {
		fmt.Fprintf(os.Stderr, "auth config: %v\n", err)
		os.Exit(1)
	}
	sm := auth.NewSessionManager(store.DB())
	if strings.EqualFold(os.Getenv("SESSION_COOKIE_SECURE"), "true") {
		sm.Cookie.Secure = true
	}
	authHandlers := auth.NewHandlers(auth.HandlersDeps{
		Store:     store,
		Sessions:  sm,
		Config:    cfg,
		Exchanger: auth.NewGoogleTokenExchanger(cfg),
		Verifier:  auth.NewGoogleIDTokenVerifier(),
	})

	handler := router.New(router.Deps{
		DB:           store.DB(),
		Sessions:     sm,
		AuthHandlers: authHandlers,
	})

	addr := ":" + port
	fmt.Printf("API listening on %s (db=%s)\n", addr, dbPath)
	if err := http.ListenAndServe(addr, handler); err != nil {
		fmt.Fprintf(os.Stderr, "server error: %v\n", err)
		os.Exit(1)
	}
}
```

- [ ] **Step 10.4: Verify build + tests**

Run:
```bash
cd apps/api && go vet ./... && go test ./... && go build ./...
```

Expected: all green.

- [ ] **Step 10.5: Commit**

```bash
git add apps/api/internal/router/router.go apps/api/internal/router/router_test.go apps/api/cmd/api/main.go
git commit -m "feat(api): mount /auth/* routes + scs LoadAndSave + CORS AllowCredentials"
```

---

## Task 11: env.example + docker-compose env passthrough

**Files:**
- Create: `apps/api/.env.example`
- Modify: `infra/docker-compose.yml`

- [ ] **Step 11.1: Create apps/api/.env.example**

Create `apps/api/.env.example`:

```dotenv
# Listen address (default 8080).
PORT=8080

# SQLite database file path inside the container.
SQLITE_PATH=/data/votacao.db

# CORS — comma-separated origins. Must match the Vercel/local web origin
# exactly (no trailing slash). With AllowCredentials=true, "*" is rejected.
CORS_ALLOWED_ORIGINS=http://localhost:3333,https://piluvitu.com.br

# Google OAuth — from console.cloud.google.com → APIs & Services → Credentials
# (OAuth client ID, type=Web application).
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URL=http://localhost:8080/auth/google/callback

# Where the browser is sent after a successful login.
WEB_REDIRECT_URL=http://localhost:3333/votacao

# CSV of admin emails (case-insensitive match against the Google account email).
ADMIN_EMAILS=paulo.tspi@gmail.com

# Promote session cookie to Secure (HTTPS only). Default off for local dev.
SESSION_COOKIE_SECURE=false
```

- [ ] **Step 11.2: Pass new env vars through docker-compose**

Replace the `api:` service block in `infra/docker-compose.yml`. Keep the rest of the file unchanged:

```yaml
services:
  api:
    build:
      context: ..
      dockerfile: apps/api/Dockerfile
    ports:
      - '8080:8080'
    environment:
      PORT: '8080'
      CORS_ALLOWED_ORIGINS: ${CORS_ALLOWED_ORIGINS:-http://localhost:3333,https://piluvitu.com.br}
      SQLITE_PATH: '/data/votacao.db'
      GOOGLE_OAUTH_CLIENT_ID: ${GOOGLE_OAUTH_CLIENT_ID:?GOOGLE_OAUTH_CLIENT_ID não definido — copie apps/api/.env.example}
      GOOGLE_OAUTH_CLIENT_SECRET: ${GOOGLE_OAUTH_CLIENT_SECRET:?GOOGLE_OAUTH_CLIENT_SECRET não definido}
      GOOGLE_OAUTH_REDIRECT_URL: ${GOOGLE_OAUTH_REDIRECT_URL:-http://localhost:8080/auth/google/callback}
      WEB_REDIRECT_URL: ${WEB_REDIRECT_URL:-http://localhost:3333/votacao}
      ADMIN_EMAILS: ${ADMIN_EMAILS:-}
      SESSION_COOKIE_SECURE: ${SESSION_COOKIE_SECURE:-false}
    volumes:
      - api-data:/data
    restart: unless-stopped
```

(The `web:`, `cloudflared:`, and `volumes:` sections are unchanged.)

- [ ] **Step 11.3: Smoke test locally without Docker**

> Não tente fazer login Google sem credenciais reais. Esse smoke valida só que o binário inicia e que `/auth/me` responde 401 sem sessão.

Run (terminal 1):
```bash
mkdir -p /tmp/votacao-dev
GOOGLE_OAUTH_CLIENT_ID=stub \
GOOGLE_OAUTH_CLIENT_SECRET=stub \
GOOGLE_OAUTH_REDIRECT_URL=http://localhost:8080/auth/google/callback \
WEB_REDIRECT_URL=http://localhost:3333/votacao \
ADMIN_EMAILS=paulo.tspi@gmail.com \
SQLITE_PATH=/tmp/votacao-dev/votacao.db \
make dev-api
```

Run (terminal 2):
```bash
curl -s -w "\n%{http_code}\n" http://localhost:8080/auth/me
# Expected body: {"error":"not authenticated"}; status: 401
```

Stop the server (Ctrl+C in terminal 1).

- [ ] **Step 11.4: Commit**

```bash
git add apps/api/.env.example infra/docker-compose.yml
git commit -m "feat(infra): wire OAuth env vars + add apps/api/.env.example"
```

---

## Task 12: CLAUDE.md docs + final sweep

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 12.1: Update CLAUDE.md**

Find the **Votação de Filmes** section and update the **Status** line plus add the auth detail:

```markdown
- **Status:** em construção (Fase 2 concluída: Auth Google via OAuth + scs sessions; Fase 1 entregou DB + store + volume Docker).
```

Append a new sub-section right after the existing Votação bullets and before the "Tools dashboard" section:

```markdown
#### Auth Google (`internal/auth`)

- **Fluxo:** `GET /auth/google/login` gera state CSRF (cookie HttpOnly Lax, 10 min) e redireciona pro Google. `GET /auth/google/callback` valida state, troca code, valida ID token via `google.golang.org/api/idtoken`, dá upsert no `users` aplicando `ADMIN_EMAILS` (case-insensitive), grava `user_id` na sessão scs, redireciona pra `WEB_REDIRECT_URL`. `GET /auth/me` retorna o user logado (JSON) ou 401. `POST /auth/logout` destrói a sessão (204).
- **Sessões:** `alexedwards/scs/v2` com `sqlite3store` — cria a tabela `sessions` automaticamente no mesmo SQLite que a feature votação. Cookie `piluvitu_session`, HttpOnly, SameSite=Lax, lifetime 7 dias. `SESSION_COOKIE_SECURE=true` em produção (Cloud Run/Tunnel).
- **Middleware:** `auth.RequireAuth(sm, store)` e `auth.RequireAdmin(sm, store)` — anexam `*votacao.User` em `r.Context()` (`auth.UserFromContext`). Não-logado → 401. Não-admin → 403.
- **Testabilidade:** `TokenExchanger` + `IDTokenVerifier` são interfaces. Em produção: `auth.NewGoogleTokenExchanger(cfg)` e `auth.NewGoogleIDTokenVerifier()`. Em testes: stubs em `internal/auth/helper_test.go`.
- **CORS:** `AllowCredentials: true` (necessário pro cookie de sessão atravessar fetch do Next.js). Origens explícitas via `CORS_ALLOWED_ORIGINS`, sem `*`.
```

Update the env vars list to add:

```markdown
- `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URL` — OAuth Client ID type "Web application" do Google Cloud Console. Redirect URL precisa estar registrada no console e bater 1:1 com a env.
- `WEB_REDIRECT_URL` — pra onde o browser vai depois do callback bem-sucedido (default `http://localhost:3333/votacao`).
- `ADMIN_EMAILS` — CSV de e-mails admin. Comparação case-insensitive contra o e-mail do ID token.
- `SESSION_COOKIE_SECURE` — `true` em produção (HTTPS), `false` em dev local (HTTP).
```

- [ ] **Step 12.2: Final lint + test + build sweep**

Run:
```bash
cd apps/api && go vet ./... && go test ./... && go build ./...
```

Expected: all green.

- [ ] **Step 12.3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): document /auth/* endpoints + scs session setup"
```

---

## Phase 2 Exit Criteria

- [ ] `auth.ConfigFromEnv()` fails fast when any of the 4 required env vars is missing
- [ ] `GET /auth/google/login` returns 302 with `Location` to `accounts.google.com/...?state=...` and sets a `piluvitu_oauth_state` cookie
- [ ] `GET /auth/google/callback` rejects state mismatch (400) and missing state cookie (400)
- [ ] `GET /auth/me` returns 401 when no session
- [ ] `POST /auth/logout` destroys the scs session (subsequent `/auth/me` → 401)
- [ ] `auth.RequireAuth` and `auth.RequireAdmin` middleware work as a chain and attach `*votacao.User` to context
- [ ] `scs` `sessions` table is created automatically inside `/data/votacao.db` on first request
- [ ] `go vet ./...` clean
- [ ] `go test ./...` 100% pass (Phase 1 tests + ≥12 new Phase 2 tests)
- [ ] CLAUDE.md updated with `/auth/*` documentation

---

## Notes for the implementer

- **Don't add a `sessions` table to `schema.sql`.** `sqlite3store.New(db)` creates it on first use. Mixing it in would break idempotency.
- **`idtoken.Validate` vs JWKS by hand:** `google.golang.org/api/idtoken` caches Google's public keys with the right refresh semantics. Don't roll a manual JWKS fetcher.
- **`oauth2.Token.Extra("id_token")` returns `any`.** Always type-assert to string and check for empty — Google's spec guarantees it for `scope=openid`, but defense-in-depth.
- **CORS `AllowCredentials: true` is incompatible with `AllowedOrigins: ["*"]`.** Both go-chi/cors and the browser will reject. Keep origins explicit.
- **`SameSite=Lax` is correct for the OAuth callback** — Google performs a top-level navigation (302) back to our callback, which sends Lax cookies. `Strict` would break it.
- **scs middleware writes the cookie on every modified session** — applying `LoadAndSave` globally is cheap (skips writes when nothing changed) and avoids surprises when adding new authenticated routes in later phases.
- **Don't add an integration test that hits Google.** All paths are covered via stubs; the real Google round-trip is validated by manual smoke (Phase 2 closure: hit `/auth/google/login` in a browser and confirm full sign-in).
- **For the production switch-over (Cloud Run):** set `SESSION_COOKIE_SECURE=true` and update `GOOGLE_OAUTH_REDIRECT_URL` to the Cloud Run URL — and add the same URL to the OAuth client's authorized redirect list in the Google Cloud Console.
- **Frequent commits:** 12 commits in this phase. Each task is independently mergeable.
