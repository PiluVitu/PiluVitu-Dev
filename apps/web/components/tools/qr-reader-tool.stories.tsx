import type { Meta, StoryObj } from '@storybook/nextjs'
import { QrReaderTool } from '@/components/tools/qr-reader-tool'

const meta = {
  title: 'Tools/QrReaderTool',
  component: QrReaderTool,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof QrReaderTool>

export default meta
type Story = StoryObj<typeof meta>

export const Idle: Story = {}
