import type { Meta, StoryObj } from '@storybook/nextjs'
import { ToolCard } from '@/components/tools/tool-card'
import { TOOLS } from '@/lib/tools-registry'

const meta = {
  title: 'Tools/ToolCard',
  component: ToolCard,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div className="w-48">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ToolCard>

export default meta
type Story = StoryObj<typeof meta>

export const CPF: Story = {
  args: { tool: TOOLS.find((t) => t.slug === 'cpf')! },
}
export const QRReader: Story = {
  args: { tool: TOOLS.find((t) => t.slug === 'qr-reader')! },
}
export const UUID: Story = {
  args: { tool: TOOLS.find((t) => t.slug === 'uuid')! },
}
