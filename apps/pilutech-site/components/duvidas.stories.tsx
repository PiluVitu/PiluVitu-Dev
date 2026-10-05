import type { Meta, StoryObj } from '@storybook/nextjs'
import { Duvidas } from './duvidas'

const meta = {
  title: 'Landing/Duvidas',
  component: Duvidas,
  parameters: { layout: 'fullscreen' },
  globals: { fundo: 'claro' },
} satisfies Meta<typeof Duvidas>

export default meta
type Story = StoryObj<typeof meta>

export const Padrao: Story = {}

export const Celular: Story = {
  globals: { fundo: 'claro', viewport: { value: 'mobile1', isRotated: false } },
}
