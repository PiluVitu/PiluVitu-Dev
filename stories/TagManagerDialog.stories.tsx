import type { Meta, StoryObj } from '@storybook/nextjs'
import { TagManagerDialog } from '@/components/kanban/tag-manager-dialog'
import { TAG_COLORS } from '@/lib/kanban-schema'
import { fn } from 'storybook/test'

const mockTags = {
  t1: { id: 't1', label: 'Frontend', color: TAG_COLORS[0] },
  t2: { id: 't2', label: 'Backend', color: TAG_COLORS[1] },
  t3: { id: 't3', label: 'Bug', color: TAG_COLORS[3] },
}

const meta = {
  title: 'Kanban/TagManagerDialog',
  component: TagManagerDialog,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof TagManagerDialog>

export default meta
type Story = StoryObj<typeof meta>

export const SemTags: Story = {
  args: {
    tags: {},
    onAddTag: fn(),
    onDeleteTag: fn(),
    onClose: fn(),
  },
}

export const ComTags: Story = {
  args: {
    tags: mockTags,
    onAddTag: fn(),
    onDeleteTag: fn(),
    onClose: fn(),
  },
}
