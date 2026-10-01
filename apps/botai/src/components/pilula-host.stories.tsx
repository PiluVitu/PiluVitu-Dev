import type { Meta, StoryObj } from '@storybook/react-vite'
import { PilulaHost } from './pilula-host'

const meta = {
  title: 'Popup/Pílula do host',
  component: PilulaHost,
  args: { host: 'localhost:3000', status: 'ok' },
  decorators: [
    (Story) => (
      <div className="flex p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PilulaHost>

export default meta
type Story = StoryObj<typeof meta>

export const Escuro: Story = {}
export const Claro: Story = { globals: { tema: 'claro' } }
export const Atencao: Story = {
  args: { host: 'staging.app.dev', status: 'warn' },
}
export const Cadeado: Story = {
  args: { host: 'chrome://settings', status: 'lock' },
}
export const HostLongo: Story = {
  args: {
    host: 'homologacao-do-cliente-com-nome-comprido.empresa.com.br:8443',
  },
}
