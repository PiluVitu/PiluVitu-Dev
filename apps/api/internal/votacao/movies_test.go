package votacao_test

import (
	"context"
	"testing"

	"github.com/PiluVitu/api/internal/votacao"
)

func TestInsertSessionMovies_Bulk(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	user := seedUser(t, s)
	sess, _ := s.CreateVotingSession(ctx, "X", user.ID, "{}")

	tmdb := int64(550)
	sheet := int64(42)
	movies := []votacao.SessionMovie{
		{SessionID: sess.ID, Category: "terror", Title: "A Coisa", Type: "filme", PosterURL: "https://p", TMDbID: &tmdb, WasWatched: false, SheetNumber: &sheet},
		{SessionID: sess.ID, Category: "ação", Title: "John Wick", Type: "filme"},
	}
	if err := s.InsertSessionMovies(ctx, movies); err != nil {
		t.Fatalf("InsertSessionMovies: %v", err)
	}
	got, err := s.GetSessionMovies(ctx, sess.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 {
		t.Fatalf("len = %d, want 2", len(got))
	}
	if got[0].Title != "A Coisa" || got[0].Category != "terror" {
		t.Errorf("first row wrong: %+v", got[0])
	}
	if got[0].PosterURL != "https://p" {
		t.Errorf("poster_url = %q", got[0].PosterURL)
	}
	if got[1].PosterURL != "" {
		t.Errorf("expected empty poster_url, got %q", got[1].PosterURL)
	}
}

func TestInsertSessionMovies_UniqueCategoryPerSession(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	user := seedUser(t, s)
	sess, _ := s.CreateVotingSession(ctx, "X", user.ID, "{}")

	movies := []votacao.SessionMovie{
		{SessionID: sess.ID, Category: "terror", Title: "A", Type: "filme"},
		{SessionID: sess.ID, Category: "terror", Title: "B", Type: "filme"},
	}
	err := s.InsertSessionMovies(ctx, movies)
	if err == nil {
		t.Error("expected UNIQUE violation on duplicate category in same session")
	}
}

func TestInsertSessionMovies_EmptyIsNoop(t *testing.T) {
	s := newTestStore(t)
	if err := s.InsertSessionMovies(context.Background(), nil); err != nil {
		t.Errorf("empty insert should be no-op, got: %v", err)
	}
}

func TestGetSessionMovies_EmptyReturnsEmptySlice(t *testing.T) {
	s := newTestStore(t)
	got, err := s.GetSessionMovies(context.Background(), 999)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 0 {
		t.Errorf("expected empty slice, got len %d", len(got))
	}
}
