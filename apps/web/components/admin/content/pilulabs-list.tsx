'use client'

import type { PiluLabsEntry } from '@/lib/admin/content-schemas'
import { SortableList } from './sortable-list'

const ROTULO_DO_TIPO: Record<PiluLabsEntry['tipo'], string> = {
  extensao: 'Extensão',
  mobile: 'Mobile',
  web: 'Web',
  cli: 'CLI',
}

export function PiluLabsList(props: {
  entries: { slug: string; data: PiluLabsEntry }[]
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
            <p className="truncate font-semibold">{e.data.nome}</p>
            <p className="text-muted-foreground truncate text-sm">
              {e.data.subtitulo || e.slug}
            </p>
            <p
              data-testid="marcas"
              className="text-muted-foreground mt-1 flex flex-wrap gap-2 font-mono text-xs"
            >
              <span>{ROTULO_DO_TIPO[e.data.tipo]}</span>
              <span>{e.data.listado ? 'Listado' : 'Oculto'}</span>
              {e.data.destaque ? <span>Destaque</span> : null}
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
