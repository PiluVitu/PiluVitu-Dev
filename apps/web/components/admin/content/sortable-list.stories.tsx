import type { Meta, StoryObj } from '@storybook/nextjs'
import { useState } from 'react'
import { SortableList } from './sortable-list'

const meta: Meta = {
  title: 'Admin/Content/SortableList',
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

export const Default: Story = {
  render: () => {
    const [items, setItems] = useState([
      { slug: 'a' },
      { slug: 'b' },
      { slug: 'c' },
    ])
    return (
      <SortableList
        items={items}
        onReorder={(slugs) => setItems(slugs.map((s) => ({ slug: s })))}
        renderItem={(i) => (
          <div className="border-border bg-card rounded-lg border px-4 py-3">
            {i.slug}
          </div>
        )}
      />
    )
  },
}
