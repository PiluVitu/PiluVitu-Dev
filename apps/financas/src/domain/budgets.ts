import { addMonthsToCompetence, nowIsoUtc } from '../lib/dates'
import { newId } from '../lib/ids'
import { byCategory } from './reports'

// Teto de sanidade (R$ 100 milhões): barra erro de digitação de zeros.
export const MAX_BUDGET_CENTS = 10_000_000_000

export type Budget = {
  id: string
  category_id: string
  month: string
  amount_cents: number
}

export type BudgetRow = {
  category_id: string
  category_name: string
  parent_name: string | null
  budget_cents: number | null
  spent_cents: number
  /** Só categoria de despesa ativa aceita orçamento (`setBudget`). */
  budgetable: boolean
}

export type BudgetReport = {
  month: string
  rows: BudgetRow[]
  total_budget_cents: number
  /** Gasto só das categorias que têm orçamento no mês. */
  budgeted_spent_cents: number
  /** Informativo: lançamento sem categoria não pode ter orçamento. */
  uncategorized_spent_cents: number
}

type CategoryRow = {
  id: string
  parent_id: string | null
  name: string
  kind: string
  archived_at: string | null
}

/** Mês fora do formato 'YYYY-MM': as rotas respondem 400, não 422. */
export class MesInvalidoError extends RangeError {}

function checkMonth(month: string): string {
  try {
    return addMonthsToCompetence(month, 0)
  } catch (err) {
    if (err instanceof RangeError) throw new MesInvalidoError(err.message)
    throw err
  }
}

function checkAmount(amountCents: unknown): number {
  if (
    typeof amountCents !== 'number' ||
    !Number.isInteger(amountCents) ||
    amountCents <= 0 ||
    amountCents > MAX_BUDGET_CENTS
  ) {
    throw new RangeError(
      'valor do orçamento precisa ser um inteiro em centavos, maior que zero',
    )
  }
  return amountCents
}

export async function setBudget(
  db: D1Database,
  month: string,
  categoryId: string,
  amountCents: number,
): Promise<Budget> {
  checkMonth(month)
  checkAmount(amountCents)

  const cat = await db
    .prepare('SELECT kind, archived_at FROM categories WHERE id = ?')
    .bind(categoryId)
    .first<{ kind: string; archived_at: string | null }>()
  if (!cat) throw new RangeError('categoria não encontrada')
  if (cat.kind !== 'expense')
    throw new RangeError('só categoria de despesa tem orçamento')
  if (cat.archived_at !== null)
    throw new RangeError('categoria arquivada não aceita orçamento')

  const now = nowIsoUtc()
  const row = await db
    .prepare(
      `INSERT INTO budgets (id, category_id, month, amount_cents, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (month, category_id)
       DO UPDATE SET amount_cents = excluded.amount_cents, updated_at = excluded.updated_at
       RETURNING id, category_id, month, amount_cents`,
    )
    .bind(newId(), categoryId, month, amountCents, now, now)
    .first<Budget>()
  return row as Budget
}

/** `false` quando não havia orçamento (a rota traduz em 404). */
export async function deleteBudget(
  db: D1Database,
  month: string,
  categoryId: string,
): Promise<boolean> {
  checkMonth(month)
  const res = await db
    .prepare('DELETE FROM budgets WHERE month = ? AND category_id = ?')
    .bind(month, categoryId)
    .run()
  return res.meta.changes > 0
}

// Gasto = o mesmo de `byCategory` (só despesa, sem transferência nem rateio);
// um estorno não libera orçamento.
export async function budgetReport(
  db: D1Database,
  month: string,
): Promise<BudgetReport> {
  checkMonth(month)
  const [spend, budgets, cats] = await Promise.all([
    byCategory(db, { competence: month }),
    db
      .prepare('SELECT category_id, amount_cents FROM budgets WHERE month = ?')
      .bind(month)
      .all<{ category_id: string; amount_cents: number }>(),
    db
      .prepare('SELECT id, parent_id, name, kind, archived_at FROM categories')
      .all<CategoryRow>(),
  ])

  const budgetOf = new Map(
    budgets.results.map((b) => [b.category_id, b.amount_cents]),
  )
  const spentOf = new Map<string, number>()
  let uncategorized = 0
  for (const r of spend.rows) {
    if (r.category_id === null) uncategorized += -r.total_cents
    else spentOf.set(r.category_id, -r.total_cents)
  }

  const nameOf = new Map(cats.results.map((c) => [c.id, c.name]))
  const rows: BudgetRow[] = cats.results
    .filter(
      (c) =>
        budgetOf.has(c.id) ||
        spentOf.has(c.id) ||
        (c.kind === 'expense' && c.archived_at === null),
    )
    .map((c) => ({
      category_id: c.id,
      category_name: c.name,
      parent_name:
        c.parent_id === null ? null : (nameOf.get(c.parent_id) ?? null),
      budget_cents: budgetOf.get(c.id) ?? null,
      spent_cents: spentOf.get(c.id) ?? 0,
      budgetable: c.kind === 'expense' && c.archived_at === null,
    }))
    .sort((a, b) => a.category_name.localeCompare(b.category_name, 'pt-BR'))

  const budgeted = rows.filter((r) => r.budget_cents !== null)
  return {
    month,
    rows,
    total_budget_cents: budgeted.reduce((s, r) => s + (r.budget_cents ?? 0), 0),
    budgeted_spent_cents: budgeted.reduce((s, r) => s + r.spent_cents, 0),
    uncategorized_spent_cents: uncategorized,
  }
}

/** Copia do mês anterior sem sobrescrever e sem categoria arquivada. */
export async function copyPreviousMonth(
  db: D1Database,
  month: string,
): Promise<{ copied: number; skipped: number }> {
  const from = addMonthsToCompetence(checkMonth(month), -1)
  const { results } = await db
    .prepare(
      `SELECT b.category_id, b.amount_cents, c.archived_at
         FROM budgets b JOIN categories c ON c.id = b.category_id
        WHERE b.month = ?`,
    )
    .bind(from)
    .all<{
      category_id: string
      amount_cents: number
      archived_at: string | null
    }>()

  const ativos = results.filter((r) => r.archived_at === null)
  if (ativos.length === 0) return { copied: 0, skipped: results.length }

  const now = nowIsoUtc()
  const outcomes = await db.batch(
    ativos.map((r) =>
      db
        .prepare(
          `INSERT INTO budgets (id, category_id, month, amount_cents, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (month, category_id) DO NOTHING`,
        )
        .bind(newId(), r.category_id, month, r.amount_cents, now, now),
    ),
  )
  const copied = outcomes.reduce((s, o) => s + o.meta.changes, 0)
  return { copied, skipped: results.length - copied }
}
