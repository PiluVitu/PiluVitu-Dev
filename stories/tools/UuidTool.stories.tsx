import type { Meta, StoryObj } from '@storybook/nextjs'
import { UuidTool } from '@/components/tools/uuid-tool'

const meta = {
  title: 'Tools/UuidTool',
  component: UuidTool,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof UuidTool>

export default meta
type Story = StoryObj<typeof meta>

export const Vazio: Story = {}
