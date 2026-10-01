import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { PESSOA_DOURADA } from '../test/pessoa-dourada'
import { PaginaProibida } from './pagina-proibida'
import { PopupShell } from './popup-shell'

const meta = {
  title: 'Popup/1e · Página proibida',
  component: PaginaProibida,
  args: {
    motivo: 'proibida',
    nome: PESSOA_DOURADA.nome.completo,
    onVerDados: fn(),
    onGerarPessoa: fn(),
  },
  render: (args) => (
    <PopupShell
      host={
        args.motivo === 'arquivo-sem-acesso'
          ? 'arquivo local'
          : 'chrome://settings'
      }
      status="lock"
    >
      <PaginaProibida {...args} />
    </PopupShell>
  ),
} satisfies Meta<typeof PaginaProibida>

export default meta
type Story = StoryObj<typeof meta>

export const Escuro: Story = {}
export const Claro: Story = { globals: { tema: 'claro' } }
export const SemPessoa: Story = { args: { nome: null } }
export const ArquivoSemAcesso: Story = {
  args: { motivo: 'arquivo-sem-acesso' },
}
