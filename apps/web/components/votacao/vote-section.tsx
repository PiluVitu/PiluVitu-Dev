'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { MovieCard } from './movie-card'
import { useVoteMutation } from '@/hooks/votacao/use-vote-mutation'
import type { SessionMovie } from '@/lib/votacao/types'

interface Props {
  sessionId: number
  movies: SessionMovie[]
  alreadyVoted: boolean
  closed: boolean
}

export function VoteSection({
  sessionId,
  movies,
  alreadyVoted,
  closed,
}: Props) {
  const [selected, setSelected] = useState<number | null>(null)
  const mutation = useVoteMutation(sessionId)

  const lockedReason = closed
    ? 'Sessão encerrada — votação fechada.'
    : alreadyVoted
      ? 'Você já votou nesta sessão.'
      : null

  return (
    <div className="space-y-6">
      {lockedReason && (
        <p className="bg-muted rounded-md border px-4 py-3 text-sm">
          {lockedReason}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {movies.map((m) => (
          <MovieCard
            key={m.ID}
            movie={m}
            selected={selected === m.ID}
            onSelect={() => setSelected(m.ID)}
            disabled={!!lockedReason}
          />
        ))}
      </div>
      {!lockedReason && (
        <div className="flex justify-end">
          <Button
            disabled={!selected || mutation.isPending}
            onClick={() => {
              if (!selected) return
              mutation.mutate(selected, {
                onSuccess: () => toast.success('Voto registrado'),
                onError: (err) => toast.error(String(err)),
              })
            }}
          >
            {mutation.isPending ? 'Enviando…' : 'Votar'}
          </Button>
        </div>
      )}
    </div>
  )
}
