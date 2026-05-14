import type { Meta, StoryObj } from '@storybook/nextjs'
import { TagBadge } from '@/components/kanban/tag-badge'
import { TAG_COLORS } from '@/lib/kanban-schema'

const meta = {
  title: 'Kanban/TagBadge',
  component: TagBadge,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof TagBadge>

export default meta
type Story = StoryObj<typeof meta>

export const Azul: Story = {
  args: { tag: { id: '1', label: 'Frontend', color: TAG_COLORS[0] } },
}

export const Verde: Story = {
  args: { tag: { id: '2', label: 'Backend', color: TAG_COLORS[1] } },
}

export const Vermelho: Story = {
  args: { tag: { id: '3', label: 'Bug', color: TAG_COLORS[3] } },
}

export const TodasAsCores: Story = {
  name: 'Todas as cores',
  args: { tag: { id: '0', label: 'Placeholder', color: TAG_COLORS[0] } },
  render: () => (
    <div className="flex flex-wrap gap-2">
      {TAG_COLORS.map((color, i) => (
        <TagBadge
          key={color}
          tag={{ id: String(i), label: `Tag ${i + 1}`, color }}
        />
      ))}
    </div>
  ),
}
