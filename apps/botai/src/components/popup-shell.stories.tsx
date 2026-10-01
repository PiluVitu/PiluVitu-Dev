import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { PopupShell } from './popup-shell'
import { Rodape } from './rodape'

const meta = {
  title: 'Popup/Casca',
  component: PopupShell,
  args: {
    host: 'localhost:3000',
    status: 'ok',
    onAbrirPiluTech: fn(),
    children: (
      <p className="text-muted-foreground m-0 p-4 text-sm">
        conteúdo do estado
      </p>
    ),
    rodape: (
      <Rodape
        atalho="Alt+Shift+P"
        texto="preenche sem abrir"
        comAlterar
        onAlterarAtalho={fn()}
      />
    ),
  },
} satisfies Meta<typeof PopupShell>

export default meta
type Story = StoryObj<typeof meta>

export const Escuro: Story = {}
export const Claro: Story = { globals: { tema: 'claro' } }
export const SemAtalho: Story = {
  args: {
    rodape: (
      <Rodape
        atalho=""
        texto="preenche sem abrir"
        comAlterar
        onAlterarAtalho={fn()}
      />
    ),
  },
}
export const PaginaProibida: Story = {
  args: { host: 'chrome://settings', status: 'lock', rodape: undefined },
}
