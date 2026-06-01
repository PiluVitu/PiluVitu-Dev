import type { Meta, StoryObj } from '@storybook/nextjs'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TiebreakRoulette } from './tiebreak-roulette'
import type { SessionMovie } from '@/lib/votacao/types'

const MOVIES: SessionMovie[] = [
  {
    ID: 1,
    SessionID: 1,
    Category: 'Ação',
    Title: 'Duna',
    Type: 'filme',
    PosterURL: '',
    WasWatched: false,
  },
  {
    ID: 2,
    SessionID: 1,
    Category: 'Drama',
    Title: 'Matrix',
    Type: 'filme',
    PosterURL: '',
    WasWatched: false,
  },
]

const meta: Meta<typeof TiebreakRoulette> = {
  title: 'Votacao/TiebreakRoulette',
  component: TiebreakRoulette,
  decorators: [
    (Story) => (
      <QueryClientProvider client={new QueryClient()}>
        <Story />
      </QueryClientProvider>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof TiebreakRoulette>

// Note: results come from useResults; in Storybook the query stays pending so
// this demonstrates the empty/loading guard. Wheel behavior is covered by the
// RouletteWheel story.
export const Default: Story = {
  args: { sessionId: 1, movies: MOVIES },
}
