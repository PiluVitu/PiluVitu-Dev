package votacao_test

import (
	"context"
	"testing"

	"github.com/PiluVitu/api/internal/votacao"
)

func TestCreateTiebreakAndSetWinner(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	user := seedUser(t, s)
	sess, movies := seedSessionMovies(t, s, user.ID, "Ação", "Drama") // helper from Task 4.3
	m2 := movies[1].ID

	tb := votacao.TiebreakRecord{
		SessionID:     sess.ID,
		TriggeredBy:   user.ID,
		TiedIDsJSON:   "[1,2]",
		ClientEntropy: "deadbeef",
		ServerNonce:   "cafef00d",
		WinnerMovieID: m2,
	}
	if err := s.CreateTiebreak(ctx, tb); err != nil {
		t.Fatalf("create tiebreak: %v", err)
	}
	if err := s.SetSessionWinner(ctx, sess.ID, m2, "roulette"); err != nil {
		t.Fatalf("set winner: %v", err)
	}

	got, err := s.GetVotingSession(ctx, sess.ID)
	if err != nil {
		t.Fatalf("get session: %v", err)
	}
	if got.WinnerMovieID == nil || *got.WinnerMovieID != m2 {
		t.Fatalf("winner not set: %+v", got)
	}
	if _, err := s.GetTiebreakBySession(ctx, sess.ID); err != nil {
		t.Fatalf("audit row missing: %v", err)
	}
}
