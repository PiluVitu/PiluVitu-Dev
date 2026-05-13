import type { Meta, StoryObj } from '@storybook/nextjs'
import { JsonTool } from '@/components/tools/json-tool'

const meta = {
  title: 'Tools/JsonTool',
  component: JsonTool,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof JsonTool>

export default meta
type Story = StoryObj<typeof meta>

export const Vazio: Story = {}
