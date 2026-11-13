import type { Metadata } from 'next'
import { KanbanBoard } from '@/components/kanban/kanban-board'
import { PAGINA_KANBAN } from '@/lib/rotas-publicas'

export const metadata: Metadata = {
  title: 'Mini Kanban',
  description: PAGINA_KANBAN.descricao,
  alternates: { canonical: PAGINA_KANBAN.caminho },
  manifest: '/manifest.json',
}

export default function TasksPage() {
  return (
    <main className="min-h-screen p-6">
      <KanbanBoard />
    </main>
  )
}
