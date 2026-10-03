import type { Meta, StoryObj } from '@storybook/nextjs'
import { Rodape } from './rodape'

const meta = {
  title: 'Landing/Rodape',
  component: Rodape,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Rodape>

export default meta
type Story = StoryObj<typeof meta>

export const Padrao: Story = { args: { ano: 2026 } }
