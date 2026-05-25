import { analyzeResults } from './results'

describe('analyzeResults', () => {
  it('returns no winner for empty / zero-vote results', () => {
    expect(analyzeResults([])).toEqual({
      winnerMovieId: null,
      topMovieIds: [],
      isTie: false,
      topCount: 0,
    })
  })

  it('identifies a clear single winner', () => {
    const a = analyzeResults([
      { movie_id: 1, count: 3 },
      { movie_id: 2, count: 1 },
    ])
    expect(a.isTie).toBe(false)
    expect(a.winnerMovieId).toBe(1)
    expect(a.topMovieIds).toEqual([1])
    expect(a.topCount).toBe(3)
  })

  it('detects a tie at the top (no single winner)', () => {
    const a = analyzeResults([
      { movie_id: 1, count: 2 },
      { movie_id: 2, count: 2 },
      { movie_id: 3, count: 1 },
    ])
    expect(a.isTie).toBe(true)
    expect(a.winnerMovieId).toBeNull()
    expect(a.topMovieIds).toEqual([1, 2])
    expect(a.topCount).toBe(2)
  })
})
