'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { TagManagerDialog } from './tag-manager-dialog'
import { KanbanState } from '@/lib/kanban-schema'
import { exportState, parseImport } from '@/lib/kanban-export'
import { toast } from 'sonner'
import { Action } from '@/hooks/use-kanban-store'
import { DownloadIcon, GearIcon, UploadIcon } from '@radix-ui/react-icons'

interface BoardHeaderProps {
  state: KanbanState
  dispatch: React.Dispatch<Action>
}

export function BoardHeader({ state, dispatch }: BoardHeaderProps) {
  const [showTagManager, setShowTagManager] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const result = parseImport(ev.target?.result as string)
      if (result.success) {
        dispatch({ type: 'IMPORT_STATE', state: result.state })
        toast.success('Board importado com sucesso')
      } else {
        toast.error(`Erro ao importar: ${result.error}`)
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div className="mb-6 flex items-center justify-between">
      <h1 className="text-2xl font-bold">Mini Kanban</h1>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => exportState(state)}>
          <DownloadIcon className="mr-2 h-4 w-4" />
          Exportar
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => importRef.current?.click()}
        >
          <UploadIcon className="mr-2 h-4 w-4" />
          Importar
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowTagManager(true)}
        >
          <GearIcon className="mr-2 h-4 w-4" />
          Tags
        </Button>
        <input
          ref={importRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleImport}
        />
      </div>

      {showTagManager && (
        <TagManagerDialog
          tags={state.tags}
          onAddTag={(label, color) =>
            dispatch({ type: 'ADD_TAG', label, color })
          }
          onDeleteTag={(tagId) => dispatch({ type: 'DELETE_TAG', tagId })}
          onClose={() => setShowTagManager(false)}
        />
      )}
    </div>
  )
}
