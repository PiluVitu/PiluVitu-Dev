import type { Meta, StoryObj } from '@storybook/nextjs'
import { Terminal } from './terminal'

const meta = {
  title: 'Landing/Terminal',
  component: Terminal,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Terminal>

export default meta
type Story = StoryObj<typeof meta>

export const Escuro: Story = {}
