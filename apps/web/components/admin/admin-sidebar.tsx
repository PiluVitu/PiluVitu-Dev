'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faNewspaper,
  faDiagramProject,
  faBriefcase,
  faUser,
  faImage,
  faSquareCheck,
  faCubes,
  faUpRightFromSquare,
  faRightFromBracket,
  type IconDefinition,
} from '@fortawesome/free-solid-svg-icons'
import { cn } from '@/lib/utils'

export interface SidebarCounts {
  posts?: number
  projects?: number
  careers?: number
  sessions?: number
}

interface NavItem {
  label: string
  href: string
  icon: IconDefinition
  countKey?: keyof SidebarCounts
}

interface NavGroup {
  title: string
  items: NavItem[]
}

const GROUPS: NavGroup[] = [
  {
    title: 'Coleções',
    items: [
      { label: 'Posts', href: '/admin', icon: faNewspaper, countKey: 'posts' },
      {
        label: 'Projetos',
        href: '/admin/projetos',
        icon: faDiagramProject,
        countKey: 'projects',
      },
      {
        label: 'Carreira',
        href: '/admin/carreira',
        icon: faBriefcase,
        countKey: 'careers',
      },
    ],
  },
  {
    title: 'Site',
    items: [
      { label: 'Perfil & bio', href: '/admin/perfil', icon: faUser },
      { label: 'Mídia', href: '/admin/midia', icon: faImage },
    ],
  },
  {
    title: 'Votação',
    items: [
      {
        label: 'Sessões',
        href: '/admin/sessoes',
        icon: faSquareCheck,
        countKey: 'sessions',
      },
    ],
  },
]

export function AdminSidebar({
  counts = {},
  onLogout,
}: {
  counts?: SidebarCounts
  onLogout?: () => void
}) {
  const pathname = usePathname()
  return (
    <aside className="border-border bg-card/40 flex w-64 shrink-0 flex-col gap-6 border-r px-4 py-6">
      <Link href="/admin" className="flex items-center gap-2 px-2">
        <span className="bg-primary text-primary-foreground grid size-8 place-items-center rounded-lg font-bold">
          P
        </span>
        <span className="text-lg font-semibold">piluvitu</span>
      </Link>

      <nav className="flex flex-1 flex-col gap-6">
        {GROUPS.map((group) => (
          <div key={group.title} className="flex flex-col gap-1">
            <p className="text-muted-foreground px-2 font-mono text-[10px] font-semibold tracking-[0.2em] uppercase">
              {group.title}
            </p>
            {group.items.map((item) => {
              const active = pathname === item.href
              const count = item.countKey ? counts[item.countKey] : undefined
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center justify-between rounded-lg px-2 py-2 text-sm transition-colors',
                    active
                      ? 'bg-accent-soft text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/40',
                  )}
                >
                  <span className="flex items-center gap-3">
                    <FontAwesomeIcon icon={item.icon} className="size-4" />
                    {item.label}
                  </span>
                  {count !== undefined ? (
                    <span className="text-muted-foreground font-mono text-xs">
                      {count}
                    </span>
                  ) : null}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      <div className="border-border text-muted-foreground flex flex-col gap-2 border-t pt-4 text-sm">
        <Link
          href="/design-system"
          className="hover:text-foreground flex items-center gap-3 px-2 transition-colors"
        >
          <FontAwesomeIcon icon={faCubes} className="size-4" /> Design System
        </Link>
        <Link
          href="/"
          className="hover:text-foreground flex items-center gap-3 px-2 transition-colors"
        >
          <FontAwesomeIcon icon={faUpRightFromSquare} className="size-4" /> Ver
          site
        </Link>
        <button
          type="button"
          onClick={onLogout}
          className="hover:text-foreground flex items-center gap-3 px-2 text-left transition-colors"
        >
          <FontAwesomeIcon icon={faRightFromBracket} className="size-4" /> Sair
        </button>
      </div>
    </aside>
  )
}
