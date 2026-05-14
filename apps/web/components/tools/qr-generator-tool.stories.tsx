import type { Meta, StoryObj } from '@storybook/nextjs'
import { QrGeneratorTool } from '@/components/tools/qr-generator-tool'

const meta = {
  title: 'Tools/QrGeneratorTool',
  component: QrGeneratorTool,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof QrGeneratorTool>

export default meta
type Story = StoryObj<typeof meta>

export const Vazio: Story = {}
