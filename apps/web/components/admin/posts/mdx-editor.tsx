'use client'

import CodeMirror from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import type { EditorView } from '@codemirror/view'

export function MdxEditor(props: {
  value: string
  onChange: (v: string) => void
  onReady?: (view: EditorView) => void
}) {
  return (
    <div className="h-full overflow-hidden">
      <CodeMirror
        value={props.value}
        onChange={props.onChange}
        extensions={[markdown()]}
        theme="dark"
        height="100%"
        style={{ height: '100%' }}
        onCreateEditor={(view: EditorView) => props.onReady?.(view)}
        basicSetup={{
          lineNumbers: false,
          foldGutter: false,
          highlightActiveLine: false,
        }}
      />
    </div>
  )
}
