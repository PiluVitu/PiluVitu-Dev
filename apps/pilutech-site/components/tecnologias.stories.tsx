import type { Meta, StoryObj } from '@storybook/nextjs'
import { Tecnologias } from './tecnologias'

const meta = {
  title: 'Landing/Tecnologias',
  component: Tecnologias,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Tecnologias>

export default meta
type Story = StoryObj<typeof meta>

export const Padrao: Story = {}

export const Celular: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
}
