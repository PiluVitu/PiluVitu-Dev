'use client'
import { cn } from '@/lib/utils'
import { useResults } from '@/hooks/votacao/use-session-detail'
import { analyzeResults } from '@/lib/votacao/results'
import type { SessionMovie } from '@/lib/votacao/types'

interface Props {
  sessionId: number
  movies: SessionMovie[]
  /** Movies the current user approved. Tags their rows. */
  votedMovieIds?: number[]
  /** 'roulette' when the winner came from a tie-break draw. */
  winnerMethod?: 'votes' | 'roulette' | null
  winnerMovieId?: number | null
}

export function ResultsList({
  sessionId,
  movies,
  votedMovieIds,
  winnerMethod,
  winnerMovieId,
}: Props) {
  const { data, isLoading } = useResults(sessionId)
  if (isLoading)
    return <p className="text-muted-foreground">Carregando resultados…</p>
  if (!data) return null

  const movieById = Object.fromEntries(movies.map((m) => [m.ID, m]))
  const total = data.total_votes || 1
  const analysis = analyzeResults(data.results)

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        Total de votos: <strong>{data.total_votes}</strong>
      </p>

      {data.results.length > 0 && !analysis.isTie && (
        <p className="text-muted-foreground text-xs">
          Total de votantes: <strong>{data.total_voters}</strong>
        </p>
      )}

      {analysis.isTie && (
        <p className="rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-sm dark:bg-amber-950/20">
          Empate entre {analysis.topMovieIds.length} filmes com{' '}
          {analysis.topCount} voto(s) cada — precisa de desempate.
        </p>
      )}

      <ul className="space-y-2">
        {data.results.map((r) => {
          const movie = movieById[r.movie_id]
          const pct = ((r.count / total) * 100).toFixed(0)
          const youVoted = (votedMovieIds ?? []).includes(r.movie_id)
          const isWinner =
            !analysis.isTie && r.movie_id === analysis.winnerMovieId
          const isTied =
            analysis.isTie && analysis.topMovieIds.includes(r.movie_id)
          return (
            <li
              key={r.movie_id}
              className={cn(
                'flex items-center justify-between rounded-md border px-3 py-2',
                isWinner && 'border-amber-400 bg-amber-50 dark:bg-amber-950/20',
                isTied && 'border-amber-400',
                youVoted && !isWinner && 'border-success bg-success/10',
              )}
            >
              <div>
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {movie?.Title ?? `Filme ${r.movie_id}`}
                  {isWinner && (
                    <span className="rounded-full bg-amber-400 px-2 py-0.5 text-xs font-semibold text-amber-950">
                      🏆 Vencedor
                    </span>
                  )}
                  {winnerMovieId === r.movie_id &&
                    winnerMethod === 'roulette' && (
                      <span className="rounded-full bg-purple-500 px-2 py-0.5 text-xs font-semibold text-white">
                        🎲 Vencedor no desempate
                      </span>
                    )}
                  {isTied && (
                    <span className="rounded-full border border-amber-400 px-2 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                      Empate
                    </span>
                  )}
                  {youVoted && (
                    <span className="bg-success text-success-foreground rounded-full px-2 py-0.5 text-xs font-semibold">
                      seu voto
                    </span>
                  )}
                </p>
                {movie && (
                  <p className="text-muted-foreground text-xs">
                    {movie.Category}
                  </p>
                )}
              </div>
              <span className="font-mono text-sm">
                {r.count} ({pct}%)
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
