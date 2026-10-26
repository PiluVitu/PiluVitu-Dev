import { analyzeResults } from './results'
import type { HistoricoFilme, HistoricoSessao } from './types'

export type MetodoDoVencedor = 'votos' | 'desempate' | 'roleta'

export interface VencedorDoHistorico {
  filme: HistoricoFilme
  metodo: MetodoDoVencedor
}

/** O vencedor gravado pelo servidor; sem ele, o único topo da contagem. */
export function vencedorDoHistorico(
  sessao: HistoricoSessao,
): VencedorDoHistorico | null {
  const gravado = sessao.movies.find((m) => m.id === sessao.winner_movie_id)
  if (gravado) {
    const metodo: MetodoDoVencedor =
      sessao.mode === 'roleta'
        ? 'roleta'
        : sessao.winner_method === 'roulette'
          ? 'desempate'
          : 'votos'
    return { filme: gravado, metodo }
  }
  if (sessao.mode === 'roleta') return null
  const { winnerMovieId } = analyzeResults(
    sessao.movies.map((m) => ({ movie_id: m.id, count: m.votes })),
  )
  const topo = sessao.movies.find((m) => m.id === winnerMovieId)
  return topo ? { filme: topo, metodo: 'votos' } : null
}

const DATA = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  timeZone: 'America/Fortaleza',
})

/** A data da noite: o encerramento, ou a criação quando ele falta. Fuso de Teresina. */
export function dataDaSessao(sessao: HistoricoSessao): string {
  return DATA.format(new Date(sessao.closed_at ?? sessao.created_at))
}

export function participantes(total: number): string {
  return total === 1 ? '1 participante' : `${total} participantes`
}
