import type { Meta, StoryObj } from '@storybook/nextjs'
import { fn } from 'storybook/test'
import { PostsTable } from './posts-table'

const meta: Meta<typeof PostsTable> = {
  title: 'Admin/Posts/PostsTable',
  component: PostsTable,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: { onDelete: fn() },
}
export default meta
type Story = StoryObj<typeof PostsTable>

export const Default: Story = {
  args: {
    posts: [
      {
        filename: 'husky.mdx',
        slug: 'como-usar-husky',
        title: 'Como usar o Husky',
        draft: false,
        publishedAt: '2025-04-28',
        readingTimeMinutes: 5,
      },
      {
        filename: 'wsl.mdx',
        slug: 'wsl-pt1',
        title: 'WSL Pt.1',
        draft: true,
        publishedAt: '2025-02-05',
        readingTimeMinutes: 4,
      },
    ],
  },
}
export const Empty: Story = { args: { posts: [] } }
