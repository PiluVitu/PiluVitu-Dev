import type { Meta, StoryObj } from '@storybook/nextjs'
import { JwtTool } from '@/components/tools/jwt-tool'

const meta = {
  title: 'Tools/JwtTool',
  component: JwtTool,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof JwtTool>

export default meta
type Story = StoryObj<typeof meta>

export const Vazio: Story = {}
