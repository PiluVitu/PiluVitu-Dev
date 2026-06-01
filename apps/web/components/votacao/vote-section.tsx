'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { MovieCard } from './movie-card'
import { useVoteMutation } from '@/hooks/votacao/use-vote-mutation'
import { errorMessage } from '@/lib/votacao/api-client'
import type { SessionMovie } from '@/lib/votacao/types'

interface Props {
  sessionId: number
  movies: SessionMovie[]
  closed: boolean
  /** Movies the current user already approved. */
  votedMovieIds: number[]
}

export function VoteSection({
  sessionId,
  movies,
  closed,
  votedMovieIds,
}: Props) {
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(votedMovieIds),
  )
  const mutation = useVoteMutation(sessionId)

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-6">
      {closed && (
        <p className="bg-muted rounded-md border px-4 py-3 text-sm">
          Sessão encerrada — votação fechada.
        </p>
      )}
      {!closed && (
        <p className="text-muted-foreground text-sm">
          Aprove quantos filmes quiser. Você pode mudar seu voto até a sessão
          ser encerrada.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {movies.map((m) => (
          <MovieCard
            key={m.ID}
            movie={m}
            selected={selected.has(m.ID)}
            youVoted={selected.has(m.ID)}
            onSelect={() => !closed && toggle(m.ID)}
            disabled={closed}
          />
        ))}
      </div>
      {!closed && (
        <div className="flex justify-end">
          <Button
            disabled={mutation.isPending}
            onClick={() =>
              mutation.mutate(Array.from(selected), {
                onSuccess: () => toast.success('Voto registrado'),
                onError: (err) => toast.error(errorMessage(err)),
              })
            }
          >
            {mutation.isPending ? 'Enviando…' : `Votar (${selected.size})`}
          </Button>
        </div>
      )}
    </div>
  )
}
