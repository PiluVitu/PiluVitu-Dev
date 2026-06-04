import type { Meta, StoryObj } from '@storybook/nextjs'
import { StatCard } from './stat-card'

const meta: Meta<typeof StatCard> = {
  title: 'Admin/StatCard',
  component: StatCard,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj<typeof StatCard>

export const Posts: Story = {
  args: {
    label: 'Posts',
    value: 6,
    hint: (
      <>
        <strong className="text-foreground">5</strong> publicados ·{' '}
        <strong className="text-foreground">1</strong> rascunho
      </>
    ),
  },
}

export const Simple: Story = {
  args: { label: 'Projetos', value: 1, hint: '1 publicado' },
}
