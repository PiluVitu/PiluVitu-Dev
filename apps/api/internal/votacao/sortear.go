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
