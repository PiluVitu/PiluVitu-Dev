import type { Meta, StoryObj } from '@storybook/nextjs'
import { UsersTable } from './users-table'
import type { AdminUser } from '@/lib/votacao/types'

const meta: Meta<typeof UsersTable> = {
  title: 'Votacao/Admin/UsersTable',
  component: UsersTable,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj<typeof UsersTable>

const users: AdminUser[] = [
  {
    id: 1,
    name: 'Paulo V.',
    email: 'paulo.tspi@gmail.com',
    picture: '',
    is_admin: true,
    created_at: '2026-05-25T16:52:29Z',
  },
  {
    id: 2,
    name: 'Maria S.',
    email: 'maria@gmail.com',
    picture: '',
    is_admin: false,
    created_at: '2026-05-24T10:00:00Z',
  },
]

export const Default: Story = { args: { users } }
export const Loading: Story = { args: { users: [], isLoading: true } }
export const Empty: Story = { args: { users: [] } }
