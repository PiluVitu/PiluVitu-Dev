import type { Meta, StoryObj } from '@storybook/nextjs'
import { CpfTool } from '@/components/tools/cpf-tool'

const meta = {
  title: 'Tools/CpfTool',
  component: CpfTool,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof CpfTool>

export default meta
type Story = StoryObj<typeof meta>

export const Vazio: Story = {}
