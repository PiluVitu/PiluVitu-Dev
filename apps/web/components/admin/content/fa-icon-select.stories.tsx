import type { Meta, StoryObj } from '@storybook/nextjs'
import { useState } from 'react'
import { FaIconSelect } from './fa-icon-select'

const meta: Meta<typeof FaIconSelect> = {
  title: 'Admin/Content/FaIconSelect',
  component: FaIconSelect,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj<typeof FaIconSelect>
export const Default: Story = {
  render: () => {
    const [v, setV] = useState('brands__github')
    return (
      <div className="max-w-md">
        <FaIconSelect label="Ícone" value={v} onChange={setV} />
      </div>
    )
  },
}
