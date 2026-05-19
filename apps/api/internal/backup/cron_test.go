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
