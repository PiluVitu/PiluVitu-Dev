package votacao

import (
	"context"

	"github.com/PiluVitu/api/internal/votacao"
)

// SheetsReader is the subset of gsheets.Client used by these handlers.
// Defined here so tests can inject a stub without depending on gsheets.
type SheetsReader interface {
	ReadMovies(ctx context.Context) ([]votacao.SheetMovie, error)
	GetCategories(ctx context.Context) ([]string, error)
}

// PosterSearcher is the subset of tmdb.Client used by these handlers.
type PosterSearcher interface {
	SearchPoster(ctx context.Context, title, mediaType string) (url string, tmdbID int64, err error)
}

// Backuper is invoked by CloseSession (async) after a successful close.
type Backuper interface {
	Run(ctx context.Context, trigger string) error
}

// Deps wires the votacao HTTP handlers to their collaborators.
type Deps struct {
	Store    *votacao.Store
	Sheets   SheetsReader
	Posters  PosterSearcher
	Backuper Backuper // OPTIONAL: nil → skip backup on close
}

// Handlers is the HTTP-layer entry point for /votacao/* routes.
type Handlers struct {
	deps Deps
}

// NewHandlers constructs a Handlers with the given dependencies.
func NewHandlers(deps Deps) *Handlers { return &Handlers{deps: deps} }
