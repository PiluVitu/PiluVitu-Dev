'use client'

import { toast } from 'sonner'
import { SectionHeader } from '@/components/section-header'
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

export default function SessoesPage() {
  const user = useCurrentUser()
  const isAdmin = !!user.data?.is_admin

  // O shell (admin)/layout.tsx já bloqueia não-admin. Este gate mantém as
  // queries admin honestas (enabled=false) pra não dispararem antes do user
  // resolver / pra não-admin.
  const users = useAdminUsers(isAdmin)
  const backups = useAdminBackups(isAdmin)
  const createBackup = useCreateBackup()

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <SectionHeader label="Nova sessão" />
        <CreateSessionForm />
      </section>

      <section className="space-y-3">
        <SectionHeader label="Sessões" />
        <SessionsManager />
      </section>

      <section className="space-y-3">
        <SectionHeader label="Usuários" count={users.data?.users?.length} />
        <UsersTable
          users={users.data?.users ?? []}
          isLoading={users.isLoading}
        />
      </section>

      <section className="space-y-3">
        <SectionHeader label="Backups" />
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
    </div>
  )
}
