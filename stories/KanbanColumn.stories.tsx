import type { Meta, StoryObj } from '@storybook/nextjs'
import { KanbanColumn } from '@/components/kanban/kanban-column'
import { DndContext } from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { TAG_COLORS } from '@/lib/kanban-schema'
import { fn } from 'storybook/test'

const mockTags = {
  t1: { id: 't1', label: 'Frontend', color: TAG_COLORS[0] },
}

const mockCards = [
  {
    id: 'c1',
    title: 'Card um',
    description: '',
    links: [],
    tagIds: ['t1'],
    createdAt: new Date().toISOString(),
  },
  {
    id: 'c2',
    title:
      'Card dois com título bem mais longo para testar truncamento de texto na visualização',
    description: '',
    links: [],
    tagIds: [],
    createdAt: new Date().toISOString(),
  },
]

const meta = {
  title: 'Kanban/KanbanColumn',
  component: KanbanColumn,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: [
    (Story: React.ComponentType) => (
      <DndContext>
        <SortableContext items={['col1']} strategy={horizontalListSortingStrategy}>
          <Story />
        </SortableContext>
      </DndContext>
    ),
  ],
} satisfies Meta<typeof KanbanColumn>

export default meta
type Story = StoryObj<typeof meta>

export const Vazia: Story = {
  args: {
    column: { id: 'col1', title: 'Backlog', cardIds: [] },
    cards: [],
    tags: {},
    onTitleChange: fn(),
    onDelete: fn(),
    onAddCard: fn(),
    onUpdateCard: fn(),
    onDeleteCard: fn(),
  },
}

export const ComCards: Story = {
  args: {
    column: { id: 'col1', title: 'Em andamento', cardIds: ['c1', 'c2'] },
    cards: mockCards,
    tags: mockTags,
    onTitleChange: fn(),
    onDelete: fn(),
    onAddCard: fn(),
    onUpdateCard: fn(),
    onDeleteCard: fn(),
  },
}
