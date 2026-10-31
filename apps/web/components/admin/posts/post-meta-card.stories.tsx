import type { Meta, StoryObj } from '@storybook/nextjs'
import { fn } from 'storybook/test'
import { PostMetaCard } from './post-meta-card'

const meta: Meta<typeof PostMetaCard> = {
  title: 'Admin/Posts/PostMetaCard',
  component: PostMetaCard,
  parameters: { layout: 'padded' },
  args: { onChange: fn(), slugEditable: true, body: '# Husky\n\nUm texto.' },
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
      tldr: '',
      metaDescription: '',
    },
  },
}

export const ComResumo: Story = {
  args: {
    value: {
      title: 'Como usar o Husky',
      slug: 'como-usar-o-husky',
      excerpt: 'Resumo do post.',
      coverImage: '',
      tags: ['git', 'husky'],
      publishedAt: '',
      draft: false,
      readingTimeMinutes: 5,
      tldr: 'Eu mostro como configurar o Husky com lint-staged num monorepo pnpm.',
      metaDescription:
        'Como configurar o Husky com lint-staged num monorepo pnpm, passo a passo, sem varrer o repo inteiro.',
    },
  },
}
