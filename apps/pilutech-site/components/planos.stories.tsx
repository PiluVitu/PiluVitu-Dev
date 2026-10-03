import type { Meta, StoryObj } from '@storybook/nextjs'
import { Planos } from './planos'

const meta = {
  title: 'Landing/Planos',
  component: Planos,
  parameters: { layout: 'fullscreen' },
  globals: { fundo: 'claro' },
} satisfies Meta<typeof Planos>

export default meta
type Story = StoryObj<typeof meta>

export const Padrao: Story = {}
