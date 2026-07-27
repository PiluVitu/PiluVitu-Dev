'use client'
import { useState } from 'react'
import { Button } from '@piluvitu/ui/button'
import { Skeleton } from '@piluvitu/ui/skeleton'
import { toast } from 'sonner'
import { SessionStatusBadge } from './session-status-badge'
import { SessionVotesList } from './admin/session-votes-list'
import { useSessionList } from '@/hooks/votacao/use-session-list'
import { useCloseSession } from '@/hooks/votacao/use-close-session'
import { useAdminSessionVotes } from '@/hooks/votacao/use-admin-session-votes'
import { errorMessage } from '@/lib/votacao/api-client'

// SessionVotesExpander lazy-loads the per-session vote breakdown (only when the
// row is expanded — the query is gated by `enabled`).
function SessionVotesExpander({ sessionId }: { sessionId: number }) {
  const { data, isLoading } = useAdminSessionVotes(sessionId)
  return (
    <SessionVotesList
      votes={data?.votes ?? []}
      total={data?.total ?? 0}
      isLoading={isLoading}
    />
  )
}

export function SessionsManager() {
  const list = useSessionList()
  const close = useCloseSession()
  const [expanded, setExpanded] = useState<number | null>(null)

  if (list.isLoading) return <Skeleton className="h-32 w-full" />
  if (list.error)
    return <p className="text-destructive text-sm">Erro ao carregar sessões.</p>

  const sessions = list.data?.sessions ?? []
  if (sessions.length === 0)
    return (
      <p className="text-muted-foreground text-sm">Nenhuma sessão ainda.</p>
    )

  return (
    <ul className="space-y-3">
      {sessions.map((s) => {
        const isOpen = s.Status === 'open'
        const isExpanded = expanded === s.ID
        return (
          <li key={s.ID} className="rounded-md border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-medium">{s.Title}</span>
                <SessionStatusBadge status={s.Status} />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setExpanded(isExpanded ? null : s.ID)}
                >
                  {isExpanded ? 'Ocultar votos' : 'Ver votos'}
                </Button>
                {isOpen && (
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={close.isPending}
                    onClick={() =>
                      close.mutate(s.ID, {
                        onSuccess: () => toast.success('Sessão encerrada'),
                        onError: (err) => toast.error(errorMessage(err)),
                      })
                    }
                  >
                    Encerrar
                  </Button>
                )}
              </div>
            </div>
            {isExpanded && (
              <div className="mt-3">
                <SessionVotesExpander sessionId={s.ID} />
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
