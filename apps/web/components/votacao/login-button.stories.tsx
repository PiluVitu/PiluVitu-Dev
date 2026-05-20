import type { Meta, StoryObj } from '@storybook/nextjs'
import { LoginButton } from './login-button'

const meta: Meta<typeof LoginButton> = {
  title: 'Votacao/LoginButton',
  component: LoginButton,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
}
export default meta
type Story = StoryObj<typeof LoginButton>

export const Default: Story = {}
