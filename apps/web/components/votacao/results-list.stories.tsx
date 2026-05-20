import type { Meta, StoryObj } from '@storybook/nextjs'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ResultsList } from './results-list'
import type { SessionMovie } from '@/lib/votacao/types'

// Pre-populate query cache so useResults returns data without a network call.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})
queryClient.setQueryData(['votacao', 'results', 1], {
  results: [
    { movie_id: 1, count: 5 },
    { movie_id: 2, count: 3 },
    { movie_id: 3, count: 1 },
  ],
  total_votes: 9,
})

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

const meta: Meta<typeof ResultsList> = {
  title: 'Votacao/ResultsList',
  component: ResultsList,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <div className="mx-auto max-w-2xl">
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof ResultsList>

export const Default: Story = {
  args: {
    sessionId: 1,
    movies: mockMovies,
  },
}
