import type { Meta, StoryObj } from '@storybook/nextjs'
import { fn } from 'storybook/test'
import { MediaCard } from './media-card'

const meta: Meta<typeof MediaCard> = {
  title: 'Admin/Media/MediaCard',
  component: MediaCard,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj<typeof MediaCard>

const item = {
  filename: 'capa.png',
  path: '/media/capa.png',
  size: 120000,
  sha: 's1',
}
export const Manage: Story = { args: { item, onDelete: fn() } } // delete button shown
export const Pickable: Story = { args: { item, onSelect: fn() } } // clickable, no delete
