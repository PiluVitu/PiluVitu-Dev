import type { Meta, StoryObj } from '@storybook/nextjs'
import { BotaoTema } from './botao-tema'

const meta = {
  title: 'Landing/BotaoTema',
  component: BotaoTema,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof BotaoTema>

export default meta
type Story = StoryObj<typeof meta>

export const Escuro: Story = {}
export const Claro: Story = { globals: { tema: 'claro' } }
