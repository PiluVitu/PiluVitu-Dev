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

// ComputeTopMovies returns the movie_ids sharing the highest vote count
// (sorted asc) and that count. len >= 2 means a tie at the top; len == 1 is a
// clear winner; nil/0 when there are no votes.
func ComputeTopMovies(votes []Vote) ([]int64, int) {
	tally := TallyVotes(votes)
	if len(tally) == 0 {
		return nil, 0
	}
	max := 0
	for _, c := range tally {
		if c > max {
			max = c
		}
	}
	ids := make([]int64, 0)
	for id, c := range tally {
		if c == max {
			ids = append(ids, id)
		}
	}
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	return ids, max
}

