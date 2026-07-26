import { billCompetence, nowIsoUtc } from '../lib/dates'
import { newId } from '../lib/ids'

export type Transaction = {
  id: string
  account_id: string
  amount_cents: number
  currency: string
  amount_original_cents: number | null
  fx_rate_ppm: number | null
  purchase_date: string
  bill_competence: string | null
  settled_at: string | null
  description: string
  payee_id: string | null
  category_id: string | null
  is_business: number
  transfer_id: string | null
  parent_id: string | null
  imported_id: string | null
  import_source: string | null
  created_at: string
  updated_at: string
}

export type NewTransaction = {
  account_id: string
  amount_cents: number
  purchase_date: string
  description: string
  bill_competence?: string | null
  settled_at?: string | null
  payee_id?: string | null
  category_id?: string | null
  is_business?: 0 | 1
  currency?: string
  amount_original_cents?: number | null
  fx_rate_ppm?: number | null
  imported_id?: string | null
  import_source?: string | null
}

const TX_COLUMNS = `id, account_id, amount_cents, currency, amount_original_cents, fx_rate_ppm,
  purchase_date, bill_competence, settled_at, description, payee_id, category_id,
  is_business, transfer_id, parent_id, imported_id, import_source, created_at, updated_at`

// 19 colunas => 19 bound params por linha. O teto real e ativo do D1 e de
// 100 params POR STATEMENT (medido), entao 1 linha por statement aqui e
// folgado; o multi-row so aparece no plano de parcelas (Task 8).
const TX_VALUES = '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'

const INSERT_TX = `INSERT INTO transactions (${TX_COLUMNS}) VALUES ${TX_VALUES}`

function txBinds(
  id: string,
  input: NewTransaction,
  transfer_id: string | null,
  now: string,
): unknown[] {
  return [
    id,
    input.account_id,
    input.amount_cents,
    input.currency ?? 'BRL',
    input.amount_original_cents ?? null,
    input.fx_rate_ppm ?? null,
    input.purchase_date,
    input.bill_competence ?? null,
    input.settled_at ?? null,
    input.description,
    input.payee_id ?? null,
    input.category_id ?? null,
    input.is_business ?? 0,
    transfer_id,
    null, // parent_id: rateio e da fatia ②
    input.imported_id ?? null,
    input.import_source ?? null,
    now,
    now,
  ]
}

export async function createTransaction(
  db: D1Database,
  input: NewTransaction,
): Promise<Transaction> {
  const account = await db
    .prepare('SELECT kind, closing_day FROM accounts WHERE id = ?')
    .bind(input.account_id)
    .first<{ kind: string; closing_day: number | null }>()
  if (!account) throw new RangeError(`conta ${input.account_id} nao existe`)

  // A regra de fechamento mora na CONTA, nunca no chamador: compra 28/07 num
  // cartao que fecha dia 25 cai na fatura '2026-08'. Fora de credit_card,
  // bill_competence fica NULL — so cartao tem fatura.
  let competence = input.bill_competence ?? null
  if (
    competence === null &&
    account.kind === 'credit_card' &&
    account.closing_day !== null
  ) {
    competence = billCompetence(input.purchase_date, account.closing_day)
  }

  const id = newId()
  const now = nowIsoUtc()
  await db
    .prepare(INSERT_TX)
    .bind(...txBinds(id, { ...input, bill_competence: competence }, null, now))
    .run()

  const row = await db
    .prepare(`SELECT ${TX_COLUMNS} FROM transactions WHERE id = ?`)
    .bind(id)
    .first<Transaction>()
  if (!row) throw new Error(`lancamento ${id} sumiu logo apos o INSERT`)
  return row
}

export async function createTransfer(
  db: D1Database,
  input: {
    from_account_id: string
    to_account_id: string
    amount_cents: number
    date: string
    description: string
  },
): Promise<{ transfer_id: string; out: Transaction; inbound: Transaction }> {
  if (input.amount_cents <= 0)
    throw new RangeError('valor da transferencia deve ser positivo')
  if (input.from_account_id === input.to_account_id) {
    throw new RangeError('transferencia exige duas contas diferentes')
  }

  const transfer_id = newId()
  const now = nowIsoUtc()
  const base = {
    purchase_date: input.date,
    settled_at: input.date,
    description: input.description,
  }

  // UM batch: se a segunda perna falhar, o D1 reverte a primeira (medido) e
  // nao sobra meia transferencia no caixa. bill_competence fica NULL de
  // proposito — transferencia ja nasce liquidada e nao entra em fatura futura.
  const res = await db.batch<Transaction>([
    db.prepare(INSERT_TX).bind(
      ...txBinds(
        newId(),
        {
          ...base,
          account_id: input.from_account_id,
          amount_cents: -input.amount_cents,
        },
        transfer_id,
        now,
      ),
    ),
    db.prepare(INSERT_TX).bind(
      ...txBinds(
        newId(),
        {
          ...base,
          account_id: input.to_account_id,
          amount_cents: input.amount_cents,
        },
        transfer_id,
        now,
      ),
    ),
    db
      .prepare(
        `SELECT ${TX_COLUMNS} FROM transactions WHERE transfer_id = ? ORDER BY amount_cents`,
      )
      .bind(transfer_id),
  ])

  // ORDER BY amount_cents: a perna negativa (saida) vem primeiro.
  const [out, inbound] = res[2].results
  return { transfer_id, out, inbound }
}

export async function listTransactions(
  db: D1Database,
  opts: { account_id?: string; from?: string; to?: string; limit?: number },
): Promise<Transaction[]> {
  const where: string[] = []
  const binds: unknown[] = []
  if (opts.account_id) {
    where.push('account_id = ?')
    binds.push(opts.account_id)
  }
  if (opts.from) {
    where.push('purchase_date >= ?')
    binds.push(opts.from)
  }
  if (opts.to) {
    where.push('purchase_date <= ?')
    binds.push(opts.to)
  }
  // LIMIT sempre presente: no D1 "rows read" conta linha ESCANEADA, e uma
  // listagem sem teto vira cota queimada.
  const limit = Math.min(opts.limit ?? 200, 500)

  const sql = `SELECT ${TX_COLUMNS} FROM transactions
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY purchase_date DESC, created_at DESC
    LIMIT ?`
  const res = await db
    .prepare(sql)
    .bind(...binds, limit)
    .all<Transaction>()
  return res.results
}
