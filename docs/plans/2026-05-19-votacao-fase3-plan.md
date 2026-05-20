# Votação de Filmes — Fase 3: Sheets Reader + Sorteio Puro

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o leitor da planilha Google Sheets (`internal/gsheets`) e o sorteador puro (`internal/votacao/sortear.go`) — ambos com testes herméticos (sem chamar Google de verdade).

**Architecture:**
- `SheetMovie` definido em `internal/votacao/` (domínio) — gsheets depende de votacao para o tipo, não o inverso para Store.
- `gsheets.Client` constrói o `*sheets.Service` via Service Account em prod; em testes injetamos um `*sheets.Service` apontando para `httptest.Server` (via `option.WithEndpoint` + `option.WithoutAuthentication`).
- `SortOnePerCategory` é função pura — recebe `*rand.Rand` para determinismo nos testes.

**Tech Stack:** Go 1.25, `google.golang.org/api/sheets/v4` (já transitiva pela Fase 2), `google.golang.org/api/option`.

**Reference design:** `docs/plans/2026-05-19-votacao-filmes-design.md` (seções "Setup Google", "Layout da planilha", "Sorteio").

**Pré-requisito de Fase 2:** branch `feat/votacao-fase3` partindo de `feat/votacao-fase2` (não mergeado ainda).

---

## File Structure

```
apps/api/internal/votacao/
  sortear.go              # SheetMovie, SortOptions, ErrNoCandidates, SortOnePerCategory
  sortear_test.go         # 100% cobertura: filtros, agrupamento, casos vazios, determinismo
apps/api/internal/gsheets/
  client.go               # Client struct + NewClient (prod) + NewClientWithService (test)
  movies.go               # ReadMovies + GetCategories + parseRow
  movies_test.go          # httptest.Server + JSON fixtures
  fixtures_test.go        # sample sheets.ValueRange JSON bodies
apps/api/cmd/api/main.go  # MODIFIED: build gsheets.Client (se env presente, opcional na fase 3)
infra/docker-compose.yml  # MODIFIED: GSHEETS_* env passthrough + secret mount (read-only)
apps/api/.env.example     # MODIFIED: GSHEETS_* + GOOGLE_APPLICATION_CREDENTIALS
CLAUDE.md                 # MODIFIED: documentar gsheets + sortear
```

---

## Task 1: SheetMovie + SortOnePerCategory (pure)

**Files:**
- Create: `apps/api/internal/votacao/sortear.go`
- Create: `apps/api/internal/votacao/sortear_test.go`

- [ ] **Step 1.1: Write failing tests**

Create `apps/api/internal/votacao/sortear_test.go`:

```go
package votacao_test

import (
	"errors"
	"math/rand"
	"testing"

	"github.com/PiluVitu/api/internal/votacao"
)

func sample() []votacao.SheetMovie {
	return []votacao.SheetMovie{
		{Number: 1, Title: "A Coisa", Type: "filme", Category: "terror", Watched: false},
		{Number: 2, Title: "Hereditário", Type: "filme", Category: "terror", Watched: false},
		{Number: 3, Title: "John Wick", Type: "filme", Category: "ação", Watched: true},
		{Number: 4, Title: "Breaking Bad", Type: "serie", Category: "drama", Watched: false},
		{Number: 5, Title: "Forrest Gump", Type: "filme", Category: "drama", Watched: false},
	}
}

func TestSortOnePerCategory_HappyPath(t *testing.T) {
	got, err := votacao.SortOnePerCategory(sample(), votacao.SortOptions{}, rand.New(rand.NewSource(1)))
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 3 {
		t.Fatalf("got %d, want 3 categories", len(got))
	}
	seen := map[string]bool{}
	for _, m := range got {
		if seen[m.Category] {
			t.Errorf("duplicate category %q", m.Category)
		}
		seen[m.Category] = true
	}
}

func TestSortOnePerCategory_FilterByType(t *testing.T) {
	got, err := votacao.SortOnePerCategory(sample(), votacao.SortOptions{Types: []string{"serie"}}, rand.New(rand.NewSource(1)))
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].Type != "serie" {
		t.Errorf("got %+v, want exactly the serie", got)
	}
}

func TestSortOnePerCategory_ExcludeWatched(t *testing.T) {
	got, err := votacao.SortOnePerCategory(sample(), votacao.SortOptions{IncludeWatched: false}, rand.New(rand.NewSource(1)))
	if err != nil {
		t.Fatal(err)
	}
	for _, m := range got {
		if m.Watched {
			t.Errorf("watched movie leaked: %+v", m)
		}
	}
}

func TestSortOnePerCategory_IncludeWatched(t *testing.T) {
	got, err := votacao.SortOnePerCategory(sample(), votacao.SortOptions{IncludeWatched: true}, rand.New(rand.NewSource(1)))
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 3 {
		t.Errorf("got %d categories, want 3", len(got))
	}
}

func TestSortOnePerCategory_FilterByCategories(t *testing.T) {
	got, err := votacao.SortOnePerCategory(sample(), votacao.SortOptions{Categories: []string{"terror", "drama"}, IncludeWatched: true}, rand.New(rand.NewSource(1)))
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 {
		t.Fatalf("got %d, want 2", len(got))
	}
	for _, m := range got {
		if m.Category != "terror" && m.Category != "drama" {
			t.Errorf("unexpected category %q", m.Category)
		}
	}
}

func TestSortOnePerCategory_NoCandidates(t *testing.T) {
	_, err := votacao.SortOnePerCategory(nil, votacao.SortOptions{}, rand.New(rand.NewSource(1)))
	if !errors.Is(err, votacao.ErrNoCandidates) {
		t.Errorf("err = %v, want ErrNoCandidates", err)
	}
}

func TestSortOnePerCategory_NoCandidatesAfterFilter(t *testing.T) {
	movies := []votacao.SheetMovie{{Title: "Only", Type: "filme", Category: "terror", Watched: true}}
	_, err := votacao.SortOnePerCategory(movies, votacao.SortOptions{IncludeWatched: false}, rand.New(rand.NewSource(1)))
	if !errors.Is(err, votacao.ErrNoCandidates) {
		t.Errorf("err = %v, want ErrNoCandidates", err)
	}
}

func TestSortOnePerCategory_DeterministicWithSeed(t *testing.T) {
	movies := sample()
	a, _ := votacao.SortOnePerCategory(movies, votacao.SortOptions{IncludeWatched: true}, rand.New(rand.NewSource(42)))
	b, _ := votacao.SortOnePerCategory(movies, votacao.SortOptions{IncludeWatched: true}, rand.New(rand.NewSource(42)))
	if len(a) != len(b) {
		t.Fatal("length mismatch")
	}
	for i := range a {
		if a[i] != b[i] {
			t.Errorf("seed=42 not deterministic at index %d: %+v vs %+v", i, a[i], b[i])
		}
	}
}

func TestSortOnePerCategory_OrderedByCategoryAlpha(t *testing.T) {
	got, err := votacao.SortOnePerCategory(sample(), votacao.SortOptions{IncludeWatched: true}, rand.New(rand.NewSource(1)))
	if err != nil {
		t.Fatal(err)
	}
	// Categories alphabetically: ação, drama, terror — ensures stable output across runs.
	wantCats := []string{"ação", "drama", "terror"}
	for i, w := range wantCats {
		if got[i].Category != w {
			t.Errorf("categories[%d] = %q, want %q", i, got[i].Category, w)
		}
	}
}
```

- [ ] **Step 1.2: Run, confirm failure**

```bash
cd apps/api && go test ./internal/votacao/... -run Sort -v
```

Expected: build error — types undefined.

- [ ] **Step 1.3: Implement sortear.go**

Create `apps/api/internal/votacao/sortear.go`:

```go
package votacao

import (
	"errors"
	"math/rand"
	"slices"
)

// SheetMovie is one parsed row from the Google Sheets catalog.
type SheetMovie struct {
	Number   int
	Title    string
	Type     string // "filme" | "serie"
	Category string // normalized to lowercase
	Watched  bool
}

// SortOptions controls which subset of SheetMovies is eligible for sorting.
type SortOptions struct {
	Types          []string // ["filme"], ["serie"], both, or empty = both
	IncludeWatched bool     // false = exclude already-watched rows
	Categories     []string // subset of categories to consider; empty = all
}

// ErrNoCandidates is returned when no movie passes the filter.
var ErrNoCandidates = errors.New("votacao: no movie candidates after filter")

// SortOnePerCategory picks exactly one movie per category from the input set,
// after applying the filters in opts. Categories are iterated in alphabetical
// order so the output sequence is stable for a given (input, opts) pair.
func SortOnePerCategory(movies []SheetMovie, opts SortOptions, rng *rand.Rand) ([]SheetMovie, error) {
	filtered := filterMovies(movies, opts)
	if len(filtered) == 0 {
		return nil, ErrNoCandidates
	}
	byCat := map[string][]SheetMovie{}
	for _, m := range filtered {
		byCat[m.Category] = append(byCat[m.Category], m)
	}
	cats := make([]string, 0, len(byCat))
	for k := range byCat {
		cats = append(cats, k)
	}
	slices.Sort(cats)

	out := make([]SheetMovie, 0, len(cats))
	for _, c := range cats {
		list := byCat[c]
		out = append(out, list[rng.Intn(len(list))])
	}
	return out, nil
}

func filterMovies(movies []SheetMovie, opts SortOptions) []SheetMovie {
	allowedTypes := stringSet(opts.Types)
	allowedCats := stringSet(opts.Categories)
	out := make([]SheetMovie, 0, len(movies))
	for _, m := range movies {
		if !opts.IncludeWatched && m.Watched {
			continue
		}
		if len(allowedTypes) > 0 && !allowedTypes[m.Type] {
			continue
		}
		if len(allowedCats) > 0 && !allowedCats[m.Category] {
			continue
		}
		out = append(out, m)
	}
	return out
}

func stringSet(values []string) map[string]bool {
	if len(values) == 0 {
		return nil
	}
	m := make(map[string]bool, len(values))
	for _, v := range values {
		m[v] = true
	}
	return m
}
```

- [ ] **Step 1.4: Run, confirm pass**

```bash
cd apps/api && go test ./internal/votacao/... -run Sort -v
```

Expected: all 9 sortear tests pass.

- [ ] **Step 1.5: Commit**

```bash
git add apps/api/internal/votacao/sortear.go apps/api/internal/votacao/sortear_test.go
git commit -m "feat(votacao): SortOnePerCategory pure sorter + SheetMovie type"
```

---

## Task 2: gsheets.Client (dual constructor)

**Files:**
- Create: `apps/api/internal/gsheets/client.go`

This task has no dedicated tests; the client is exercised end-to-end via the `ReadMovies` tests in Task 3.

- [ ] **Step 2.1: Implement client.go**

Create `apps/api/internal/gsheets/client.go`:

```go
package gsheets

import (
	"context"
	"fmt"

	"google.golang.org/api/option"
	"google.golang.org/api/sheets/v4"
)

// Client is a thin wrapper around the Google Sheets v4 service.
// Production code calls NewClient with a Service Account JSON file path.
// Tests construct a *sheets.Service against an httptest.Server and call
// NewClientWithService directly.
type Client struct {
	svc           *sheets.Service
	spreadsheetID string
	rangeA1       string
}

// NewClient builds a Sheets client using Application Default Credentials
// (typically a Service Account JSON loaded via GOOGLE_APPLICATION_CREDENTIALS).
func NewClient(ctx context.Context, spreadsheetID, rangeA1 string) (*Client, error) {
	svc, err := sheets.NewService(ctx,
		option.WithScopes(sheets.SpreadsheetsReadonlyScope),
	)
	if err != nil {
		return nil, fmt.Errorf("gsheets: build service: %w", err)
	}
	return NewClientWithService(svc, spreadsheetID, rangeA1), nil
}

// NewClientWithService constructs a Client around a pre-built *sheets.Service.
// Used by tests that point the service at an httptest.Server.
func NewClientWithService(svc *sheets.Service, spreadsheetID, rangeA1 string) *Client {
	return &Client{svc: svc, spreadsheetID: spreadsheetID, rangeA1: rangeA1}
}
```

- [ ] **Step 2.2: Verify build**

```bash
cd apps/api && go build ./internal/gsheets/...
```

Expected: build OK.

- [ ] **Step 2.3: Commit**

```bash
git add apps/api/internal/gsheets/client.go
git commit -m "feat(gsheets): Client with dual constructor (prod + test)"
```

---

## Task 3: ReadMovies + parseRow + GetCategories

**Files:**
- Create: `apps/api/internal/gsheets/movies.go`
- Create: `apps/api/internal/gsheets/movies_test.go`
- Create: `apps/api/internal/gsheets/fixtures_test.go`

### Step 3.1: Write failing tests

Create `apps/api/internal/gsheets/fixtures_test.go`:

```go
package gsheets_test

// validValueRange is the JSON body the Google Sheets API returns for a
// values:get call. Rows follow the layout: A=Nº, B=Título, C=Filme/Série,
// D=Gênero, E=Assistido?, F=Nota (ignored).
const validValueRange = `{
  "range": "Filmes!A2:F",
  "majorDimension": "ROWS",
  "values": [
    ["1", "A Coisa",      "Filme", "Terror", "Não", ""],
    ["2", "John Wick",    "Filme", "Ação",   "Sim", "8"],
    ["3", "Hereditário",  "Filme", "TERROR", "não", ""],
    ["4", "Breaking Bad", "Série", "Drama",  "Não", ""],
    ["5", "",             "Filme", "Drama",  "Não", ""],
    ["6", "Sem Categoria","Filme", "",       "Não", ""],
    ["7", "Trailing",     "Filme", " Comédia ", "Não", ""]
  ]
}`

const emptyValueRange = `{"range":"Filmes!A2:F","majorDimension":"ROWS","values":[]}`
```

Create `apps/api/internal/gsheets/movies_test.go`:

```go
package gsheets_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"google.golang.org/api/option"
	"google.golang.org/api/sheets/v4"

	"github.com/PiluVitu/api/internal/gsheets"
)

func newFixtureClient(t *testing.T, body string) *gsheets.Client {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)

	svc, err := sheets.NewService(context.Background(),
		option.WithEndpoint(srv.URL),
		option.WithoutAuthentication(),
	)
	if err != nil {
		t.Fatalf("sheets.NewService: %v", err)
	}
	return gsheets.NewClientWithService(svc, "fake-sheet-id", "Filmes!A2:F")
}

func TestReadMovies_ParsesValidRows(t *testing.T) {
	c := newFixtureClient(t, validValueRange)
	got, err := c.ReadMovies(context.Background())
	if err != nil {
		t.Fatalf("ReadMovies: %v", err)
	}
	// 7 raw rows: row 5 (empty title) and row 6 (empty category) skipped → 5 valid.
	if len(got) != 5 {
		t.Fatalf("got %d, want 5", len(got))
	}
	first := got[0]
	if first.Number != 1 || first.Title != "A Coisa" || first.Type != "filme" || first.Category != "terror" || first.Watched {
		t.Errorf("first row mis-parsed: %+v", first)
	}
}

func TestReadMovies_NormalizesCategoryToLowerAndTrims(t *testing.T) {
	c := newFixtureClient(t, validValueRange)
	got, _ := c.ReadMovies(context.Background())
	// "Hereditário" row has category "TERROR" — must normalize.
	// "Trailing" row has " Comédia " — must trim AND lowercase.
	hasTerror, hasComedia := false, false
	for _, m := range got {
		if m.Title == "Hereditário" && m.Category == "terror" {
			hasTerror = true
		}
		if m.Title == "Trailing" && m.Category == "comédia" {
			hasComedia = true
		}
	}
	if !hasTerror {
		t.Error("Hereditário category not normalized to lowercase")
	}
	if !hasComedia {
		t.Error("Trailing category not trimmed+lowercased")
	}
}

func TestReadMovies_ParsesType(t *testing.T) {
	c := newFixtureClient(t, validValueRange)
	got, _ := c.ReadMovies(context.Background())
	for _, m := range got {
		if m.Title == "Breaking Bad" && m.Type != "serie" {
			t.Errorf("Breaking Bad type = %q, want serie", m.Type)
		}
		if m.Title == "A Coisa" && m.Type != "filme" {
			t.Errorf("A Coisa type = %q, want filme", m.Type)
		}
	}
}

func TestReadMovies_ParsesWatchedFlag(t *testing.T) {
	c := newFixtureClient(t, validValueRange)
	got, _ := c.ReadMovies(context.Background())
	for _, m := range got {
		if m.Title == "John Wick" && !m.Watched {
			t.Errorf("John Wick should be watched")
		}
		if m.Title == "A Coisa" && m.Watched {
			t.Errorf("A Coisa should NOT be watched")
		}
		if m.Title == "Hereditário" && m.Watched {
			t.Errorf("Hereditário (lower-case 'não') should not be watched")
		}
	}
}

func TestReadMovies_SkipsRowsWithoutTitleOrCategory(t *testing.T) {
	c := newFixtureClient(t, validValueRange)
	got, _ := c.ReadMovies(context.Background())
	for _, m := range got {
		if m.Title == "" || m.Category == "" {
			t.Errorf("row should have been skipped: %+v", m)
		}
		if m.Title == "Sem Categoria" {
			t.Error("row with empty category should not appear")
		}
	}
}

func TestReadMovies_EmptySheet(t *testing.T) {
	c := newFixtureClient(t, emptyValueRange)
	got, err := c.ReadMovies(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 0 {
		t.Errorf("empty sheet should yield 0 rows, got %d", len(got))
	}
}

func TestGetCategories_DedupAndSorted(t *testing.T) {
	c := newFixtureClient(t, validValueRange)
	cats, err := c.GetCategories(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	// Expected unique cats from sample: ação, comédia, drama, terror
	want := []string{"ação", "comédia", "drama", "terror"}
	if len(cats) != len(want) {
		t.Fatalf("got %v, want %v", cats, want)
	}
	for i, w := range want {
		if cats[i] != w {
			t.Errorf("cats[%d] = %q, want %q", i, cats[i], w)
		}
	}
}
```

### Step 3.2: Run failing tests

```bash
cd apps/api && go test ./internal/gsheets/... -v
```

Expected: build error — `ReadMovies`, `GetCategories` undefined on `*Client`.

### Step 3.3: Implement movies.go

Create `apps/api/internal/gsheets/movies.go`:

```go
package gsheets

import (
	"context"
	"fmt"
	"slices"
	"strconv"
	"strings"

	"github.com/PiluVitu/api/internal/votacao"
)

// ReadMovies fetches the configured A1 range and parses each row into a
// votacao.SheetMovie. Rows missing a title or a category are skipped.
func (c *Client) ReadMovies(ctx context.Context) ([]votacao.SheetMovie, error) {
	resp, err := c.svc.Spreadsheets.Values.Get(c.spreadsheetID, c.rangeA1).Context(ctx).Do()
	if err != nil {
		return nil, fmt.Errorf("gsheets: read values: %w", err)
	}
	out := make([]votacao.SheetMovie, 0, len(resp.Values))
	for _, row := range resp.Values {
		m, ok := parseRow(row)
		if !ok {
			continue
		}
		out = append(out, m)
	}
	return out, nil
}

// GetCategories returns the deduplicated list of categories present in the
// sheet, in alphabetical order. Empty categories are excluded.
func (c *Client) GetCategories(ctx context.Context) ([]string, error) {
	movies, err := c.ReadMovies(ctx)
	if err != nil {
		return nil, err
	}
	seen := map[string]bool{}
	for _, m := range movies {
		seen[m.Category] = true
	}
	out := make([]string, 0, len(seen))
	for k := range seen {
		out = append(out, k)
	}
	slices.Sort(out)
	return out, nil
}

// parseRow extracts a SheetMovie from a single row. Returns ok=false when
// the row is unusable (missing title or category, or column count too small).
//
// Column layout: A=Nº, B=Título, C=Filme/Série, D=Gênero, E=Assistido?, F=Nota.
func parseRow(row []any) (votacao.SheetMovie, bool) {
	if len(row) < 5 {
		return votacao.SheetMovie{}, false
	}
	title := strings.TrimSpace(cellString(row[1]))
	category := strings.ToLower(strings.TrimSpace(cellString(row[3])))
	if title == "" || category == "" {
		return votacao.SheetMovie{}, false
	}
	number, _ := strconv.Atoi(strings.TrimSpace(cellString(row[0])))
	return votacao.SheetMovie{
		Number:   number,
		Title:    title,
		Type:     normalizeType(cellString(row[2])),
		Category: category,
		Watched:  parseYesNo(cellString(row[4])),
	}, true
}

func cellString(v any) string {
	s, _ := v.(string)
	return s
}

func normalizeType(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "serie", "série":
		return "serie"
	default:
		return "filme"
	}
}

func parseYesNo(raw string) bool {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "sim", "yes", "true", "1":
		return true
	default:
		return false
	}
}
```

### Step 3.4: Run, confirm pass

```bash
cd apps/api && go test ./internal/gsheets/... -v
```

Expected: 7 tests pass.

### Step 3.5: Commit

```bash
git add apps/api/internal/gsheets/movies.go apps/api/internal/gsheets/movies_test.go apps/api/internal/gsheets/fixtures_test.go
git commit -m "feat(gsheets): ReadMovies + GetCategories with row parsing"
```

---

## Task 4: env.example + docker-compose passthrough + secret mount

**Files:**
- Modify: `apps/api/.env.example`
- Modify: `infra/docker-compose.yml`

### Step 4.1: Append to apps/api/.env.example

Open `apps/api/.env.example` and append:

```dotenv

# Google Sheets — Service Account credentials path (mounted read-only into the container).
GOOGLE_APPLICATION_CREDENTIALS=/secrets/google-sa.json

# The spreadsheet to read movie candidates from. Copy from the share URL.
GSHEETS_MOVIES_SPREADSHEET_ID=

# A1 range. Default skips header row (A1). Cols A–F per layout doc.
GSHEETS_MOVIES_RANGE=A2:F
```

### Step 4.2: Pass the new envs through docker-compose

Edit the `api:` service in `infra/docker-compose.yml`. Inside the `environment:` block (after the existing `SESSION_COOKIE_SECURE` line), append:

```yaml
      GOOGLE_APPLICATION_CREDENTIALS: ${GOOGLE_APPLICATION_CREDENTIALS:-/secrets/google-sa.json}
      GSHEETS_MOVIES_SPREADSHEET_ID: ${GSHEETS_MOVIES_SPREADSHEET_ID:-}
      GSHEETS_MOVIES_RANGE: ${GSHEETS_MOVIES_RANGE:-A2:F}
```

Add a `volumes:` entry to the `api:` service so the SA JSON is mounted read-only (alongside the existing `api-data:/data` mount). Replace the `volumes:` block inside `api:` with:

```yaml
    volumes:
      - api-data:/data
      - ../infra/secrets:/secrets:ro
```

> If the host directory `infra/secrets/` doesn't exist yet, that's fine: `docker compose` will create an empty bind source. The user adds `google-sa.json` there before the first `compose up`.

### Step 4.3: Verify nothing breaks

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/api && go vet ./... && go test ./... && go build ./...
```

Expected: green. (No new consumer of GSHEETS_* env yet — Task 5 wires it.)

### Step 4.4: Commit

```bash
git add apps/api/.env.example infra/docker-compose.yml
git commit -m "feat(infra): wire GSHEETS_* env + mount /secrets:ro for Service Account JSON"
```

---

## Task 5: Optional wiring in main.go (gsheets client constructed if env present)

**Files:**
- Modify: `apps/api/cmd/api/main.go`

Constructing the gsheets client in main is OPTIONAL for Phase 3 — Phase 4 will plumb it into the handlers. But constructing here proves the wiring is correct and surfaces config errors at boot.

### Step 5.1: Update main.go

Replace `apps/api/cmd/api/main.go` to add the gsheets client construction. Keep everything else intact:

```go
package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"strings"

	"github.com/PiluVitu/api/internal/auth"
	"github.com/PiluVitu/api/internal/gsheets"
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

	// Optional gsheets client — only built when both env vars are set. Failing
	// to build is logged but does not abort startup, so Phase 3 stays decoupled
	// from real Google credentials in local dev.
	if sheetID := os.Getenv("GSHEETS_MOVIES_SPREADSHEET_ID"); sheetID != "" {
		rangeA1 := os.Getenv("GSHEETS_MOVIES_RANGE")
		if rangeA1 == "" {
			rangeA1 = "A2:F"
		}
		if _, gerr := gsheets.NewClient(context.Background(), sheetID, rangeA1); gerr != nil {
			fmt.Fprintf(os.Stderr, "gsheets: %v (continuing without sheets)\n", gerr)
		}
	}

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

### Step 5.2: Verify build + tests

```bash
cd apps/api && go vet ./... && go test ./... && go build ./...
```

Expected: green. Test count stable.

### Step 5.3: Commit

```bash
git add apps/api/cmd/api/main.go
git commit -m "feat(api): optionally construct gsheets.Client at startup"
```

---

## Task 6: CLAUDE.md docs + final sweep

**Files:**
- Modify: `CLAUDE.md`

### Step 6.1: Update CLAUDE.md

Find the "Votação de Filmes" section. Update the Status line to:

```
- **Status:** em construção (Fase 3 concluída: Sheets reader + sorteio puro; Fase 2 entregou Auth Google; Fase 1 entregou DB + store + volume Docker).
```

After the existing "Auth Google" sub-section, add:

```markdown
#### Sheets reader + sorteio (`internal/gsheets`, `internal/votacao/sortear.go`)

- **gsheets.Client:** wrapper sobre `google.golang.org/api/sheets/v4`. Constructor de prod (`NewClient`) usa Application Default Credentials (Service Account JSON via `GOOGLE_APPLICATION_CREDENTIALS`). Constructor de teste (`NewClientWithService`) recebe um `*sheets.Service` já configurado — usado nos testes apontando pra um `httptest.Server` com fixtures JSON.
- **ReadMovies:** lê o range `GSHEETS_MOVIES_RANGE` da planilha `GSHEETS_MOVIES_SPREADSHEET_ID` e retorna `[]votacao.SheetMovie`. Linhas sem título ou categoria são puladas. Categoria é normalizada pra lowercase + trim. Tipo aceita "filme"/"série"; default filme. Watched aceita "sim/yes/true/1" (case-insensitive).
- **GetCategories:** retorna lista deduplicada e ordenada de categorias presentes na planilha — usado pelo modal "Nova votação" no front (Fase 7).
- **SortOnePerCategory:** função pura. Filtra por `Types` / `IncludeWatched` / `Categories`, agrupa por categoria, sorteia 1 por grupo. Categorias iteradas em ordem alfabética → saída estável. Determinístico com `*rand.Rand` injetado. Retorna `ErrNoCandidates` se nenhum sobrevive aos filtros.
- **Secret mount:** `infra/secrets/google-sa.json` é montado em `/secrets:ro` dentro do container. Compose não falha se o arquivo não existir; quem usa gsheets em runtime é que vai dar erro.
```

In the env vars list, append:

```markdown
- `GOOGLE_APPLICATION_CREDENTIALS` — caminho do JSON da Service Account dentro do container (default `/secrets/google-sa.json`).
- `GSHEETS_MOVIES_SPREADSHEET_ID` — ID da planilha (extraído da URL do Sheets). Sem isso o gsheets fica desligado.
- `GSHEETS_MOVIES_RANGE` — A1 notation. Default `A2:F` (pula header).
```

### Step 6.2: Final lint + test + build

```bash
cd apps/api && go vet ./... && go test ./... && go build ./...
```

Expected: green. Auth: 24, votacao: ~30+9 sortear, gsheets: 7, router: 9.

### Step 6.3: Commit

```bash
git add CLAUDE.md
git commit -m "docs(claude): document gsheets reader + sortear pure function"
```

---

## Phase 3 Exit Criteria

- [ ] `SortOnePerCategory` 100% testado (9 tests: happy, type filter, watched filter, category filter, empty/no-candidates, determinism, alpha order)
- [ ] `gsheets.ReadMovies` parses 7 sample rows correctly via fixture HTTP server (no real Google calls in tests)
- [ ] `gsheets.GetCategories` returns deduplicated + sorted list
- [ ] Secret mount path documented in docker-compose
- [ ] `go vet` + `go test ./...` + `go build` green
- [ ] CLAUDE.md updated

---

## Notes for the implementer

- **SheetMovie lives in `votacao`, NOT in `gsheets`.** This means `gsheets` imports `votacao` for the type — that's intentional (votacao is the domain, gsheets is infrastructure). One-way dependency.
- **`google.golang.org/api/sheets/v4`** is a transitive dep of `google.golang.org/api` which was already pulled in Phase 2. It will become a direct dep automatically when imported in Task 2.
- **Tests use `httptest.Server` + `option.WithEndpoint(srv.URL)` + `option.WithoutAuthentication()`.** This pattern is canonical for hermetic Google API tests. The server returns the JSON body the real API would return for `values:get`.
- **`parseRow` lives in `movies.go` (private)**, not exported. Tests exercise it through `ReadMovies` end-to-end.
- **No real `infra/secrets/` directory created in this phase.** The user creates it manually before deploying.
- **Frequent commits:** 6 commits in this phase.
