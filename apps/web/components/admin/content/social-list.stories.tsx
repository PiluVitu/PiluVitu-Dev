import type { Meta, StoryObj } from '@storybook/nextjs'
import { fn } from 'storybook/test'
import { SocialList } from './social-list'

const meta: Meta<typeof SocialList> = {
  title: 'Admin/Content/SocialList',
  component: SocialList,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: { onReorder: fn(), onEdit: fn(), onDelete: fn() },
}
export default meta
type Story = StoryObj<typeof SocialList>

export const Default: Story = {
  args: {
    entries: [
      {
        slug: 'github',
        data: {
          key: 'github',
          order: 0,
          socialDescription: 'Acesse o meu Github',
          socialLink: 'https://github.com/PiluVitu',
          iconMode: 'fontawesome',
          fontawesomeIcon: 'brands__github',
          image: '',
          altImage: 'GH',
        },
      },
    ],
  },
}
