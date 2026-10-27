import type { Meta, StoryObj } from '@storybook/nextjs'
import { SessionCard } from './session-card'
import type { VotingSession } from '@/lib/votacao/types'

const meta: Meta<typeof SessionCard> = {
  title: 'Votacao/SessionCard',
  component: SessionCard,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div className="w-96">
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof SessionCard>

const baseSession: VotingSession = {
  ID: 1,
  Title: 'Sexta 22/05',
  Status: 'open',
  CreatedBy: 1,
  CreatedAt: new Date('2026-05-19T20:00:00Z').toISOString(),
  ClosedAt: null,
  WinnerMovieID: null,
  SortOptionsJSON: '{}',
}

export const Open: Story = { args: { session: baseSession, href: '/1' } }
export const Closed: Story = {
  args: {
    href: '/1',
    session: {
      ...baseSession,
      Status: 'closed',
      ClosedAt: new Date('2026-05-19T23:00:00Z').toISOString(),
      WinnerMovieID: 1,
    },
  },
}

export const Halloween: Story = {
  args: {
    href: '/1',
    session: {
      ...baseSession,
      Title: 'Noite de Halloween',
      SortOptionsJSON: JSON.stringify({ theme: 'halloween' }),
    },
  },
}
