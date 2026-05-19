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
	// 7 raw rows; row 5 (empty title) and row 6 (empty category) skipped → 5 valid.
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
