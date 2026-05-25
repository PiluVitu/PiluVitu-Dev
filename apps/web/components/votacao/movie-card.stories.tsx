import type { Meta, StoryObj } from '@storybook/nextjs'
import { MovieCard } from './movie-card'

const meta: Meta<typeof MovieCard> = {
  title: 'Votacao/MovieCard',
  component: MovieCard,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div className="w-64">
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof MovieCard>

const baseMovie = {
  ID: 1,
  SessionID: 10,
  Category: 'terror',
  Title: 'A Coisa',
  Type: 'filme' as const,
  PosterURL: 'https://image.tmdb.org/t/p/w500/sample.jpg',
  TMDbID: 550,
  WasWatched: false,
  SheetNumber: 42,
}

export const Default: Story = { args: { movie: baseMovie } }
export const Selected: Story = { args: { movie: baseMovie, selected: true } }
export const YouVoted: Story = {
  args: { movie: baseMovie, youVoted: true, disabled: true },
}
export const NoPoster: Story = {
  args: { movie: { ...baseMovie, PosterURL: '' } },
}
export const Watched: Story = {
  args: { movie: { ...baseMovie, WasWatched: true } },
}
