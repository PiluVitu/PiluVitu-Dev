'use client'

import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faXmark } from '@fortawesome/free-solid-svg-icons'
import { FieldShell } from './fields'

export function TagArrayInput(props: {
  label: string
  values: string[]
  onChange: (v: string[]) => void
  placeholder?: string
}) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const t = draft.trim()
    if (t && !props.values.includes(t)) props.onChange([...props.values, t])
    setDraft('')
  }
  return (
    <FieldShell label={props.label}>
      <div className="border-border bg-muted/40 flex flex-wrap gap-2 rounded-lg border p-2">
        {props.values.map((v) => (
          <span
            key={v}
            className="bg-accent-soft text-primary rounded-pill inline-flex items-center gap-1 px-2 py-0.5 text-xs"
          >
            {v}
            <button
              type="button"
              aria-label={`Remover ${v}`}
              onClick={() =>
                props.onChange(props.values.filter((x) => x !== v))
              }
            >
              <FontAwesomeIcon icon={faXmark} className="size-3" />
            </button>
          </span>
        ))}
        <input
          className="text-foreground min-w-24 flex-1 bg-transparent text-sm outline-none"
          value={draft}
          placeholder={props.placeholder ?? 'Adicionar…'}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          onBlur={add}
        />
      </div>
    </FieldShell>
  )
}
