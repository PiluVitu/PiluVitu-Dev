import type { Meta, StoryObj } from '@storybook/nextjs'
import { fn } from 'storybook/test'
import { CoverImageCard } from './cover-image-card'

const meta: Meta<typeof CoverImageCard> = {
  title: 'Admin/Posts/CoverImageCard',
  component: CoverImageCard,
  parameters: { layout: 'padded' },
  args: { onChange: fn() },
}
export default meta
type Story = StoryObj<typeof CoverImageCard>

export const Vazio: Story = { args: { value: '' } }
export const ComImagem: Story = { args: { value: '/media/capa.png' } }
