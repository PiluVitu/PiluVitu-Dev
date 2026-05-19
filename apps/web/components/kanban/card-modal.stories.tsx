import type { Meta, StoryObj } from '@storybook/nextjs'
import { CardModal } from '@/components/kanban/card-modal'
import { TAG_COLORS } from '@/lib/kanban-schema'

const mockTags = {
  t1: { id: 't1', label: 'Frontend', color: TAG_COLORS[0] },
  t2: { id: 't2', label: 'Backend', color: TAG_COLORS[1] },
  t3: { id: 't3', label: 'Bug', color: TAG_COLORS[3] },
}

const meta = {
  title: 'Kanban/CardModal',
  component: CardModal,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof CardModal>

export default meta
type Story = StoryObj<typeof meta>

export const Criacao: Story = {
  args: {
    mode: 'create',
    tags: mockTags,
    onSave: () => {},
    onClose: () => {},
  },
}

export const Edicao: Story = {
  args: {
    mode: 'edit',
    card: {
      id: 'c1',
      title: 'Implementar OAuth',
      description: 'Usar GitHub OAuth2 com PKCE',
      links: [
        {
          url: 'https://docs.github.com/en/apps/oauth-apps',
          label: 'Docs GitHub',
        },
      ],
      tagIds: ['t1', 't3'],
      createdAt: new Date().toISOString(),
    },
    tags: mockTags,
    onSave: () => {},
    onDelete: () => {},
    onClose: () => {},
  },
}

export const SemTags: Story = {
  args: {
    mode: 'create',
    tags: {},
    onSave: () => {},
    onClose: () => {},
  },
}
