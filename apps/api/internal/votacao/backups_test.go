package votacao_test

import (
	"context"
	"testing"
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
