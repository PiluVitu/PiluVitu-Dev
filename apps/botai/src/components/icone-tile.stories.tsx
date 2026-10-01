import { faCheck, faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { IconeTile } from './icone-tile'

const meta = {
  title: 'Popup/Ícone de estado',
  component: IconeTile,
  args: {
    tom: 'neutro',
    children: <FontAwesomeIcon icon={faMagnifyingGlass} />,
  },
  decorators: [
    (Story) => (
      <div className="flex p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof IconeTile>

export default meta
type Story = StoryObj<typeof meta>

export const Neutro: Story = {}
export const Ok: Story = {
  args: { tom: 'ok', children: <FontAwesomeIcon icon={faCheck} /> },
}
export const Claro: Story = { globals: { tema: 'claro' } }
