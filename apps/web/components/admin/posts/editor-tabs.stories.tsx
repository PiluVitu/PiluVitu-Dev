import type { Meta, StoryObj } from '@storybook/nextjs'
import { fn } from 'storybook/test'
import { EditorTabs } from './editor-tabs'

const meta: Meta<typeof EditorTabs> = {
  title: 'Admin/Posts/EditorTabs',
  component: EditorTabs,
  parameters: { layout: 'padded' },
  args: { onChange: fn() },
}
export default meta
type Story = StoryObj<typeof EditorTabs>

export const Editar: Story = { args: { value: 'edit' } }
export const Dividir: Story = { args: { value: 'split' } }
export const Preview: Story = { args: { value: 'preview' } }
