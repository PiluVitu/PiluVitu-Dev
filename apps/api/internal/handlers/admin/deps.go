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
