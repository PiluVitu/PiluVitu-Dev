import type { Meta, StoryObj } from '@storybook/nextjs'
import { AdminSidebar } from './admin-sidebar'

const meta: Meta<typeof AdminSidebar> = {
  title: 'Admin/AdminSidebar',
  component: AdminSidebar,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
}
export default meta
type Story = StoryObj<typeof AdminSidebar>

export const Default: Story = {
  args: { counts: { posts: 6, projects: 1, careers: 5, sessions: 2 } },
  render: (args) => (
    <div className="bg-background flex h-screen">
      <AdminSidebar {...args} />
    </div>
  ),
}
