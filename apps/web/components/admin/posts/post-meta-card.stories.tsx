import type { Meta, StoryObj } from '@storybook/nextjs'
import { fn } from 'storybook/test'
import { PostMetaCard } from './post-meta-card'

const meta: Meta<typeof PostMetaCard> = {
  title: 'Admin/Posts/PostMetaCard',
  component: PostMetaCard,
  parameters: { layout: 'padded' },
  args: { onChange: fn(), slugEditable: true },
}
export default meta
type Story = StoryObj<typeof PostMetaCard>

export const Default: Story = {
  args: {
    value: {
      title: 'T',
      slug: 'como-usar-o-husky',
      excerpt: 'Resumo do post.',
      coverImage: '',
      tags: [],
      publishedAt: '',
      draft: false,
      readingTimeMinutes: 5,
    },
  },
}
