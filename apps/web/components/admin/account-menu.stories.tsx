import type { Meta, StoryObj } from '@storybook/nextjs'
import { fn } from 'storybook/test'
import { AccountMenu } from './account-menu'

const meta: Meta<typeof AccountMenu> = {
  title: 'Admin/AccountMenu',
  component: AccountMenu,
  parameters: { layout: 'padded' },
  args: {
    name: 'Paulo Victor',
    email: 'paulo.tspi@gmail.com',
    initials: 'PV',
    onUnlink: fn(),
    onLogout: fn(),
    defaultOpen: true,
  },
}
export default meta
type Story = StoryObj<typeof AccountMenu>

export const Connected: Story = {
  args: { githubLinked: true, githubLogin: 'piluvitu' },
}
export const Disconnected: Story = {
  args: { githubLinked: false, githubLogin: null },
}
