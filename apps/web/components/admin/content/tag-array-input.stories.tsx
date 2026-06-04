import type { Meta, StoryObj } from '@storybook/nextjs'
import { useState } from 'react'
import { TagArrayInput } from './tag-array-input'

const meta: Meta<typeof TagArrayInput> = {
  title: 'Admin/Content/TagArrayInput',
  component: TagArrayInput,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj<typeof TagArrayInput>
export const Default: Story = {
  render: () => {
    const [v, setV] = useState(['React', 'Go'])
    return (
      <div className="max-w-md">
        <TagArrayInput label="Tags" values={v} onChange={setV} />
      </div>
    )
  },
}
