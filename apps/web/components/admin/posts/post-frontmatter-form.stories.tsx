import type { Meta, StoryObj } from '@storybook/nextjs'
import { fn } from 'storybook/test'
import { PostFrontmatterForm } from './post-frontmatter-form'

const meta: Meta<typeof PostFrontmatterForm> = {
  title: 'Admin/Posts/PostFrontmatterForm',
  component: PostFrontmatterForm,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: { onChange: fn() },
}
export default meta
type Story = StoryObj<typeof PostFrontmatterForm>

const fm = {
  title: 'Como usar o Husky',
  slug: 'como-usar-o-husky',
  excerpt: 'resumo',
  coverImage: '',
  tags: ['git', 'husky'],
  publishedAt: '2025-04-28',
  draft: false,
  readingTimeMinutes: 0,
}

export const Editing: Story = { args: { value: fm, slugEditable: false } }
export const Creating: Story = {
  args: { value: { ...fm, slug: 'como-usar-o-husky' }, slugEditable: true },
}
