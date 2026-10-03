import type { Meta, StoryObj } from '@storybook/nextjs'
import { Barra } from './barra'

const meta = {
  title: 'Landing/Barra',
  component: Barra,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Barra>

export default meta
type Story = StoryObj<typeof meta>

export const Padrao: Story = {}
