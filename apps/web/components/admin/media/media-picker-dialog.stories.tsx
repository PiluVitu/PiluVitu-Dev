import type { Meta, StoryObj } from '@storybook/nextjs'
import { fn } from 'storybook/test'
import { MediaPickerDialog } from './media-picker-dialog'

const meta: Meta<typeof MediaPickerDialog> = {
  title: 'Admin/Media/MediaPickerDialog',
  component: MediaPickerDialog,
  parameters: { layout: 'fullscreen' },
}
export default meta
type Story = StoryObj<typeof MediaPickerDialog>

// list fetch won't resolve in Storybook → shows skeleton/empty; documents the shell.
export const Open: Story = {
  args: { open: true, onOpenChange: fn(), onPick: fn() },
}
