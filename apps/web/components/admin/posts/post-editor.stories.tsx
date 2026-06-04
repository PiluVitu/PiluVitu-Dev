import type { Meta, StoryObj } from '@storybook/nextjs'
import { fn } from 'storybook/test'
import { PostEditor } from './post-editor'

const meta: Meta<typeof PostEditor> = {
  title: 'Admin/Posts/PostEditor',
  component: PostEditor,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  args: { onSave: fn() },
}
export default meta
type Story = StoryObj<typeof PostEditor>

const fm = {
  title: 'Como usar o Husky',
  slug: 'como-usar-o-husky',
  excerpt: 'resumo',
  coverImage: '',
  tags: ['git'],
  publishedAt: '2025-04-28',
  draft: false,
}

// The preview pane calls the server serialize route, which Storybook can't run —
// it will show the "Comece a escrever…"/error state. The editor + frontmatter are interactive.
export const Edit: Story = {
  args: {
    mode: 'edit',
    initialFrontmatter: fm,
    initialBody: '# Husky\n\nbody',
    pending: false,
  },
}
export const Create: Story = {
  args: {
    mode: 'create',
    initialFrontmatter: {
      title: '',
      slug: '',
      excerpt: '',
      coverImage: '',
      tags: [],
      publishedAt: '',
      draft: true,
    },
    initialBody: '# Novo\n\n',
    pending: false,
  },
}
