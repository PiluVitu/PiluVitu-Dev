import type { Meta, StoryObj } from '@storybook/nextjs'
import { Contato } from './contato'

const meta = {
  title: 'Landing/Contato',
  component: Contato,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Contato>

export default meta
type Story = StoryObj<typeof meta>

export const Padrao: Story = {}
