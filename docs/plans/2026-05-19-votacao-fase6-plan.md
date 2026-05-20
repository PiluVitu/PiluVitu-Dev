# Votação de Filmes — Fase 6: Drive Backup + Cron

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Implementar backup automático do SQLite no Google Drive (cron diário + on-demand via admin) com VACUUM INTO + rotation. Disparar backup async ao fechar sessão (trigger `session_close`).

**Architecture:**
- `internal/gdrive` — wrapper sobre `google.golang.org/api/drive/v3`. `Uploader` interface pra desacoplar testes. Métodos: `Upload(ctx, fileName, body)` (multipart), `Rotate(ctx, folderID, keep)` (lista por createdTime desc, deleta os antigos).
- `internal/backup` — `Runner.Run(ctx, trigger)` faz `VACUUM INTO` num arquivo temporário, sobe pelo `Uploader`, insere row em `backups`, chama rotation. Erros são logados mas o startup nunca aborta.
- `cron.Start(ctx, spec, fn)` usa `github.com/robfig/cron/v3` numa goroutine. Em testes, o cron não é iniciado — só testamos a função `parseSpec`.
- Handlers `/admin/backup` (POST) e `/admin/backups` (GET) gerenciam runs on-demand e listagem do histórico.
- `CloseSession` no `handlers/votacao` chama `Runner.Run` async via goroutine no contexto do server (não bloqueia a resposta).

**Tech Stack:** `google.golang.org/api/drive/v3`, `github.com/robfig/cron/v3`.

**Pré-requisitos:** Fases 1-5 commitadas. Branch `feat/votacao-fase6` partindo de `feat/votacao-fase5`.

---

## File Structure

```
apps/api/internal/gdrive/
  client.go              # Client + NewClient + NewClientWithService + Uploader interface
  upload.go              # Upload + Rotate
  upload_test.go         # httptest fixtures
apps/api/internal/backup/
  runner.go              # Runner struct + Run(ctx, trigger)
  runner_test.go         # SQLite temp + fake uploader
  cron.go                # Start(ctx, spec, fn) + parseSpec
  cron_test.go           # parseSpec edge cases
apps/api/internal/handlers/admin/
  backup.go              # POST /admin/backup, GET /admin/backups
  backup_test.go
  deps.go                # Deps + Handlers struct
apps/api/internal/handlers/votacao/
  sessions.go            # MODIFIED: CloseSession fires async backup
  votes.go               # MODIFIED: CloseSession (same file) — actually votes.go has it; check
apps/api/internal/router/router.go    # MODIFIED: mount /admin/* under RequireAdmin
apps/api/cmd/api/main.go              # MODIFIED: build gdrive + backup.Runner; cron start
apps/api/.env.example                 # + GDRIVE_BACKUP_FOLDER_ID, GDRIVE_BACKUP_KEEP, BACKUP_CRON
infra/docker-compose.yml              # MODIFIED: env passthrough
CLAUDE.md                             # MODIFIED: document backup/cron
```

---

## Task 1: gdrive.Client + Upload + Rotate (with httptest)

**Files:**
- Create: `apps/api/internal/gdrive/client.go`
- Create: `apps/api/internal/gdrive/upload.go`
- Create: `apps/api/internal/gdrive/upload_test.go`

### 1.1 Implement client.go

```go
package gdrive

import (
	"context"
	"fmt"
	"io"

	"google.golang.org/api/drive/v3"
	"google.golang.org/api/option"
)

// Uploader is the surface used by the backup runner. Defined here so tests
// can stub it without depending on drive/v3.
type Uploader interface {
	Upload(ctx context.Context, folderID, name string, body io.Reader) (fileID string, sizeBytes int64, err error)
	Rotate(ctx context.Context, folderID string, keep int) error
}

// Client wraps a *drive.Service.
type Client struct {
	svc *drive.Service
}

// NewClient builds a Drive client via Application Default Credentials.
func NewClient(ctx context.Context) (*Client, error) {
	svc, err := drive.NewService(ctx, option.WithScopes(drive.DriveFileScope))
	if err != nil {
		return nil, fmt.Errorf("gdrive: build service: %w", err)
	}
	return &Client{svc: svc}, nil
}

// NewClientWithService is the test seam.
func NewClientWithService(svc *drive.Service) *Client { return &Client{svc: svc} }
```

### 1.2 Implement upload.go

```go
package gdrive

import (
	"context"
	"fmt"
	"io"
	"sort"

	"google.golang.org/api/drive/v3"
)

// Upload creates a new file in the given folder. Returns the new fileID and
// reported size.
func (c *Client) Upload(ctx context.Context, folderID, name string, body io.Reader) (string, int64, error) {
	f := &drive.File{Name: name, Parents: []string{folderID}}
	out, err := c.svc.Files.Create(f).
		Context(ctx).
		Fields("id, size").
		Media(body).
		Do()
	if err != nil {
		return "", 0, fmt.Errorf("gdrive: upload: %w", err)
	}
	return out.Id, out.Size, nil
}

// Rotate keeps the `keep` most recent files in the folder and deletes the rest.
func (c *Client) Rotate(ctx context.Context, folderID string, keep int) error {
	if keep <= 0 {
		return nil
	}
	query := fmt.Sprintf("'%s' in parents and trashed=false", folderID)
	list, err := c.svc.Files.List().
		Q(query).
		Fields("files(id, createdTime)").
		PageSize(1000).
		Context(ctx).
		Do()
	if err != nil {
		return fmt.Errorf("gdrive: list for rotate: %w", err)
	}
	files := list.Files
	if len(files) <= keep {
		return nil
	}
	sort.Slice(files, func(i, j int) bool { return files[i].CreatedTime > files[j].CreatedTime })
	for _, f := range files[keep:] {
		if err := c.svc.Files.Delete(f.Id).Context(ctx).Do(); err != nil {
			return fmt.Errorf("gdrive: delete %s: %w", f.Id, err)
		}
	}
	return nil
}
```

### 1.3 Tests

Create `apps/api/internal/gdrive/upload_test.go`:

```go
package gdrive_test

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"google.golang.org/api/drive/v3"
	"google.golang.org/api/option"

	"github.com/PiluVitu/api/internal/gdrive"
)

func newFakeDrive(t *testing.T, handler http.HandlerFunc) *gdrive.Client {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	svc, err := drive.NewService(context.Background(),
		option.WithEndpoint(srv.URL),
		option.WithoutAuthentication(),
	)
	if err != nil {
		t.Fatalf("drive.NewService: %v", err)
	}
	return gdrive.NewClientWithService(svc)
}

func TestUpload_Happy(t *testing.T) {
	var got int32
	c := newFakeDrive(t, func(w http.ResponseWriter, r *http.Request) {
		// Multipart uploads go through /upload/drive/v3/files
		if !strings.Contains(r.URL.Path, "/files") {
			t.Errorf("path = %q", r.URL.Path)
		}
		atomic.AddInt32(&got, 1)
		_, _ = w.Write([]byte(`{"id":"abc","size":"42"}`))
	})
	id, size, err := c.Upload(context.Background(), "folder1", "snap.db", strings.NewReader("hello"))
	if err != nil {
		t.Fatal(err)
	}
	if id != "abc" {
		t.Errorf("id = %q", id)
	}
	if size != 42 {
		t.Errorf("size = %d", size)
	}
	if atomic.LoadInt32(&got) == 0 {
		t.Error("server never reached")
	}
}

func TestRotate_NoOpWhenUnderKeep(t *testing.T) {
	c := newFakeDrive(t, func(w http.ResponseWriter, r *http.Request) {
		// Single file present, keep=5 → no delete.
		_, _ = w.Write([]byte(`{"files":[{"id":"f1","createdTime":"2025-01-01T00:00:00Z"}]}`))
	})
	if err := c.Rotate(context.Background(), "folder1", 5); err != nil {
		t.Errorf("expected no-op, got %v", err)
	}
}

func TestRotate_DeletesOldest(t *testing.T) {
	var deletedIDs []string
	c := newFakeDrive(t, func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet:
			// 4 files; keep=2 → delete the 2 oldest.
			_, _ = w.Write([]byte(`{"files":[
				{"id":"new1","createdTime":"2025-05-01T00:00:00Z"},
				{"id":"old1","createdTime":"2025-01-01T00:00:00Z"},
				{"id":"new2","createdTime":"2025-04-01T00:00:00Z"},
				{"id":"old2","createdTime":"2025-02-01T00:00:00Z"}
			]}`))
		case r.Method == http.MethodDelete:
			parts := strings.Split(r.URL.Path, "/")
			id := parts[len(parts)-1]
			deletedIDs = append(deletedIDs, id)
			w.WriteHeader(http.StatusNoContent)
		default:
			http.Error(w, "unexpected method", 500)
		}
	})
	if err := c.Rotate(context.Background(), "folder1", 2); err != nil {
		t.Fatal(err)
	}
	if len(deletedIDs) != 2 {
		t.Fatalf("deleted = %v", deletedIDs)
	}
	for _, id := range deletedIDs {
		if id != "old1" && id != "old2" {
			t.Errorf("unexpected deletion: %q", id)
		}
	}
}

func TestRotate_KeepZeroIsNoOp(t *testing.T) {
	c := newFakeDrive(t, func(w http.ResponseWriter, r *http.Request) {
		t.Error("rotate keep=0 should not hit the server")
	})
	if err := c.Rotate(context.Background(), "folder1", 0); err != nil {
		t.Errorf("got %v", err)
	}
}

// silence unused import
var _ io.Reader = nil
```

### 1.4 Run + commit

```bash
cd apps/api && go test ./internal/gdrive/... -v
git add apps/api/internal/gdrive/
git commit -m "feat(gdrive): Client.Upload + Rotate with httptest fixtures"
```

---

## Task 2: backup.Runner + tests

**Files:**
- Create: `apps/api/internal/backup/runner.go`
- Create: `apps/api/internal/backup/runner_test.go`

### 2.1 Implement runner.go

```go
package backup

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/PiluVitu/api/internal/gdrive"
	"github.com/PiluVitu/api/internal/votacao"
)

// Runner ties the SQLite store, the Drive uploader, and the config knobs
// (folder ID, retention count) together.
type Runner struct {
	Store    *votacao.Store
	Uploader gdrive.Uploader
	FolderID string
	Keep     int
}

// Run does VACUUM INTO + Upload + INSERT backups + Rotate. The trigger label
// is one of "cron", "manual", "session_close".
func (r *Runner) Run(ctx context.Context, trigger string) error {
	if r.Uploader == nil || r.Store == nil || r.FolderID == "" {
		return fmt.Errorf("backup: runner not fully configured")
	}
	snapPath := filepath.Join(os.TempDir(), fmt.Sprintf("votacao-snapshot-%d.db", time.Now().UnixNano()))
	defer os.Remove(snapPath)

	if _, err := r.Store.DB().ExecContext(ctx, "VACUUM INTO ?", snapPath); err != nil {
		return fmt.Errorf("backup: vacuum into: %w", err)
	}

	f, err := os.Open(snapPath)
	if err != nil {
		return fmt.Errorf("backup: open snapshot: %w", err)
	}
	defer f.Close()

	name := fmt.Sprintf("votacao-%s-%s.db", time.Now().UTC().Format("2006-01-02-150405"), trigger)
	fileID, size, err := r.Uploader.Upload(ctx, r.FolderID, name, f)
	if err != nil {
		return fmt.Errorf("backup: upload: %w", err)
	}

	if _, err := r.Store.InsertBackup(ctx, fileID, name, size, trigger); err != nil {
		return fmt.Errorf("backup: insert row: %w", err)
	}

	if r.Keep > 0 {
		if err := r.Uploader.Rotate(ctx, r.FolderID, r.Keep); err != nil {
			return fmt.Errorf("backup: rotate: %w", err)
		}
	}
	return nil
}
```

### 2.2 Tests

Create `apps/api/internal/backup/runner_test.go`:

```go
package backup_test

import (
	"context"
	"errors"
	"io"
	"path/filepath"
	"sync/atomic"
	"testing"

	"github.com/PiluVitu/api/internal/backup"
	"github.com/PiluVitu/api/internal/votacao"
)

type fakeUploader struct {
	uploadCalls int32
	rotateCalls int32
	wantFolder  string
	uploadErr   error
	rotateErr   error
	keepSeen    int
}

func (f *fakeUploader) Upload(ctx context.Context, folder, name string, body io.Reader) (string, int64, error) {
	atomic.AddInt32(&f.uploadCalls, 1)
	if f.wantFolder != "" && folder != f.wantFolder {
		return "", 0, errors.New("wrong folder")
	}
	if f.uploadErr != nil {
		return "", 0, f.uploadErr
	}
	// Drain body to avoid reader leak.
	_, _ = io.Copy(io.Discard, body)
	return "fake-id", 1234, nil
}

func (f *fakeUploader) Rotate(ctx context.Context, folder string, keep int) error {
	atomic.AddInt32(&f.rotateCalls, 1)
	f.keepSeen = keep
	return f.rotateErr
}

func newStore(t *testing.T) *votacao.Store {
	t.Helper()
	s, err := votacao.NewStore(filepath.Join(t.TempDir(), "x.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.Close() })
	return s
}

func TestRun_HappyPath(t *testing.T) {
	store := newStore(t)
	u := &fakeUploader{wantFolder: "fid"}
	r := &backup.Runner{Store: store, Uploader: u, FolderID: "fid", Keep: 5}
	if err := r.Run(context.Background(), "manual"); err != nil {
		t.Fatal(err)
	}
	if atomic.LoadInt32(&u.uploadCalls) != 1 {
		t.Errorf("upload calls = %d", u.uploadCalls)
	}
	if atomic.LoadInt32(&u.rotateCalls) != 1 {
		t.Errorf("rotate calls = %d", u.rotateCalls)
	}
	if u.keepSeen != 5 {
		t.Errorf("keep = %d", u.keepSeen)
	}
	rows, err := store.ListBackups(context.Background(), 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || rows[0].TriggerType != "manual" || rows[0].SizeBytes != 1234 {
		t.Errorf("backups row = %+v", rows)
	}
}

func TestRun_NoRotateWhenKeepZero(t *testing.T) {
	store := newStore(t)
	u := &fakeUploader{}
	r := &backup.Runner{Store: store, Uploader: u, FolderID: "fid", Keep: 0}
	if err := r.Run(context.Background(), "cron"); err != nil {
		t.Fatal(err)
	}
	if u.rotateCalls != 0 {
		t.Errorf("rotate should not be called when keep=0")
	}
}

func TestRun_MissingDeps(t *testing.T) {
	r := &backup.Runner{}
	if err := r.Run(context.Background(), "manual"); err == nil {
		t.Error("expected error on missing deps")
	}
}

func TestRun_UploadError(t *testing.T) {
	store := newStore(t)
	u := &fakeUploader{uploadErr: errors.New("net down")}
	r := &backup.Runner{Store: store, Uploader: u, FolderID: "fid", Keep: 5}
	if err := r.Run(context.Background(), "cron"); err == nil {
		t.Error("expected upload error to propagate")
	}
}
```

### 2.3 Run + commit

```bash
cd apps/api && go test ./internal/backup/... -v
git add apps/api/internal/backup/runner.go apps/api/internal/backup/runner_test.go
git commit -m "feat(backup): Runner VACUUM INTO + Upload + INSERT + Rotate"
```

---

## Task 3: cron.Start

**Files:**
- Create: `apps/api/internal/backup/cron.go`
- Create: `apps/api/internal/backup/cron_test.go`

### 3.1 Implement cron.go

```go
package backup

import (
	"context"
	"fmt"

	"github.com/robfig/cron/v3"
)

// Start schedules fn to run on the given cron spec, returning the cron object
// (for stopping in tests / shutdown). spec uses standard 5-field syntax.
//
// fn is invoked in its own goroutine inside the cron scheduler; long-running
// runs do not block subsequent ticks (cron starts a fresh goroutine each fire).
func Start(ctx context.Context, spec string, fn func(context.Context)) (*cron.Cron, error) {
	if _, err := cron.ParseStandard(spec); err != nil {
		return nil, fmt.Errorf("backup: parse spec %q: %w", spec, err)
	}
	c := cron.New()
	_, err := c.AddFunc(spec, func() { fn(ctx) })
	if err != nil {
		return nil, fmt.Errorf("backup: add cron: %w", err)
	}
	c.Start()
	return c, nil
}
```

### 3.2 Tests

```go
package backup_test

import (
	"context"
	"testing"

	"github.com/PiluVitu/api/internal/backup"
)

func TestStart_ParseError(t *testing.T) {
	_, err := backup.Start(context.Background(), "not a cron", func(context.Context) {})
	if err == nil {
		t.Error("expected parse error")
	}
}

func TestStart_ValidSpecReturnsCron(t *testing.T) {
	c, err := backup.Start(context.Background(), "0 3 * * *", func(context.Context) {})
	if err != nil {
		t.Fatal(err)
	}
	defer c.Stop()
	if len(c.Entries()) != 1 {
		t.Errorf("entries = %d", len(c.Entries()))
	}
}
```

### 3.3 Run + commit

```bash
cd apps/api && go test ./internal/backup/... -v
git add apps/api/internal/backup/cron.go apps/api/internal/backup/cron_test.go
git commit -m "feat(backup): cron.Start using robfig/cron/v3"
```

---

## Task 4: handlers/admin

**Files:**
- Create: `apps/api/internal/handlers/admin/deps.go`
- Create: `apps/api/internal/handlers/admin/backup.go`
- Create: `apps/api/internal/handlers/admin/backup_test.go`

### 4.1 Implement deps.go

```go
package admin

import (
	"context"

	"github.com/PiluVitu/api/internal/votacao"
)

// BackupRunner is the surface used by the admin handlers.
type BackupRunner interface {
	Run(ctx context.Context, trigger string) error
}

// Deps wires the admin handlers.
type Deps struct {
	Store  *votacao.Store
	Runner BackupRunner
}

// Handlers exposes /admin/* HTTP handlers.
type Handlers struct {
	deps Deps
}

// NewHandlers constructs Handlers.
func NewHandlers(deps Deps) *Handlers { return &Handlers{deps: deps} }
```

### 4.2 Implement backup.go

```go
package admin

import (
	"encoding/json"
	"net/http"
)

// CreateBackup (admin) triggers a backup with trigger="manual". 200 ok or 500 on error.
func (h *Handlers) CreateBackup(w http.ResponseWriter, r *http.Request) {
	if h.deps.Runner == nil {
		jsonError(w, http.StatusServiceUnavailable, "backup runner disabled")
		return
	}
	if err := h.deps.Runner.Run(r.Context(), "manual"); err != nil {
		jsonError(w, http.StatusInternalServerError, "backup failed")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ListBackups returns the recent backups stored in SQLite (newest first).
func (h *Handlers) ListBackups(w http.ResponseWriter, r *http.Request) {
	rows, err := h.deps.Store.ListBackups(r.Context(), 50)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, "list failed")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"backups": rows})
}

func jsonError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
```

### 4.3 Tests

```go
package admin_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/PiluVitu/api/internal/handlers/admin"
	"github.com/PiluVitu/api/internal/votacao"
)

type stubRunner struct {
	err     error
	calls   int
	trigger string
}

func (s *stubRunner) Run(ctx context.Context, trigger string) error {
	s.calls++
	s.trigger = trigger
	return s.err
}

func newStore(t *testing.T) *votacao.Store {
	t.Helper()
	s, _ := votacao.NewStore(filepath.Join(t.TempDir(), "x.db"))
	t.Cleanup(func() { _ = s.Close() })
	return s
}

func TestCreateBackup_HappyPath(t *testing.T) {
	store := newStore(t)
	runner := &stubRunner{}
	h := admin.NewHandlers(admin.Deps{Store: store, Runner: runner})
	rec := httptest.NewRecorder()
	h.CreateBackup(rec, httptest.NewRequest(http.MethodPost, "/admin/backup", nil))
	if rec.Code != http.StatusNoContent {
		t.Errorf("status = %d", rec.Code)
	}
	if runner.calls != 1 || runner.trigger != "manual" {
		t.Errorf("runner = %+v", runner)
	}
}

func TestCreateBackup_RunnerDisabled(t *testing.T) {
	store := newStore(t)
	h := admin.NewHandlers(admin.Deps{Store: store})
	rec := httptest.NewRecorder()
	h.CreateBackup(rec, httptest.NewRequest(http.MethodPost, "/admin/backup", nil))
	if rec.Code != http.StatusServiceUnavailable {
		t.Errorf("status = %d", rec.Code)
	}
}

func TestCreateBackup_RunnerError(t *testing.T) {
	store := newStore(t)
	runner := &stubRunner{err: errors.New("boom")}
	h := admin.NewHandlers(admin.Deps{Store: store, Runner: runner})
	rec := httptest.NewRecorder()
	h.CreateBackup(rec, httptest.NewRequest(http.MethodPost, "/admin/backup", nil))
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("status = %d", rec.Code)
	}
}

func TestListBackups_Empty(t *testing.T) {
	store := newStore(t)
	h := admin.NewHandlers(admin.Deps{Store: store})
	rec := httptest.NewRecorder()
	h.ListBackups(rec, httptest.NewRequest(http.MethodGet, "/admin/backups", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	var out struct {
		Backups []votacao.Backup `json:"backups"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	if len(out.Backups) != 0 {
		t.Errorf("got %d", len(out.Backups))
	}
}

func TestListBackups_PopulatedAfterInsert(t *testing.T) {
	store := newStore(t)
	_, _ = store.InsertBackup(context.Background(), "fid", "n.db", 100, "cron")
	h := admin.NewHandlers(admin.Deps{Store: store})
	rec := httptest.NewRecorder()
	h.ListBackups(rec, httptest.NewRequest(http.MethodGet, "/admin/backups", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	var out struct {
		Backups []votacao.Backup `json:"backups"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	if len(out.Backups) != 1 || out.Backups[0].TriggerType != "cron" {
		t.Errorf("backups = %+v", out.Backups)
	}
}
```

### 4.4 Run + commit

```bash
cd apps/api && go test ./internal/handlers/admin/... -v
git add apps/api/internal/handlers/admin/
git commit -m "feat(handlers/admin): /admin/backup + /admin/backups handlers"
```

---

## Task 5: Mount /admin routes + main.go wiring

**Files:**
- Modify: `apps/api/internal/router/router.go`
- Modify: `apps/api/internal/router/router_test.go`
- Modify: `apps/api/cmd/api/main.go`
- Modify: `apps/api/internal/handlers/votacao/votes.go` (CloseSession fires async backup)

### 5.1 router.go

Add to Deps:
```go
type Deps struct {
	DB              *sql.DB
	Sessions        *scs.SessionManager
	AuthHandlers    *auth.Handlers
	VotacaoHandlers *handlersvotacao.Handlers
	AdminHandlers   *handlersadmin.Handlers
	Store           *votacao.Store
}
```

Add import: `handlersadmin "github.com/PiluVitu/api/internal/handlers/admin"`.

After the /votacao block:

```go
	if deps.AdminHandlers != nil && deps.Store != nil && deps.Sessions != nil {
		r.Route("/admin", func(r chi.Router) {
			r.With(auth.RequireAdmin(deps.Sessions, deps.Store)).Post("/backup", deps.AdminHandlers.CreateBackup)
			r.With(auth.RequireAdmin(deps.Sessions, deps.Store)).Get("/backups", deps.AdminHandlers.ListBackups)
		})
	}
```

### 5.2 router_test.go

```go
func TestAdminBackup_RequiresAdmin(t *testing.T) {
	store, _ := votacao.NewStore(filepath.Join(t.TempDir(), "x.db"))
	t.Cleanup(func() { _ = store.Close() })
	sm := auth.NewSessionManager(store.DB())
	authH := auth.NewHandlers(auth.HandlersDeps{
		Store: store, Sessions: sm,
		Config:    auth.Config{ClientID: "cid", WebRedirectURL: "http://web"},
		Exchanger: &fakeExchanger{}, Verifier: &fakeVerifier{},
	})
	adminH := handlersadmin.NewHandlers(handlersadmin.Deps{Store: store})

	srv := httptest.NewServer(New(Deps{
		DB: store.DB(), Sessions: sm,
		AuthHandlers: authH, AdminHandlers: adminH, Store: store,
	}))
	defer srv.Close()
	resp, _ := http.Post(srv.URL+"/admin/backup", "application/json", nil)
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d", resp.StatusCode)
	}
}
```

(Add `handlersadmin "github.com/PiluVitu/api/internal/handlers/admin"` to imports.)

### 5.3 votes.go (CloseSession fires backup)

In `apps/api/internal/handlers/votacao/votes.go`, change the end of `CloseSession`. After the successful close, add an async backup trigger using a Deps field (next step).

First, modify `Deps` in `deps.go`:

```go
type Deps struct {
	Store    *votacao.Store
	Sheets   SheetsReader
	Posters  PosterSearcher
	Backuper Backuper // OPTIONAL: nil → skip backup on close
}

// Backuper is invoked by CloseSession (async) after a successful close.
type Backuper interface {
	Run(ctx context.Context, trigger string) error
}
```

In `votes.go.CloseSession`, after the successful close (right before writing the response), add:

```go
	if h.deps.Backuper != nil {
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			_ = h.deps.Backuper.Run(ctx, "session_close")
		}()
	}
```

Add `"context"` and `"time"` to imports if not already there.

### 5.4 main.go

Build the gdrive client + backup.Runner + cron. Wire into VotacaoHandlers (as Backuper) and AdminHandlers.

```go
package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/PiluVitu/api/internal/auth"
	"github.com/PiluVitu/api/internal/backup"
	"github.com/PiluVitu/api/internal/gdrive"
	"github.com/PiluVitu/api/internal/gsheets"
	handlersadmin "github.com/PiluVitu/api/internal/handlers/admin"
	handlersvotacao "github.com/PiluVitu/api/internal/handlers/votacao"
	"github.com/PiluVitu/api/internal/router"
	"github.com/PiluVitu/api/internal/tmdb"
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
		Store: store, Sessions: sm, Config: cfg,
		Exchanger: auth.NewGoogleTokenExchanger(cfg),
		Verifier:  auth.NewGoogleIDTokenVerifier(),
	})

	var sheetsClient handlersvotacao.SheetsReader
	if sheetID := os.Getenv("GSHEETS_MOVIES_SPREADSHEET_ID"); sheetID != "" {
		rangeA1 := os.Getenv("GSHEETS_MOVIES_RANGE")
		if rangeA1 == "" {
			rangeA1 = "A2:F"
		}
		c, gerr := gsheets.NewClient(context.Background(), sheetID, rangeA1)
		if gerr != nil {
			fmt.Fprintf(os.Stderr, "gsheets: %v (continuing without sheets)\n", gerr)
		} else {
			sheetsClient = c
		}
	}

	var postersClient handlersvotacao.PosterSearcher
	if key := os.Getenv("TMDB_API_KEY"); key != "" {
		postersClient = tmdb.NewClient(key)
	}

	var runner *backup.Runner
	if folder := os.Getenv("GDRIVE_BACKUP_FOLDER_ID"); folder != "" {
		drv, gerr := gdrive.NewClient(context.Background())
		if gerr != nil {
			fmt.Fprintf(os.Stderr, "gdrive: %v (continuing without backup)\n", gerr)
		} else {
			keep, _ := strconv.Atoi(os.Getenv("GDRIVE_BACKUP_KEEP"))
			if keep <= 0 {
				keep = 30
			}
			runner = &backup.Runner{Store: store, Uploader: drv, FolderID: folder, Keep: keep}
		}
	}

	var backuper handlersvotacao.Backuper
	if runner != nil {
		backuper = runner
	}
	votH := handlersvotacao.NewHandlers(handlersvotacao.Deps{
		Store: store, Sheets: sheetsClient, Posters: postersClient, Backuper: backuper,
	})

	var adminBackup handlersadmin.BackupRunner
	if runner != nil {
		adminBackup = runner
	}
	adminH := handlersadmin.NewHandlers(handlersadmin.Deps{Store: store, Runner: adminBackup})

	// Cron — only start if both runner and BACKUP_CRON set.
	if runner != nil {
		spec := os.Getenv("BACKUP_CRON")
		if spec == "" {
			spec = "0 3 * * *"
		}
		_, cerr := backup.Start(context.Background(), spec, func(ctx context.Context) {
			if err := runner.Run(ctx, "cron"); err != nil {
				fmt.Fprintf(os.Stderr, "backup cron: %v\n", err)
			}
		})
		if cerr != nil {
			fmt.Fprintf(os.Stderr, "backup cron start: %v (continuing without cron)\n", cerr)
		} else {
			fmt.Printf("Backup cron scheduled (%s)\n", spec)
		}
	}

	handler := router.New(router.Deps{
		DB: store.DB(), Sessions: sm,
		AuthHandlers: authHandlers, VotacaoHandlers: votH,
		AdminHandlers: adminH, Store: store,
	})

	addr := ":" + port
	fmt.Printf("API listening on %s (db=%s)\n", addr, dbPath)
	if err := http.ListenAndServe(addr, handler); err != nil {
		fmt.Fprintf(os.Stderr, "server error: %v\n", err)
		os.Exit(1)
	}
}
```

### 5.5 Verify + commit

```bash
cd apps/api && go vet ./... && go test ./... && go build ./...
git add apps/api/internal/router/ apps/api/internal/handlers/votacao/ apps/api/cmd/api/main.go
git commit -m "feat(api): mount /admin/*, fire session_close backup, start cron"
```

---

## Task 6: env + compose + CLAUDE.md

### 6.1 Append to apps/api/.env.example

```dotenv

# Google Drive backup folder (share with the SA, copy folderId from URL).
GDRIVE_BACKUP_FOLDER_ID=
# How many most-recent backup files to keep before rotating.
GDRIVE_BACKUP_KEEP=30
# Cron spec for the daily backup. Default 03:00 server time.
BACKUP_CRON=0 3 * * *
```

### 6.2 Append to infra/docker-compose.yml api env

```yaml
      GDRIVE_BACKUP_FOLDER_ID: ${GDRIVE_BACKUP_FOLDER_ID:-}
      GDRIVE_BACKUP_KEEP: ${GDRIVE_BACKUP_KEEP:-30}
      BACKUP_CRON: ${BACKUP_CRON:-0 3 * * *}
```

### 6.3 Update CLAUDE.md

Status: "Fase 6 concluída: Drive backup + cron".

Add a new sub-section after "TMDb + handlers de sessions":

```markdown
#### Backup + Cron (`internal/gdrive`, `internal/backup`, `internal/handlers/admin`)

- **gdrive.Client:** wrapper sobre `google.golang.org/api/drive/v3`. `Upload` (multipart, scope drive.file) + `Rotate` (lista por createdTime desc, deleta os antigos além do `keep`). Test seam: `NewClientWithService` aceita um `*drive.Service` apontado pra `httptest.Server`.
- **backup.Runner:** `Run(ctx, trigger)` faz `VACUUM INTO` num arquivo temp, sobe via `gdrive.Uploader`, insere row em `backups` (com `trigger_type` "cron"/"manual"/"session_close"), chama Rotate. Falhas propagam.
- **backup.Start:** registra `func(ctx)` no `robfig/cron/v3` com o spec dado. Tarefa roda em goroutine separada do scheduler; runs longos não bloqueiam ticks.
- **handlers/admin:** `POST /admin/backup` (RequireAdmin) dispara `Runner.Run(ctx, "manual")` síncrono → 204. `GET /admin/backups` (RequireAdmin) retorna últimos 50 do `backups` table.
- **session_close trigger:** `CloseSession` (em `handlers/votacao/votes.go`), após fechar com sucesso, dispara `Runner.Run` async via goroutine com timeout de 30s. Falha do backup é logada, não bloqueia a resposta.
- **Wiring opcional:** `runner` só é construído no `main.go` se `GDRIVE_BACKUP_FOLDER_ID` setado. Sem isso, /admin/backup responde 503 e o cron não inicia.
```

In env vars list:

```markdown
- `GDRIVE_BACKUP_FOLDER_ID` — ID da pasta Drive onde os snapshots vão. Vazio → backup desabilitado.
- `GDRIVE_BACKUP_KEEP` — quantos backups mais recentes manter (default 30).
- `BACKUP_CRON` — cron spec 5-fields (default `0 3 * * *` — 03:00 local).
```

### 6.4 Final sweep + commit

```bash
cd apps/api && go vet ./... && go test ./... && go build ./...
git add apps/api/.env.example infra/docker-compose.yml CLAUDE.md
git commit -m "docs/infra(votacao): wire GDRIVE_* + BACKUP_CRON env + document Phase 6"
```

---

## Phase 6 Exit Criteria

- [ ] gdrive Upload + Rotate covered with httptest (4 tests)
- [ ] backup.Runner Run covered with fake uploader + real SQLite (4 tests)
- [ ] cron parse covered (2 tests)
- [ ] /admin/backup + /admin/backups (4 handler tests + 1 router auth smoke test)
- [ ] CloseSession fires async backup (existing CloseSession test should still pass — async is fire-and-forget so test doesn't need to assert it)
- [ ] All tests pass, build clean
- [ ] CLAUDE.md updated

---

## Notes for the implementer

- `robfig/cron/v3` parses 5-field standard cron via `cron.ParseStandard`. Don't use `cron.New(cron.WithSeconds())`.
- `google.golang.org/api/drive/v3` is pulled in transitively from Phase 2's `google.golang.org/api` dep — no new go.mod entry needed beyond promotion to direct.
- `VACUUM INTO` in modernc.org/sqlite expects a path; the file must not exist beforehand (we use `time.Now().UnixNano()` to guarantee uniqueness).
- `time.Now().UTC().Format("2006-01-02-150405")` is the filename pattern. Match exactly.
- 7 commits in this phase.
