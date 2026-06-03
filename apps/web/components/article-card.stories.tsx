import type { Meta, StoryObj } from '@storybook/nextjs'
import { ArticleCard } from '@/components/article-card'

const meta = {
  title: 'Blog/ArticleCard',
  component: ArticleCard,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div className="w-72">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ArticleCard>

export default meta
type Story = StoryObj<typeof meta>

const baseArticle = {
  id: 'blog-como-usar-husky',
  source: 'blog' as const,
  title: 'Como usar o Husky para garantir a qualidade do seu código',
  href: '/posts/como-usar-husky',
  isExternal: false,
  socialImage: null,
  readingTimeMinutes: 5,
  reactionsCount: 0,
  commentsCount: 0,
  publishedAt: '2026-04-10T10:00:00.000Z',
}

export const Blog: Story = { args: { article: baseArticle, index: 0 } }
export const DevTo: Story = {
  args: {
    article: {
      ...baseArticle,
      id: 'devto-1',
      source: 'devto',
      isExternal: true,
    },
    index: 1,
  },
}
