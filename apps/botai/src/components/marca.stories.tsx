import type { Meta, StoryObj } from '@storybook/react-vite'
import { Marca } from './marca'

const meta = {
  title: 'Popup/Marca',
  component: Marca,
  args: { className: 'text-primary size-12' },
  decorators: [
    (Story) => (
      <div className="p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Marca>

export default meta
type Story = StoryObj<typeof meta>

export const Escuro: Story = {}
export const Claro: Story = { globals: { tema: 'claro' } }
