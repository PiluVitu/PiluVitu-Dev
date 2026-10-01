import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { PESSOA_DOURADA } from '../test/pessoa-dourada'
import { PessoaPronta } from './pessoa-pronta'
import { PopupShell } from './popup-shell'
import { Rodape } from './rodape'

const meta = {
  title: 'Popup/1b · Pessoa pronta',
  component: PessoaPronta,
  args: {
    pessoa: PESSOA_DOURADA,
    idade: PESSOA_DOURADA.nascimento.idade,
    atalho: 'Ctrl+Shift+Y',
    preencherDesabilitado: false,
    onPreencher: fn(),
    onNovaPessoa: fn(),
    onAbrirCaixa: fn(),
    onCopiar: fn(async () => undefined),
  },
  render: (args) => (
    <PopupShell
      host={args.preencherDesabilitado ? 'chrome://settings' : 'localhost:3000'}
      status={args.preencherDesabilitado ? 'lock' : 'ok'}
      rodape={
        <Rodape
          atalho={args.atalho}
          texto="preenche sem abrir"
          comAlterar
          onAlterarAtalho={fn()}
        />
      }
      onAbrirPiluTech={fn()}
    >
      <PessoaPronta {...args} />
    </PopupShell>
  ),
} satisfies Meta<typeof PessoaPronta>

export default meta
type Story = StoryObj<typeof meta>

export const Escuro: Story = {}
export const Claro: Story = { globals: { tema: 'claro' } }
export const SemAtalho: Story = { args: { atalho: '' } }
export const AtalhoDoMac: Story = { args: { atalho: '⌥⇧P' } }
export const VindoDaPaginaProibida: Story = {
  args: { preencherDesabilitado: true },
}
