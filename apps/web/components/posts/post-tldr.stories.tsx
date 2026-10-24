import type { Meta, StoryObj } from '@storybook/nextjs'
import { PostTldr } from './post-tldr'

const meta: Meta<typeof PostTldr> = {
  title: 'Posts/PostTldr',
  component: PostTldr,
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj<typeof PostTldr>

export const Default: Story = {
  args: {
    texto:
      'Eu mostro como configurar o Husky com lint-staged num monorepo pnpm. O hook formata só os arquivos staged, então o commit fica rápido.',
  },
}

export const Vazio: Story = { args: { texto: '' } }
