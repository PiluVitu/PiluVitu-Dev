import type { LinhaOrcamento } from '../lib/orcamento'
import { ColunaDeOrcamento } from './categorias'

// CSF puro, no padrão de insight.stories.tsx: o apps/financas/web não tem
// Storybook instalado. categorias.test.tsx renderiza cada story.
type Story = { args: { nome: string; linha: LinhaOrcamento } }

const linha = (orcado: number | null, gasto: number): LinhaOrcamento => ({
  category_id: 'cat-exemplo',
  category_name: 'Mercado',
  parent_name: null,
  budget_cents: orcado,
  spent_cents: gasto,
  budgetable: true,
  average_3m_cents: 0,
})

const meta = {
  title: 'Finanças/Categorias/Coluna de orçamento',
  component: ColunaDeOrcamento,
}
export default meta

export const SemLimite: Story = {
  args: { nome: 'Mercado', linha: linha(null, 5000) },
}

export const DentroDoLimite: Story = {
  args: { nome: 'Mercado', linha: linha(120000, 30000) },
}

export const EmAtencao: Story = {
  args: { nome: 'Mercado', linha: linha(120000, 100000) },
}

export const Estourada: Story = {
  args: { nome: 'Mercado', linha: linha(120000, 134820) },
}
