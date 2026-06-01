package votacao_test

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/PiluVitu/api/internal/votacao"
)

func setupVoteScenario(t *testing.T) (*votacao.Store, *votacao.VotingSession, *votacao.SessionMovie, *votacao.User) {
	t.Helper()
	s := newTestStore(t)
	ctx := context.Background()
	user := seedUser(t, s)
	sess, err := s.CreateVotingSession(ctx, "X", user.ID, "{}")
	if err != nil {
		t.Fatal(err)
	}
	if err := s.InsertSessionMovies(ctx, []votacao.SessionMovie{
		{SessionID: sess.ID, Category: "terror", Title: "M", Type: "filme"},
	}); err != nil {
		t.Fatal(err)
	}
	movies, _ := s.GetSessionMovies(ctx, sess.ID)
	return s, sess, &movies[0], user
}

func seedSessionMovies(t *testing.T, s *votacao.Store, userID int64, cats ...string) (*votacao.VotingSession, []votacao.SessionMovie) {
	t.Helper()
	ctx := context.Background()
	sess, err := s.CreateVotingSession(ctx, "X", userID, "{}")
	if err != nil {
		t.Fatal(err)
	}
	rows := make([]votacao.SessionMovie, 0, len(cats))
	for i, c := range cats {
		rows = append(rows, votacao.SessionMovie{
			SessionID: sess.ID, Category: c, Title: fmt.Sprintf("M%d", i), Type: "filme",
		})
	}
	if err := s.InsertSessionMovies(ctx, rows); err != nil {
		t.Fatal(err)
	}
	movies, _ := s.GetSessionMovies(ctx, sess.ID)
	return sess, movies
}

func TestInsertVote_Happy(t *testing.T) {
	s, sess, movie, user := setupVoteScenario(t)
	if err := s.ReplaceUserVotes(context.Background(), sess.ID, user.ID, []int64{movie.ID}); err != nil {
		t.Fatalf("ReplaceUserVotes: %v", err)
	}
	votes, err := s.ListVotesBySession(context.Background(), sess.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(votes) != 1 || votes[0].UserID != user.ID || votes[0].MovieID != movie.ID {
		t.Errorf("unexpected votes: %+v", votes)
	}
}

func TestInsertVote_TwoUsersSameSession(t *testing.T) {
	s, sess, movie, user1 := setupVoteScenario(t)
	ctx := context.Background()
	user2, _ := s.UpsertUser(ctx, "sub2", "u2@x.com", "U2", "", nil)

	if err := s.ReplaceUserVotes(ctx, sess.ID, user1.ID, []int64{movie.ID}); err != nil {
		t.Fatal(err)
	}
	if err := s.ReplaceUserVotes(ctx, sess.ID, user2.ID, []int64{movie.ID}); err != nil {
		t.Errorf("second user should be able to vote: %v", err)
	}
}

func TestListVotesBySession_Empty(t *testing.T) {
	s := newTestStore(t)
	got, err := s.ListVotesBySession(context.Background(), 999)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 0 {
		t.Errorf("expected empty slice, got %d", len(got))
	}
}

func TestHasVoted_False(t *testing.T) {
	s, sess, _, user := setupVoteScenario(t)
	ok, err := s.HasVoted(context.Background(), sess.ID, user.ID)
	if err != nil {
		t.Fatal(err)
	}
	if ok {
		t.Error("HasVoted should be false before voting")
	}
}

func TestHasVoted_True(t *testing.T) {
	s, sess, movie, user := setupVoteScenario(t)
	_ = s.ReplaceUserVotes(context.Background(), sess.ID, user.ID, []int64{movie.ID})
	ok, err := s.HasVoted(context.Background(), sess.ID, user.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !ok {
		t.Error("HasVoted should be true after voting")
	}
}

func TestListSessionVotesWithUsers(t *testing.T) {
	s, sess, movie, user := setupVoteScenario(t)
	ctx := context.Background()

	// No votes yet.
	empty, err := s.ListSessionVotesWithUsers(ctx, sess.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(empty) != 0 {
		t.Errorf("expected 0 vote details, got %d", len(empty))
	}

	if err := s.ReplaceUserVotes(ctx, sess.ID, user.ID, []int64{movie.ID}); err != nil {
		t.Fatal(err)
	}
	details, err := s.ListSessionVotesWithUsers(ctx, sess.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(details) != 1 {
		t.Fatalf("expected 1 vote detail, got %d", len(details))
	}
	d := details[0]
	if d.UserID != user.ID || d.UserName != "Seed" || d.UserEmail != "seed@example.com" {
		t.Errorf("voter = %+v", d)
	}
	if d.MovieID != movie.ID || d.MovieTitle != "M" || d.Category != "terror" {
		t.Errorf("movie = %+v", d)
	}
}

func TestReplaceUserVotes(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	user := seedUser(t, s)
	sess, movies := seedSessionMovies(t, s, user.ID, "Ação", "Comédia", "Drama")
	m1, m2, m3 := movies[0].ID, movies[1].ID, movies[2].ID

	// First submission: approve m1 + m2.
	if err := s.ReplaceUserVotes(ctx, sess.ID, user.ID, []int64{m1, m2}); err != nil {
		t.Fatalf("replace 1: %v", err)
	}
	got, err := s.GetUserVotes(ctx, sess.ID, user.ID)
	if err != nil {
		t.Fatalf("get votes: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("want 2 votes, got %d", len(got))
	}

	// Re-submission replaces the set: now only m3.
	if err := s.ReplaceUserVotes(ctx, sess.ID, user.ID, []int64{m3}); err != nil {
		t.Fatalf("replace 2: %v", err)
	}
	got, _ = s.GetUserVotes(ctx, sess.ID, user.ID)
	if len(got) != 1 || got[0] != m3 {
		t.Fatalf("want [m3], got %v", got)
	}

	// Empty set clears the user's votes.
	if err := s.ReplaceUserVotes(ctx, sess.ID, user.ID, nil); err != nil {
		t.Fatalf("replace empty: %v", err)
	}
	got, _ = s.GetUserVotes(ctx, sess.ID, user.ID)
	if len(got) != 0 {
		t.Fatalf("want empty, got %v", got)
	}
}

func TestReplaceUserVotesRejectsForeignMovie(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	user := seedUser(t, s)
	sess, _ := seedSessionMovies(t, s, user.ID, "Ação")

	err := s.ReplaceUserVotes(ctx, sess.ID, user.ID, []int64{99999})
	if !errors.Is(err, votacao.ErrMovieNotInSession) {
		t.Fatalf("want ErrMovieNotInSession, got %v", err)
	}
}

func TestCountVoters(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	u1 := seedUser(t, s)
	u2, err := s.UpsertUser(ctx, "sub-c2", "c2@example.com", "C2", "", nil)
	if err != nil {
		t.Fatal(err)
	}
	sess, movies := seedSessionMovies(t, s, u1.ID, "Ação", "Comédia")

	_ = s.ReplaceUserVotes(ctx, sess.ID, u1.ID, []int64{movies[0].ID, movies[1].ID})
	_ = s.ReplaceUserVotes(ctx, sess.ID, u2.ID, []int64{movies[0].ID})

	voters, err := s.CountVoters(ctx, sess.ID)
	if err != nil {
		t.Fatalf("count voters: %v", err)
	}
	if voters != 2 {
		t.Fatalf("want 2 distinct voters, got %d", voters)
	}
}
