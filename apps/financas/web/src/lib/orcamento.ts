export type EstadoOrcamento =
  | 'sem_orcamento'
  | 'dentro'
  | 'atencao'
  | 'estourado'

/** Espelha uma linha de `GET /api/budgets` (`domain/budgets.ts`, Worker). */
export type LinhaOrcamento = {
  category_id: string
  category_name: string
  parent_name: string | null
  budget_cents: number | null
  spent_cents: number
  budgetable: boolean
  average_3m_cents: number
}

export type RelatorioOrcamento = {
  month: string
  rows: LinhaOrcamento[]
  total_budget_cents: number
  budgeted_spent_cents: number
  uncategorized_spent_cents: number
}

// Atenção vai de 80% até o limite exato: 100% ainda não estourou.
export function estadoDoOrcamento(
  budgetCents: number | null,
  spentCents: number,
): EstadoOrcamento {
  if (budgetCents === null) return 'sem_orcamento'
  if (spentCents > budgetCents) return 'estourado'
  return spentCents * 5 >= budgetCents * 4 ? 'atencao' : 'dentro'
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

export function mesAbreviado(competence: string): string {
  return MESES[Number(competence.split('-')[1]) - 1].slice(0, 3)
}

function pct(l: LinhaOrcamento): number {
  return percentualUsado(l.budget_cents, l.spent_cents) ?? 0
}

// Estourados primeiro, depois orçados pelo % usado, por fim os sem orçamento
// pelo maior gasto.
export function ordenarLinhas(linhas: LinhaOrcamento[]): LinhaOrcamento[] {
  const rank = (l: LinhaOrcamento) =>
    ({ estourado: 0, atencao: 1, dentro: 2, sem_orcamento: 3 })[
      estadoDoOrcamento(l.budget_cents, l.spent_cents)
    ]
  return [...linhas].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (rank(a) === 3 ? b.spent_cents - a.spent_cents : pct(b) - pct(a)) ||
      a.category_name.localeCompare(b.category_name, 'pt-BR'),
  )
}

export type ResumoDoMes = {
  com_limite_count: number
  orcado_cents: number
  gasto_cents: number
  pct: number | null
  /** Soma do que resta nas categorias que não estouraram. */
  ainda_da_cents: number
  estourado_cents: number
  estourado_count: number
}

// Só as categorias com limite entram: gasto sem limite não tem régua.
export function resumoDoMes(linhas: LinhaOrcamento[]): ResumoDoMes {
  const r: ResumoDoMes = {
    com_limite_count: 0,
    orcado_cents: 0,
    gasto_cents: 0,
    pct: null,
    ainda_da_cents: 0,
    estourado_cents: 0,
    estourado_count: 0,
  }
  for (const l of linhas) {
    if (l.budget_cents === null) continue
    r.com_limite_count += 1
    r.orcado_cents += l.budget_cents
    r.gasto_cents += l.spent_cents
    if (l.spent_cents > l.budget_cents) {
      r.estourado_cents += l.spent_cents - l.budget_cents
      r.estourado_count += 1
    } else {
      r.ainda_da_cents += l.budget_cents - l.spent_cents
    }
  }
  r.pct =
    r.orcado_cents > 0
      ? Math.round((r.gasto_cents / r.orcado_cents) * 100)
      : null
  return r
}

export type MarcaDeHoje = {
  dia: number
  dias_no_mes: number
  pct: number
  faltam: number
}

/** A marca de "hoje" só existe no mês corrente. */
export function marcaDeHoje(month: string, hoje: string): MarcaDeHoje | null {
  if (hoje.slice(0, 7) !== month) return null
  const dia = Number(hoje.slice(8, 10))
  const dias_no_mes = new Date(
    Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
  ).getUTCDate()
  return {
    dia,
    dias_no_mes,
    pct: Math.round((dia / dias_no_mes) * 100),
    faltam: dias_no_mes - dia,
  }
}
