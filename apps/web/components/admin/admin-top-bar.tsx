'use client'

import { toast } from 'sonner'
import { ModeToggle } from '@/components/mode-toggle'
import { AccountMenu } from '@/components/admin/account-menu'
import { useCurrentUser } from '@/hooks/votacao/use-current-user'
import { useGithubLink } from '@/hooks/admin/use-github-link'
import { votacaoApi } from '@/lib/votacao/api-client'

interface AdminTopBarProps {
  breadcrumb: string[]
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

export function AdminTopBar({ breadcrumb }: AdminTopBarProps) {
  const user = useCurrentUser()
  const gh = useGithubLink()

  const onUnlink = async () => {
    const r = await fetch('/api/admin/github/unlink', { method: 'POST' })
    if (!r.ok) {
      toast.error('Falha ao desvincular GitHub')
      return
    }
    toast.success('GitHub desconectado')
    gh.refetch()
  }

  const onLogout = async () => {
    await votacaoApi.logout().catch(() => {})
    window.location.href = '/'
  }

  return (
    <header className="border-border flex items-center justify-between gap-4 border-b px-8 py-4">
      <nav className="text-muted-foreground flex items-center gap-2 font-mono text-sm">
        {breadcrumb.map((crumb, i) => (
          <span key={i} className="flex items-center gap-2">
            {i > 0 ? <span aria-hidden>/</span> : null}
            <span
              className={
                i === breadcrumb.length - 1 ? 'text-foreground' : undefined
              }
            >
              {crumb}
            </span>
          </span>
        ))}
      </nav>

      <div className="flex items-center gap-3">
        <input
          type="search"
          placeholder="Buscar conteúdo…"
          className="border-border bg-muted/40 text-foreground placeholder:text-muted-foreground rounded-pill hidden w-64 border px-4 py-2 text-sm outline-none md:block"
          aria-label="Buscar conteúdo"
        />
        <ModeToggle />
        <AccountMenu
          name={user.data?.name}
          email={user.data?.email}
          initials={initials(user.data?.name)}
          githubLinked={!!gh.data?.linked}
          githubLogin={gh.data?.login}
          onUnlink={onUnlink}
          onLogout={onLogout}
        />
      </div>
    </header>
  )
}
