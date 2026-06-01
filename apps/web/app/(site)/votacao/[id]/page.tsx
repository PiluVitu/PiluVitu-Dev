'use client'
import { use } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { SessionStatusBadge } from '@/components/votacao/session-status-badge'
import { VoteSection } from '@/components/votacao/vote-section'
import { ResultsList } from '@/components/votacao/results-list'
import { RunoffButton } from '@/components/votacao/runoff-button'
import { LoginButton } from '@/components/votacao/login-button'
import { useCurrentUser } from '@/hooks/votacao/use-current-user'
import { useSessionDetail } from '@/hooks/votacao/use-session-detail'
import { useCloseSession } from '@/hooks/votacao/use-close-session'
import { toast } from 'sonner'

export default function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: idStr } = use(params)
  const id = Number(idStr)

  const user = useCurrentUser()
  const detail = useSessionDetail(id)
  const close = useCloseSession()

  if (!Number.isFinite(id) || id <= 0) {
    return (
      <main className="container mx-auto max-w-3xl px-4 py-12">
        <p className="text-destructive">ID inválido.</p>
      </main>
    )
  }

  if (detail.isLoading) {
    return (
      <main className="container mx-auto max-w-4xl space-y-6 px-4 py-12">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-64 w-full" />
      </main>
    )
  }

  if (!detail.data) {
    return (
      <main className="container mx-auto max-w-3xl px-4 py-12">
        <p className="text-destructive">
          {String(detail.error ?? 'Sessão não encontrada.')}
        </p>
        {!user.data && (
          <div className="mt-4">
            <LoginButton />
          </div>
        )}
      </main>
    )
  }

  const { session, movies, voted_movie_ids } = detail.data
  const closed = session.Status === 'closed'

  return (
    <main className="container mx-auto max-w-4xl space-y-8 px-4 py-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{session.Title}</h1>
          <p className="text-muted-foreground text-sm">
            criada em {new Date(session.CreatedAt).toLocaleString('pt-BR')}
          </p>
        </div>
        <SessionStatusBadge status={session.Status} />
      </header>

      {!user.data && !user.isLoading && (
        <div className="bg-muted/50 rounded-md border p-4">
          <p className="mb-2 text-sm">Você precisa estar logado pra votar.</p>
          <LoginButton />
        </div>
      )}

      {closed ? (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Resultados</h2>
          <ResultsList
            sessionId={id}
            movies={movies}
            votedMovieIds={voted_movie_ids}
            winnerMethod={session.WinnerMethod}
            winnerMovieId={session.WinnerMovieID}
          />
        </section>
      ) : (
        <VoteSection
          sessionId={id}
          movies={movies}
          closed={closed}
          votedMovieIds={voted_movie_ids}
        />
      )}

      {user.data?.is_admin && !closed && (
        <div className="border-t pt-4">
          <Button
            variant="destructive"
            disabled={close.isPending}
            onClick={() =>
              close.mutate(id, {
                onSuccess: (data) =>
                  toast.success(
                    data.winner_movie_id
                      ? `Encerrada. Vencedor: ${data.winner_movie_id}`
                      : 'Encerrada sem votos.',
                  ),
                onError: (err) => toast.error(String(err)),
              })
            }
          >
            {close.isPending ? 'Encerrando…' : 'Encerrar sessão'}
          </Button>
        </div>
      )}

      {user.data?.is_admin && closed && (
        <div className="border-t pt-4">
          <RunoffButton sessionId={id} />
        </div>
      )}
    </main>
  )
}
