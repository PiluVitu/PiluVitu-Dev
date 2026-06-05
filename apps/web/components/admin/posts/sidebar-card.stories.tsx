import type { Meta, StoryObj } from '@storybook/nextjs'
import { SidebarCard } from './sidebar-card'

const meta: Meta<typeof SidebarCard> = {
  title: 'Admin/Posts/SidebarCard',
  component: SidebarCard,
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj<typeof SidebarCard>

export const Default: Story = {
  args: { title: 'Publicação', children: 'conteúdo do card' },
}
