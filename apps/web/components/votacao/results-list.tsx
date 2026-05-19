'use client'
import { useResults } from '@/hooks/votacao/use-session-detail'
import type { SessionMovie } from '@/lib/votacao/types'

interface Props {
  sessionId: number
  movies: SessionMovie[]
}

export function ResultsList({ sessionId, movies }: Props) {
  const { data, isLoading } = useResults(sessionId)
  if (isLoading)
    return <p className="text-muted-foreground">Carregando resultados…</p>
  if (!data) return null

  const movieById = Object.fromEntries(movies.map((m) => [m.ID, m]))
  const total = data.total_votes || 1

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Total de votos: <strong>{data.total_votes}</strong>
      </p>
      <ul className="space-y-2">
        {data.results.map((r) => {
          const movie = movieById[r.movie_id]
          const pct = ((r.count / total) * 100).toFixed(0)
          return (
            <li
              key={r.movie_id}
              className="flex items-center justify-between rounded-md border px-3 py-2"
            >
              <div>
                <p className="font-medium">
                  {movie?.Title ?? `Filme ${r.movie_id}`}
                </p>
                {movie && (
                  <p className="text-xs text-muted-foreground">
                    {movie.Category}
                  </p>
                )}
              </div>
              <span className="text-sm font-mono">
                {r.count} ({pct}%)
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
