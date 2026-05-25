import type { Meta, StoryObj } from '@storybook/nextjs'
import { SessionVotesList } from './session-votes-list'
import type { SessionVote } from '@/lib/votacao/types'

const meta: Meta<typeof SessionVotesList> = {
  title: 'Votacao/Admin/SessionVotesList',
  component: SessionVotesList,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj<typeof SessionVotesList>

const votes: SessionVote[] = [
  {
    user_id: 1,
    user_name: 'Paulo V.',
    user_email: 'paulo@x.com',
    movie_id: 2,
    movie_title: 'Harry Potter e a Câmara Secreta',
    category: 'aventura',
    created_at: '2026-05-25T17:00:00Z',
  },
  {
    user_id: 2,
    user_name: 'Maria S.',
    user_email: 'maria@x.com',
    movie_id: 8,
    movie_title: 'Matrix',
    category: 'ficção científica',
    created_at: '2026-05-25T17:02:00Z',
  },
]

export const Default: Story = { args: { votes, total: votes.length } }
export const Loading: Story = { args: { votes: [], total: 0, isLoading: true } }
export const Empty: Story = { args: { votes: [], total: 0 } }
