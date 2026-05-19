import type { Meta, StoryObj } from '@storybook/nextjs'
import { fn } from 'storybook/test'
import { FeedLoadMore } from '@/components/feed/feed-load-more'

const meta = {
  title: 'Feed/FeedLoadMore',
  component: FeedLoadMore,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: {
    visible: 20,
    total: 54,
    onLoadMore: fn(),
  },
} satisfies Meta<typeof FeedLoadMore>

export default meta
type Story = StoryObj<typeof meta>

export const ComMaisItens: Story = {}

export const QuaseNoFim: Story = {
  args: {
    visible: 50,
    total: 54,
  },
}

export const TodosVisiveis: Story = {
  args: {
    visible: 54,
    total: 54,
  },
}
