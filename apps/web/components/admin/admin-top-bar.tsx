'use client'

import { ModeToggle } from '@/components/mode-toggle'

interface AdminTopBarProps {
  breadcrumb: string[]
  userName?: string
  userInitials?: string
}

export function AdminTopBar({
  breadcrumb,
  userName,
  userInitials,
}: AdminTopBarProps) {
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
        <div className="bg-accent-soft text-primary rounded-pill flex items-center gap-2 px-3 py-1.5 text-sm">
          <span className="bg-primary text-primary-foreground grid size-6 place-items-center rounded-full text-xs font-bold">
            {userInitials ?? 'PV'}
          </span>
          {userName ? (
            <span className="hidden sm:inline">{userName}</span>
          ) : null}
        </div>
      </div>
    </header>
  )
}
