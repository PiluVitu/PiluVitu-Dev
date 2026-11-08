import { PilulaDeFiltro } from './extrato'

// CSF puro, no padrão de insight.stories.tsx: o apps/financas/web não tem
// Storybook instalado. extrato.test.tsx renderiza cada story.
type Story = { args: { ativa: boolean; children: string } }

const meta = {
  title: 'Finanças/Extrato/Pílula de filtro',
  component: PilulaDeFiltro,
}
export default meta

export const Desligada: Story = {
  args: { ativa: false, children: 'Todas as contas' },
}

export const Ligada: Story = { args: { ativa: true, children: 'Falta pagar' } }

export const ComContaEscolhida: Story = {
  args: { ativa: true, children: 'Conta corrente' },
}
