import type { Meta, StoryObj } from '@storybook/nextjs'
import { fn } from 'storybook/test'
import { FeedSearch } from '@/components/feed/feed-search'

const meta = {
  title: 'Feed/FeedSearch',
  component: FeedSearch,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    value: '',
    onChange: fn(),
  },
} satisfies Meta<typeof FeedSearch>

export default meta
type Story = StoryObj<typeof meta>

export const Vazio: Story = {}

export const ComTexto: Story = {
  args: {
    value: 'next.js',
  },
}
