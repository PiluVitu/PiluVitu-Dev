import { describe, expect, it } from 'vitest'
import { computeTopMovies, tallyVotes } from './tally'

describe('tallyVotes', () => {
  it('sem votos devolve Map vazio', () => {
    expect(tallyVotes([])).toEqual(new Map())
  })

  it('conta um voto por movie_id', () => {
    const out = tallyVotes([{ movieId: 1 }, { movieId: 1 }, { movieId: 2 }])
    expect(out.get(1)).toBe(2)
    expect(out.get(2)).toBe(1)
    expect(out.size).toBe(2)
  })
})

describe('computeTopMovies', () => {
  it('sem votos devolve ids:[] e max:0 — nunca lança', () => {
    expect(computeTopMovies([])).toEqual({ ids: [], max: 0 })
  })

  it('vencedor claro — ids:[id único], max = a contagem dele', () => {
    const out = computeTopMovies([
      { movieId: 10 },
      { movieId: 10 },
      { movieId: 20 },
    ])
    expect(out).toEqual({ ids: [10], max: 2 })
  })

  // ⚠️ O teste que só passa com as DUAS chaves certas (count DESC, movie_id
  // ASC não se aplica aqui — é o desempate de computeTopMovies mesmo, que
  // ordena só por movie_id ASC dentro do topo). Votado em ordem que faria um
  // desempate por "primeira aparição" (Map preserva ordem de inserção)
  // devolver [5, 2] — só passa se a função ORDENAR explicitamente ASC.
  it('empate no topo — ids ordenados ASC, não pela ordem de primeira aparição', () => {
    const out = computeTopMovies([
      { movieId: 5 },
      { movieId: 5 },
      { movieId: 2 },
      { movieId: 2 },
    ])
    expect(out.ids).toEqual([2, 5])
    expect(out.max).toBe(2)
  })

  it('empate de 3+ movies no topo — todos entram, ordenados ASC', () => {
    const out = computeTopMovies([
      { movieId: 30 },
      { movieId: 10 },
      { movieId: 20 },
    ])
    expect(out).toEqual({ ids: [10, 20, 30], max: 1 })
  })

  it('movies fora do topo não entram em ids, mesmo com contagem próxima', () => {
    const out = computeTopMovies([
      { movieId: 1 },
      { movieId: 1 },
      { movieId: 1 },
      { movieId: 2 },
      { movieId: 2 },
    ])
    expect(out).toEqual({ ids: [1], max: 3 })
  })
})
