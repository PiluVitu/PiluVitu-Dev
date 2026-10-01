import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import type { Navegador } from '../lib/navegador'
import { PESSOA_DOURADA } from '../test/pessoa-dourada'
import { PaginaProibida } from './pagina-proibida'
import { PopupShell } from './popup-shell'

const PAGINA_PROIBIDA_DE_EXEMPLO: Record<Navegador, string> = {
  chrome: 'chrome://settings',
  edge: 'edge://settings',
  opera: 'opera://settings',
  firefox: 'about:addons',
}

const meta = {
  title: 'Popup/1e · Página proibida',
  component: PaginaProibida,
  args: {
    motivo: 'proibida',
    navegador: 'chrome',
    nome: PESSOA_DOURADA.nome.completo,
    onVerDados: fn(),
    onGerarPessoa: fn(),
  },
  render: (args) => (
    <PopupShell
      host={
        args.motivo === 'arquivo-sem-acesso'
          ? 'arquivo local'
          : PAGINA_PROIBIDA_DE_EXEMPLO[args.navegador]
      }
      status="lock"
      onAbrirPiluTech={fn()}
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
export const Firefox: Story = { args: { navegador: 'firefox' } }
export const FirefoxClaro: Story = {
  args: { navegador: 'firefox' },
  globals: { tema: 'claro' },
}
export const FirefoxArquivoSemAcesso: Story = {
  args: { navegador: 'firefox', motivo: 'arquivo-sem-acesso' },
}
export const Edge: Story = { args: { navegador: 'edge' } }
export const EdgeArquivoSemAcesso: Story = {
  args: { navegador: 'edge', motivo: 'arquivo-sem-acesso' },
}
export const Opera: Story = { args: { navegador: 'opera' } }
export const OperaArquivoSemAcesso: Story = {
  args: { navegador: 'opera', motivo: 'arquivo-sem-acesso' },
}
