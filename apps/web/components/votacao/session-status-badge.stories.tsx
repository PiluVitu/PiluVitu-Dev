import type { Meta, StoryObj } from '@storybook/nextjs'
import { SessionStatusBadge } from './session-status-badge'

const meta: Meta<typeof SessionStatusBadge> = {
  title: 'Votacao/SessionStatusBadge',
  component: SessionStatusBadge,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
}
export default meta
type Story = StoryObj<typeof SessionStatusBadge>

export const Open: Story = { args: { status: 'open' } }
export const Closed: Story = { args: { status: 'closed' } }
