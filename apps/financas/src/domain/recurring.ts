import {
  addDays,
  addMonthsToCompetence,
  competenceDueDate,
  daysBetween,
  isRealCalendarDate,
  nowIsoUtc,
  todayInTeresina,
} from '../lib/dates'
import { newId } from '../lib/ids'
import type { Scope } from './accounts'

/**
 * Fatia ⑥ (docs/superpowers/specs/2026-07-27-financas-recorrentes-design.md):
 * despesas recorrentes com FAIXA de valor (§2) — o Simples varia de R$ 12 a
 * R$ 600 conforme o faturamento, e entrar como R$ 306 seria o número que
 * nunca acontece. Valor fixo (Starlink R$ 189) é só o caso `min = max`, sem
 * um tipo "fixo" separado — duplicaria caminho de código pra nada.
 *
 * `recurring_expenses` (migration 0006) guarda só a DEFINIÇÃO, e este
 * arquivo nunca escreve em `transactions`: `projectRecurring` calcula na
 * leitura. O lançamento pendente da recorrente que "lança sozinha"
 * (migration 0019) é escrito por `recurring-auto.ts`.
 */

const FREQUENCIES = ['weekly', 'biweekly', 'monthly', 'annual'] as const
export type Frequency = (typeof FREQUENCIES)[number]

function isFrequency(value: unknown): value is Frequency {
  return (
    typeof value === 'string' &&
    (FREQUENCIES as readonly string[]).includes(value)
  )
}

export type RecurringExpense = {
  id: string
  description: string
  category_id: string | null
  account_id: string | null
  scope: Scope
  frequency: Frequency
  day_of_month: number
  amount_min_cents: number
  amount_max_cents: number
  starts_on: string
  ends_on: string | null
  active: number
  notes: string | null
  generate_since: string | null
  created_at: string
  updated_at: string
}

export type NewRecurringExpense = {
  description: string
  category_id?: string | null
  account_id?: string | null
  scope: Scope
  frequency?: Frequency
  /** Obrigatório em mensal e anual; em semanal e quinzenal, ausente vira o dia de `starts_on`. */
  day_of_month?: number
  amount_min_cents: number
  amount_max_cents: number
  starts_on: string
  ends_on?: string | null
  active?: 0 | 1
  notes?: string | null
  auto_generate?: boolean
}

export type RecurringPatch = Partial<{
  description: string
  category_id: string | null
  account_id: string | null
  scope: Scope
  frequency: Frequency
  day_of_month: number
  amount_min_cents: number
  amount_max_cents: number
  starts_on: string
  ends_on: string | null
  active: 0 | 1
  notes: string | null
  auto_generate: boolean
}>

type WriteOptions = { today?: string }

const COLUMNS = `id, description, category_id, account_id, scope, frequency,
  day_of_month, amount_min_cents, amount_max_cents, starts_on, ends_on,
  active, notes, generate_since, created_at, updated_at`

// Mesmo raciocínio de idx_tx_recurring/migration 0006: a tabela tem no
// máximo uma dezena de linhas em regime normal (Starlink, DAS, contador,
// INSS...). O teto aqui é só defesa em profundidade — no D1 "rows read"
// cobra por linha ESCANEADA, então toda query fica bounded por princípio,
// mesmo quando o dado real nunca deveria chegar perto do teto.
const RECURRING_LIST_LIMIT = 500

const NEEDS_ACCOUNT_MESSAGE =
  'para lançar sozinha, a recorrente precisa de uma conta'

const MATCH_TOLERANCE_DAYS = 3

function stepDays(frequency: Frequency): number | null {
  if (frequency === 'weekly') return 7
  if (frequency === 'biweekly') return 14
  return null
}

function dayOf(date: string): number {
  return Number(date.slice(8, 10))
}

function validateAmounts(minCents: number, maxCents: number): void {
  if (!Number.isInteger(minCents) || minCents <= 0) {
    throw new RangeError(
      `amount_min_cents inválido: ${minCents} (esperado inteiro positivo em centavos)`,
    )
  }
  if (!Number.isInteger(maxCents) || maxCents < minCents) {
    throw new RangeError(
      `amount_max_cents inválido: ${maxCents} (esperado inteiro >= amount_min_cents)`,
    )
  }
}

function validateDayOfMonth(day: unknown): asserts day is number {
  if (
    typeof day !== 'number' ||
    !Number.isInteger(day) ||
    day < 1 ||
    day > 31
  ) {
    throw new RangeError(
      `day_of_month inválido: ${day} (esperado inteiro entre 1 e 31)`,
    )
  }
}

function validateFrequency(value: unknown): asserts value is Frequency {
  if (!isFrequency(value)) {
    throw new RangeError(
      'frequência inválida: use semanal, quinzenal, mensal ou anual',
    )
  }
}

function validateAutoGenerate(value: unknown): void {
  if (value !== undefined && typeof value !== 'boolean') {
    throw new RangeError('"lançar sozinha" precisa ser verdadeiro ou falso')
  }
}

function validateDate(value: string, label: string): void {
  if (!isRealCalendarDate(value)) {
    throw new RangeError(`${label} inválida (esperado AAAA-MM-DD): ${value}`)
  }
}

/**
 * TS valida ANTES do banco (mesmo padrão de createAccount/setFixedNetCents):
 * o CHECK do schema pegaria os mesmos casos, mas com "CHECK constraint
 * failed" cru, que não diz ao usuário o que corrigir.
 */
export async function createRecurring(
  db: D1Database,
  input: NewRecurringExpense,
  opts: WriteOptions = {},
): Promise<RecurringExpense> {
  const frequency = input.frequency === undefined ? 'monthly' : input.frequency
  validateFrequency(frequency)
  validateAutoGenerate(input.auto_generate)
  validateDate(input.starts_on, 'data de início')
  if (input.ends_on != null) validateDate(input.ends_on, 'data de fim')
  const dayOfMonth =
    input.day_of_month === undefined && stepDays(frequency) !== null
      ? dayOf(input.starts_on)
      : input.day_of_month
  validateDayOfMonth(dayOfMonth)
  validateAmounts(input.amount_min_cents, input.amount_max_cents)

  const accountId = input.account_id ?? null
  if (input.auto_generate === true && accountId === null) {
    throw new RangeError(NEEDS_ACCOUNT_MESSAGE)
  }

  const now = nowIsoUtc()
  const row: RecurringExpense = {
    id: newId(),
    description: input.description,
    category_id: input.category_id ?? null,
    account_id: accountId,
    scope: input.scope,
    frequency,
    day_of_month: dayOfMonth,
    amount_min_cents: input.amount_min_cents,
    amount_max_cents: input.amount_max_cents,
    starts_on: input.starts_on,
    ends_on: input.ends_on ?? null,
    active: input.active ?? 1,
    notes: input.notes ?? null,
    generate_since:
      input.auto_generate === true ? (opts.today ?? todayInTeresina()) : null,
    created_at: now,
    updated_at: now,
  }

  await db
    .prepare(
      `INSERT INTO recurring_expenses (${COLUMNS})
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.id,
      row.description,
      row.category_id,
      row.account_id,
      row.scope,
      row.frequency,
      row.day_of_month,
      row.amount_min_cents,
      row.amount_max_cents,
      row.starts_on,
      row.ends_on,
      row.active,
      row.notes,
      row.generate_since,
      row.created_at,
      row.updated_at,
    )
    .run()

  return row
}

export async function listRecurring(
  db: D1Database,
  opts: { scope?: Scope; includeInactive?: boolean } = {},
): Promise<RecurringExpense[]> {
  const where: string[] = []
  const binds: unknown[] = []
  if (opts.scope) {
    where.push('scope = ?')
    binds.push(opts.scope)
  }
  if (!opts.includeInactive) where.push('active = 1')
  binds.push(RECURRING_LIST_LIMIT)

  const sql = `SELECT ${COLUMNS} FROM recurring_expenses
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY description
    LIMIT ?`
  const res = await db
    .prepare(sql)
    .bind(...binds)
    .all<RecurringExpense>()
  return res.results
}

const PATCHABLE_FIELDS = [
  'description',
  'category_id',
  'account_id',
  'scope',
  'frequency',
  'day_of_month',
  'amount_min_cents',
  'amount_max_cents',
  'starts_on',
  'ends_on',
  'active',
  'notes',
] as const satisfies readonly (keyof RecurringPatch)[]

async function getRecurring(
  db: D1Database,
  id: string,
): Promise<RecurringExpense | null> {
  return db
    .prepare(`SELECT ${COLUMNS} FROM recurring_expenses WHERE id = ?`)
    .bind(id)
    .first<RecurringExpense>()
}

function nextGenerateSince(
  current: string | null,
  on: boolean,
  reactivating: boolean,
  today: string,
): string | null {
  if (!on) return null
  if (current === null || (reactivating && current < today)) return today
  return current
}

/**
 * Update parcial: só os campos presentes em `patch` entram no SET; `null`
 * para id inexistente. `auto_generate` e a reativação mexem em
 * `generate_since` (ver "CRUD de frequency e auto_generate" no CLAUDE.md).
 */
export async function updateRecurring(
  db: D1Database,
  id: string,
  patch: RecurringPatch,
  opts: WriteOptions = {},
): Promise<RecurringExpense | null> {
  const current = await getRecurring(db, id)
  if (!current) return null

  const values: RecurringPatch = { ...patch }
  const touchesGeneration = 'auto_generate' in patch
  if (!touchesGeneration && !PATCHABLE_FIELDS.some((f) => f in values)) {
    return current
  }

  if ('frequency' in values) validateFrequency(values.frequency)
  validateAutoGenerate(values.auto_generate)
  if (values.starts_on !== undefined)
    validateDate(values.starts_on, 'data de início')
  if (values.ends_on != null) validateDate(values.ends_on, 'data de fim')

  const frequency = values.frequency ?? current.frequency
  const startsOn = values.starts_on ?? current.starts_on
  if (
    stepDays(frequency) !== null &&
    !('day_of_month' in values) &&
    ('starts_on' in values || 'frequency' in values)
  ) {
    validateDate(startsOn, 'data de início')
    values.day_of_month = dayOf(startsOn)
  }

  if ('day_of_month' in values) validateDayOfMonth(values.day_of_month)
  if (
    values.amount_min_cents !== undefined ||
    values.amount_max_cents !== undefined
  ) {
    // Faixa parcial (só um dos dois no patch) validaria contra o valor
    // NOVO cruzado com o valor ATUAL — exige os dois juntos.
    if (
      values.amount_min_cents === undefined ||
      values.amount_max_cents === undefined
    ) {
      throw new RangeError(
        'amount_min_cents e amount_max_cents devem ser atualizados juntos',
      )
    }
    validateAmounts(values.amount_min_cents, values.amount_max_cents)
  }

  const accountId =
    'account_id' in values ? (values.account_id ?? null) : current.account_id
  const generationOn = touchesGeneration
    ? values.auto_generate === true
    : current.generate_since !== null
  if (
    ('account_id' in values || touchesGeneration) &&
    generationOn &&
    accountId === null
  ) {
    throw new RangeError(NEEDS_ACCOUNT_MESSAGE)
  }

  const fields = PATCHABLE_FIELDS.filter((f) => f in values)
  const assignments = fields.map((f) => `${f} = ?`)
  const binds: unknown[] = fields.map((f) => values[f] ?? null)
  const reactivating = current.active === 0 && values.active === 1
  if (touchesGeneration || reactivating) {
    assignments.push('generate_since = ?')
    binds.push(
      nextGenerateSince(
        current.generate_since,
        generationOn,
        reactivating,
        opts.today ?? todayInTeresina(),
      ),
    )
  }

  const res = await db
    .prepare(
      `UPDATE recurring_expenses SET ${assignments.join(', ')}, updated_at = ?
        WHERE id = ?`,
    )
    .bind(...binds, nowIsoUtc(), id)
    .run()
  if (res.meta.changes === 0) return null

  return getRecurring(db, id)
}

/**
 * DELETE de verdade (não soft-delete): a FK `transactions.recurring_expense_id`
 * é `ON DELETE SET NULL` (migration 0006), nunca CASCADE — apagar a
 * DEFINIÇÃO de uma recorrente não pode apagar um `transaction` real
 * (dinheiro que de fato saiu). Devolve se a linha EXISTIA (meta.changes > 0),
 * mesma convenção de archiveAccount/deleteDebt.
 */
export async function deleteRecurring(
  db: D1Database,
  id: string,
): Promise<boolean> {
  const res = await db
    .prepare('DELETE FROM recurring_expenses WHERE id = ?')
    .bind(id)
    .run()
  return res.meta.changes > 0
}

export type RecurringSchedule = Pick<
  RecurringExpense,
  'frequency' | 'day_of_month' | 'starts_on' | 'ends_on'
>

/**
 * Datas de vencimento de `r` dentro de `[from, to]` (inclusive), já
 * cortadas por `starts_on`/`ends_on` no nível do dia. Mensal e anual usam
 * `competenceDueDate` (dia aparado); semanal e quinzenal andam 7/14 dias a
 * partir de `starts_on`.
 */
export function occurrencesBetween(
  r: RecurringSchedule,
  from: string,
  to: string,
): string[] {
  const start = from > r.starts_on ? from : r.starts_on
  const end = r.ends_on !== null && r.ends_on < to ? r.ends_on : to
  if (start > end) return []

  const dates: string[] = []
  const step = stepDays(r.frequency)
  if (step !== null) {
    const k = Math.ceil(daysBetween(r.starts_on, start) / step)
    for (
      let d = addDays(r.starts_on, k * step);
      d <= end;
      d = addDays(d, step)
    ) {
      dates.push(d)
    }
    return dates
  }

  const startMonth = r.starts_on.slice(5, 7)
  const lastCompetence = end.slice(0, 7)
  for (
    let c = start.slice(0, 7);
    c <= lastCompetence;
    c = addMonthsToCompetence(c, 1)
  ) {
    if (r.frequency === 'annual' && c.slice(5, 7) !== startMonth) continue
    const due = competenceDueDate(c, r.day_of_month)
    if (due >= start && due <= end) dates.push(due)
  }
  return dates
}

/** Chave de idempotência de `recurring_occurrences` (migration 0019). */
export function occurrenceKey(frequency: Frequency, dueDate: string): string {
  return stepDays(frequency) === null ? dueDate.slice(0, 7) : dueDate
}

/**
 * Janela de `purchase_date` em que um lançamento é "o desta ocorrência":
 * a competência inteira em mensal e anual, o vencimento ±3 dias em semanal e
 * quinzenal (inclusive nas duas pontas).
 */
export function occurrenceMatchWindow(
  frequency: Frequency,
  dueDate: string,
): { from: string; to: string } {
  if (stepDays(frequency) !== null) {
    return {
      from: addDays(dueDate, -MATCH_TOLERANCE_DAYS),
      to: addDays(dueDate, MATCH_TOLERANCE_DAYS),
    }
  }
  const competence = dueDate.slice(0, 7)
  return { from: `${competence}-01`, to: competenceDueDate(competence, 31) }
}

export type ProjectedRange = { min: number; max: number }

type ActiveRecurringRow = RecurringSchedule & {
  id: string
  amount_min_cents: number
  amount_max_cents: number
}

type LinkedTxRow = { recurring_expense_id: string; purchase_date: string }

const MAX_PROJECT_MONTHS = 24
// Mesmo raciocínio de RECURRING_LIST_LIMIT acima.
const ACTIVE_RECURRING_LIMIT = 500
// months (<=24) x recorrentes ativas (dezena) x ocorrências (até 5) nunca
// deveria chegar perto disso em uso real — teto de defesa, não regra.
const LINKED_TX_LIMIT = 5000

/**
 * Faixa `{min, max}` por competência em `[from, from+months)`, uma por
 * ocorrência não suprimida (ver "Regra 2" em "Despesas recorrentes" no CLAUDE.md).
 */
export async function projectRecurring(
  db: D1Database,
  opts: { from: string; months: number },
): Promise<Map<string, ProjectedRange>> {
  const { from, months } = opts

  const firstCompetence = addMonthsToCompetence(from, 0)
  if (!Number.isInteger(months) || months < 1 || months > MAX_PROJECT_MONTHS) {
    throw new RangeError(
      `months inválido: ${months} (esperado inteiro entre 1 e ${MAX_PROJECT_MONTHS})`,
    )
  }

  const competences = Array.from({ length: months }, (_, i) =>
    addMonthsToCompetence(firstCompetence, i),
  )
  const lastCompetence = competences[competences.length - 1]
  const map = new Map<string, ProjectedRange>()

  const activeRes = await db
    .prepare(
      `SELECT id, frequency, day_of_month, amount_min_cents, amount_max_cents,
              starts_on, ends_on
         FROM recurring_expenses
        WHERE active = 1
        LIMIT ?`,
    )
    .bind(ACTIVE_RECURRING_LIMIT)
    .all<ActiveRecurringRow>()
  const active = activeRes.results
  if (active.length === 0) return map

  const windowStart = `${firstCompetence}-01`
  const windowEnd = competenceDueDate(lastCompetence, 31)
  const ids = active.map((r) => r.id)
  const placeholders = ids.map(() => '?').join(',')
  const linkedRes = await db
    .prepare(
      `SELECT recurring_expense_id, purchase_date
         FROM transactions
        WHERE recurring_expense_id IN (${placeholders})
          AND purchase_date >= ?
          AND purchase_date <= ?
          AND (settled_at IS NOT NULL OR bill_competence IS NOT NULL)
        LIMIT ?`,
    )
    .bind(...ids, windowStart, windowEnd, LINKED_TX_LIMIT)
    .all<LinkedTxRow>()

  const linked = new Map<string, Map<string, number>>()
  for (const row of linkedRes.results) {
    const competence = row.purchase_date.slice(0, 7)
    const byCompetence = linked.get(row.recurring_expense_id) ?? new Map()
    byCompetence.set(competence, (byCompetence.get(competence) ?? 0) + 1)
    linked.set(row.recurring_expense_id, byCompetence)
  }

  for (const r of active) {
    const occurrences = new Map<string, number>()
    for (const due of occurrencesBetween(r, windowStart, windowEnd)) {
      const competence = due.slice(0, 7)
      occurrences.set(competence, (occurrences.get(competence) ?? 0) + 1)
    }

    for (const competence of competences) {
      const n = occurrences.get(competence) ?? 0
      const projected = n - (linked.get(r.id)?.get(competence) ?? 0)
      if (projected <= 0) continue

      const cell = map.get(competence) ?? { min: 0, max: 0 }
      cell.min += projected * r.amount_min_cents
      cell.max += projected * r.amount_max_cents
      map.set(competence, cell)
    }
  }

  return map
}
