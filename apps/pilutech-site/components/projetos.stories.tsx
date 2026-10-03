import type { Meta, StoryObj } from '@storybook/nextjs'
import { Projetos } from './projetos'

const meta = {
  title: 'Landing/Projetos',
  component: Projetos,
  parameters: { layout: 'fullscreen' },
  globals: { fundo: 'claro' },
} satisfies Meta<typeof Projetos>

export default meta
type Story = StoryObj<typeof meta>

export const EmBreve: Story = { args: { faseDoBotai: 'em-breve' } }
export const BotaiPublicado: Story = { args: { faseDoBotai: 'disponivel' } }
