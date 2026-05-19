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
