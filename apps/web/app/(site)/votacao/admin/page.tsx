'use client'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { CreateSessionForm } from '@/components/votacao/create-session-form'
import { SessionsManager } from '@/components/votacao/sessions-manager'
import { UsersTable } from '@/components/votacao/admin/users-table'
import { BackupsPanel } from '@/components/votacao/admin/backups-panel'
import { useCurrentUser } from '@/hooks/votacao/use-current-user'
import { useAdminUsers } from '@/hooks/votacao/use-admin-users'
import {
  useAdminBackups,
  useCreateBackup,
} from '@/hooks/votacao/use-admin-backups'
import { errorMessage } from '@/lib/votacao/api-client'

export default function VotacaoAdminPage() {
  const user = useCurrentUser()
  const isAdmin = !!user.data?.is_admin

  // Admin-only queries: gated so they never fire for non-admins.
  const users = useAdminUsers(isAdmin)
  const backups = useAdminBackups(isAdmin)
  const createBackup = useCreateBackup()

  if (user.isLoading) {
    return (
      <main className="container mx-auto max-w-2xl px-4 py-12">
        <Skeleton className="h-10 w-1/2" />
      </main>
    )
  }

  if (!isAdmin) {
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
    <main className="container mx-auto max-w-4xl space-y-10 px-4 py-12">
      <header>
        <h1 className="text-3xl font-bold">Painel admin</h1>
        <p className="text-muted-foreground">
          Sessões, votos, usuários e backups da votação.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Nova sessão</h2>
        <p className="text-muted-foreground text-sm">
          Sorteio puxado da planilha + pôsteres do TMDb.
        </p>
        <CreateSessionForm />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Sessões</h2>
        <p className="text-muted-foreground text-sm">
          Encerre uma sessão ou expanda pra ver quem votou em quê.
        </p>
        <SessionsManager />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Usuários cadastrados</h2>
        <UsersTable
          users={users.data?.users ?? []}
          isLoading={users.isLoading}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Backups</h2>
        <BackupsPanel
          backups={backups.data?.backups ?? []}
          isLoading={backups.isLoading}
          backingUp={createBackup.isPending}
          onBackup={() =>
            createBackup.mutate(undefined, {
              onSuccess: () => toast.success('Backup executado'),
              onError: (err) => toast.error(errorMessage(err)),
            })
          }
        />
      </section>
    </main>
  )
}
