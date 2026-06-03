'use client'
import { LoginButton } from '@/components/votacao/login-button'
import { LogoutButton } from '@/components/votacao/logout-button'
import { SessionCard } from '@/components/votacao/session-card'
import { PageTopBar } from '@/components/page-top-bar'
import { Skeleton } from '@/components/ui/skeleton'
import { useCurrentUser } from '@/hooks/votacao/use-current-user'
import { useSessionList } from '@/hooks/votacao/use-session-list'
import Link from 'next/link'

export default function VotacaoPage() {
  const user = useCurrentUser()
  const list = useSessionList()

  return (
    <div className="mx-auto min-h-screen max-w-4xl px-6 py-8 sm:px-8 xl:py-10">
      <PageTopBar backHref="/" backLabel="Paulo Victor" />

      <header className="mt-10 mb-10 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">
            Votação de Filmes
          </h1>
          <p className="text-muted-foreground mt-2">
            Sessões em aberto e histórico recente.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {user.isLoading ? (
            <Skeleton className="h-9 w-40" />
          ) : user.data ? (
            <>
              <span className="text-muted-foreground text-sm">
                {user.data.name}{' '}
                {user.data.is_admin && (
                  <span className="text-foreground">(admin)</span>
                )}
              </span>
              {user.data.is_admin && (
                <Link
                  href="/votacao/admin"
                  className="hover:text-primary text-sm underline underline-offset-4 transition-colors"
                >
                  Painel admin
                </Link>
              )}
              <LogoutButton />
            </>
          ) : (
            <LoginButton />
          )}
        </div>
      </header>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Sessões</h2>
        {list.isLoading && (
          <div className="grid gap-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}
        {list.error && (
          <p className="text-destructive text-sm">Erro ao carregar sessões.</p>
        )}
        {list.data?.sessions.length === 0 && (
          <p className="text-muted-foreground">
            Nenhuma sessão ainda.{' '}
            {user.data?.is_admin && 'Crie a primeira no painel admin.'}
          </p>
        )}
        <div className="grid gap-3">
          {list.data?.sessions.map((s) => (
            <SessionCard key={s.ID} session={s} />
          ))}
        </div>
      </section>
    </div>
  )
}
