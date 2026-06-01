package votacao

import (
	"crypto/sha256"
	"encoding/binary"
	"sort"
)

// TiebreakSeed derives a 32-byte seed from the client entropy, the server nonce,
// the session id and the tied movie ids. The ids are sorted internally so the
// seed is independent of their input order (reproducible/auditable).
func TiebreakSeed(clientEntropy, serverNonce []byte, sessionID int64, tiedIDs []int64) []byte {
	ids := append([]int64(nil), tiedIDs...)
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	h := sha256.New()
	h.Write(clientEntropy)
	h.Write(serverNonce)
	var sid [8]byte
	binary.BigEndian.PutUint64(sid[:], uint64(sessionID))
	h.Write(sid[:])
	for _, id := range ids {
		var b [8]byte
		binary.BigEndian.PutUint64(b[:], uint64(id))
		h.Write(b[:])
	}
	return h.Sum(nil)
}

// PickTiebreakIndex maps a seed to an unbiased index in [0, n) using rejection
// sampling over 32-bit windows of the seed (re-hashing if the bytes are
// exhausted, which is astronomically unlikely). n must be >= 1.
func PickTiebreakIndex(seed []byte, n int) int {
	if n <= 1 {
		return 0
	}
	// Largest multiple of n that fits in 2^32, kept in uint64 so powers of two
	// (where it equals 2^32 exactly) don't wrap to 0.
	limit := (uint64(1) << 32) / uint64(n) * uint64(n)
	cur := seed
	for {
		for off := 0; off+4 <= len(cur); off += 4 {
			x := uint64(binary.BigEndian.Uint32(cur[off : off+4]))
			if x < limit {
				return int(x % uint64(n))
			}
		}
		next := sha256.Sum256(cur)
		cur = next[:]
	}
}
