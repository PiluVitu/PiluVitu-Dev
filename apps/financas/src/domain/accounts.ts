import { nowIsoUtc } from '../lib/dates'
import { newId } from '../lib/ids'

export type Scope = 'PJ' | 'PF'

export type AccountKind =
  | 'checking'
  | 'savings'
  | 'credit_card'
  | 'cash'
  | 'investment'
  | 'benefit'

export type Account = {
  id: string
  name: string
  scope: Scope
  kind: AccountKind
  institution: string | null
  currency: string
  closing_day: number | null
  due_day: number | null
  credit_limit_cents: number | null
  opening_balance_cents: number
  opening_date: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
}

export type NewAccount = {
  name: string
  scope: Scope
  kind: AccountKind
  institution?: string | null
  currency?: string
  closing_day?: number | null
  due_day?: number | null
  credit_limit_cents?: number | null
  opening_balance_cents?: number
  opening_date?: string | null
}

const COLUMNS = `id, name, scope, kind, institution, currency, closing_day, due_day,
  credit_limit_cents, opening_balance_cents, opening_date, archived_at,
  created_at, updated_at`

export async function createAccount(
  db: D1Database,
  input: NewAccount,
): Promise<Account> {
  // O CHECK do schema barra isto, mas o D1 devolve "CHECK constraint failed",
  // que nao diz ao usuario o que fazer. Validar antes para ter mensagem util.
  if (
    input.kind === 'credit_card' &&
    (input.closing_day == null || input.due_day == null)
  ) {
    throw new RangeError('cartao de credito exige closing_day e due_day')
  }

  const id = newId()
  const now = nowIsoUtc()
  await db
    .prepare(
      `INSERT INTO accounts (${COLUMNS})
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    )
    .bind(
      id,
      input.name,
      input.scope,
      input.kind,
      input.institution ?? null,
      input.currency ?? 'BRL',
      input.closing_day ?? null,
      input.due_day ?? null,
      input.credit_limit_cents ?? null,
      input.opening_balance_cents ?? 0,
      input.opening_date ?? null,
      now,
      now,
    )
    .run()

  const row = await db
    .prepare(`SELECT ${COLUMNS} FROM accounts WHERE id = ?`)
    .bind(id)
    .first<Account>()
  if (!row) throw new Error(`conta ${id} sumiu logo apos o INSERT`)
  return row
}

export async function listAccounts(
  db: D1Database,
  opts: { scope?: Scope; includeArchived?: boolean } = {},
): Promise<Account[]> {
  const where: string[] = []
  const binds: unknown[] = []
  if (opts.scope) {
    where.push('scope = ?')
    binds.push(opts.scope)
  }
  if (!opts.includeArchived) where.push('archived_at IS NULL')

  const sql = `SELECT ${COLUMNS} FROM accounts
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY scope, name`
  const stmt = db.prepare(sql)
  const res = await (binds.length ? stmt.bind(...binds) : stmt).all<Account>()
  return res.results
}

export async function accountBalances(
  db: D1Database,
): Promise<Array<{ account_id: string; balance_cents: number }>> {
  // UMA query com GROUP BY: no D1 "rows read" conta linha ESCANEADA, entao
  // uma query por conta custaria cota. parent_id IS NULL porque o rateio
  // guarda o valor cheio no pai e repete o mesmo dinheiro nas filhas.
  const res = await db
    .prepare(
      `SELECT a.id AS account_id,
              a.opening_balance_cents + COALESCE(SUM(t.amount_cents), 0) AS balance_cents
         FROM accounts a
         LEFT JOIN transactions t
                ON t.account_id = a.id AND t.parent_id IS NULL
        GROUP BY a.id
        ORDER BY a.name`,
    )
    .all<{ account_id: string; balance_cents: number }>()
  return res.results
}

export async function archiveAccount(
  db: D1Database,
  id: string,
): Promise<void> {
  // Soft delete: conta encerrada nao apaga historico (ON DELETE RESTRICT
  // em transactions.account_id impediria de qualquer forma).
  const now = nowIsoUtc()
  await db
    .prepare(
      'UPDATE accounts SET archived_at = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL',
    )
    .bind(now, now, id)
    .run()
}
