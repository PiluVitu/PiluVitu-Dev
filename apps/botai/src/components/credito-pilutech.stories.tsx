import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { CreditoPiluTech } from './credito-pilutech'

const meta = {
  title: 'Popup/Crédito PiluTech',
  component: CreditoPiluTech,
  args: { onAbrir: fn() },
  decorators: [
    (Story) => (
      <div className="w-[380px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CreditoPiluTech>

export default meta
type Story = StoryObj<typeof meta>

export const Escuro: Story = {}
export const Claro: Story = { globals: { tema: 'claro' } }
