import type { Meta, StoryObj } from '@storybook/nextjs'
import { fn } from 'storybook/test'
import { ImageField } from './image-field'

const meta: Meta<typeof ImageField> = {
  title: 'Admin/Content/ImageField',
  component: ImageField,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: { label: 'Capa', onChange: fn() },
}
export default meta
type Story = StoryObj<typeof ImageField>

export const Empty: Story = { args: { value: '' } }
export const WithMediaPath: Story = { args: { value: '/media/capa.png' } }
export const WithExternalUrl: Story = {
  args: { value: 'https://aride.com.br/logo.png' },
}
