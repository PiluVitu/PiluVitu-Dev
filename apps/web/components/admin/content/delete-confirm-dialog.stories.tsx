import type { Meta, StoryObj } from '@storybook/nextjs'
import { fn } from 'storybook/test'
import { DeleteConfirmDialog } from './delete-confirm-dialog'

const meta: Meta<typeof DeleteConfirmDialog> = {
  title: 'Admin/Content/DeleteConfirmDialog',
  component: DeleteConfirmDialog,
  tags: ['autodocs'],
  args: {
    open: true,
    onOpenChange: fn(),
    onConfirm: fn(),
    itemLabel: 'Live PRs',
  },
}
export default meta
type Story = StoryObj<typeof DeleteConfirmDialog>

export const Open: Story = {}

export const Pending: Story = {
  args: { pending: true },
}
