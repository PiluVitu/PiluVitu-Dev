import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { PESSOA_DOURADA } from '../test/pessoa-dourada'
import { RESUMO_DO_DESIGN, resumoDe } from '../test/resumos'
import { PopupShell } from './popup-shell'
import { ResultadoPreenchimento } from './resultado-preenchimento'
import { Rodape } from './rodape'

const meta = {
  title: 'Popup/1c · Resultado',
  component: ResultadoPreenchimento,
  args: {
    resumo: RESUMO_DO_DESIGN,
    caminho: '/cadastro',
    nome: PESSOA_DOURADA.nome.completo,
    onMostrar: fn(),
    onAbrirCaixa: fn(),
    onVerDados: fn(),
  },
  parameters: { atalho: 'Alt+Shift+P' },
  render: (args, { parameters }) => (
    <PopupShell
      host="localhost:3000"
      status={args.resumo.x === 0 ? 'warn' : 'ok'}
      rodape={
        <Rodape
          atalho={parameters.atalho as string}
          texto="preenche de novo"
          onAlterarAtalho={fn()}
        />
      }
      onAbrirPiluTech={fn()}
    >
      <ResultadoPreenchimento {...args} />
    </PopupShell>
  ),
} satisfies Meta<typeof ResultadoPreenchimento>

export default meta
type Story = StoryObj<typeof meta>

export const Escuro: Story = {}
export const Claro: Story = { globals: { tema: 'claro' } }
export const TudoReconhecido: Story = { args: { resumo: resumoDe(9) } }
export const Singular: Story = { args: { resumo: resumoDe(1) } }
export const SoRecusados: Story = {
  args: {
    resumo: resumoDe(0, [
      {
        documentId: 'doc-0',
        idx: 1,
        rotulo: 'Senha (recusou o valor)',
        seletor: 'input[name="senha"]',
      },
    ]),
  },
}
export const MuitosCampos: Story = {
  args: {
    resumo: resumoDe(
      52,
      Array.from({ length: 4 }, (_, i) => ({
        documentId: 'doc-0',
        idx: 53 + i,
        rotulo: `Campo extra ${i + 1}`,
        seletor: `input[name="extra_${i + 1}"]`,
      })),
    ),
  },
}
export const SemAtalho: Story = { parameters: { atalho: '' } }
