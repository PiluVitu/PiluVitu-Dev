import type { Meta, StoryObj } from '@storybook/nextjs'
import { Landing } from './landing'

const meta = {
  title: 'Landing/Pagina',
  component: Landing,
  parameters: { layout: 'fullscreen' },
  globals: { fundo: 'claro' },
} satisfies Meta<typeof Landing>

export default meta
type Story = StoryObj<typeof meta>

export const EmBreve: Story = {
  args: { faseDoBotai: 'em-breve', ano: 2026 },
}
export const BotaiPublicado: Story = {
  args: { faseDoBotai: 'disponivel', ano: 2026 },
}
