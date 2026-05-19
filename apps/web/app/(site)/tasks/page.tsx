import type { Metadata } from 'next'
import { KanbanBoard } from '@/components/kanban/kanban-board'

export const metadata: Metadata = {
  title: 'Mini Kanban',
  manifest: '/manifest.json',
}

export default function TasksPage() {
  return (
    <main className="min-h-screen p-6">
      <KanbanBoard />
    </main>
  )
}
