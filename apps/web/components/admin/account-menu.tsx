'use client'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faGithub } from '@fortawesome/free-brands-svg-icons'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@piluvitu/ui/dropdown-menu'

interface AccountMenuProps {
  name?: string
  email?: string
  initials: string
  githubLinked: boolean
  githubLogin?: string | null
  onUnlink: () => void
  onLogout: () => void
  /** Renderiza o menu já aberto — usado por stories/testes. */
  defaultOpen?: boolean
}

/**
 * Menu de conta no top bar do /admin. Mostra a identidade do usuário, o status
 * da conexão GitHub (com conectar/desconectar) e o logout. Componente puro:
 * recebe dados + handlers por prop; o wiring (hooks) fica no `AdminTopBar`.
 * Estruturado em seções pra acomodar itens futuros (tema, preferências, etc.).
 */
export function AccountMenu({
  name,
  email,
  initials,
  githubLinked,
  githubLogin,
  onUnlink,
  onLogout,
  defaultOpen,
}: AccountMenuProps) {
  return (
    <DropdownMenu defaultOpen={defaultOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Menu da conta"
          className="bg-accent-soft text-primary rounded-pill focus-visible:ring-primary/50 flex items-center gap-2 px-3 py-1.5 text-sm outline-none focus-visible:ring-2"
        >
          <span className="bg-primary text-primary-foreground grid size-6 place-items-center rounded-full text-xs font-bold">
            {initials}
          </span>
          {name ? <span className="hidden sm:inline">{name}</span> : null}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="flex items-center gap-3 py-2">
          <span className="bg-primary text-primary-foreground grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold">
            {initials}
          </span>
          <span className="min-w-0">
            {name ? (
              <span className="block truncate font-medium">{name}</span>
            ) : null}
            {email ? (
              <span className="text-muted-foreground block truncate text-xs font-normal">
                {email}
              </span>
            ) : null}
          </span>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <div className="px-2 py-1.5">
          <p className="text-muted-foreground mb-1.5 font-mono text-[10px] font-semibold tracking-[0.15em] uppercase">
            GitHub
          </p>
          <div className="flex items-center gap-2 text-sm">
            <span
              aria-hidden
              className={`size-2 shrink-0 rounded-full ${githubLinked ? 'bg-ok' : 'bg-warn'}`}
            />
            <FontAwesomeIcon icon={faGithub} className="size-4 shrink-0" />
            {githubLinked ? (
              <span className="min-w-0 truncate">
                Conectado como{' '}
                <strong className="text-foreground">@{githubLogin}</strong>
              </span>
            ) : (
              <span className="text-muted-foreground">Não conectado</span>
            )}
          </div>
          <div className="mt-2">
            {githubLinked ? (
              <button
                type="button"
                onClick={onUnlink}
                className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
              >
                Desconectar
              </button>
            ) : (
              <a
                href="/api/admin/github/login"
                className="bg-primary text-primary-foreground rounded-pill inline-block px-3 py-1 text-xs font-medium"
              >
                Conectar GitHub
              </a>
            )}
          </div>
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={onLogout} className="cursor-pointer">
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
