import type { Meta, StoryObj } from '@storybook/nextjs'
import { fn } from 'storybook/test'
import { PostPublishCard } from './post-publish-card'

const base = {
  title: 'T',
  slug: 't',
  excerpt: '',
  coverImage: '',
  tags: [],
  publishedAt: '2025-04-28',
  draft: false,
  readingTimeMinutes: 5,
}

const meta: Meta<typeof PostPublishCard> = {
  title: 'Admin/Posts/PostPublishCard',
  component: PostPublishCard,
  parameters: { layout: 'padded' },
  args: { onChange: fn(), onSave: fn() },
}
export default meta
type Story = StoryObj<typeof PostPublishCard>

export const Publicado: Story = { args: { value: base } }
export const Rascunho: Story = { args: { value: { ...base, draft: true } } }
export const Salvando: Story = { args: { value: base, pending: true } }
