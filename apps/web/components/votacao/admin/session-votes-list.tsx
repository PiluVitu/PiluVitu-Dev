'use client'
import { Skeleton } from '@/components/ui/skeleton'
import type { SessionVote } from '@/lib/votacao/types'

interface Props {
  votes: SessionVote[]
  total: number
  isLoading?: boolean
}

export function SessionVotesList({ votes, total, isLoading }: Props) {
  if (isLoading) return <Skeleton className="h-24 w-full" />
  if (total === 0)
    return <p className="text-muted-foreground text-sm">Ninguém votou ainda.</p>
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs">{total} voto(s)</p>
      <ul className="divide-y rounded-md border">
        {votes.map((v) => (
          <li
            key={v.user_id}
            className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
          >
            <span className="font-medium">{v.user_name}</span>
            <span className="text-muted-foreground flex items-center gap-2">
              <span aria-hidden>→</span>
              {v.movie_title}
              <span className="text-xs uppercase">{v.category}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
