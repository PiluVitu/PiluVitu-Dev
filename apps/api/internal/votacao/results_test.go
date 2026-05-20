package votacao_test

import (
	"testing"

	"github.com/PiluVitu/api/internal/votacao"
)

func TestTallyVotes_Empty(t *testing.T) {
	got := votacao.TallyVotes(nil)
	if len(got) != 0 {
		t.Errorf("len = %d", len(got))
	}
}

func TestTallyVotes_Counts(t *testing.T) {
	votes := []votacao.Vote{
		{MovieID: 1}, {MovieID: 1}, {MovieID: 2}, {MovieID: 1}, {MovieID: 3},
	}
	got := votacao.TallyVotes(votes)
	want := map[int64]int{1: 3, 2: 1, 3: 1}
	if len(got) != len(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for k, v := range want {
		if got[k] != v {
			t.Errorf("movie %d = %d, want %d", k, got[k], v)
		}
	}
}

func TestComputeWinner_Empty(t *testing.T) {
	w := votacao.ComputeWinner(nil)
	if w != nil {
		t.Errorf("want nil, got %v", w)
	}
}

func TestComputeWinner_SingleWinner(t *testing.T) {
	votes := []votacao.Vote{{MovieID: 10}, {MovieID: 10}, {MovieID: 5}}
	w := votacao.ComputeWinner(votes)
	if w == nil || *w != 10 {
		t.Errorf("want 10, got %v", w)
	}
}

func TestComputeWinner_TieBreakerByLowestMovieID(t *testing.T) {
	// Each tied; lowest movie_id wins for determinism.
	votes := []votacao.Vote{{MovieID: 7}, {MovieID: 3}, {MovieID: 5}}
	w := votacao.ComputeWinner(votes)
	if w == nil || *w != 3 {
		t.Errorf("want 3 (lowest ID in tie), got %v", w)
	}
}
