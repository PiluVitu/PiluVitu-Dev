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
	got, err := votacao.SortOnePerCategory(sample(), votacao.SortOptions{IncludeWatched: true}, rand.New(rand.NewSource(1)))
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
	wantCats := []string{"ação", "drama", "terror"}
	for i, w := range wantCats {
		if got[i].Category != w {
			t.Errorf("categories[%d] = %q, want %q", i, got[i].Category, w)
		}
	}
}
