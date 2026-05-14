import { KanbanState, KanbanStateSchema } from '@/lib/kanban-schema'

export function exportState(state: KanbanState): void {
  const json = JSON.stringify(state, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const date = new Date().toISOString().slice(0, 10)
  const a = document.createElement('a')
  a.href = url
  a.download = `kanban-backup-${date}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export type ImportResult =
  | { success: true; state: KanbanState }
  | { success: false; error: string }

export function parseImport(text: string): ImportResult {
  try {
    const parsed = JSON.parse(text)
    const result = KanbanStateSchema.safeParse(parsed)
    if (result.success) return { success: true, state: result.data }
    return {
      success: false,
      error: result.error.issues[0]?.message ?? 'Arquivo inválido',
    }
  } catch {
    return { success: false, error: 'JSON malformado' }
  }
}
