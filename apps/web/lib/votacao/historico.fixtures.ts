import type { HistoricoFilme, HistoricoSessao } from './types'

export const filmeDoHistorico = (
  id: number,
  title: string,
  votes: number,
  over: Partial<HistoricoFilme> = {},
): HistoricoFilme => ({
  id,
  title,
  type: 'filme',
  category: 'terror',
  poster_url: '',
  votes,
  ...over,
})

export const sessaoDoHistorico = (
  over: Partial<HistoricoSessao> = {},
): HistoricoSessao => ({
  id: 12,
  title: 'Sexta 22/05',
  created_at: '2026-05-22T21:00:00Z',
  closed_at: '2026-05-23T00:30:00Z',
  theme: null,
  mode: 'votacao',
  winner_movie_id: 1,
  winner_method: 'votes',
  total_voters: 4,
  total_votes: 7,
  movies: [
    filmeDoHistorico(1, 'A Coisa', 4),
    filmeDoHistorico(2, 'Forrest Gump', 2, { category: 'drama' }),
    filmeDoHistorico(3, 'Stranger Things', 1, {
      category: 'ficção',
      type: 'serie',
    }),
  ],
  ...over,
})

export const roletaDoHistorico = (
  over: Partial<HistoricoSessao> = {},
): HistoricoSessao =>
  sessaoDoHistorico({
    id: 13,
    title: 'Noite de Halloween',
    theme: 'halloween',
    mode: 'roleta',
    winner_movie_id: 2,
    winner_method: 'roulette',
    total_voters: 0,
    total_votes: 0,
    movies: [
      filmeDoHistorico(1, 'A Coisa', 0),
      filmeDoHistorico(2, 'Hereditário', 0),
      filmeDoHistorico(3, 'O Exorcista', 0),
    ],
    ...over,
  })
