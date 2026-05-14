import type { Meta, StoryObj } from '@storybook/nextjs'
import { KanbanCard } from '@/components/kanban/kanban-card'
import { DndContext } from '@dnd-kit/core'
import { SortableContext } from '@dnd-kit/sortable'
import { TAG_COLORS } from '@/lib/kanban-schema'

const mockTags = {
  t1: { id: 't1', label: 'Frontend', color: TAG_COLORS[0] },
  t2: { id: 't2', label: 'Bug', color: TAG_COLORS[3] },
}

const baseCard = {
  id: 'c1',
  title: 'Implementar autenticação OAuth',
  description: 'Usar GitHub OAuth2',
  links: [],
  tagIds: [],
  createdAt: new Date().toISOString(),
}

const meta = {
  title: 'Kanban/KanbanCard',
  component: KanbanCard,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <DndContext>
        <SortableContext items={['c1']}>
          <div className="w-72">
            <Story />
          </div>
        </SortableContext>
      </DndContext>
    ),
  ],
} satisfies Meta<typeof KanbanCard>

export default meta
type Story = StoryObj<typeof meta>

export const Simples: Story = {
  args: { card: baseCard, columnId: 'col1', tags: {}, onClick: () => {} },
}

export const ComTags: Story = {
  args: {
    card: { ...baseCard, tagIds: ['t1', 't2'] },
    columnId: 'col1',
    tags: mockTags,
    onClick: () => {},
  },
}

export const ComLinks: Story = {
  args: {
    card: {
      ...baseCard,
      links: [
        { url: 'https://docs.github.com', label: 'Docs' },
        { url: 'https://example.com' },
      ],
    },
    columnId: 'col1',
    tags: {},
    onClick: () => {},
  },
}

export const Completo: Story = {
  args: {
    card: {
      ...baseCard,
      links: [{ url: 'https://docs.github.com', label: 'Docs' }],
      tagIds: ['t1', 't2'],
    },
    columnId: 'col1',
    tags: mockTags,
    onClick: () => {},
  },
}

export const TituloLongo: Story = {
  args: {
    card: {
      ...baseCard,
      title:
        'Implementar sistema de autenticação completo com múltiplos provedores OAuth2 e suporte a 2FA via TOTP',
    },
    columnId: 'col1',
    tags: {},
    onClick: () => {},
  },
}
