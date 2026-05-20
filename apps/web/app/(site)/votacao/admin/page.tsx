'use client'
import { Skeleton } from '@/components/ui/skeleton'
import { CreateSessionForm } from '@/components/votacao/create-session-form'
import { useCurrentUser } from '@/hooks/votacao/use-current-user'

export default function VotacaoAdminPage() {
  const user = useCurrentUser()

  if (user.isLoading) {
    return (
      <main className="container mx-auto max-w-2xl px-4 py-12">
        <Skeleton className="h-10 w-1/2" />
      </main>
    )
  }

  if (!user.data?.is_admin) {
    return (
      <main className="container mx-auto max-w-2xl px-4 py-12">
        <h1 className="text-2xl font-bold">Acesso negado</h1>
        <p className="text-muted-foreground mt-2">
          Esta página é restrita a administradores.
        </p>
      </main>
    )
  }

  return (
    <main className="container mx-auto max-w-2xl space-y-8 px-4 py-12">
      <header>
        <h1 className="text-3xl font-bold">Painel admin</h1>
        <p className="text-muted-foreground">
          Crie uma nova sessão de votação (sorteio puxado da planilha + TMDb).
        </p>
      </header>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Nova sessão</h2>
        <CreateSessionForm />
      </section>
    </main>
  )
}
