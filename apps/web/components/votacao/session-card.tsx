import Link from 'next/link'
import { cn } from '@/lib/utils'
import { isHalloweenSession } from '@/lib/votacao/halloween'
import { SessionStatusBadge } from './session-status-badge'
import type { VotingSession } from '@/lib/votacao/types'

export function SessionCard({ session }: { session: VotingSession }) {
  const halloween = isHalloweenSession(session)
  return (
    <Link
      href={`/votacao/${session.ID}`}
      data-halloween={halloween || undefined}
      className={cn(
        'group bg-card border-border hover:bg-accent flex items-center justify-between gap-4 rounded-lg border p-6 transition-colors',
        halloween &&
          'border-orange-500/50 bg-gradient-to-r from-orange-500/15 via-purple-900/20 to-transparent hover:border-orange-400',
      )}
    >
      <div className="flex flex-col gap-1">
        <span className="text-lg font-semibold">
          {halloween && (
            <span aria-hidden className="mr-2">
              🎃
            </span>
          )}
          {session.Title}
        </span>
        {halloween && (
          <span className="font-mono text-xs tracking-widest text-orange-600 uppercase dark:text-orange-400">
            Sessão de Halloween
          </span>
        )}
        <span className="text-muted-foreground font-mono text-xs">
          criada em {new Date(session.CreatedAt).toLocaleString('pt-BR')}
        </span>
      </div>
      <SessionStatusBadge status={session.Status} />
    </Link>
  )
}
