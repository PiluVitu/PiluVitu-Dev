import type { Meta, StoryObj } from '@storybook/nextjs'
import { ComoFunciona } from './como-funciona'

const meta = {
  title: 'Landing/ComoFunciona',
  component: ComoFunciona,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ComoFunciona>

export default meta
type Story = StoryObj<typeof meta>

export const Padrao: Story = {}
