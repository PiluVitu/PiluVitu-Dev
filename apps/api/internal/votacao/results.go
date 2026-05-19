package votacao

import "sort"

// TallyVotes counts votes per movie_id.
func TallyVotes(votes []Vote) map[int64]int {
	out := make(map[int64]int, len(votes))
	for _, v := range votes {
		out[v.MovieID]++
	}
	return out
}

// ComputeWinner returns the movie_id with the highest vote count.
// Ties are broken deterministically by lowest movie_id. Returns nil when
// there are no votes (allows closing a session with no winner).
func ComputeWinner(votes []Vote) *int64 {
	if len(votes) == 0 {
		return nil
	}
	tally := TallyVotes(votes)
	ids := make([]int64, 0, len(tally))
	for id := range tally {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	bestID := ids[0]
	bestCount := tally[bestID]
	for _, id := range ids[1:] {
		if tally[id] > bestCount {
			bestID = id
			bestCount = tally[id]
		}
	}
	return &bestID
}
