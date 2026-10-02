import type { Meta, StoryObj } from '@storybook/nextjs'
import { Rodape } from './rodape'

const meta = {
  title: 'Landing/Rodape',
  component: Rodape,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Rodape>

export default meta
type Story = StoryObj<typeof meta>

export const Escuro: Story = {}
export const Claro: Story = { globals: { tema: 'claro' } }
