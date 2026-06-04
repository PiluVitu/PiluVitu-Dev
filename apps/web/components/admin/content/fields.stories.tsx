import type { Meta, StoryObj } from '@storybook/nextjs'
import { useState } from 'react'
import { TextField, TextareaField, SelectField, ToggleField } from './fields'

const meta: Meta = {
  title: 'Admin/Content/Fields',
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

export const AllFields: Story = {
  render: () => {
    const [t, setT] = useState('Live PRs')
    const [a, setA] = useState('desc')
    const [s, setS] = useState('#14b8a6')
    const [on, setOn] = useState(true)
    return (
      <div className="flex max-w-md flex-col gap-4">
        <TextField label="Nome" value={t} onChange={setT} />
        <TextareaField label="Descrição" value={a} onChange={setA} />
        <SelectField
          label="Cor"
          value={s}
          onChange={setS}
          options={[
            { label: 'Verde água', value: '#14b8a6' },
            { label: 'Ciano', value: '#06b6d4' },
          ]}
        />
        <ToggleField
          label="Disponível para oportunidades"
          checked={on}
          onChange={setOn}
        />
      </div>
    )
  },
}
