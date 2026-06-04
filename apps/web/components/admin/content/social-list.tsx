'use client'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { VISIT_CARD_FA_ICON_MAP } from '@/lib/visit-card-fontawesome'
import type { SocialEntry } from '@/lib/admin/content-schemas'
import { SortableList } from './sortable-list'

export function SocialList(props: {
  entries: { slug: string; data: SocialEntry }[]
  onReorder: (slugs: string[]) => void
  onEdit: (slug: string) => void
  onDelete: (slug: string) => void
}) {
  return (
    <SortableList
      items={props.entries}
      onReorder={props.onReorder}
      renderItem={(e) => {
        const icon = VISIT_CARD_FA_ICON_MAP[e.data.fontawesomeIcon]
        return (
          <div className="border-border bg-card flex items-center justify-between gap-4 rounded-[var(--radius)] border px-5 py-3">
            <span className="flex min-w-0 items-center gap-3">
              <span className="bg-accent-soft text-primary grid size-8 place-items-center rounded-lg">
                {e.data.iconMode === 'fontawesome' && icon ? (
                  <FontAwesomeIcon icon={icon} className="size-4" />
                ) : null}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium">
                  {e.data.socialDescription || e.slug}
                </span>
                <span className="text-muted-foreground block truncate text-xs">
                  {e.data.socialLink}
                </span>
              </span>
            </span>
            <span className="flex shrink-0 gap-2">
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
        )
      }}
    />
  )
}
