import type { Meta, StoryObj } from '@storybook/nextjs'
import { Base64Tool } from '@/components/tools/base64-tool'

const meta = {
  title: 'Tools/Base64Tool',
  component: Base64Tool,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Base64Tool>

export default meta
type Story = StoryObj<typeof meta>

export const Vazio: Story = {}
