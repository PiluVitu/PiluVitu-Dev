// O quadro puxa o nanoid, que é ESM puro e o ts-jest não transforma.
jest.mock('@/components/kanban/kanban-board', () => ({
  KanbanBoard: () => null,
}))

import { PAGINA_KANBAN } from '@/lib/rotas-publicas'
import { metadata } from './page'

it('metadata: o mesmo título e manifest, com a descrição e o canonical do Kanban', () => {
  expect(metadata).toEqual({
    title: 'Mini Kanban',
    description: PAGINA_KANBAN.descricao,
    alternates: { canonical: '/tasks' },
    manifest: '/manifest.json',
  })
})
