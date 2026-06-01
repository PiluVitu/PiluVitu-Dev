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

func TestComputeTopMovies_Empty(t *testing.T) {
	ids, count := votacao.ComputeTopMovies(nil)
	if len(ids) != 0 || count != 0 {
		t.Errorf("want ([],0), got (%v,%d)", ids, count)
	}
}

func TestComputeTopMovies_ClearWinner(t *testing.T) {
	votes := []votacao.Vote{{MovieID: 10}, {MovieID: 10}, {MovieID: 5}}
	ids, count := votacao.ComputeTopMovies(votes)
	if len(ids) != 1 || ids[0] != 10 || count != 2 {
		t.Errorf("want ([10],2), got (%v,%d)", ids, count)
	}
}

func TestComputeTopMovies_Tie(t *testing.T) {
	// 7 and 3 tied at 2 each; 5 has 1. Tied ids returned sorted asc.
	votes := []votacao.Vote{
		{MovieID: 7}, {MovieID: 7}, {MovieID: 3}, {MovieID: 3}, {MovieID: 5},
	}
	ids, count := votacao.ComputeTopMovies(votes)
	if count != 2 {
		t.Fatalf("count = %d, want 2", count)
	}
	if len(ids) != 2 || ids[0] != 3 || ids[1] != 7 {
		t.Errorf("want [3 7], got %v", ids)
	}
}
