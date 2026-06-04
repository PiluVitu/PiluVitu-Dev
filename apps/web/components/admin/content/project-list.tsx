'use client'

import type { ProjectEntry } from '@/lib/admin/content-schemas'
import { SortableList } from './sortable-list'

export function ProjectList(props: {
  entries: { slug: string; data: ProjectEntry }[]
  onReorder: (slugs: string[]) => void
  onEdit: (slug: string) => void
  onDelete: (slug: string) => void
}) {
  return (
    <SortableList
      items={props.entries}
      onReorder={props.onReorder}
      renderItem={(e) => (
        <div className="border-border bg-card shadow-ds flex items-center justify-between gap-4 rounded-[var(--radius)] border px-5 py-4">
          <div className="min-w-0">
            <p className="truncate font-semibold">{e.data.projectName}</p>
            <p className="text-muted-foreground truncate text-sm">
              {e.data.subtitle || e.slug}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
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
          </div>
        </div>
      )}
    />
  )
}
