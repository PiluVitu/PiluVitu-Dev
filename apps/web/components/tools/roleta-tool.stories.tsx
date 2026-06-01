import type { Meta, StoryObj } from '@storybook/nextjs'
import { RoletaTool } from './roleta-tool'

const meta: Meta<typeof RoletaTool> = {
  title: 'Tools/RoletaTool',
  component: RoletaTool,
}
export default meta
type Story = StoryObj<typeof RoletaTool>

export const Default: Story = {}
