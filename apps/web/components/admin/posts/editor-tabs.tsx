'use client'

export type EditorTab = 'edit' | 'split' | 'preview'

const TABS: { value: EditorTab; label: string }[] = [
  { value: 'edit', label: 'Editar' },
  { value: 'split', label: 'Dividir' },
  { value: 'preview', label: 'Pré-visualizar' },
]

export function EditorTabs(props: {
  value: EditorTab
  onChange: (t: EditorTab) => void
}) {
  return (
    <div className="border-border bg-muted/40 rounded-pill inline-flex gap-1 border p-1">
      {TABS.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => props.onChange(t.value)}
          className={`rounded-pill px-3 py-1 text-xs font-medium transition-colors ${
            props.value === t.value
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
