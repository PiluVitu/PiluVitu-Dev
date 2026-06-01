package votacao_test

import (
	"testing"

	"github.com/PiluVitu/api/internal/votacao"
)

func TestTiebreakSeedIsDeterministicAndOrderIndependent(t *testing.T) {
	ce := []byte{1, 2, 3}
	sn := []byte{9, 8, 7}
	a := votacao.TiebreakSeed(ce, sn, 5, []int64{30, 10, 20})
	b := votacao.TiebreakSeed(ce, sn, 5, []int64{10, 20, 30})
	if string(a) != string(b) {
		t.Fatal("seed must be independent of tied id order")
	}
	if len(a) != 32 {
		t.Fatalf("want 32-byte seed, got %d", len(a))
	}
}

func TestPickTiebreakIndexDeterministicAndInRange(t *testing.T) {
	seed := votacao.TiebreakSeed([]byte("client"), []byte("server"), 1, []int64{1, 2, 3})
	idx := votacao.PickTiebreakIndex(seed, 3)
	if idx != votacao.PickTiebreakIndex(seed, 3) {
		t.Fatal("must be deterministic for same seed")
	}
	if idx < 0 || idx >= 3 {
		t.Fatalf("index out of range: %d", idx)
	}
}

func TestPickTiebreakIndexRoughlyUniform(t *testing.T) {
	n := 4
	counts := make([]int, n)
	const N = 20000
	for i := 0; i < N; i++ {
		seed := votacao.TiebreakSeed([]byte{byte(i), byte(i >> 8)}, []byte{0x5a}, 1, []int64{1, 2, 3, 4})
		counts[votacao.PickTiebreakIndex(seed, n)]++
	}
	for _, c := range counts {
		if c < int(float64(N/n)*0.85) || c > int(float64(N/n)*1.15) {
			t.Fatalf("non-uniform distribution: %v", counts)
		}
	}
}

func TestPickTiebreakIndexHandlesPowerOfTwo(t *testing.T) {
	// n=2 divides 2^32 — must not infinite-loop nor go out of range.
	seed := votacao.TiebreakSeed([]byte("x"), []byte("y"), 1, []int64{1, 2})
	idx := votacao.PickTiebreakIndex(seed, 2)
	if idx < 0 || idx >= 2 {
		t.Fatalf("index out of range: %d", idx)
	}
}
