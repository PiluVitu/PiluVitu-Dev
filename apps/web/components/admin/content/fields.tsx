'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

const inputCls =
  'border-border bg-muted/40 text-foreground placeholder:text-muted-foreground w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary'

export function FieldShell({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      {children}
      {error ? <span className="text-warn text-xs">{error}</span> : null}
    </label>
  )
}

export function TextField(props: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  error?: string
}) {
  return (
    <FieldShell label={props.label} error={props.error}>
      <input
        className={inputCls}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </FieldShell>
  )
}

export function TextareaField(props: {
  label: string
  value: string
  onChange: (v: string) => void
  rows?: number
  error?: string
}) {
  return (
    <FieldShell label={props.label} error={props.error}>
      <textarea
        className={cn(inputCls, 'min-h-24 resize-y')}
        rows={props.rows ?? 4}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </FieldShell>
  )
}

export function SelectField(props: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { label: string; value: string }[]
  error?: string
}) {
  return (
    <FieldShell label={props.label} error={props.error}>
      <select
        className={inputCls}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      >
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  )
}

export function ToggleField(props: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-muted-foreground text-sm">{props.label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={props.checked}
        onClick={() => props.onChange(!props.checked)}
        className={cn(
          'relative h-6 w-11 rounded-full transition-colors',
          props.checked ? 'bg-primary' : 'bg-muted',
        )}
      >
        <span
          className={cn(
            'bg-background absolute top-0.5 size-5 rounded-full transition-transform',
            props.checked ? 'translate-x-5' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  )
}
