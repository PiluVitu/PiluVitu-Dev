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

func TestListUsers_EmptyAndPopulated(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	empty, err := s.ListUsers(ctx)
	if err != nil {
		t.Fatalf("ListUsers: %v", err)
	}
	if len(empty) != 0 {
		t.Errorf("expected 0 users, got %d", len(empty))
	}

	if _, err := s.UpsertUser(ctx, "sub-a", "a@x.com", "Alice", "", nil); err != nil {
		t.Fatal(err)
	}
	if _, err := s.UpsertUser(ctx, "sub-b", "b@x.com", "Bob", "", []string{"b@x.com"}); err != nil {
		t.Fatal(err)
	}

	users, err := s.ListUsers(ctx)
	if err != nil {
		t.Fatalf("ListUsers: %v", err)
	}
	if len(users) != 2 {
		t.Fatalf("expected 2 users, got %d", len(users))
	}
	// Newest first (Bob inserted last) — ties broken by id DESC.
	if users[0].Email != "b@x.com" || !users[0].IsAdmin {
		t.Errorf("first user = %+v, want Bob/admin", users[0])
	}
	if users[1].Email != "a@x.com" {
		t.Errorf("second user = %+v, want Alice", users[1])
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

func TestUpsertUser_DowngradeFromAdmin(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	u, _ := s.UpsertUser(ctx, "sub", "p@x.com", "P", "", []string{"p@x.com"})
	if !u.IsAdmin {
		t.Fatal("precondition: should start admin")
	}
	u, err := s.UpsertUser(ctx, "sub", "p@x.com", "P", "", nil)
	if err != nil {
		t.Fatal(err)
	}
	if u.IsAdmin {
		t.Error("should be demoted when removed from allowlist")
	}
}

func TestUpsertUser_EmptyPictureRoundTrip(t *testing.T) {
	s := newTestStore(t)
	u, err := s.UpsertUser(context.Background(), "sub", "x@x.com", "X", "", nil)
	if err != nil {
		t.Fatal(err)
	}
	if u.Picture != "" {
		t.Errorf("Picture = %q, want empty string", u.Picture)
	}
}
