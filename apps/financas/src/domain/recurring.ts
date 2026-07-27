import {
  addMonthsToCompetence,
  competenceDueDate,
  nowIsoUtc,
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
 * `recurring_expenses` (migration 0006) guarda só a DEFINIÇÃO. Este arquivo
 * NUNCA escreve em `transactions` — a recorrente é uma EXPECTATIVA, nunca um
 * fato (§3). `projectRecurring` calcula na LEITURA, dentro da janela pedida;
 * quando o dinheiro sai de verdade, existe um `transaction` real, lançado à
 * mão ou importado (fatia ②), opcionalmente vinculado via
 * `transactions.recurring_expense_id`.
 */

export type RecurringExpense = {
  id: string
  description: string
  category_id: string | null
  account_id: string | null
  scope: Scope
  day_of_month: number
  amount_min_cents: number
  amount_max_cents: number
  starts_on: string
  ends_on: string | null
  active: number
  notes: string | null
  created_at: string
  updated_at: string
}

export type NewRecurringExpense = {
  description: string
  category_id?: string | null
  account_id?: string | null
  scope: Scope
  day_of_month: number
  amount_min_cents: number
  amount_max_cents: number
  starts_on: string
  ends_on?: string | null
  active?: 0 | 1
  notes?: string | null
}

export type RecurringPatch = Partial<{
  description: string
  category_id: string | null
  account_id: string | null
  scope: Scope
  day_of_month: number
  amount_min_cents: number
  amount_max_cents: number
  starts_on: string
  ends_on: string | null
  active: 0 | 1
  notes: string | null
}>

const COLUMNS = `id, description, category_id, account_id, scope, day_of_month,
  amount_min_cents, amount_max_cents, starts_on, ends_on, active, notes,
  created_at, updated_at`

// Mesmo raciocínio de idx_tx_recurring/migration 0006: a tabela tem no
// máximo uma dezena de linhas em regime normal (Starlink, DAS, contador,
// INSS...). O teto aqui é só defesa em profundidade — no D1 "rows read"
// cobra por linha ESCANEADA, então toda query fica bounded por princípio,
// mesmo quando o dado real nunca deveria chegar perto do teto.
const RECURRING_LIST_LIMIT = 500

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

function validateDayOfMonth(day: number): void {
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new RangeError(
      `day_of_month inválido: ${day} (esperado inteiro entre 1 e 31)`,
    )
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
): Promise<RecurringExpense> {
  validateDayOfMonth(input.day_of_month)
  validateAmounts(input.amount_min_cents, input.amount_max_cents)

  const now = nowIsoUtc()
  const row: RecurringExpense = {
    id: newId(),
    description: input.description,
    category_id: input.category_id ?? null,
    account_id: input.account_id ?? null,
    scope: input.scope,
    day_of_month: input.day_of_month,
    amount_min_cents: input.amount_min_cents,
    amount_max_cents: input.amount_max_cents,
    starts_on: input.starts_on,
    ends_on: input.ends_on ?? null,
    active: input.active ?? 1,
    notes: input.notes ?? null,
    created_at: now,
    updated_at: now,
  }

  await db
    .prepare(
      `INSERT INTO recurring_expenses (${COLUMNS})
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.id,
      row.description,
      row.category_id,
      row.account_id,
      row.scope,
      row.day_of_month,
      row.amount_min_cents,
      row.amount_max_cents,
      row.starts_on,
      row.ends_on,
      row.active,
      row.notes,
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
  'day_of_month',
  'amount_min_cents',
  'amount_max_cents',
  'starts_on',
  'ends_on',
  'active',
  'notes',
] as const satisfies readonly (keyof RecurringPatch)[]

/**
 * Update parcial por whitelist de colunas — só os campos presentes em
 * `patch` entram no SET. Devolve `null` para id inexistente (mesma
 * convenção de archiveAccount/deleteDebt: id-não-encontrado numa transição
 * de estado é resultado esperado do domínio, não exceção de programação; a
 * rota traduz em 404).
 */
export async function updateRecurring(
  db: D1Database,
  id: string,
  patch: RecurringPatch,
): Promise<RecurringExpense | null> {
  const fields = PATCHABLE_FIELDS.filter((f) => f in patch)

  if (fields.length === 0) {
    return db
      .prepare(`SELECT ${COLUMNS} FROM recurring_expenses WHERE id = ?`)
      .bind(id)
      .first<RecurringExpense>()
  }

  if (patch.day_of_month !== undefined) validateDayOfMonth(patch.day_of_month)
  if (
    patch.amount_min_cents !== undefined ||
    patch.amount_max_cents !== undefined
  ) {
    // Faixa parcial (só um dos dois no patch) validaria contra o valor
    // NOVO cruzado com o valor ATUAL — não suportado hoje (nenhum chamador
    // precisa disso ainda); exige os dois juntos quando qualquer um muda,
    // mesma disciplina simples de não duplicar caminho de código à toa.
    if (
      patch.amount_min_cents === undefined ||
      patch.amount_max_cents === undefined
    ) {
      throw new RangeError(
        'amount_min_cents e amount_max_cents devem ser atualizados juntos',
      )
    }
    validateAmounts(patch.amount_min_cents, patch.amount_max_cents)
  }

  const set = fields.map((f) => `${f} = ?`).join(', ')
  const values = fields.map((f) => patch[f] ?? null)
  const now = nowIsoUtc()

  const res = await db
    .prepare(
      `UPDATE recurring_expenses SET ${set}, updated_at = ? WHERE id = ?`,
    )
    .bind(...values, now, id)
    .run()
  if (res.meta.changes === 0) return null

  return db
    .prepare(`SELECT ${COLUMNS} FROM recurring_expenses WHERE id = ?`)
    .bind(id)
    .first<RecurringExpense>()
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

export type ProjectedRange = { min: number; max: number }

type ActiveRecurringRow = {
  id: string
  day_of_month: number
  amount_min_cents: number
  amount_max_cents: number
  starts_on: string
  ends_on: string | null
}

type LinkedTxRow = { recurring_expense_id: string; purchase_date: string }

const MAX_PROJECT_MONTHS = 24
// Mesmo raciocínio de RECURRING_LIST_LIMIT acima.
const ACTIVE_RECURRING_LIMIT = 500
// months (<=24) x recorrentes ativas (dezena) nunca deveria chegar perto
// disso em uso real — teto de defesa, não regra de negócio.
const LINKED_TX_LIMIT = 5000

/**
 * Projeta despesas recorrentes ativas dentro da janela `[from, from+months)`,
 * competência a competência. NUNCA escreve em `transactions` (§3 do spec) —
 * é leitura pura.
 *
 * Regras, cada uma com teste dedicado em recurring.test.ts:
 *  1. `day_of_month` é APARADO por `competenceDueDate` (dia 31 -> 28 em
 *     fevereiro), a mesma aritmética do fechamento/vencimento de cartão —
 *     reusada, nunca reimplementada aqui.
 *  2. `starts_on`/`ends_on` cortam a projeção no nível do DIA (comparando
 *     a data de vencimento APARADA da competência contra as duas colunas),
 *     não no nível da competência — um `starts_on` no meio do mês pode
 *     empurrar a primeira ocorrência pra competência seguinte.
 *  3. `active = 0` nunca entra (filtro no próprio SQL).
 *  4. SUPRESSÃO É EXATA E POR COMPETÊNCIA (§3.1): a projeção de uma
 *     competência some quando existe `transaction.recurring_expense_id`
 *     apontando pra esta recorrente com `purchase_date` NAQUELA
 *     competência — nunca por categoria+valor aproximado (heurística que
 *     erra em silêncio), e nunca "qualquer vínculo suprime tudo" (vincular
 *     agosto não pode suprimir setembro).
 */
export async function projectRecurring(
  db: D1Database,
  opts: { from: string; months: number },
): Promise<Map<string, ProjectedRange>> {
  const { from, months } = opts

  // addMonthsToCompetence(from, 0) valida o formato 'YYYY-MM' (lança
  // RangeError se ausente/malformado) e devolve a mesma competência —
  // reusa a validação central de lib/dates.ts em vez de duplicar regex
  // aqui (mesmo truque de byCategory em domain/reports.ts).
  const firstCompetence = addMonthsToCompetence(from, 0)
  if (!Number.isInteger(months) || months < 1 || months > MAX_PROJECT_MONTHS) {
    throw new RangeError(
      `months inválido: ${months} (esperado inteiro entre 1 e ${MAX_PROJECT_MONTHS})`,
    )
  }

  const competences = Array.from({ length: months }, (_, i) =>
    addMonthsToCompetence(firstCompetence, i),
  )
  const map = new Map<string, ProjectedRange>()

  const activeRes = await db
    .prepare(
      `SELECT id, day_of_month, amount_min_cents, amount_max_cents, starts_on, ends_on
         FROM recurring_expenses
        WHERE active = 1
        LIMIT ?`,
    )
    .bind(ACTIVE_RECURRING_LIMIT)
    .all<ActiveRecurringRow>()
  const active = activeRes.results
  if (active.length === 0) return map

  // UMA única query busca todo lançamento VINCULADO dentro da janela
  // pedida inteira — idx_tx_recurring (migration 0006) cobre igualdade em
  // recurring_expense_id + range em purchase_date, o mesmo padrão sargable
  // de byCategory (domain/reports.ts). A competência de cada vínculo vem
  // do próprio purchase_date (fatia 'YYYY-MM' dos 10 primeiros chars),
  // NUNCA da competência "esperada" da recorrente — é isso que faz a
  // supressão ser POR COMPETÊNCIA: se agrupássemos só por
  // recurring_expense_id (ignorando a data do vínculo), um único
  // lançamento vinculado apagaria a recorrente da janela INTEIRA.
  const windowStart = `${competences[0]}-01`
  const windowEndExclusive = `${addMonthsToCompetence(
    competences[competences.length - 1],
    1,
  )}-01`
  const ids = active.map((r) => r.id)
  const placeholders = ids.map(() => '?').join(',')
  const linkedRes = await db
    .prepare(
      `SELECT recurring_expense_id, purchase_date
         FROM transactions
        WHERE recurring_expense_id IN (${placeholders})
          AND purchase_date >= ?
          AND purchase_date <  ?
        LIMIT ?`,
    )
    .bind(...ids, windowStart, windowEndExclusive, LINKED_TX_LIMIT)
    .all<LinkedTxRow>()

  const suppressedCompetences = new Map<string, Set<string>>()
  for (const row of linkedRes.results) {
    const competence = row.purchase_date.slice(0, 7)
    let set = suppressedCompetences.get(row.recurring_expense_id)
    if (!set) {
      set = new Set()
      suppressedCompetences.set(row.recurring_expense_id, set)
    }
    set.add(competence)
  }

  for (const r of active) {
    for (const competence of competences) {
      // Dia aparado (31 -> 28 em fevereiro) pela mesma aritmética do
      // fechamento/vencimento de cartão (competenceDueDate, lib/dates.ts).
      const dueDate = competenceDueDate(competence, r.day_of_month)
      if (dueDate < r.starts_on) continue // ainda não começou nesta competência
      if (r.ends_on !== null && dueDate > r.ends_on) continue // já encerrada
      if (suppressedCompetences.get(r.id)?.has(competence)) continue // lançamento vinculado NESTA competência

      const cell = map.get(competence) ?? { min: 0, max: 0 }
      cell.min += r.amount_min_cents
      cell.max += r.amount_max_cents
      map.set(competence, cell)
    }
  }

  return map
}
