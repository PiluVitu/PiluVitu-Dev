'use client'

import type { CarreiraEntry } from '@/lib/admin/content-schemas'
import { SortableList } from './sortable-list'

export function CarreiraList(props: {
  entries: { slug: string; data: CarreiraEntry }[]
  onReorder: (slugs: string[]) => void
  onEdit: (slug: string) => void
  onDelete: (slug: string) => void
}) {
  return (
    <div className="space-y-2">
      <div className="text-muted-foreground grid grid-cols-[2fr_2fr_1.5fr_1fr_auto] gap-4 px-5 font-mono text-xs uppercase">
        <span>Empresa</span>
        <span>Cargo</span>
        <span>Período</span>
        <span>Status</span>
        <span />
      </div>
      <SortableList
        items={props.entries}
        onReorder={props.onReorder}
        renderItem={(e) => (
          <div className="border-border bg-card grid grid-cols-[2fr_2fr_1.5fr_1fr_auto] items-center gap-4 rounded-[var(--radius)] border px-5 py-3">
            <span className="truncate font-medium">{e.data.orgName}</span>
            <span className="text-muted-foreground truncate text-sm">
              {e.data.title}
            </span>
            <span className="text-muted-foreground truncate font-mono text-xs">
              {e.data.date}
            </span>
            <span>
              <span
                className={
                  e.data.current
                    ? 'text-ok text-xs'
                    : 'text-muted-foreground text-xs'
                }
              >
                {e.data.current ? '● Atual' : 'Encerrado'}
              </span>
            </span>
            <span className="flex gap-2">
              <button
                className="text-primary text-sm"
                onClick={() => props.onEdit(e.slug)}
              >
                Editar
              </button>
              <button
                className="text-warn text-sm"
                onClick={() => props.onDelete(e.slug)}
              >
                Remover
              </button>
            </span>
          </div>
        )}
      />
    </div>
  )
}
