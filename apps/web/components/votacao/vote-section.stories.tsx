import type { Meta, StoryObj } from '@storybook/nextjs'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { VoteSection } from './vote-section'
import type { SessionMovie } from '@/lib/votacao/types'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

const meta: Meta<typeof VoteSection> = {
  title: 'Votacao/VoteSection',
  component: VoteSection,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <div className="mx-auto max-w-4xl">
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof VoteSection>

const mockMovies: SessionMovie[] = [
  {
    ID: 1,
    SessionID: 1,
    Category: 'terror',
    Title: 'A Coisa',
    Type: 'filme',
    PosterURL: '',
    TMDbID: 550,
    WasWatched: false,
    SheetNumber: 1,
  },
  {
    ID: 2,
    SessionID: 1,
    Category: 'drama',
    Title: 'Forrest Gump',
    Type: 'filme',
    PosterURL: '',
    TMDbID: 13,
    WasWatched: false,
    SheetNumber: 2,
  },
  {
    ID: 3,
    SessionID: 1,
    Category: 'ficção',
    Title: 'Stranger Things',
    Type: 'serie',
    PosterURL: '',
    TMDbID: 66732,
    WasWatched: true,
    SheetNumber: 3,
  },
]

export const CanVote: Story = {
  args: {
    sessionId: 1,
    movies: mockMovies,
    alreadyVoted: false,
    closed: false,
  },
}

export const AlreadyVoted: Story = {
  args: {
    sessionId: 1,
    movies: mockMovies,
    alreadyVoted: true,
    closed: false,
  },
}

export const Closed: Story = {
  args: {
    sessionId: 1,
    movies: mockMovies,
    alreadyVoted: false,
    closed: true,
  },
}
