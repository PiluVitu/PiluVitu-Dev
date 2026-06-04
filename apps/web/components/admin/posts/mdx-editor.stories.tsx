import type { Meta, StoryObj } from '@storybook/nextjs'
import { useState } from 'react'
import { MdxEditor } from './mdx-editor'

const meta: Meta = {
  title: 'Admin/Posts/MdxEditor',
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

export const Default: Story = {
  render: () => {
    const [v, setV] = useState('# Olá\n\n```mermaid\ngraph TD; A-->B;\n```\n')
    return (
      <div className="h-96">
        <MdxEditor value={v} onChange={setV} />
      </div>
    )
  },
}
