import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { LinhaCopiavel } from './linha-copiavel'

const meta = {
  title: 'Popup/Linha copiável',
  component: LinhaCopiavel,
  args: {
    rotulo: 'CPF',
    valor: '529.982.247-25',
    copiado: false,
    onCopiar: fn(),
  },
  decorators: [
    (Story) => (
      <div className="p-2">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LinhaCopiavel>

export default meta
type Story = StoryObj<typeof meta>

export const Escuro: Story = {}
export const Claro: Story = { globals: { tema: 'claro' } }
export const Copiado: Story = { args: { copiado: true } }
export const ValorLongo: Story = {
  args: {
    rotulo: 'E-mail',
    valor: 'maria-ribeiro-4821@tuamaeaquelaursa.com',
  },
}
