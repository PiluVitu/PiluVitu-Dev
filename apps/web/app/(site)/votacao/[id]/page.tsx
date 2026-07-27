'use client'
import { use } from 'react'
import { Skeleton } from '@piluvitu/ui/skeleton'
import { Button } from '@piluvitu/ui/button'
import { PageTopBar } from '@/components/page-top-bar'
import { SessionStatusBadge } from '@/components/votacao/session-status-badge'
import { VoteSection } from '@/components/votacao/vote-section'
import { ResultsList } from '@/components/votacao/results-list'
import { TiebreakRoulette } from '@/components/votacao/tiebreak-roulette'
import { LoginButton } from '@/components/votacao/login-button'
import { useCurrentUser } from '@/hooks/votacao/use-current-user'
import { useSessionDetail } from '@/hooks/votacao/use-session-detail'
import { useCloseSession } from '@/hooks/votacao/use-close-session'
import { errorMessage } from '@/lib/votacao/api-client'
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

  const shell = (children: React.ReactNode) => (
    <div className="mx-auto min-h-screen max-w-4xl px-6 py-8 sm:px-8 xl:py-10">
      <PageTopBar backHref="/votacao" backLabel="Sessões" />
      <div className="mt-10">{children}</div>
    </div>
  )

  if (!Number.isFinite(id) || id <= 0) {
    return shell(<p className="text-destructive">ID inválido.</p>)
  }

  if (detail.isLoading) {
    return shell(
      <div className="space-y-6">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-64 w-full" />
      </div>,
    )
  }

  if (!detail.data) {
    return shell(
      <>
        <p className="text-destructive">
          {detail.error ? errorMessage(detail.error) : 'Sessão não encontrada.'}
        </p>
        {!user.data && (
          <div className="mt-4">
            <LoginButton />
          </div>
        )}
      </>,
    )
  }

  const { session, movies, voted_movie_ids } = detail.data
  const closed = session.Status === 'closed'

  return shell(
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">{session.Title}</h1>
          <p className="text-muted-foreground mt-1 font-mono text-xs">
            criada em {new Date(session.CreatedAt).toLocaleString('pt-BR')}
          </p>
        </div>
        <SessionStatusBadge status={session.Status} />
      </header>

      {!user.data && !user.isLoading && (
        <div className="bg-card border-border rounded-lg border p-4">
          <p className="mb-3 text-sm">Você precisa estar logado pra votar.</p>
          <LoginButton />
        </div>
      )}

      {closed ? (
        <section className="space-y-4">
          <h2 className="text-2xl font-bold tracking-tight">Resultados</h2>
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
        <div className="border-border border-t pt-6">
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
                onError: (err) => toast.error(errorMessage(err)),
              })
            }
          >
            {close.isPending ? 'Encerrando…' : 'Encerrar sessão'}
          </Button>
        </div>
      )}

      {user.data?.is_admin && closed && (
        <div className="border-border border-t pt-6">
          <TiebreakRoulette sessionId={id} movies={movies} />
        </div>
      )}
    </div>,
  )
}
