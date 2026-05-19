package votacao_test

import (
	"context"
	"errors"
	"testing"

	"github.com/PiluVitu/api/internal/votacao"
)

func seedUser(t *testing.T, s *votacao.Store) *votacao.User {
	t.Helper()
	u, err := s.UpsertUser(context.Background(), "sub-seed", "seed@example.com", "Seed", "", nil)
	if err != nil {
		t.Fatalf("seedUser: %v", err)
	}
	return u
}

func TestCreateVotingSession(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	user := seedUser(t, s)

	sess, err := s.CreateVotingSession(ctx, "Sexta 22/05", user.ID, `{"types":["filme"]}`)
	if err != nil {
		t.Fatalf("CreateVotingSession: %v", err)
	}
	if sess.ID == 0 {
		t.Error("id should be set")
	}
	if sess.Status != "open" {
		t.Errorf("status = %q, want open", sess.Status)
	}
	if sess.Title != "Sexta 22/05" {
		t.Errorf("title = %q", sess.Title)
	}
	if sess.SortOptionsJSON != `{"types":["filme"]}` {
		t.Errorf("sort_options_json = %q", sess.SortOptionsJSON)
	}
	if sess.ClosedAt != nil {
		t.Error("closed_at should be nil")
	}
	if sess.WinnerMovieID != nil {
		t.Error("winner_movie_id should be nil")
	}
}

func TestGetVotingSession_NotFound(t *testing.T) {
	s := newTestStore(t)
	_, err := s.GetVotingSession(context.Background(), 999)
	if !errors.Is(err, votacao.ErrNotFound) {
		t.Errorf("err = %v, want ErrNotFound", err)
	}
}

func TestListVotingSessions_OrderedDescending(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	user := seedUser(t, s)

	first, _ := s.CreateVotingSession(ctx, "First", user.ID, "{}")
	second, _ := s.CreateVotingSession(ctx, "Second", user.ID, "{}")

	list, err := s.ListVotingSessions(ctx, 10, 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 2 {
		t.Fatalf("len = %d, want 2", len(list))
	}
	if list[0].ID != second.ID {
		t.Errorf("first item id = %d, want %d (newest first)", list[0].ID, second.ID)
	}
	if list[1].ID != first.ID {
		t.Errorf("second item id = %d, want %d", list[1].ID, first.ID)
	}
}

func TestListVotingSessions_Pagination(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	user := seedUser(t, s)
	for i := 0; i < 5; i++ {
		_, _ = s.CreateVotingSession(ctx, "S", user.ID, "{}")
	}
	page1, _ := s.ListVotingSessions(ctx, 2, 0)
	page2, _ := s.ListVotingSessions(ctx, 2, 2)
	if len(page1) != 2 || len(page2) != 2 {
		t.Fatalf("pages: %d, %d", len(page1), len(page2))
	}
	if page1[0].ID == page2[0].ID {
		t.Error("pages overlap")
	}
}

func TestCloseVotingSession(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	user := seedUser(t, s)
	sess, _ := s.CreateVotingSession(ctx, "X", user.ID, "{}")

	if err := s.CloseVotingSession(ctx, sess.ID, nil); err != nil {
		t.Fatalf("CloseVotingSession: %v", err)
	}
	got, _ := s.GetVotingSession(ctx, sess.ID)
	if got.Status != "closed" {
		t.Errorf("status = %q", got.Status)
	}
	if got.ClosedAt == nil {
		t.Error("closed_at should be set")
	}
}

func TestCloseVotingSession_AlreadyClosedReturnsNotFound(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	user := seedUser(t, s)
	sess, _ := s.CreateVotingSession(ctx, "X", user.ID, "{}")
	_ = s.CloseVotingSession(ctx, sess.ID, nil)

	err := s.CloseVotingSession(ctx, sess.ID, nil)
	if !errors.Is(err, votacao.ErrNotFound) {
		t.Errorf("err = %v, want ErrNotFound (no open row to close)", err)
	}
}
