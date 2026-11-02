import type { Meta, StoryObj } from '@storybook/nextjs'
import { HomeBentoLayout } from './home-bento-layout'

const meta = {
  title: 'Home/HomeBentoLayout',
  component: HomeBentoLayout,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof HomeBentoLayout>

export default meta
type Story = StoryObj<typeof meta>

export const SemConteudoDoCms: Story = {
  args: {
    carreiraList: [],
    initialBlogPosts: [],
  },
}
