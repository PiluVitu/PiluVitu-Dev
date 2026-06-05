import type { Meta, StoryObj } from '@storybook/nextjs'
import { MdxToolbar } from './mdx-toolbar'

const meta: Meta<typeof MdxToolbar> = {
  title: 'Admin/Posts/MdxToolbar',
  component: MdxToolbar,
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj<typeof MdxToolbar>

export const Default: Story = { args: { editorRef: { current: null } } }
