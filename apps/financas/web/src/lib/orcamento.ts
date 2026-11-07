export type EstadoOrcamento = 'sem_orcamento' | 'dentro' | 'estourado'

/** Espelha uma linha de `GET /api/budgets` (`domain/budgets.ts`, Worker). */
export type LinhaOrcamento = {
  category_id: string
  category_name: string
  parent_name: string | null
  budget_cents: number | null
  spent_cents: number
  budgetable: boolean
}

export type RelatorioOrcamento = {
  month: string
  rows: LinhaOrcamento[]
  total_budget_cents: number
  budgeted_spent_cents: number
  uncategorized_spent_cents: number
}

// Exatamente 100% ainda é "dentro": o orçamento acaba, não estoura.
export function estadoDoOrcamento(
  budgetCents: number | null,
  spentCents: number,
): EstadoOrcamento {
  if (budgetCents === null) return 'sem_orcamento'
  return spentCents > budgetCents ? 'estourado' : 'dentro'
}

export function percentualUsado(
  budgetCents: number | null,
  spentCents: number,
): number | null {
  if (budgetCents === null) return null
  return Math.round((spentCents / budgetCents) * 100)
}

export function larguraDaBarra(
  budgetCents: number | null,
  spentCents: number,
): number {
  const pct = percentualUsado(budgetCents, spentCents)
  if (pct === null) return 0
  return Math.min(100, Math.max(0, pct))
}

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]

export function mesPorExtenso(competence: string): string {
  const [ano, mes] = competence.split('-')
  return `${MESES[Number(mes) - 1]} de ${ano}`
}

function pct(l: LinhaOrcamento): number {
  return percentualUsado(l.budget_cents, l.spent_cents) ?? 0
}

// Estourados primeiro, depois orçados pelo % usado, por fim os sem orçamento
// pelo maior gasto.
export function ordenarLinhas(linhas: LinhaOrcamento[]): LinhaOrcamento[] {
  const rank = (l: LinhaOrcamento) =>
    ({ estourado: 0, dentro: 1, sem_orcamento: 2 })[
      estadoDoOrcamento(l.budget_cents, l.spent_cents)
    ]
  return [...linhas].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (rank(a) === 2 ? b.spent_cents - a.spent_cents : pct(b) - pct(a)) ||
      a.category_name.localeCompare(b.category_name, 'pt-BR'),
  )
}
