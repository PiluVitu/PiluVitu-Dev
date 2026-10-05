import type { Meta, StoryObj } from '@storybook/nextjs'
import { Servicos } from './servicos'

const meta = {
  title: 'Landing/Servicos',
  component: Servicos,
  parameters: { layout: 'fullscreen' },
  globals: { fundo: 'claro' },
} satisfies Meta<typeof Servicos>

export default meta
type Story = StoryObj<typeof meta>

export const Padrao: Story = {}

export const Celular: Story = {
  globals: { fundo: 'claro', viewport: { value: 'mobile1', isRotated: false } },
}
