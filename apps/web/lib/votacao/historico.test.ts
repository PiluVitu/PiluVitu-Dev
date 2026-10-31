import { dataDaSessao, participantes, vencedorDoHistorico } from './historico'
import type { HistoricoSessao } from './types'

const filme = (id: number, votes: number) => ({
  id,
  title: `Filme ${id}`,
  type: 'filme' as const,
  category: 'terror',
  poster_url: '',
  votes,
})

const sessao = (over: Partial<HistoricoSessao> = {}): HistoricoSessao => ({
  id: 1,
  title: 'Sexta',
  created_at: '2026-10-24T22:00:00Z',
  closed_at: '2026-10-25T01:30:00Z',
  theme: null,
  mode: 'votacao',
  winner_movie_id: 1,
  winner_method: 'votes',
  total_voters: 3,
  total_votes: 5,
  movies: [filme(1, 3), filme(2, 2)],
  ...over,
})

describe('vencedorDoHistorico', () => {
  it('o vencedor gravado, por votos', () => {
    expect(vencedorDoHistorico(sessao())).toEqual({
      filme: filme(1, 3),
      metodo: 'votos',
    })
  })

  it('roulette numa votação é o desempate', () => {
    const s = sessao({
      winner_movie_id: 2,
      winner_method: 'roulette',
      movies: [filme(1, 2), filme(2, 2)],
    })
    expect(vencedorDoHistorico(s)?.metodo).toBe('desempate')
    expect(vencedorDoHistorico(s)?.filme.id).toBe(2)
  })

  it('na roleta de Halloween, é o sorteado, mesmo com zero votos', () => {
    const s = sessao({
      theme: 'halloween',
      mode: 'roleta',
      winner_movie_id: 2,
      winner_method: 'roulette',
      total_voters: 0,
      total_votes: 0,
      movies: [filme(1, 0), filme(2, 0)],
    })
    expect(vencedorDoHistorico(s)).toEqual({
      filme: filme(2, 0),
      metodo: 'roleta',
    })
  })

  it('sem vencedor gravado, cai no único topo da contagem', () => {
    expect(
      vencedorDoHistorico(
        sessao({ winner_movie_id: null, winner_method: null }),
      ),
    ).toEqual({ filme: filme(1, 3), metodo: 'votos' })
  })

  it('sem gravado e com empate, ou sem votos, não tem vencedor', () => {
    expect(
      vencedorDoHistorico(
        sessao({
          winner_movie_id: null,
          winner_method: null,
          movies: [filme(1, 2), filme(2, 2)],
        }),
      ),
    ).toBeNull()
    expect(
      vencedorDoHistorico(
        sessao({
          winner_movie_id: null,
          winner_method: null,
          movies: [filme(1, 0)],
        }),
      ),
    ).toBeNull()
  })

  it('roleta sem sorteio gravado não inventa vencedor', () => {
    expect(
      vencedorDoHistorico(
        sessao({ mode: 'roleta', winner_movie_id: null, winner_method: null }),
      ),
    ).toBeNull()
  })
})

describe('dataDaSessao', () => {
  it('usa o encerramento, no fuso de Teresina (01:30 UTC é a noite anterior)', () => {
    expect(dataDaSessao(sessao())).toBe('24 de outubro de 2026')
  })

  it('sem encerramento, usa a criação', () => {
    expect(
      dataDaSessao(
        sessao({ closed_at: null, created_at: '2026-03-02T15:00:00Z' }),
      ),
    ).toBe('02 de março de 2026')
  })
})

it('participantes no singular e no plural', () => {
  expect(participantes(1)).toBe('1 participante')
  expect(participantes(0)).toBe('0 participantes')
  expect(participantes(7)).toBe('7 participantes')
})
