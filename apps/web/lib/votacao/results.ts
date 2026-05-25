export interface ResultRow {
  movie_id: number
  count: number
}

export interface ResultsAnalysis {
  /** The sole winner's movie_id, or null when there's a tie or no votes. */
  winnerMovieId: number | null
  /** Movie ids sharing the top count. length >= 2 means a tie. */
  topMovieIds: number[]
  isTie: boolean
  topCount: number
}

/**
 * analyzeResults derives the winner / tie state from a tally. Pure and
 * framework-free so it's testable and reusable (ResultsList + detail page).
 */
export function analyzeResults(results: ResultRow[]): ResultsAnalysis {
  let topCount = 0
  for (const r of results) if (r.count > topCount) topCount = r.count

  if (topCount === 0) {
    return { winnerMovieId: null, topMovieIds: [], isTie: false, topCount: 0 }
  }

  const topMovieIds = results
    .filter((r) => r.count === topCount)
    .map((r) => r.movie_id)
  const isTie = topMovieIds.length >= 2

  return {
    winnerMovieId: isTie ? null : topMovieIds[0],
    topMovieIds,
    isTie,
    topCount,
  }
}
