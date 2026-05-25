package votacao_test

import (
	"context"
	"errors"
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

func TestInsertVote_Happy(t *testing.T) {
	s, sess, movie, user := setupVoteScenario(t)
	if err := s.InsertVote(context.Background(), sess.ID, user.ID, movie.ID); err != nil {
		t.Fatalf("InsertVote: %v", err)
	}
	votes, err := s.ListVotesBySession(context.Background(), sess.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(votes) != 1 || votes[0].UserID != user.ID || votes[0].MovieID != movie.ID {
		t.Errorf("unexpected votes: %+v", votes)
	}
}

func TestInsertVote_DuplicateReturnsErrAlreadyVoted(t *testing.T) {
	s, sess, movie, user := setupVoteScenario(t)
	ctx := context.Background()
	if err := s.InsertVote(ctx, sess.ID, user.ID, movie.ID); err != nil {
		t.Fatal(err)
	}
	err := s.InsertVote(ctx, sess.ID, user.ID, movie.ID)
	if !errors.Is(err, votacao.ErrAlreadyVoted) {
		t.Errorf("err = %v, want ErrAlreadyVoted", err)
	}
}

func TestInsertVote_TwoUsersSameSession(t *testing.T) {
	s, sess, movie, user1 := setupVoteScenario(t)
	ctx := context.Background()
	user2, _ := s.UpsertUser(ctx, "sub2", "u2@x.com", "U2", "", nil)

	if err := s.InsertVote(ctx, sess.ID, user1.ID, movie.ID); err != nil {
		t.Fatal(err)
	}
	if err := s.InsertVote(ctx, sess.ID, user2.ID, movie.ID); err != nil {
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

func TestInsertVote_NonExistentMovieReturnsWrappedError(t *testing.T) {
	s, sess, _, user := setupVoteScenario(t)
	ctx := context.Background()

	// movie_id 999999 doesn't exist — should fail FK constraint, NOT match ErrAlreadyVoted
	err := s.InsertVote(ctx, sess.ID, user.ID, 999999)
	if err == nil {
		t.Fatal("expected error for non-existent movie_id")
	}
	if errors.Is(err, votacao.ErrAlreadyVoted) {
		t.Errorf("FK violation should NOT be ErrAlreadyVoted, got: %v", err)
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
	_ = s.InsertVote(context.Background(), sess.ID, user.ID, movie.ID)
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

	if err := s.InsertVote(ctx, sess.ID, user.ID, movie.ID); err != nil {
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

func TestGetUserVote_NotVoted(t *testing.T) {
	s, sess, _, user := setupVoteScenario(t)
	movieID, voted, err := s.GetUserVote(context.Background(), sess.ID, user.ID)
	if err != nil {
		t.Fatal(err)
	}
	if voted || movieID != 0 {
		t.Errorf("expected (0,false), got (%d,%v)", movieID, voted)
	}
}

func TestGetUserVote_ReturnsVotedMovie(t *testing.T) {
	s, sess, movie, user := setupVoteScenario(t)
	if err := s.InsertVote(context.Background(), sess.ID, user.ID, movie.ID); err != nil {
		t.Fatal(err)
	}
	movieID, voted, err := s.GetUserVote(context.Background(), sess.ID, user.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !voted || movieID != movie.ID {
		t.Errorf("expected (%d,true), got (%d,%v)", movie.ID, movieID, voted)
	}
}
