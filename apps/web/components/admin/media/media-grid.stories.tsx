import type { Meta, StoryObj } from '@storybook/nextjs'
import { fn } from 'storybook/test'
import { MediaGrid } from './media-grid'

const meta: Meta<typeof MediaGrid> = {
  title: 'Admin/Media/MediaGrid',
  component: MediaGrid,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: { onDelete: fn() },
}
export default meta
type Story = StoryObj<typeof MediaGrid>

export const Default: Story = {
  args: {
    items: [
      {
        filename: 'capa.png',
        path: '/media/capa.png',
        size: 120000,
        sha: 's1',
      },
      {
        filename: 'avatar.jpg',
        path: '/media/avatar.jpg',
        size: 50000,
        sha: 's2',
      },
      { filename: 'logo.svg', path: '/media/logo.svg', size: 3000, sha: 's3' },
    ],
  },
}
export const Empty: Story = { args: { items: [] } }
