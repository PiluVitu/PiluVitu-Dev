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
