import Link from 'next/link'
import { SessionStatusBadge } from './session-status-badge'
import type { VotingSession } from '@/lib/votacao/types'

export function SessionCard({ session }: { session: VotingSession }) {
  return (
    <Link
      href={`/votacao/${session.ID}`}
      className="group bg-card border-border hover:bg-accent flex items-center justify-between gap-4 rounded-lg border p-6 transition-colors"
    >
      <div className="flex flex-col gap-1">
        <span className="text-lg font-semibold">{session.Title}</span>
        <span className="text-muted-foreground font-mono text-xs">
          criada em {new Date(session.CreatedAt).toLocaleString('pt-BR')}
        </span>
      </div>
      <SessionStatusBadge status={session.Status} />
    </Link>
  )
}
