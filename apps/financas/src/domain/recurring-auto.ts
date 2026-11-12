import {
  addDays,
  billCompetence,
  isRealCalendarDate,
  nowIsoUtc,
} from '../lib/dates'
import { errorCode } from '../lib/errors'
import { newId } from '../lib/ids'
import type { Scope } from './accounts'
import {
  occurrenceKey,
  occurrenceMatchWindow,
  occurrencesBetween,
  type Frequency,
} from './recurring'
import { INSERT_TX, txBinds } from './transactions'
import { contraparteEhPropria, getNomesProprios } from './transfer-pairing'

/**
 * Recorrência que lança sozinha (migration 0019): cria o lançamento
 * PENDENTE de cada ocorrência já vencida das recorrentes com
 * `generate_since`. Roda no Cron diário (`src/scheduled.ts`); ver
 * "Lançar sozinha" no CLAUDE.md.
 */

export type GenerationResult = {
  gerados: number
  vinculados: number
  sem_conta: number
  falhas: number
}

type AutoRecurringRow = {
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
  generate_since: string
  account_kind: string | null
  closing_day: number | null
}

type WithAccount = AutoRecurringRow & { account_id: string }

type OpenOccurrence = {
  r: WithAccount
  due: string
  key: string
  window: { from: string; to: string }
}

type LinkedTx = { id: string; purchase_date: string }

type ImportedTx = {
  id: string
  amount_cents: number
  purchase_date: string
  description: string
}

const LOOKBACK_DAYS = 31
const AUTO_RECURRING_LIMIT = 500
const LINKED_TX_LIMIT = 500
const IMPORTED_TX_LIMIT = 500

const INSERT_OCCURRENCE = `INSERT INTO recurring_occurrences
  (recurring_expense_id, occurrence_key, due_date, transaction_id, origin, created_at)
  VALUES (?, ?, ?, ?, ?, ?)`

const LINK_IMPORTED = `UPDATE transactions
   SET recurring_expense_id = ?, updated_at = ?
 WHERE id = ? AND recurring_expense_id IS NULL`

const INSERT_LINKED_OCCURRENCE = `INSERT INTO recurring_occurrences
  (recurring_expense_id, occurrence_key, due_date, transaction_id, origin, created_at)
  SELECT ?, ?, ?, ?, 'vinculado', ?
   WHERE EXISTS (
     SELECT 1 FROM transactions WHERE id = ? AND recurring_expense_id = ?
   )
  ON CONFLICT DO NOTHING`

function isOccurrenceTaken(err: unknown): boolean {
  return (
    err instanceof Error &&
    /UNIQUE constraint failed: recurring_occurrences\./.test(err.message)
  )
}

function recordFailure(
  result: GenerationResult,
  recurringId: string,
  err: unknown,
): void {
  result.falhas++
  console.error('recorrência automática falhou', recurringId, errorCode(err))
}

export async function generateRecurringOccurrences(
  db: D1Database,
  opts: { today: string },
): Promise<GenerationResult> {
  const { today } = opts
  if (!isRealCalendarDate(today)) {
    throw new RangeError(`today inválido (esperado AAAA-MM-DD): ${today}`)
  }

  const res = await db
    .prepare(
      `SELECT r.id, r.description,
              CASE WHEN c.archived_at IS NULL THEN r.category_id END AS category_id,
              r.account_id, r.scope, r.frequency, r.day_of_month,
              r.amount_min_cents, r.amount_max_cents, r.starts_on, r.ends_on,
              r.generate_since, a.kind AS account_kind, a.closing_day
         FROM recurring_expenses r
         LEFT JOIN categories c ON c.id = r.category_id
         LEFT JOIN accounts a ON a.id = r.account_id
        WHERE r.active = 1
          AND r.generate_since IS NOT NULL
        ORDER BY r.id
        LIMIT ?`,
    )
    .bind(AUTO_RECURRING_LIMIT)
    .all<AutoRecurringRow>()

  const result: GenerationResult = {
    gerados: 0,
    vinculados: 0,
    sem_conta: 0,
    falhas: 0,
  }
  const open: OpenOccurrence[] = []
  for (const r of res.results) {
    if (r.account_id === null) {
      result.sem_conta++
      continue
    }
    try {
      const pending = await openOccurrences(
        db,
        { ...r, account_id: r.account_id },
        today,
        result,
      )
      open.push(...pending)
    } catch (err) {
      recordFailure(result, r.id, err)
    }
  }

  const failed = new Set<string>()
  const claims = new Map<OpenOccurrence, string>()
  for (const [accountId, group] of groupByAccount(open)) {
    try {
      for (const [o, txId] of await importedClaims(db, accountId, group)) {
        claims.set(o, txId)
      }
    } catch (err) {
      for (const id of new Set(group.map((o) => o.r.id))) {
        failed.add(id)
        recordFailure(result, id, err)
      }
    }
  }

  for (const o of open) {
    if (failed.has(o.r.id)) continue
    try {
      const txId = claims.get(o)
      if (txId === undefined) await generate(db, o, result)
      else await linkImported(db, o, txId, result)
    } catch (err) {
      failed.add(o.r.id)
      recordFailure(result, o.r.id, err)
    }
  }
  return result
}

/**
 * As ocorrências vencidas de `r` que ainda não têm linha em
 * `recurring_occurrences`. As que já têm lançamento vinculado à recorrente
 * são gravadas aqui como 'vinculado' e não voltam.
 */
async function openOccurrences(
  db: D1Database,
  r: WithAccount,
  today: string,
  result: GenerationResult,
): Promise<OpenOccurrence[]> {
  const lookback = addDays(today, -LOOKBACK_DAYS)
  const from = r.generate_since > lookback ? r.generate_since : lookback
  const dues = occurrencesBetween(r, from, today)
  if (dues.length === 0) return []

  const keys = dues.map((d) => occurrenceKey(r.frequency, d))
  const taken = await db
    .prepare(
      `SELECT occurrence_key FROM recurring_occurrences
        WHERE recurring_expense_id = ?
          AND occurrence_key IN (${keys.map(() => '?').join(', ')})`,
    )
    .bind(r.id, ...keys)
    .all<{ occurrence_key: string }>()
  const takenKeys = new Set(taken.results.map((o) => o.occurrence_key))

  const windows = dues.map((d) => occurrenceMatchWindow(r.frequency, d))
  const linked = await db
    .prepare(
      `SELECT id, purchase_date FROM transactions
        WHERE recurring_expense_id = ?
          AND purchase_date >= ?
          AND purchase_date <= ?
        ORDER BY created_at, id
        LIMIT ?`,
    )
    .bind(
      r.id,
      windows[0].from,
      windows[windows.length - 1].to,
      LINKED_TX_LIMIT,
    )
    .all<LinkedTx>()

  const open: OpenOccurrence[] = []
  for (const [i, due] of dues.entries()) {
    const key = keys[i]
    if (takenKeys.has(key)) continue

    const window = windows[i]
    const match = linked.results.find(
      (t) => t.purchase_date >= window.from && t.purchase_date <= window.to,
    )
    if (!match) {
      open.push({ r, due, key, window })
      continue
    }
    const inserted = await db
      .prepare(`${INSERT_OCCURRENCE} ON CONFLICT DO NOTHING`)
      .bind(r.id, key, due, match.id, 'vinculado', nowIsoUtc())
      .run()
    if (inserted.meta.changes > 0) result.vinculados++
  }
  return open
}

function groupByAccount(open: OpenOccurrence[]): Map<string, OpenOccurrence[]> {
  const groups = new Map<string, OpenOccurrence[]>()
  for (const o of open) {
    const group = groups.get(o.r.account_id) ?? []
    group.push(o)
    groups.set(o.r.account_id, group)
  }
  return groups
}

/**
 * Ocorrência aberta → saída importada sem vínculo que é o pagamento dela.
 * Ver "Conciliação recorrente × importação" no CLAUDE.md (ordem inversa).
 */
async function importedClaims(
  db: D1Database,
  accountId: string,
  group: OpenOccurrence[],
): Promise<Map<OpenOccurrence, string>> {
  const claims = new Map<OpenOccurrence, string>()
  const from = group.reduce(
    (min, o) => (o.window.from < min ? o.window.from : min),
    group[0].window.from,
  )
  const to = group.reduce(
    (max, o) => (o.window.to > max ? o.window.to : max),
    group[0].window.to,
  )
  const imported = await db
    .prepare(
      `SELECT id, amount_cents, purchase_date, description
         FROM transactions
        WHERE account_id = ?
          AND purchase_date >= ?
          AND purchase_date <= ?
          AND imported_id IS NOT NULL
          AND recurring_expense_id IS NULL
          AND transfer_id IS NULL
          AND amount_cents < 0
        LIMIT ?`,
    )
    .bind(accountId, from, to, IMPORTED_TX_LIMIT)
    .all<ImportedTx>()
  if (imported.results.length === 0) return claims

  const ownNames = await getNomesProprios(db)
  const txsByOccurrence = new Map<OpenOccurrence, string[]>()
  const occurrencesByTx = new Map<string, number>()
  for (const t of imported.results) {
    if (contraparteEhPropria(t.description, ownNames)) continue
    const magnitude = -t.amount_cents
    for (const o of group) {
      if (
        magnitude < o.r.amount_min_cents ||
        magnitude > o.r.amount_max_cents ||
        t.purchase_date < o.window.from ||
        t.purchase_date > o.window.to
      ) {
        continue
      }
      txsByOccurrence.set(o, [...(txsByOccurrence.get(o) ?? []), t.id])
      occurrencesByTx.set(t.id, (occurrencesByTx.get(t.id) ?? 0) + 1)
    }
  }

  for (const [o, txIds] of txsByOccurrence) {
    if (txIds.length === 1 && occurrencesByTx.get(txIds[0]) === 1) {
      claims.set(o, txIds[0])
    }
  }
  return claims
}

async function linkImported(
  db: D1Database,
  o: OpenOccurrence,
  txId: string,
  result: GenerationResult,
): Promise<void> {
  const now = nowIsoUtc()
  const [, inserted] = await db.batch([
    db.prepare(LINK_IMPORTED).bind(o.r.id, now, txId),
    db
      .prepare(INSERT_LINKED_OCCURRENCE)
      .bind(o.r.id, o.key, o.due, txId, now, txId, o.r.id),
  ])
  if (inserted.meta.changes > 0) result.vinculados++
}

async function generate(
  db: D1Database,
  o: OpenOccurrence,
  result: GenerationResult,
): Promise<void> {
  const { r, due, key } = o
  const txId = newId()
  const now = nowIsoUtc()
  const billComp =
    r.account_kind === 'credit_card' && r.closing_day !== null
      ? billCompetence(due, r.closing_day)
      : null
  try {
    await db.batch([
      db.prepare(INSERT_TX).bind(
        ...txBinds(
          txId,
          {
            account_id: r.account_id,
            amount_cents: -r.amount_max_cents,
            purchase_date: due,
            bill_competence: billComp,
            settled_at: null,
            description: r.description,
            category_id: r.category_id,
            is_business: r.scope === 'PJ' ? 1 : 0,
            recurring_expense_id: r.id,
          },
          null,
          now,
        ),
      ),
      db.prepare(INSERT_OCCURRENCE).bind(r.id, key, due, txId, 'gerado', now),
    ])
    result.gerados++
  } catch (err) {
    if (!isOccurrenceTaken(err)) throw err
  }
}
