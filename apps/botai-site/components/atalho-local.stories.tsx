import type { Meta, StoryObj } from '@storybook/nextjs'
import { AtalhoLocal } from './atalho-local'

// Mostra o atalho do sistema de quem abre o Storybook.
const meta = {
  title: 'Landing/AtalhoLocal',
  component: AtalhoLocal,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof AtalhoLocal>

export default meta
type Story = StoryObj<typeof meta>

export const DoSistemaAtual: Story = {}
