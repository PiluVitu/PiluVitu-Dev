import type { LinhaOrcamento, RelatorioOrcamento } from '../lib/orcamento'
import type { MetaView } from '../lib/metas'
import { ConteudoMetas } from './BlocoMetas'
import { ConteudoOrcamento } from './BlocoOrcamento'

// CSF puro, no padrão de insight.stories.tsx: o apps/financas/web não tem
// Storybook instalado. inicio.test.tsx renderiza cada story.
export const linhaOrc = (
  nome: string,
  orcado: number | null,
  gasto: number,
): LinhaOrcamento => ({
  category_id: nome,
  category_name: nome,
  parent_name: null,
  budget_cents: orcado,
  spent_cents: gasto,
  budgetable: true,
  average_3m_cents: 0,
})

const relatorio = (rows: LinhaOrcamento[]): RelatorioOrcamento => {
  const comLimite = rows.filter((r) => r.budget_cents !== null)
  return {
    month: '2026-11',
    rows,
    total_budget_cents: comLimite.reduce(
      (s, r) => s + (r.budget_cents ?? 0),
      0,
    ),
    budgeted_spent_cents: comLimite.reduce((s, r) => s + r.spent_cents, 0),
    uncategorized_spent_cents: 0,
  }
}

export const orcamentoDoMes = relatorio([
  linhaOrc('Mercado', 120000, 134820),
  linhaOrc('Lazer', 40000, 45290),
  linhaOrc('Moradia', 210000, 198000),
  linhaOrc('Transporte', 60000, 51240),
  linhaOrc('Assinaturas', 18000, 12070),
  linhaOrc('Saúde', 35000, 12800),
  linhaOrc('Educação', 25000, 0),
])

export const meta = (patch: Partial<MetaView> = {}): MetaView => ({
  id: 'g-viagem',
  name: 'Viagem de julho',
  target_cents: 800000,
  target_date: '2027-06-30',
  account_id: 'a-poup',
  account_name: 'Poupança',
  balance_cents: 465000,
  pct: 58,
  status: 'em_andamento',
  missing_cents: 335000,
  months_left: 8,
  monthly_needed_cents: 41875,
  editable: true,
  reserve_overlap: false,
  ...patch,
})

export const metasDoDono: MetaView[] = [
  meta(),
  meta({
    id: 'g-note',
    name: 'Notebook novo',
    target_cents: 650000,
    target_date: '2027-03-31',
    balance_cents: 212000,
    pct: 33,
    missing_cents: 438000,
    months_left: 5,
    monthly_needed_cents: 87600,
  }),
  meta({
    id: 'g-curso',
    name: 'Curso de inglês',
    target_cents: 240000,
    balance_cents: 240000,
    pct: 100,
    status: 'concluida',
    missing_cents: 0,
    months_left: null,
    monthly_needed_cents: null,
  }),
  meta({
    id: 'g-obra',
    name: 'Reforma da cozinha',
    target_cents: 1200000,
    target_date: '2026-10-31',
    balance_cents: 220000,
    pct: 18,
    status: 'atrasada',
    missing_cents: 980000,
    months_left: null,
    monthly_needed_cents: null,
  }),
]

type Story<P> = { args: P }

const meta_ = {
  title: 'Finanças/Início/Blocos',
}
export default meta_

export const OrcamentoEstourado: Story<{ relatorio: RelatorioOrcamento }> & {
  render: typeof ConteudoOrcamento
} = { args: { relatorio: orcamentoDoMes }, render: ConteudoOrcamento }

export const OrcamentoNoLimite: Story<{ relatorio: RelatorioOrcamento }> & {
  render: typeof ConteudoOrcamento
} = {
  args: {
    relatorio: relatorio([
      linhaOrc('Mercado', 100000, 30000),
      linhaOrc('Lazer', 40000, 5000),
    ]),
  },
  render: ConteudoOrcamento,
}

export const MetasEmAndamento: Story<{ metas: MetaView[] }> & {
  render: typeof ConteudoMetas
} = { args: { metas: metasDoDono }, render: ConteudoMetas }

export const MetasTodasConcluidas: Story<{ metas: MetaView[] }> & {
  render: typeof ConteudoMetas
} = {
  args: { metas: [metasDoDono[2]] },
  render: ConteudoMetas,
}
