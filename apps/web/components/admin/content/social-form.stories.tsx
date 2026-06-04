import type { Meta, StoryObj } from '@storybook/nextjs'
import { fn } from 'storybook/test'
import { SocialForm } from './social-form'

const meta: Meta<typeof SocialForm> = {
  title: 'Admin/Content/SocialForm',
  component: SocialForm,
  tags: ['autodocs'],
  args: { onSubmit: fn() },
}
export default meta
type Story = StoryObj<typeof SocialForm>

export const New: Story = {}

export const Editing: Story = {
  args: {
    initial: {
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
}
