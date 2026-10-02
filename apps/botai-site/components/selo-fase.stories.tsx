import type { Meta, StoryObj } from '@storybook/nextjs'
import { SeloFase } from './selo-fase'

const meta = {
  title: 'Landing/SeloFase',
  component: SeloFase,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof SeloFase>

export default meta
type Story = StoryObj<typeof meta>

export const EmBreve: Story = { args: { fase: 'em-breve' } }
export const Disponivel: Story = { args: { fase: 'disponivel' } }
export const DisponivelClaro: Story = {
  args: { fase: 'disponivel' },
  globals: { tema: 'claro' },
}
