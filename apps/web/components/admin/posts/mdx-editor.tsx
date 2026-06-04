'use client'

import CodeMirror from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'

export function MdxEditor(props: {
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="border-border h-full overflow-hidden rounded-lg border">
      <CodeMirror
        value={props.value}
        onChange={props.onChange}
        extensions={[markdown()]}
        theme="dark"
        height="100%"
        style={{ height: '100%' }}
        basicSetup={{
          lineNumbers: true,
          foldGutter: false,
          highlightActiveLine: false,
        }}
      />
    </div>
  )
}
