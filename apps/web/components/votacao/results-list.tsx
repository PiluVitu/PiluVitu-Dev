'use client'
import { cn } from '@/lib/utils'
import { useResults } from '@/hooks/votacao/use-session-detail'
import { analyzeResults } from '@/lib/votacao/results'
import type { SessionMovie } from '@/lib/votacao/types'
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

interface Props {
  sessionId: number
  movies: SessionMovie[]
  /** Movies the current user approved. Tags their rows. */
  votedMovieIds?: number[]
  /** 'roulette' when the winner came from a tie-break draw. */
  winnerMethod?: 'votes' | 'roulette' | null
  winnerMovieId?: number | null
}

type Tone = 'win' | 'ok' | 'warn' | 'default'

const FILL: Record<Tone, string> = {
  win: 'bg-win/15',
  ok: 'bg-ok/10',
  warn: 'bg-warn/10',
  default: 'bg-muted/40',
}

const BORDER: Record<Tone, string> = {
  win: 'border-win/50',
  ok: 'border-ok/40',
  warn: 'border-warn/50',
  default: 'border-border',
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
        Total de votos:{' '}
        <strong className="text-foreground">{data.total_votes}</strong>
      </p>

      {data.results.length > 0 && !analysis.isTie && (
        <p className="text-muted-foreground text-xs">
          Total de votantes: <strong>{data.total_voters}</strong>
        </p>
      )}

      {analysis.isTie && (
        <div className="border-warn/40 bg-warn/10 text-warn flex items-center gap-2 rounded-lg border px-4 py-3 text-sm">
          <FontAwesomeIcon
            icon={faTriangleExclamation}
            className="size-4 shrink-0"
          />
          <span>
            Empate entre {analysis.topMovieIds.length} filmes com{' '}
            {analysis.topCount} voto(s) cada —{' '}
            {winnerMethod === 'roulette'
              ? 'resolvido pela roleta de desempate.'
              : 'precisa de desempate.'}
          </span>
        </div>
      )}

      <ul className="space-y-2">
        {data.results.map((r) => {
          const movie = movieById[r.movie_id]
          const pct = ((r.count / total) * 100).toFixed(0)
          const youVoted = (votedMovieIds ?? []).includes(r.movie_id)
          const isRouletteWinner =
            winnerMovieId === r.movie_id && winnerMethod === 'roulette'
          const isVotesWinner =
            !analysis.isTie && r.movie_id === analysis.winnerMovieId
          const isWinner = isRouletteWinner || isVotesWinner
          const isTied =
            analysis.isTie && analysis.topMovieIds.includes(r.movie_id)
          const tone: Tone = isWinner
            ? 'win'
            : youVoted
              ? 'ok'
              : isTied
                ? 'warn'
                : 'default'

          return (
            <li
              key={r.movie_id}
              className={cn(
                'relative overflow-hidden rounded-lg border',
                BORDER[tone],
              )}
            >
              {/* barra preenchida pelo percentual */}
              <div
                className={cn('absolute inset-y-0 left-0', FILL[tone])}
                style={{ width: `${pct}%` }}
                aria-hidden
              />
              <div className="relative flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {movie?.Title ?? `Filme ${r.movie_id}`}
                    {isRouletteWinner && (
                      <span className="bg-win/15 text-win inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium">
                        🎲 Vencedor no desempate
                      </span>
                    )}
                    {isVotesWinner && !isRouletteWinner && (
                      <span className="bg-win/15 text-win rounded-full px-2 py-0.5 text-xs font-medium">
                        🏆 Vencedor
                      </span>
                    )}
                    {isTied && (
                      <span className="border-warn/40 text-warn rounded-full border px-2 py-0.5 text-xs font-medium">
                        Empate
                      </span>
                    )}
                    {youVoted && (
                      <span className="bg-ok/15 text-ok rounded-full px-2 py-0.5 text-xs font-medium">
                        seu voto
                      </span>
                    )}
                  </p>
                  {movie && (
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {movie.Category}
                    </p>
                  )}
                </div>
                <span className="text-foreground shrink-0 font-mono text-sm">
                  {r.count}{' '}
                  <span className="text-muted-foreground">({pct}%)</span>
                </span>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
