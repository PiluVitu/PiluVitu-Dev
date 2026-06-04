'use client'

import { useState } from 'react'
import { mediaRawUrl } from '@/lib/admin/media-url'
import type { MediaItem } from '@/lib/admin/media-io'

function kb(bytes: number) {
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

export function MediaCard(props: {
  item: MediaItem
  onSelect?: (item: MediaItem) => void
  onDelete?: (item: MediaItem) => void
}) {
  const [dims, setDims] = useState('')
  const clickable = !!props.onSelect
  return (
    <div className="border-border bg-card flex flex-col overflow-hidden rounded-[var(--radius)] border">
      <button
        type="button"
        disabled={!clickable}
        onClick={() => props.onSelect?.(props.item)}
        className="bg-muted/30 grid aspect-video place-items-center overflow-hidden disabled:cursor-default"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mediaRawUrl(props.item.path)}
          alt={props.item.filename}
          className="max-h-full max-w-full object-contain"
          onLoad={(e) =>
            setDims(
              `${e.currentTarget.naturalWidth} × ${e.currentTarget.naturalHeight}`,
            )
          }
        />
      </button>
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-xs">{props.item.filename}</p>
          <p className="text-muted-foreground font-mono text-[10px]">
            {dims}
            {dims ? ' · ' : ''}
            {kb(props.item.size)}
          </p>
        </div>
        {props.onDelete ? (
          <button
            type="button"
            className="text-warn shrink-0 text-xs"
            onClick={() => props.onDelete?.(props.item)}
          >
            Apagar
          </button>
        ) : null}
      </div>
    </div>
  )
}
