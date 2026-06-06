'use client'

import Link from 'next/link'
import { useCurrentUser } from '@/hooks/votacao/use-current-user'

type HomeFooterProps = {
  name: string
  year?: number
}

const linkCls = 'hover:text-foreground transition-colors'

export function HomeFooter({
  name,
  year = new Date().getFullYear(),
}: HomeFooterProps) {
  const user = useCurrentUser()
  const isLoggedIn = !!user.data
  const isAdmin = !!user.data?.is_admin

  return (
    <footer className="text-muted-foreground border-border mt-2 flex flex-col gap-2 border-t pt-6 font-mono text-xs sm:flex-row sm:items-center sm:justify-between">
      <span>
        © {year} {name}
      </span>
      <span className="flex flex-wrap items-center gap-x-2">
        <span>piluvitu.com.br</span>
        <span aria-hidden>·</span>
        <Link href="/tools" className={linkCls}>
          /tools
        </Link>
        <span aria-hidden>·</span>
        {/* /tasks (Kanban) é PWA offline (localStorage) → sempre visível, não
            depende do back nem de login. */}
        <Link href="/tasks" className={linkCls}>
          /tasks
        </Link>
        {/* /votação precisa do back (sessão/dados) → só pra logado. */}
        {isLoggedIn ? (
          <>
            <span aria-hidden>·</span>
            <Link href="/votacao" className={linkCls}>
              /votação
            </Link>
          </>
        ) : null}
        {/* admin só aparece pra admin logado. */}
        {isAdmin ? (
          <>
            <span aria-hidden>·</span>
            <Link href="/admin" className={linkCls}>
              admin
            </Link>
          </>
        ) : null}
      </span>
    </footer>
  )
}
