import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { NenhumCampo } from './nenhum-campo'
import { PopupShell } from './popup-shell'
import { Rodape } from './rodape'

const meta = {
  title: 'Popup/1d · Nenhum campo',
  component: NenhumCampo,
  args: { y: 3, onTentarDeNovo: fn(), onVerDados: fn() },
  parameters: { atalho: 'Alt+Shift+P' },
  render: (args, { parameters }) => (
    <PopupShell
      host="staging.app.dev"
      status="warn"
      rodape={
        <Rodape
          atalho={parameters.atalho as string}
          texto="preenche sem abrir"
          onAlterarAtalho={fn()}
        />
      }
    >
      <NenhumCampo {...args} />
    </PopupShell>
  ),
} satisfies Meta<typeof NenhumCampo>

export default meta
type Story = StoryObj<typeof meta>

export const Escuro: Story = {}
export const Claro: Story = { globals: { tema: 'claro' } }
export const UmCampo: Story = { args: { y: 1 } }
export const SemFormulario: Story = { args: { y: 0 } }
export const SemAtalho: Story = { parameters: { atalho: '' } }
