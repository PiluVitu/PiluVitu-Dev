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

export const ComImagem: Story = {
  args: {
    article: {
      id: 'blog-como-usar-husky',
      source: 'blog',
      title: 'Como usar o husky para garantir a qualidade do seu código',
      href: '/posts/como-usar-husky',
      isExternal: false,
      socialImage:
        'https://media2.dev.to/dynamic/image/width=1000,height=500,fit=cover,gravity=auto,format=auto/https%3A%2F%2Fdev-to-uploads.s3.amazonaws.com%2Fuploads%2Farticles%2Fexample.jpg',
      readingTimeMinutes: 4,
      reactionsCount: 0,
      commentsCount: 0,
      publishedAt: '2026-04-10T10:00:00.000Z',
    },
  },
}

export const SemImagem: Story = {
  name: 'Sem imagem (fallback gerado)',
  args: {
    article: {
      id: 'blog-dicas-linux',
      source: 'blog',
      title: 'Dicas e configurações para seu sistema linux',
      href: '/posts/dicas-linux',
      isExternal: false,
      socialImage: null,
      readingTimeMinutes: 7,
      reactionsCount: 0,
      commentsCount: 0,
      publishedAt: '2026-03-20T09:00:00.000Z',
    },
  },
}

export const TituloLongo: Story = {
  name: 'Título longo (truncado)',
  args: {
    article: {
      id: 'blog-titulo-muito-longo',
      source: 'blog',
      title:
        'Instalando de maneira rápida e eficiente suas ferramentas no WSL Pt.2 com exemplos práticos',
      href: '/posts/instalando-wsl-pt2',
      isExternal: false,
      socialImage: null,
      readingTimeMinutes: 15,
      reactionsCount: 0,
      commentsCount: 0,
      publishedAt: '2026-03-01T08:00:00.000Z',
    },
  },
}
