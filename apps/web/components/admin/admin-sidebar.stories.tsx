import type { Meta, StoryObj } from '@storybook/nextjs'
import { fn } from 'storybook/test'
import { AdminSidebar } from './admin-sidebar'

const meta: Meta<typeof AdminSidebar> = {
  title: 'Admin/AdminSidebar',
  component: AdminSidebar,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  args: { onLogout: fn() },
}
export default meta
type Story = StoryObj<typeof AdminSidebar>

const frame = (args: React.ComponentProps<typeof AdminSidebar>) => (
  <div className="bg-background flex h-screen">
    <AdminSidebar {...args} />
  </div>
)

export const Default: Story = {
  args: { counts: { posts: 6, projects: 1, careers: 5, sessions: 2 } },
  render: frame,
}

export const NoCounts: Story = {
  args: { counts: {} },
  render: frame,
}
