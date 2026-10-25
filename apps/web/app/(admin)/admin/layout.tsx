'use client'

import { usePathname } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { AdminSidebar } from '@/components/admin/admin-sidebar'
import { AdminTopBar } from '@/components/admin/admin-top-bar'
import { AdminLoginScreen } from '@/components/admin/admin-login-screen'
import { Skeleton } from '@piluvitu/ui/skeleton'
import { useCurrentUser } from '@/hooks/votacao/use-current-user'
import { useAdminStats } from '@/hooks/admin/use-admin-stats'
import { usePasskeySuportado } from '@/hooks/admin/use-passkey-suportado'
import { signInWithPasskey } from '@/lib/admin/passkey'
import { votacaoApi } from '@/lib/votacao/api-client'

// Rotas não mapeadas caem no fallback ['Admin'] no JSX abaixo; adicione a entrada
// ao criar novas sub-páginas do admin.
const CRUMB: Record<string, string[]> = {
  '/admin': ['Admin', 'Dashboard'],
  '/admin/posts': ['Coleções', 'Posts'],
  '/admin/posts/novo': ['Coleções', 'Posts', 'Novo'],
  '/admin/pilulabs': ['Coleções', 'PiluLabs'],
  '/admin/carreira': ['Coleções', 'Carreira'],
  '/admin/socials': ['Coleções', 'Redes sociais'],
  '/admin/perfil': ['Site', 'Perfil & bio'],
  '/admin/midia': ['Site', 'Mídia'],
  '/admin/sessoes': ['Votação', 'Sessões'],
  '/admin/transcricao': ['Ferramentas', 'Transcrição'],
  '/admin/passkeys': ['Conta', 'Passkeys'],
}

export default function AdminShellLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname()
  const user = useCurrentUser()
  const stats = useAdminStats()
  const queryClient = useQueryClient()
  const passkeySuportado = usePasskeySuportado()

  if (user.isLoading) {
    return (
      <div className="mx-auto max-w-md p-12">
        <Skeleton className="h-10 w-1/2" />
      </div>
    )
  }

  // Não autenticado (sessão ausente → /auth/me 401) ou falha de auth →
  // oferece o login com Google ou passkey em vez de um beco sem saída.
  if (!user.data) {
    return (
      <AdminLoginScreen
        passkeySuportado={passkeySuportado}
        onPasskeyLogin={async () => {
          await signInWithPasskey()
          await queryClient.invalidateQueries({ queryKey: ['votacao', 'me'] })
        }}
      />
    )
  }

  if (!user.data.is_admin) {
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
    pilulabs: stats.data?.pilulabs,
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
        <AdminTopBar breadcrumb={CRUMB[pathname] ?? ['Admin']} />
        <main className="flex-1 px-8 py-8">{children}</main>
      </div>
    </div>
  )
}
