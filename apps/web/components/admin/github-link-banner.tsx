'use client'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faGithub } from '@fortawesome/free-brands-svg-icons'
import { Button } from '@piluvitu/ui/button'

interface GithubLinkBannerProps {
  linked: boolean
  login?: string | null
  onUnlink?: () => void
}

export function GithubLinkBanner({
  linked,
  login,
  onUnlink,
}: GithubLinkBannerProps) {
  if (linked) {
    return (
      <div className="border-border bg-card flex items-center justify-between gap-4 rounded-[var(--radius)] border px-5 py-3 text-sm">
        <span className="flex items-center gap-2">
          <FontAwesomeIcon icon={faGithub} className="size-4" />
          GitHub conectado como{' '}
          <strong className="text-foreground">@{login}</strong> — commits
          atribuídos a você.
        </span>
        <button
          type="button"
          onClick={onUnlink}
          className="text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
        >
          Desconectar
        </button>
      </div>
    )
  }
  return (
    <div className="border-warn/40 bg-warn/10 flex items-center justify-between gap-4 rounded-[var(--radius)] border px-5 py-3 text-sm">
      <span className="flex items-center gap-2">
        <FontAwesomeIcon icon={faGithub} className="size-4" />
        Conecte sua conta GitHub para salvar alterações no conteúdo.
      </span>
      <Button asChild size="sm">
        <a href="/api/admin/github/login">Conectar GitHub</a>
      </Button>
    </div>
  )
}
