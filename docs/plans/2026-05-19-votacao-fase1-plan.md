# Votação de Filmes — Fase 1: DB + Store + Volume Docker

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Estabelecer fundação SQLite + Store CRUD no Go API, com persistência em volume Docker.

**Architecture:** SQLite via `modernc.org/sqlite` (puro Go, zero CGo). Schema embutido via `//go:embed`, aplicado idempotentemente no startup. Store por entidade (users, sessions, movies, votes, backups), métodos thin, sem ORM. Volume Docker `api-data` mounted em `/data`. Health check do `/health` verifica conectividade.

**Tech Stack:** Go 1.25, `modernc.org/sqlite`, chi v5, Docker Compose, distroless nonroot.

**Reference design:** `docs/plans/2026-05-19-votacao-filmes-design.md`

---

## File Structure

```
apps/api/internal/votacao/
  schema.sql                    # CREATE TABLE statements (idempotent)
  embed.go                      # //go:embed schema.sql
  store.go                      # Store struct, NewStore, Close, DB accessor
  store_test.go
  helper_test.go                # newTestStore() — shared test helper
  users.go                      # User + UpsertUser + GetUserByGoogleSub + GetUserByID
  users_test.go
  sessions.go                   # VotingSession + Create/Get/List/Close
  sessions_test.go
  movies.go                     # SessionMovie + InsertSessionMovies + GetSessionMovies
  movies_test.go
  votes.go                      # Vote + InsertVote + ListVotesBySession + ErrAlreadyVoted
  votes_test.go
  backups.go                    # Backup + InsertBackup + ListBackups
  backups_test.go
apps/api/cmd/api/main.go        # MODIFIED: open Store, pass to router
apps/api/internal/router/router.go      # MODIFIED: accept Deps struct, /health checks DB
apps/api/internal/router/router_test.go # MODIFIED: pass Deps in tests
apps/api/Dockerfile             # MODIFIED: stage /data dir with chown 65532:65532
infra/docker-compose.yml        # MODIFIED: add api-data volume + SQLITE_PATH env
apps/api/go.mod                 # MODIFIED: + modernc.org/sqlite
apps/api/go.sum                 # MODIFIED
CLAUDE.md                       # MODIFIED: document SQLite + votacao package
```

**Why this split:** Cada entidade fica em arquivo próprio + teste colocado (lei do projeto). `store.go` é o único que toca conexão/migração; outros arquivos só recebem `*Store` e batem SQL.

---

## Task 1: Add SQLite driver + schema

**Files:**
- Create: `apps/api/internal/votacao/schema.sql`
- Create: `apps/api/internal/votacao/embed.go`
- Modify: `apps/api/go.mod`, `apps/api/go.sum`

- [ ] **Step 1.1: Add modernc.org/sqlite dependency**

Run:
```bash
cd apps/api && go get modernc.org/sqlite@latest
```

Expected: `go.mod` ganha linha `modernc.org/sqlite v1.x.x`, `go.sum` atualizado.

- [ ] **Step 1.2: Create schema.sql**

Create `apps/api/internal/votacao/schema.sql`:

```sql
-- Idempotent schema for movie voting feature.
-- Applied at startup via embed.go + Store.migrate().

CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  google_sub      TEXT NOT NULL UNIQUE,
  email           TEXT NOT NULL,
  name            TEXT NOT NULL,
  picture         TEXT,
  is_admin        INTEGER NOT NULL DEFAULT 0,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS voting_sessions (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  title             TEXT NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('open','closed')),
  created_by        INTEGER NOT NULL REFERENCES users(id),
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at         DATETIME,
  winner_movie_id   INTEGER REFERENCES session_movies(id),
  sort_options_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS session_movies (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    INTEGER NOT NULL REFERENCES voting_sessions(id) ON DELETE CASCADE,
  category      TEXT NOT NULL,
  title         TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('filme','serie')),
  poster_url    TEXT,
  tmdb_id       INTEGER,
  was_watched   INTEGER NOT NULL DEFAULT 0,
  sheet_number  INTEGER,
  UNIQUE (session_id, category)
);

CREATE TABLE IF NOT EXISTS votes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  INTEGER NOT NULL REFERENCES voting_sessions(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  movie_id    INTEGER NOT NULL REFERENCES session_movies(id),
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (session_id, user_id)
);

CREATE TABLE IF NOT EXISTS backups (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  drive_file_id   TEXT NOT NULL,
  drive_file_name TEXT NOT NULL,
  size_bytes      INTEGER NOT NULL,
  trigger_type    TEXT NOT NULL CHECK (trigger_type IN ('cron','manual','session_close')),
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_session_movies_session ON session_movies(session_id);
CREATE INDEX IF NOT EXISTS idx_votes_session ON votes(session_id);
CREATE INDEX IF NOT EXISTS idx_voting_sessions_created ON voting_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backups_created ON backups(created_at DESC);
```

> Tabela `sessions` (scs) é criada pelo próprio `sqlite3store` na Fase 2.

- [ ] **Step 1.3: Create embed.go**

Create `apps/api/internal/votacao/embed.go`:

```go
package votacao

import _ "embed"

//go:embed schema.sql
var schemaSQL string
```

- [ ] **Step 1.4: Verify build**

Run:
```bash
cd apps/api && go build ./...
```

Expected: build sem erros (sem código que use o schema ainda).

- [ ] **Step 1.5: Commit**

```bash
git add apps/api/go.mod apps/api/go.sum apps/api/internal/votacao/schema.sql apps/api/internal/votacao/embed.go
git commit -m "feat(api): add SQLite schema and modernc driver for votacao feature"
```

---

## Task 2: Store base — Open, Close, Migrate

**Files:**
- Create: `apps/api/internal/votacao/store.go`
- Create: `apps/api/internal/votacao/store_test.go`
- Create: `apps/api/internal/votacao/helper_test.go`

- [ ] **Step 2.1: Write failing tests**

Create `apps/api/internal/votacao/helper_test.go`:

```go
package votacao_test

import (
	"path/filepath"
	"testing"

	"github.com/PiluVitu/api/internal/votacao"
)

func newTestStore(t *testing.T) *votacao.Store {
	t.Helper()
	path := filepath.Join(t.TempDir(), "test.db")
	s, err := votacao.NewStore(path)
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	t.Cleanup(func() { _ = s.Close() })
	return s
}
```

Create `apps/api/internal/votacao/store_test.go`:

```go
package votacao_test

import (
	"path/filepath"
	"testing"

	"github.com/PiluVitu/api/internal/votacao"
)

func TestNewStore_CreatesAllTables(t *testing.T) {
	s := newTestStore(t)
	expected := []string{"users", "voting_sessions", "session_movies", "votes", "backups"}
	for _, table := range expected {
		var name string
		err := s.DB().QueryRow(
			`SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
			table,
		).Scan(&name)
		if err != nil {
			t.Errorf("table %q not created: %v", table, err)
		}
	}
}

func TestNewStore_ForeignKeysEnabled(t *testing.T) {
	s := newTestStore(t)
	var on int
	if err := s.DB().QueryRow(`PRAGMA foreign_keys`).Scan(&on); err != nil {
		t.Fatal(err)
	}
	if on != 1 {
		t.Errorf("foreign_keys = %d, want 1", on)
	}
}

func TestNewStore_Idempotent(t *testing.T) {
	path := filepath.Join(t.TempDir(), "x.db")
	s1, err := votacao.NewStore(path)
	if err != nil {
		t.Fatalf("first open: %v", err)
	}
	_ = s1.Close()

	s2, err := votacao.NewStore(path)
	if err != nil {
		t.Fatalf("second open: %v", err)
	}
	defer s2.Close()
}

func TestNewStore_FailsOnInvalidPath(t *testing.T) {
	_, err := votacao.NewStore("/nonexistent-dir/x.db")
	if err == nil {
		t.Error("expected error for invalid path")
	}
}
```

- [ ] **Step 2.2: Run tests, confirm failure**

Run:
```bash
cd apps/api && go test ./internal/votacao/...
```

Expected: build failure — `votacao.Store` and `votacao.NewStore` undefined.

- [ ] **Step 2.3: Implement Store**

Create `apps/api/internal/votacao/store.go`:

```go
package votacao

import (
	"database/sql"
	"errors"
	"fmt"

	_ "modernc.org/sqlite"
)

// ErrNotFound is returned when a row does not exist.
var ErrNotFound = errors.New("votacao: not found")

// Store wraps a SQLite database with the votacao schema.
// Methods are safe for concurrent use.
type Store struct {
	db *sql.DB
}

// NewStore opens (or creates) a SQLite database at path and applies
// the embedded schema idempotently. Foreign keys are enabled and
// journal mode is WAL.
func NewStore(path string) (*Store, error) {
	dsn := fmt.Sprintf("file:%s?_pragma=foreign_keys(1)&_pragma=journal_mode(wal)&_pragma=busy_timeout(5000)", path)
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("votacao: open db: %w", err)
	}
	if err := db.Ping(); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("votacao: ping db: %w", err)
	}
	if _, err := db.Exec(schemaSQL); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("votacao: apply schema: %w", err)
	}
	return &Store{db: db}, nil
}

// Close releases the underlying database connection.
func (s *Store) Close() error {
	return s.db.Close()
}

// DB returns the underlying *sql.DB. Intended for tests and
// for code that needs raw access (e.g. health checks).
func (s *Store) DB() *sql.DB {
	return s.db
}
```

- [ ] **Step 2.4: Run tests, confirm pass**

Run:
```bash
cd apps/api && go test ./internal/votacao/... -v
```

Expected: 4 tests pass.

- [ ] **Step 2.5: Commit**

```bash
git add apps/api/internal/votacao/store.go apps/api/internal/votacao/store_test.go apps/api/internal/votacao/helper_test.go
git commit -m "feat(api): votacao.Store with idempotent SQLite migration"
```

---

## Task 3: Users CRUD

**Files:**
- Create: `apps/api/internal/votacao/users.go`
- Create: `apps/api/internal/votacao/users_test.go`

- [ ] **Step 3.1: Write failing tests**

Create `apps/api/internal/votacao/users_test.go`:

```go
package votacao_test

import (
	"context"
	"errors"
	"testing"

	"github.com/PiluVitu/api/internal/votacao"
)

func TestUpsertUser_Insert(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	u, err := s.UpsertUser(ctx, "google-sub-123", "alice@example.com", "Alice", "https://pic", []string{"alice@example.com"})
	if err != nil {
		t.Fatalf("UpsertUser: %v", err)
	}
	if u.ID == 0 {
		t.Error("id should be set")
	}
	if u.GoogleSub != "google-sub-123" {
		t.Errorf("sub = %q", u.GoogleSub)
	}
	if !u.IsAdmin {
		t.Error("should be admin (email in allowlist)")
	}
}

func TestUpsertUser_UpdatesExisting(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	first, _ := s.UpsertUser(ctx, "sub", "x@x.com", "Old Name", "", nil)
	second, err := s.UpsertUser(ctx, "sub", "x@x.com", "New Name", "https://newpic", nil)
	if err != nil {
		t.Fatal(err)
	}
	if first.ID != second.ID {
		t.Errorf("id changed on upsert: %d -> %d", first.ID, second.ID)
	}
	if second.Name != "New Name" {
		t.Errorf("name = %q, want New Name", second.Name)
	}
	if second.Picture != "https://newpic" {
		t.Errorf("picture = %q", second.Picture)
	}
}

func TestUpsertUser_AdminMatchIsCaseInsensitive(t *testing.T) {
	s := newTestStore(t)
	u, err := s.UpsertUser(context.Background(), "sub", "Paulo@Example.COM", "P", "", []string{"paulo@example.com"})
	if err != nil {
		t.Fatal(err)
	}
	if !u.IsAdmin {
		t.Error("should be admin (case-insensitive match)")
	}
}

func TestGetUserByGoogleSub_NotFound(t *testing.T) {
	s := newTestStore(t)
	_, err := s.GetUserByGoogleSub(context.Background(), "missing")
	if !errors.Is(err, votacao.ErrNotFound) {
		t.Errorf("err = %v, want ErrNotFound", err)
	}
}

func TestGetUserByID(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	created, _ := s.UpsertUser(ctx, "sub", "a@b.c", "A", "", nil)
	got, err := s.GetUserByID(ctx, created.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Email != "a@b.c" {
		t.Errorf("email = %q", got.Email)
	}
}
```

- [ ] **Step 3.2: Run tests, confirm failure**

Run:
```bash
cd apps/api && go test ./internal/votacao/... -run TestUpsertUser
```

Expected: build failure — methods undefined.

- [ ] **Step 3.3: Implement users.go**

Create `apps/api/internal/votacao/users.go`:

```go
package votacao

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"
)

type User struct {
	ID        int64
	GoogleSub string
	Email     string
	Name      string
	Picture   string
	IsAdmin   bool
	CreatedAt time.Time
}

// UpsertUser inserts a user by google_sub or updates email/name/picture/is_admin if it exists.
// adminEmails (case-insensitive) determines IsAdmin.
func (s *Store) UpsertUser(ctx context.Context, sub, email, name, picture string, adminEmails []string) (*User, error) {
	isAdmin := isInAdminList(email, adminEmails)
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO users (google_sub, email, name, picture, is_admin)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(google_sub) DO UPDATE SET
			email    = excluded.email,
			name     = excluded.name,
			picture  = excluded.picture,
			is_admin = excluded.is_admin
	`, sub, email, name, nullableStr(picture), boolToInt(isAdmin))
	if err != nil {
		return nil, err
	}
	return s.GetUserByGoogleSub(ctx, sub)
}

func (s *Store) GetUserByGoogleSub(ctx context.Context, sub string) (*User, error) {
	return scanUser(s.db.QueryRowContext(ctx, userSelect+`WHERE google_sub = ?`, sub))
}

func (s *Store) GetUserByID(ctx context.Context, id int64) (*User, error) {
	return scanUser(s.db.QueryRowContext(ctx, userSelect+`WHERE id = ?`, id))
}

const userSelect = `
	SELECT id, google_sub, email, name, picture, is_admin, created_at
	FROM users
`

func scanUser(row *sql.Row) (*User, error) {
	var u User
	var picture sql.NullString
	var isAdminInt int
	err := row.Scan(&u.ID, &u.GoogleSub, &u.Email, &u.Name, &picture, &isAdminInt, &u.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	u.Picture = picture.String
	u.IsAdmin = isAdminInt == 1
	return &u, nil
}

func isInAdminList(email string, admins []string) bool {
	target := strings.ToLower(strings.TrimSpace(email))
	for _, a := range admins {
		if strings.ToLower(strings.TrimSpace(a)) == target {
			return true
		}
	}
	return false
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

func nullableStr(s string) any {
	if s == "" {
		return nil
	}
	return s
}
```

- [ ] **Step 3.4: Run tests, confirm pass**

Run:
```bash
cd apps/api && go test ./internal/votacao/... -v
```

Expected: all tests (store + users) pass.

- [ ] **Step 3.5: Commit**

```bash
git add apps/api/internal/votacao/users.go apps/api/internal/votacao/users_test.go
git commit -m "feat(api): votacao.UpsertUser/GetUser with admin allowlist"
```

---

## Task 4: Voting Sessions CRUD

**Files:**
- Create: `apps/api/internal/votacao/sessions.go`
- Create: `apps/api/internal/votacao/sessions_test.go`

- [ ] **Step 4.1: Write failing tests**

Create `apps/api/internal/votacao/sessions_test.go`:

```go
package votacao_test

import (
	"context"
	"errors"
	"testing"

	"github.com/PiluVitu/api/internal/votacao"
)

func seedUser(t *testing.T, s *votacao.Store) *votacao.User {
	t.Helper()
	u, err := s.UpsertUser(context.Background(), "sub-seed", "seed@example.com", "Seed", "", nil)
	if err != nil {
		t.Fatalf("seedUser: %v", err)
	}
	return u
}

func TestCreateVotingSession(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	user := seedUser(t, s)

	sess, err := s.CreateVotingSession(ctx, "Sexta 22/05", user.ID, `{"types":["filme"]}`)
	if err != nil {
		t.Fatalf("CreateVotingSession: %v", err)
	}
	if sess.ID == 0 {
		t.Error("id should be set")
	}
	if sess.Status != "open" {
		t.Errorf("status = %q, want open", sess.Status)
	}
	if sess.Title != "Sexta 22/05" {
		t.Errorf("title = %q", sess.Title)
	}
	if sess.SortOptionsJSON != `{"types":["filme"]}` {
		t.Errorf("sort_options_json = %q", sess.SortOptionsJSON)
	}
	if sess.ClosedAt != nil {
		t.Error("closed_at should be nil")
	}
	if sess.WinnerMovieID != nil {
		t.Error("winner_movie_id should be nil")
	}
}

func TestGetVotingSession_NotFound(t *testing.T) {
	s := newTestStore(t)
	_, err := s.GetVotingSession(context.Background(), 999)
	if !errors.Is(err, votacao.ErrNotFound) {
		t.Errorf("err = %v, want ErrNotFound", err)
	}
}

func TestListVotingSessions_OrderedDescending(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	user := seedUser(t, s)

	first, _ := s.CreateVotingSession(ctx, "First", user.ID, "{}")
	second, _ := s.CreateVotingSession(ctx, "Second", user.ID, "{}")

	list, err := s.ListVotingSessions(ctx, 10, 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 2 {
		t.Fatalf("len = %d, want 2", len(list))
	}
	if list[0].ID != second.ID {
		t.Errorf("first item id = %d, want %d (newest first)", list[0].ID, second.ID)
	}
	if list[1].ID != first.ID {
		t.Errorf("second item id = %d, want %d", list[1].ID, first.ID)
	}
}

func TestListVotingSessions_Pagination(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	user := seedUser(t, s)
	for i := 0; i < 5; i++ {
		_, _ = s.CreateVotingSession(ctx, "S", user.ID, "{}")
	}
	page1, _ := s.ListVotingSessions(ctx, 2, 0)
	page2, _ := s.ListVotingSessions(ctx, 2, 2)
	if len(page1) != 2 || len(page2) != 2 {
		t.Fatalf("pages: %d, %d", len(page1), len(page2))
	}
	if page1[0].ID == page2[0].ID {
		t.Error("pages overlap")
	}
}

func TestCloseVotingSession(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	user := seedUser(t, s)
	sess, _ := s.CreateVotingSession(ctx, "X", user.ID, "{}")

	// We don't have movies yet, so pass nil winner.
	if err := s.CloseVotingSession(ctx, sess.ID, nil); err != nil {
		t.Fatalf("CloseVotingSession: %v", err)
	}
	got, _ := s.GetVotingSession(ctx, sess.ID)
	if got.Status != "closed" {
		t.Errorf("status = %q", got.Status)
	}
	if got.ClosedAt == nil {
		t.Error("closed_at should be set")
	}
}

func TestCloseVotingSession_AlreadyClosedReturnsNotFound(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	user := seedUser(t, s)
	sess, _ := s.CreateVotingSession(ctx, "X", user.ID, "{}")
	_ = s.CloseVotingSession(ctx, sess.ID, nil)

	err := s.CloseVotingSession(ctx, sess.ID, nil)
	if !errors.Is(err, votacao.ErrNotFound) {
		t.Errorf("err = %v, want ErrNotFound (no open row to close)", err)
	}
}
```

- [ ] **Step 4.2: Run tests, confirm failure**

Run:
```bash
cd apps/api && go test ./internal/votacao/... -run VotingSession
```

Expected: undefined methods.

- [ ] **Step 4.3: Implement sessions.go**

Create `apps/api/internal/votacao/sessions.go`:

```go
package votacao

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

type VotingSession struct {
	ID              int64
	Title           string
	Status          string // "open" | "closed"
	CreatedBy       int64
	CreatedAt       time.Time
	ClosedAt        *time.Time
	WinnerMovieID   *int64
	SortOptionsJSON string
}

func (s *Store) CreateVotingSession(ctx context.Context, title string, createdBy int64, sortOptionsJSON string) (*VotingSession, error) {
	if sortOptionsJSON == "" {
		sortOptionsJSON = "{}"
	}
	res, err := s.db.ExecContext(ctx, `
		INSERT INTO voting_sessions (title, status, created_by, sort_options_json)
		VALUES (?, 'open', ?, ?)
	`, title, createdBy, sortOptionsJSON)
	if err != nil {
		return nil, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return nil, err
	}
	return s.GetVotingSession(ctx, id)
}

func (s *Store) GetVotingSession(ctx context.Context, id int64) (*VotingSession, error) {
	return scanVotingSession(s.db.QueryRowContext(ctx, votingSessionSelect+`WHERE id = ?`, id))
}

func (s *Store) ListVotingSessions(ctx context.Context, limit, offset int) ([]VotingSession, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	rows, err := s.db.QueryContext(ctx, votingSessionSelect+`ORDER BY id DESC LIMIT ? OFFSET ?`, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]VotingSession, 0, limit)
	for rows.Next() {
		v, err := scanVotingSessionRow(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *v)
	}
	return out, rows.Err()
}

// CloseVotingSession sets status='closed', timestamps closed_at, and optionally records winner_movie_id.
// Returns ErrNotFound if the session does not exist or is already closed.
func (s *Store) CloseVotingSession(ctx context.Context, id int64, winnerMovieID *int64) error {
	var (
		res sql.Result
		err error
	)
	if winnerMovieID != nil {
		res, err = s.db.ExecContext(ctx, `
			UPDATE voting_sessions
			SET status='closed', closed_at=CURRENT_TIMESTAMP, winner_movie_id=?
			WHERE id=? AND status='open'
		`, *winnerMovieID, id)
	} else {
		res, err = s.db.ExecContext(ctx, `
			UPDATE voting_sessions
			SET status='closed', closed_at=CURRENT_TIMESTAMP
			WHERE id=? AND status='open'
		`, id)
	}
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

const votingSessionSelect = `
	SELECT id, title, status, created_by, created_at, closed_at, winner_movie_id, sort_options_json
	FROM voting_sessions
`

type rowScanner interface {
	Scan(dest ...any) error
}

func scanVotingSession(row *sql.Row) (*VotingSession, error) {
	v, err := scanVotingSessionRow(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return v, err
}

func scanVotingSessionRow(r rowScanner) (*VotingSession, error) {
	var v VotingSession
	var closedAt sql.NullTime
	var winnerID sql.NullInt64
	if err := r.Scan(&v.ID, &v.Title, &v.Status, &v.CreatedBy, &v.CreatedAt, &closedAt, &winnerID, &v.SortOptionsJSON); err != nil {
		return nil, err
	}
	if closedAt.Valid {
		t := closedAt.Time
		v.ClosedAt = &t
	}
	if winnerID.Valid {
		id := winnerID.Int64
		v.WinnerMovieID = &id
	}
	return &v, nil
}
```

- [ ] **Step 4.4: Run tests, confirm pass**

Run:
```bash
cd apps/api && go test ./internal/votacao/... -v
```

Expected: all tests pass.

- [ ] **Step 4.5: Commit**

```bash
git add apps/api/internal/votacao/sessions.go apps/api/internal/votacao/sessions_test.go
git commit -m "feat(api): votacao voting session CRUD"
```

---

## Task 5: Session Movies CRUD

**Files:**
- Create: `apps/api/internal/votacao/movies.go`
- Create: `apps/api/internal/votacao/movies_test.go`

- [ ] **Step 5.1: Write failing tests**

Create `apps/api/internal/votacao/movies_test.go`:

```go
package votacao_test

import (
	"context"
	"testing"

	"github.com/PiluVitu/api/internal/votacao"
)

func TestInsertSessionMovies_Bulk(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	user := seedUser(t, s)
	sess, _ := s.CreateVotingSession(ctx, "X", user.ID, "{}")

	tmdb := int64(550)
	sheet := int64(42)
	movies := []votacao.SessionMovie{
		{SessionID: sess.ID, Category: "terror", Title: "A Coisa", Type: "filme", PosterURL: "https://p", TMDbID: &tmdb, WasWatched: false, SheetNumber: &sheet},
		{SessionID: sess.ID, Category: "ação", Title: "John Wick", Type: "filme"},
	}
	if err := s.InsertSessionMovies(ctx, movies); err != nil {
		t.Fatalf("InsertSessionMovies: %v", err)
	}
	got, err := s.GetSessionMovies(ctx, sess.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 {
		t.Fatalf("len = %d, want 2", len(got))
	}
	if got[0].Title != "A Coisa" || got[0].Category != "terror" {
		t.Errorf("first row wrong: %+v", got[0])
	}
	if got[0].PosterURL != "https://p" {
		t.Errorf("poster_url = %q", got[0].PosterURL)
	}
	if got[1].PosterURL != "" {
		t.Errorf("expected empty poster_url, got %q", got[1].PosterURL)
	}
}

func TestInsertSessionMovies_UniqueCategoryPerSession(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	user := seedUser(t, s)
	sess, _ := s.CreateVotingSession(ctx, "X", user.ID, "{}")

	movies := []votacao.SessionMovie{
		{SessionID: sess.ID, Category: "terror", Title: "A", Type: "filme"},
		{SessionID: sess.ID, Category: "terror", Title: "B", Type: "filme"},
	}
	err := s.InsertSessionMovies(ctx, movies)
	if err == nil {
		t.Error("expected UNIQUE violation on duplicate category in same session")
	}
}

func TestInsertSessionMovies_EmptyIsNoop(t *testing.T) {
	s := newTestStore(t)
	if err := s.InsertSessionMovies(context.Background(), nil); err != nil {
		t.Errorf("empty insert should be no-op, got: %v", err)
	}
}

func TestGetSessionMovies_EmptyReturnsEmptySlice(t *testing.T) {
	s := newTestStore(t)
	got, err := s.GetSessionMovies(context.Background(), 999)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 0 {
		t.Errorf("expected empty slice, got len %d", len(got))
	}
}
```

- [ ] **Step 5.2: Run tests, confirm failure**

Run:
```bash
cd apps/api && go test ./internal/votacao/... -run SessionMovies
```

Expected: undefined.

- [ ] **Step 5.3: Implement movies.go**

Create `apps/api/internal/votacao/movies.go`:

```go
package votacao

import (
	"context"
	"database/sql"
)

type SessionMovie struct {
	ID          int64
	SessionID   int64
	Category    string
	Title       string
	Type        string // "filme" | "serie"
	PosterURL   string
	TMDbID      *int64
	WasWatched  bool
	SheetNumber *int64
}

// InsertSessionMovies inserts movies in a single transaction.
// All movies must reference the same session_id (caller responsibility).
// Returns error if any row violates a constraint (e.g. duplicate category).
func (s *Store) InsertSessionMovies(ctx context.Context, movies []SessionMovie) error {
	if len(movies) == 0 {
		return nil
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	stmt, err := tx.PrepareContext(ctx, `
		INSERT INTO session_movies (session_id, category, title, type, poster_url, tmdb_id, was_watched, sheet_number)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, m := range movies {
		if _, err := stmt.ExecContext(ctx,
			m.SessionID,
			m.Category,
			m.Title,
			m.Type,
			nullableStr(m.PosterURL),
			nullableInt64(m.TMDbID),
			boolToInt(m.WasWatched),
			nullableInt64(m.SheetNumber),
		); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *Store) GetSessionMovies(ctx context.Context, sessionID int64) ([]SessionMovie, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, session_id, category, title, type, poster_url, tmdb_id, was_watched, sheet_number
		FROM session_movies
		WHERE session_id = ?
		ORDER BY id ASC
	`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]SessionMovie, 0)
	for rows.Next() {
		var m SessionMovie
		var poster sql.NullString
		var tmdbID sql.NullInt64
		var sheetNum sql.NullInt64
		var watched int
		if err := rows.Scan(&m.ID, &m.SessionID, &m.Category, &m.Title, &m.Type, &poster, &tmdbID, &watched, &sheetNum); err != nil {
			return nil, err
		}
		m.PosterURL = poster.String
		if tmdbID.Valid {
			v := tmdbID.Int64
			m.TMDbID = &v
		}
		if sheetNum.Valid {
			v := sheetNum.Int64
			m.SheetNumber = &v
		}
		m.WasWatched = watched == 1
		out = append(out, m)
	}
	return out, rows.Err()
}

func nullableInt64(p *int64) any {
	if p == nil {
		return nil
	}
	return *p
}
```

- [ ] **Step 5.4: Run tests, confirm pass**

Run:
```bash
cd apps/api && go test ./internal/votacao/... -v
```

Expected: all tests pass.

- [ ] **Step 5.5: Commit**

```bash
git add apps/api/internal/votacao/movies.go apps/api/internal/votacao/movies_test.go
git commit -m "feat(api): votacao session movies bulk insert + query"
```

---

## Task 6: Votes CRUD

**Files:**
- Create: `apps/api/internal/votacao/votes.go`
- Create: `apps/api/internal/votacao/votes_test.go`

- [ ] **Step 6.1: Write failing tests**

Create `apps/api/internal/votacao/votes_test.go`:

```go
package votacao_test

import (
	"context"
	"errors"
	"testing"

	"github.com/PiluVitu/api/internal/votacao"
)

func setupVoteScenario(t *testing.T) (*votacao.Store, *votacao.VotingSession, *votacao.SessionMovie, *votacao.User) {
	t.Helper()
	s := newTestStore(t)
	ctx := context.Background()
	user := seedUser(t, s)
	sess, err := s.CreateVotingSession(ctx, "X", user.ID, "{}")
	if err != nil {
		t.Fatal(err)
	}
	if err := s.InsertSessionMovies(ctx, []votacao.SessionMovie{
		{SessionID: sess.ID, Category: "terror", Title: "M", Type: "filme"},
	}); err != nil {
		t.Fatal(err)
	}
	movies, _ := s.GetSessionMovies(ctx, sess.ID)
	return s, sess, &movies[0], user
}

func TestInsertVote_Happy(t *testing.T) {
	s, sess, movie, user := setupVoteScenario(t)
	if err := s.InsertVote(context.Background(), sess.ID, user.ID, movie.ID); err != nil {
		t.Fatalf("InsertVote: %v", err)
	}
	votes, err := s.ListVotesBySession(context.Background(), sess.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(votes) != 1 || votes[0].UserID != user.ID || votes[0].MovieID != movie.ID {
		t.Errorf("unexpected votes: %+v", votes)
	}
}

func TestInsertVote_DuplicateReturnsErrAlreadyVoted(t *testing.T) {
	s, sess, movie, user := setupVoteScenario(t)
	ctx := context.Background()
	if err := s.InsertVote(ctx, sess.ID, user.ID, movie.ID); err != nil {
		t.Fatal(err)
	}
	err := s.InsertVote(ctx, sess.ID, user.ID, movie.ID)
	if !errors.Is(err, votacao.ErrAlreadyVoted) {
		t.Errorf("err = %v, want ErrAlreadyVoted", err)
	}
}

func TestInsertVote_TwoUsersSameSession(t *testing.T) {
	s, sess, movie, user1 := setupVoteScenario(t)
	ctx := context.Background()
	user2, _ := s.UpsertUser(ctx, "sub2", "u2@x.com", "U2", "", nil)

	if err := s.InsertVote(ctx, sess.ID, user1.ID, movie.ID); err != nil {
		t.Fatal(err)
	}
	if err := s.InsertVote(ctx, sess.ID, user2.ID, movie.ID); err != nil {
		t.Errorf("second user should be able to vote: %v", err)
	}
}

func TestListVotesBySession_Empty(t *testing.T) {
	s := newTestStore(t)
	got, err := s.ListVotesBySession(context.Background(), 999)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 0 {
		t.Errorf("expected empty slice, got %d", len(got))
	}
}
```

- [ ] **Step 6.2: Run tests, confirm failure**

Run:
```bash
cd apps/api && go test ./internal/votacao/... -run Vote
```

Expected: undefined.

- [ ] **Step 6.3: Implement votes.go**

Create `apps/api/internal/votacao/votes.go`:

```go
package votacao

import (
	"context"
	"errors"
	"strings"
	"time"
)

// ErrAlreadyVoted is returned by InsertVote when the user already voted in this session.
var ErrAlreadyVoted = errors.New("votacao: already voted")

type Vote struct {
	ID        int64
	SessionID int64
	UserID    int64
	MovieID   int64
	CreatedAt time.Time
}

func (s *Store) InsertVote(ctx context.Context, sessionID, userID, movieID int64) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO votes (session_id, user_id, movie_id) VALUES (?, ?, ?)
	`, sessionID, userID, movieID)
	if err != nil {
		if isUniqueViolation(err) {
			return ErrAlreadyVoted
		}
		return err
	}
	return nil
}

func (s *Store) ListVotesBySession(ctx context.Context, sessionID int64) ([]Vote, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, session_id, user_id, movie_id, created_at
		FROM votes
		WHERE session_id = ?
		ORDER BY created_at ASC
	`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]Vote, 0)
	for rows.Next() {
		var v Vote
		if err := rows.Scan(&v.ID, &v.SessionID, &v.UserID, &v.MovieID, &v.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

// isUniqueViolation matches modernc.org/sqlite UNIQUE constraint errors.
// We fall back to string matching to avoid coupling to the driver's internal types.
func isUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	return strings.Contains(err.Error(), "UNIQUE constraint failed")
}
```

- [ ] **Step 6.4: Run tests, confirm pass**

Run:
```bash
cd apps/api && go test ./internal/votacao/... -v
```

Expected: all tests pass.

- [ ] **Step 6.5: Commit**

```bash
git add apps/api/internal/votacao/votes.go apps/api/internal/votacao/votes_test.go
git commit -m "feat(api): votacao vote insertion (idempotent via UNIQUE)"
```

---

## Task 7: Backups CRUD

**Files:**
- Create: `apps/api/internal/votacao/backups.go`
- Create: `apps/api/internal/votacao/backups_test.go`

- [ ] **Step 7.1: Write failing tests**

Create `apps/api/internal/votacao/backups_test.go`:

```go
package votacao_test

import (
	"context"
	"testing"

	"github.com/PiluVitu/api/internal/votacao"
)

func TestInsertBackup(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	b, err := s.InsertBackup(ctx, "drive-file-id-1", "votacao-2026-05-19.db", 1024, "cron")
	if err != nil {
		t.Fatalf("InsertBackup: %v", err)
	}
	if b.ID == 0 {
		t.Error("id not set")
	}
	if b.SizeBytes != 1024 {
		t.Errorf("size = %d", b.SizeBytes)
	}
	if b.TriggerType != "cron" {
		t.Errorf("trigger = %q", b.TriggerType)
	}
}

func TestInsertBackup_RejectsBadTrigger(t *testing.T) {
	s := newTestStore(t)
	_, err := s.InsertBackup(context.Background(), "f", "n", 1, "invalid-trigger")
	if err == nil {
		t.Error("expected CHECK constraint violation for invalid trigger")
	}
}

func TestListBackups_OrderedNewestFirst(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	for _, name := range []string{"first", "second", "third"} {
		if _, err := s.InsertBackup(ctx, "id-"+name, name+".db", 1, "manual"); err != nil {
			t.Fatal(err)
		}
	}
	list, err := s.ListBackups(ctx, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 3 {
		t.Fatalf("len = %d", len(list))
	}
	if list[0].DriveFileName != "third.db" {
		t.Errorf("first item = %q, want third.db", list[0].DriveFileName)
	}
}

func TestListBackups_LimitClamp(t *testing.T) {
	s := newTestStore(t)
	got, err := s.ListBackups(context.Background(), -1)
	if err != nil {
		t.Fatal(err)
	}
	if got == nil {
		t.Error("should return empty slice, not nil")
	}
}
```

- [ ] **Step 7.2: Run tests, confirm failure**

Run:
```bash
cd apps/api && go test ./internal/votacao/... -run Backup
```

Expected: undefined.

- [ ] **Step 7.3: Implement backups.go**

Create `apps/api/internal/votacao/backups.go`:

```go
package votacao

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

type Backup struct {
	ID            int64
	DriveFileID   string
	DriveFileName string
	SizeBytes     int64
	TriggerType   string // "cron" | "manual" | "session_close"
	CreatedAt     time.Time
}

func (s *Store) InsertBackup(ctx context.Context, fileID, fileName string, sizeBytes int64, trigger string) (*Backup, error) {
	res, err := s.db.ExecContext(ctx, `
		INSERT INTO backups (drive_file_id, drive_file_name, size_bytes, trigger_type)
		VALUES (?, ?, ?, ?)
	`, fileID, fileName, sizeBytes, trigger)
	if err != nil {
		return nil, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return nil, err
	}
	return s.getBackup(ctx, id)
}

func (s *Store) getBackup(ctx context.Context, id int64) (*Backup, error) {
	var b Backup
	err := s.db.QueryRowContext(ctx, `
		SELECT id, drive_file_id, drive_file_name, size_bytes, trigger_type, created_at
		FROM backups WHERE id = ?
	`, id).Scan(&b.ID, &b.DriveFileID, &b.DriveFileName, &b.SizeBytes, &b.TriggerType, &b.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &b, nil
}

func (s *Store) ListBackups(ctx context.Context, limit int) ([]Backup, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, drive_file_id, drive_file_name, size_bytes, trigger_type, created_at
		FROM backups
		ORDER BY created_at DESC, id DESC
		LIMIT ?
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]Backup, 0)
	for rows.Next() {
		var b Backup
		if err := rows.Scan(&b.ID, &b.DriveFileID, &b.DriveFileName, &b.SizeBytes, &b.TriggerType, &b.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}
```

- [ ] **Step 7.4: Run tests, confirm pass**

Run:
```bash
cd apps/api && go test ./internal/votacao/... -v
```

Expected: all tests pass.

- [ ] **Step 7.5: Commit**

```bash
git add apps/api/internal/votacao/backups.go apps/api/internal/votacao/backups_test.go
git commit -m "feat(api): votacao backups insert + list"
```

---

## Task 8: Wire Store into main.go + router /health

**Files:**
- Modify: `apps/api/cmd/api/main.go`
- Modify: `apps/api/internal/router/router.go`
- Modify: `apps/api/internal/router/router_test.go`

- [ ] **Step 8.1: Read current router_test.go**

Run:
```bash
cat apps/api/internal/router/router_test.go
```

Note current test signatures so we can update them when we change `router.New()`.

- [ ] **Step 8.2: Update router.New() to accept Deps**

Replace `apps/api/internal/router/router.go` (full content shown below — keep CORS + tools routes intact, only add `Deps` and DB-aware /health):

```go
package router

import (
	"context"
	"database/sql"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"github.com/PiluVitu/api/internal/handlers"
)

// Deps holds external dependencies injected into the router.
type Deps struct {
	// DB is the SQLite connection used by the health check. May be nil
	// in tests that don't need DB connectivity.
	DB *sql.DB
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

	r.Get("/health", healthHandler(deps.DB))

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
		AllowCredentials: false,
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

- [ ] **Step 8.3: Update router_test.go to pass Deps**

`apps/api/internal/router/router_test.go` is in `package router` (internal test). Four call sites to `New()` need updating, and we add one new test for DB-aware health check.

**Exact replacements** — change every `New()` to `New(Deps{})` (no prefix since same package):

| Line | From | To |
|---|---|---|
| 10 | `srv := httptest.NewServer(New())` | `srv := httptest.NewServer(New(Deps{}))` |
| 25 | `srv := httptest.NewServer(New())` | `srv := httptest.NewServer(New(Deps{}))` |
| 44 | `srv := httptest.NewServer(New())` | `srv := httptest.NewServer(New(Deps{}))` |
| 63 | `srv := httptest.NewServer(New())` | `srv := httptest.NewServer(New(Deps{}))` |

Replace the import block at the top (lines 3-7) with:

```go
import (
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/PiluVitu/api/internal/votacao"
)
```

Append the new test at the end of the file (after line 108):

```go

func TestHealthWithDB_Up(t *testing.T) {
	store, err := votacao.NewStore(filepath.Join(t.TempDir(), "x.db"))
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })

	srv := httptest.NewServer(New(Deps{DB: store.DB()}))
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/health")
	if err != nil {
		t.Fatalf("GET /health: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("status = %d", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	if !strings.Contains(string(body), `"db":"up"`) {
		t.Errorf("body = %s", body)
	}
}

func TestHealthWithoutDB_StillUp(t *testing.T) {
	srv := httptest.NewServer(New(Deps{}))
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/health")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("status = %d", resp.StatusCode)
	}
}
```

- [ ] **Step 8.4: Update main.go**

Replace `apps/api/cmd/api/main.go`:

```go
package main

import (
	"fmt"
	"net/http"
	"os"

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

	handler := router.New(router.Deps{DB: store.DB()})

	addr := ":" + port
	fmt.Printf("API listening on %s (db=%s)\n", addr, dbPath)
	if err := http.ListenAndServe(addr, handler); err != nil {
		fmt.Fprintf(os.Stderr, "server error: %v\n", err)
		os.Exit(1)
	}
}
```

- [ ] **Step 8.5: Verify build + tests**

Run:
```bash
cd apps/api && go build ./... && go test ./... -v
```

Expected: build success, all tests pass (votacao + router + tools).

- [ ] **Step 8.6: Smoke test locally without Docker**

Run (in one terminal):
```bash
mkdir -p /tmp/votacao-dev
SQLITE_PATH=/tmp/votacao-dev/votacao.db make dev-api
```

Run (in another terminal):
```bash
curl -s http://localhost:8080/health
# Expected: {"ok":true,"db":"up"}
ls -la /tmp/votacao-dev/
# Expected: votacao.db file exists
```

Stop the dev server (Ctrl+C). Re-run dev-api, hit /health again — should still be up (file persists).

- [ ] **Step 8.7: Commit**

```bash
git add apps/api/cmd/api/main.go apps/api/internal/router/router.go apps/api/internal/router/router_test.go
git commit -m "feat(api): wire votacao.Store into main + /health checks DB"
```

---

## Task 9: Dockerfile + docker-compose volume

**Files:**
- Modify: `apps/api/Dockerfile`
- Modify: `infra/docker-compose.yml`

- [ ] **Step 9.1: Update Dockerfile**

Replace `apps/api/Dockerfile`:

```dockerfile
# Build stage
FROM golang:1.25-alpine AS builder
WORKDIR /app
COPY apps/api/go.mod apps/api/go.sum ./
RUN go mod download
COPY apps/api/ .
# Stage /data so the distroless final image owns it with the nonroot UID/GID (65532).
RUN mkdir -p /staging/data
RUN CGO_ENABLED=0 GOOS=linux go build -o /bin/api ./cmd/api
RUN CGO_ENABLED=0 GOOS=linux go build -o /bin/piluvitu ./cmd/cli

# Final stage — distroless static, non-root, pinned digest
FROM gcr.io/distroless/static-debian12:nonroot@sha256:d093aa3e30dbadd3efe1310db061a14da60299baff8450a17fe0ccc514a16639
COPY --from=builder /bin/api /api
COPY --from=builder --chown=65532:65532 /staging/data /data
USER nonroot:nonroot
EXPOSE 8080
# Distroless has no shell — orchestrator hits /health directly.
CMD ["/api"]
```

- [ ] **Step 9.2: Update docker-compose.yml**

Replace the `api:` service block in `infra/docker-compose.yml` and add a top-level `volumes:` section.

Open `infra/docker-compose.yml`. Update the `api:` service to add `SQLITE_PATH` env and `volumes: - api-data:/data`. At the end of the file (after the last service), add the volumes declaration. Final file:

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
    volumes:
      - api-data:/data
    restart: unless-stopped

  web:
    build:
      context: ..
      dockerfile: apps/web/Dockerfile
    ports:
      - '3333:3333'
    environment:
      NEXT_PUBLIC_API_URL: 'http://api:8080'
    depends_on:
      - api
    restart: unless-stopped

  cloudflared:
    image: cloudflare/cloudflared:latest
    profiles: [tunnel]
    restart: unless-stopped
    command: tunnel --no-autoupdate run
    environment:
      TUNNEL_TOKEN: ${CLOUDFLARE_TUNNEL_TOKEN:?CLOUDFLARE_TUNNEL_TOKEN não definido — copie infra/.env.example para infra/.env}
    depends_on:
      - api

volumes:
  api-data:
```

- [ ] **Step 9.3: Build container and verify start**

Run:
```bash
make compose-up
```

Expected: containers come up. Check logs:
```bash
cd infra && docker compose logs api --tail 20
```

Expected output includes: `API listening on :8080 (db=/data/votacao.db)`.

- [ ] **Step 9.4: Verify /health from inside Docker network**

Run:
```bash
curl -s http://localhost:8080/health
# Expected: {"ok":true,"db":"up"}
```

- [ ] **Step 9.5: Verify volume persistence across restarts**

Run:
```bash
cd infra && docker compose exec api ls -la /data
# Expected: votacao.db owned by 65532 (nonroot)
make compose-down
make compose-up
curl -s http://localhost:8080/health
# Expected: {"ok":true,"db":"up"} — DB persisted
```

- [ ] **Step 9.6: Verify volume survives docker compose down (without -v)**

Run:
```bash
docker volume ls | grep api-data
# Expected: volume listed
```

- [ ] **Step 9.7: Tear down**

Run:
```bash
make compose-down
```

- [ ] **Step 9.8: Commit**

```bash
git add apps/api/Dockerfile infra/docker-compose.yml
git commit -m "feat(infra): mount api-data volume at /data for SQLite persistence"
```

---

## Task 10: Update CLAUDE.md + roll the lint/build gate

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 10.1: Append Votação section to CLAUDE.md**

Open `CLAUDE.md` and add — after the existing "Mini Kanban PWA" section, before "Tools dashboard" — a new section:

```markdown
### Votação de Filmes (`/votacao`)

- **Status:** em construção (Fase 1: DB + store + volume Docker).
- **Design:** `docs/plans/2026-05-19-votacao-filmes-design.md`
- **Plano Fase 1:** `docs/plans/2026-05-19-votacao-fase1-plan.md`
- **Persistência:** SQLite (`modernc.org/sqlite` puro Go) em `/data/votacao.db` dentro do container Go API, volume Docker `api-data`.
- **Schema embutido:** `apps/api/internal/votacao/schema.sql` aplicado idempotentemente no startup (CREATE TABLE IF NOT EXISTS).
- **Store por entidade:** `users.go`, `sessions.go`, `movies.go`, `votes.go`, `backups.go` — todos no pacote `internal/votacao`. Testes colocated (`*_test.go`).
- **Health check:** `GET /health` agora retorna `{"ok":true,"db":"up"|"down"}` baseado em `db.PingContext`.
- **Próximas fases:** auth Google OAuth (Fase 2), Sheets reader + sorteio (Fase 3), TMDb + sessions handlers (Fase 4), votes + close + results (Fase 5), Drive backup + cron (Fase 6), Next.js UI (Fase 7), polimento (Fase 8).
```

Also add `SQLITE_PATH` to the env vars list and a line to the Go API section. Update the "Go API (apps/api)" subsection's bullet list to include:
- **Persistência:** SQLite via `modernc.org/sqlite` (puro Go, sem CGo). Volume Docker `api-data` montado em `/data`. Path configurável via env `SQLITE_PATH` (default `/data/votacao.db`).

Update the env vars block:
```
- `SQLITE_PATH` — caminho do arquivo SQLite no container (default `/data/votacao.db`)
```

- [ ] **Step 10.2: Final lint + test + build sweep**

Run:
```bash
cd apps/api && go vet ./... && go test ./... && go build ./...
```

Expected: all green.

- [ ] **Step 10.3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): document SQLite votacao package + Phase 1 plan link"
```

---

## Phase 1 Exit Criteria

- [ ] All 5 tables exist in `/data/votacao.db` after container starts
- [ ] CRUD methods for users, sessions, movies, votes, backups have ≥1 happy-path and ≥1 edge-case test each
- [ ] `make compose-up` brings the container up, `/health` returns `db:"up"`
- [ ] `make compose-down && make compose-up` preserves the DB file (volume persistence)
- [ ] `go vet ./...` clean
- [ ] `go test ./...` 100% pass
- [ ] CLAUDE.md updated with SQLite + votacao package documentation

---

## Notes for the implementer

- **modernc.org/sqlite quirks:** DSN pragmas use `_pragma=name(value)` syntax, not Go-level driver options. `time.Time` columns work out of the box with default `CURRENT_TIMESTAMP` format.
- **Foreign keys:** Per-connection setting in SQLite. The DSN pragma ensures every connection in the pool has it on.
- **WAL mode:** Better concurrent read/write than default rollback journal. Safe for the volume; produces `*.db-wal` and `*.db-shm` sidecar files.
- **Distroless volume ownership:** The `--chown=65532:65532` on `COPY` is critical. Without it, the volume mount might fail to write because the directory belongs to root.
- **Don't add scs `sessions` table to schema.sql.** Fase 2 lets `alexedwards/scs/sqlite3store` create it automatically.
- **Frequent commits:** 10 commits in this phase. Each task is independently mergeable.
