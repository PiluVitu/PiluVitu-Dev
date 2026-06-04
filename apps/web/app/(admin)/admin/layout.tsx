'use client'

import { usePathname } from 'next/navigation'
import { AdminSidebar } from '@/components/admin/admin-sidebar'
import { AdminTopBar } from '@/components/admin/admin-top-bar'
import { Skeleton } from '@/components/ui/skeleton'
import { useCurrentUser } from '@/hooks/votacao/use-current-user'
import { useAdminStats } from '@/hooks/admin/use-admin-stats'
import { votacaoApi } from '@/lib/votacao/api-client'

// Rotas não mapeadas caem no fallback ['Admin'] no JSX abaixo; adicione a entrada
// ao criar novas sub-páginas do admin.
const CRUMB: Record<string, string[]> = {
  '/admin': ['Coleções', 'Posts'],
  '/admin/projetos': ['Coleções', 'Projetos'],
  '/admin/carreira': ['Coleções', 'Carreira'],
  '/admin/perfil': ['Site', 'Perfil & bio'],
  '/admin/midia': ['Site', 'Mídia'],
  '/admin/sessoes': ['Votação', 'Sessões'],
}

function initials(name?: string) {
  if (!name) return 'PV'
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

export default function AdminShellLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname()
  const user = useCurrentUser()
  const stats = useAdminStats()

  if (user.isLoading) {
    return (
      <div className="mx-auto max-w-md p-12">
        <Skeleton className="h-10 w-1/2" />
      </div>
    )
  }

  if (user.isError) {
    return (
      <main className="mx-auto max-w-md p-12">
        <h1 className="text-2xl font-bold">Erro ao verificar acesso</h1>
        <p className="text-muted-foreground mt-2">
          Não foi possível autenticar. Tente recarregar a página.
        </p>
      </main>
    )
  }

  if (!user.data?.is_admin) {
    return (
      <main className="mx-auto max-w-md p-12">
        <h1 className="text-2xl font-bold">Acesso negado</h1>
        <p className="text-muted-foreground mt-2">
          Esta área é restrita a administradores.
        </p>
      </main>
    )
  }

  const counts = {
    posts: stats.data?.posts,
    projects: stats.data?.projects,
    careers: stats.data?.careers,
  }

  const onLogout = async () => {
    await votacaoApi.logout().catch(() => {})
    window.location.href = '/'
  }

  return (
    <div className="flex min-h-screen">
      <AdminSidebar counts={counts} onLogout={onLogout} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopBar
          breadcrumb={CRUMB[pathname] ?? ['Admin']}
          userName={user.data.name}
          userInitials={initials(user.data.name)}
        />
        <main className="flex-1 px-8 py-8">{children}</main>
      </div>
    </div>
  )
}
