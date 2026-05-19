'use client'
import { LoginButton } from '@/components/votacao/login-button'
import { LogoutButton } from '@/components/votacao/logout-button'
import { SessionCard } from '@/components/votacao/session-card'
import { Skeleton } from '@/components/ui/skeleton'
import { useCurrentUser } from '@/hooks/votacao/use-current-user'
import { useSessionList } from '@/hooks/votacao/use-session-list'
import Link from 'next/link'

export default function VotacaoPage() {
  const user = useCurrentUser()
  const list = useSessionList()

  return (
    <main className="container mx-auto max-w-4xl space-y-8 px-4 py-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Votação de Filmes</h1>
          <p className="text-muted-foreground">
            Sessões em aberto e histórico recente.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {user.isLoading ? (
            <Skeleton className="h-10 w-32" />
          ) : user.data ? (
            <>
              <span className="text-sm text-muted-foreground">
                {user.data.name} {user.data.is_admin && '(admin)'}
              </span>
              {user.data.is_admin && (
                <Link
                  href="/votacao/admin"
                  className="text-sm underline underline-offset-2"
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
    </main>
  )
}
