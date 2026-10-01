import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { PopupShell } from './popup-shell'
import { PrimeiroUso } from './primeiro-uso'
import { Rodape } from './rodape'

const meta = {
  title: 'Popup/1a · Primeiro uso',
  component: PrimeiroUso,
  args: { onGerar: fn() },
  parameters: { atalho: 'Alt+Shift+P' },
  render: (args, { parameters }) => (
    <PopupShell
      host="localhost:3000"
      status="ok"
      rodape={
        <Rodape
          atalho={parameters.atalho as string}
          texto="preenche sem abrir o popup"
          onAlterarAtalho={fn()}
        />
      }
      onAbrirPiluTech={fn()}
    >
      <PrimeiroUso {...args} />
    </PopupShell>
  ),
} satisfies Meta<typeof PrimeiroUso>

export default meta
type Story = StoryObj<typeof meta>

export const Escuro: Story = {}
export const Claro: Story = { globals: { tema: 'claro' } }
export const SemAtalho: Story = { parameters: { atalho: '' } }
