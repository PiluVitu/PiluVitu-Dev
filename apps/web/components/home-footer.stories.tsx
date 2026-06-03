import type { Meta, StoryObj } from '@storybook/nextjs'
import { HomeFooter } from './home-footer'

const meta: Meta<typeof HomeFooter> = {
  title: 'Home/HomeFooter',
  component: HomeFooter,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj<typeof HomeFooter>

export const Default: Story = {
  args: { name: 'Paulo Victor Torres Silva', year: 2026 },
}
