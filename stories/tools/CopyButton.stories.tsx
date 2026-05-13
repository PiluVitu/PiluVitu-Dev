import type { Meta, StoryObj } from '@storybook/nextjs'
import { CopyButton } from '@/components/tools/copy-button'

const meta = {
  title: 'Tools/CopyButton',
  component: CopyButton,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof CopyButton>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { value: 'texto para copiar', label: 'Copiar' },
}
export const ComValorLongo: Story = {
  args: { value: '550e8400-e29b-41d4-a716-446655440000', label: 'Copiar UUID' },
}
