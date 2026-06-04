'use client'

import { useState } from 'react'
import { FieldShell } from './fields'
import { Button } from '@/components/ui/button'
import { mediaRawUrl } from '@/lib/admin/media-url'
import { MediaPickerDialog } from '@/components/admin/media/media-picker-dialog'

export function ImageField(props: {
  label: string
  value: string
  onChange: (v: string) => void
  error?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <FieldShell label={props.label} error={props.error}>
      <div className="flex items-center gap-3">
        <div className="border-border bg-muted/30 grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg border">
          {props.value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mediaRawUrl(props.value)}
              alt=""
              className="max-h-full max-w-full object-contain"
            />
          ) : null}
        </div>
        <input
          className="border-border bg-muted/40 text-foreground placeholder:text-muted-foreground focus:border-primary w-full rounded-lg border px-3 py-2 text-sm outline-none"
          value={props.value}
          placeholder="/media/… ou URL"
          onChange={(e) => props.onChange(e.target.value)}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
        >
          Biblioteca
        </Button>
      </div>
      <MediaPickerDialog
        open={open}
        onOpenChange={setOpen}
        onPick={(path) => props.onChange(path)}
      />
    </FieldShell>
  )
}
