import type { Meta, StoryObj } from '@storybook/nextjs'
import { AdminTopBar } from './admin-top-bar'

const meta: Meta<typeof AdminTopBar> = {
  title: 'Admin/AdminTopBar',
  component: AdminTopBar,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
}
export default meta
type Story = StoryObj<typeof AdminTopBar>

export const Default: Story = {
  args: {
    breadcrumb: ['Coleções', 'Posts'],
    userName: 'Paulo Victor',
    userInitials: 'PV',
  },
}

export const NoUserName: Story = {
  args: { breadcrumb: ['Site', 'Perfil & bio'], userInitials: 'PV' },
}
