import type { Meta, StoryObj } from '@storybook/nextjs'
import { FeedPostCard } from '@/components/feed/feed-post-card'

const meta = {
  title: 'Feed/FeedPostCard',
  component: FeedPostCard,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: {
    post: {
      id: 'https://dev.to/piluvitu/exemplo',
      title: 'Como construir um agregador de RSS com Next.js 16',
      link: 'https://dev.to/piluvitu/exemplo',
      snippet:
        'Neste artigo vamos explorar como criar um agregador de feeds RSS usando Next.js 16, Keystatic e TanStack Query para uma experiência de leitura moderna.',
      publishedAt: new Date('2026-04-01T10:00:00Z').toISOString(),
      source: {
        id: 'devto-piluvitu',
        name: 'DEV.to Piluvitu',
        accentColor: '#3b82f6',
        category: 'tech',
      },
    },
  },
} satisfies Meta<typeof FeedPostCard>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const ComImagem: Story = {
  args: {
    post: {
      id: 'https://css-tricks.com/post-com-imagem',
      title: 'Modern CSS Techniques You Should Know in 2026',
      link: 'https://css-tricks.com/post-com-imagem',
      snippet:
        'CSS has evolved a lot. Here are some techniques that will make your stylesheets cleaner and more powerful.',
      publishedAt: new Date('2026-03-28T14:30:00Z').toISOString(),
      coverImage: 'https://picsum.photos/seed/css/800/400',
      source: {
        id: 'css-tricks',
        name: 'CSS Tricks',
        accentColor: '#f97316',
        category: 'design',
      },
    },
  },
}

export const SemCategoria: Story = {
  args: {
    post: {
      id: 'https://blog.exemplo.com/sem-cat',
      title: 'Post sem categoria definida no feed',
      link: 'https://blog.exemplo.com/sem-cat',
      snippet: 'Este post vem de um feed sem categoria configurada.',
      publishedAt: new Date('2026-03-20T09:00:00Z').toISOString(),
      source: {
        id: 'blog-exemplo',
        name: 'Blog Exemplo',
        accentColor: '#64748b',
      },
    },
  },
}

export const SemSnippet: Story = {
  args: {
    post: {
      id: 'https://feed.sem-snippet.com/post',
      title: 'Post com título mas sem descrição no feed',
      link: 'https://feed.sem-snippet.com/post',
      snippet: '',
      publishedAt: new Date('2026-04-10T08:00:00Z').toISOString(),
      source: {
        id: 'sem-snippet',
        name: 'Feed Minimalista',
        accentColor: '#a855f7',
        category: 'carreira',
      },
    },
  },
}
