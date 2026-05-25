'use client'
import { cn } from '@/lib/utils'
import { useResults } from '@/hooks/votacao/use-session-detail'
import type { SessionMovie } from '@/lib/votacao/types'

interface Props {
  sessionId: number
  movies: SessionMovie[]
  /** Movie the current user voted for, or null. Tags its row. */
  votedMovieId?: number | null
}

export function ResultsList({ sessionId, movies, votedMovieId }: Props) {
  const { data, isLoading } = useResults(sessionId)
  if (isLoading)
    return <p className="text-muted-foreground">Carregando resultados…</p>
  if (!data) return null

  const movieById = Object.fromEntries(movies.map((m) => [m.ID, m]))
  const total = data.total_votes || 1

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        Total de votos: <strong>{data.total_votes}</strong>
      </p>
      <ul className="space-y-2">
        {data.results.map((r) => {
          const movie = movieById[r.movie_id]
          const pct = ((r.count / total) * 100).toFixed(0)
          const youVoted = votedMovieId != null && r.movie_id === votedMovieId
          return (
            <li
              key={r.movie_id}
              className={cn(
                'flex items-center justify-between rounded-md border px-3 py-2',
                youVoted && 'border-success bg-success/10',
              )}
            >
              <div>
                <p className="flex items-center gap-2 font-medium">
                  {movie?.Title ?? `Filme ${r.movie_id}`}
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
