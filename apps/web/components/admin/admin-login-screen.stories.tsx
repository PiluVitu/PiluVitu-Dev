import type { Meta, StoryObj } from '@storybook/nextjs'
import { AdminLoginScreen } from './admin-login-screen'

const meta: Meta<typeof AdminLoginScreen> = {
  title: 'Admin/AdminLoginScreen',
  component: AdminLoginScreen,
  parameters: { layout: 'fullscreen' },
}
export default meta
type Story = StoryObj<typeof AdminLoginScreen>

export const Default: Story = { args: { href: '#' } }
