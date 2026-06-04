'use client'

import { useState } from 'react'
import type { MediaItem } from '@/lib/admin/media-io'
import { MediaCard } from './media-card'

const FILTERS = ['Todos', 'PNG', 'JPG', 'WEBP', 'SVG', 'GIF'] as const
function matches(filter: string, name: string) {
  if (filter === 'Todos') return true
  if (filter === 'JPG') return /\.jpe?g$/i.test(name)
  return new RegExp(`\\.${filter.toLowerCase()}$`, 'i').test(name)
}

export function MediaGrid(props: {
  items: MediaItem[]
  onSelect?: (item: MediaItem) => void
  onDelete?: (item: MediaItem) => void
}) {
  const [filter, setFilter] = useState<string>('Todos')
  const shown = props.items.filter((i) => matches(filter, i.filename))
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-pill px-3 py-1 font-mono text-xs ${filter === f ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
          >
            {f}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nenhuma imagem.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
          {shown.map((item) => (
            <MediaCard
              key={item.filename}
              item={item}
              onSelect={props.onSelect}
              onDelete={props.onDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}
