'use client'

import type { MutableRefObject } from 'react'
import type { EditorView } from '@codemirror/view'
import {
  wrapSelection,
  prefixLines,
  linkSelection,
  type EditResult,
} from '@/lib/admin/mdx-toolbar-actions'

type Action = (doc: string, from: number, to: number) => EditResult

const BUTTONS: { label: string; title: string; fn: Action }[] = [
  {
    label: 'H2',
    title: 'Título',
    fn: (d, f, t) => prefixLines(d, f, t, '## '),
  },
  {
    label: 'B',
    title: 'Negrito',
    fn: (d, f, t) => wrapSelection(d, f, t, '**', '**'),
  },
  {
    label: 'I',
    title: 'Itálico',
    fn: (d, f, t) => wrapSelection(d, f, t, '_', '_'),
  },
  { label: '❝', title: 'Citação', fn: (d, f, t) => prefixLines(d, f, t, '> ') },
  {
    label: '</>',
    title: 'Código',
    fn: (d, f, t) => wrapSelection(d, f, t, '`', '`'),
  },
  { label: '•', title: 'Lista', fn: (d, f, t) => prefixLines(d, f, t, '- ') },
  { label: '🔗', title: 'Link', fn: linkSelection },
]

export function MdxToolbar(props: {
  editorRef: MutableRefObject<EditorView | null>
}) {
  const apply = (fn: Action) => {
    const view = props.editorRef.current
    if (!view) return
    const { from, to } = view.state.selection.main
    const { text, selFrom, selTo } = fn(view.state.doc.toString(), from, to)
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: text },
      selection: { anchor: selFrom, head: selTo },
    })
    view.focus()
  }
  return (
    <div className="border-border bg-muted/30 flex flex-wrap items-center gap-1 border-b px-2 py-1.5">
      {BUTTONS.map((b) => (
        <button
          key={b.title}
          type="button"
          title={b.title}
          aria-label={b.title}
          // mousedown + preventDefault: não tira o foco/seleção do editor antes de aplicar
          onMouseDown={(e) => {
            e.preventDefault()
            apply(b.fn)
          }}
          className="text-muted-foreground hover:bg-muted hover:text-foreground rounded px-2 py-1 font-mono text-xs"
        >
          {b.label}
        </button>
      ))}
    </div>
  )
}
