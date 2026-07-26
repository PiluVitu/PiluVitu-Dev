import { splitInstallments } from '@piluvitu/tools/money'
import {
  addMonthsToCompetence,
  billCompetence,
  competenceDueDate,
  nowIsoUtc,
} from '../lib/dates'
import { newId } from '../lib/ids'

export type NewInstallmentPlan = {
  account_id: string
  description: string
  total_cents: number
  installments_count: number
  purchase_date: string
  payee_id?: string | null
  category_id?: string | null
  is_business?: boolean
}

export type InstallmentPlan = {
  id: string
  account_id: string
  payee_id: string | null
  category_id: string | null
  description: string
  total_cents: number
  installments_count: number
  purchase_date: string
  first_competence: string
  is_business: number
  canceled_at: string | null
  created_at: string
  updated_at: string
}

/** created_at fica só no banco (gerado por strftime no INSERT) — ver orçamento de params abaixo. */
export type Installment = {
  id: string
  plan_id: string
  seq: number
  due_date: string
  transaction_id: string
}

export class InstallmentPlanError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'InstallmentPlanError'
    this.code = code
  }
}

type AccountRow = {
  id: string
  kind: string
  currency: string
  closing_day: number | null
  due_day: number | null
}

// ---------------------------------------------------------------------------
// ORÇAMENTO DE BOUND PARAMS — teto real e ativo do D1: 100 params por statement
// (o teto documentado de 50 queries/invocação não se reproduziu quando medido).
//
//   transactions      : 19 colunas  -> floor(100/19) =  5 linhas/statement (95 params)
//                                      6 linhas dariam 114 params => estouraria
//   installments      :  5 colunas  -> floor(100/5)  = 20 linhas/statement (100 params,
//                                      teto exato). created_at NÃO é bound: sai de
//                                      strftime() no próprio SQL, o que é o que mantém
//                                      a linha em 5 colunas em vez de 6.
//
// Plano de 60x = 1 (plano) + ceil(60/5)=12 (transactions) + ceil(60/20)=3 (installments)
//              = 16 statements num ÚNICO batch(), que faz rollback real.
// ---------------------------------------------------------------------------
const TX_COLUMNS = [
  'id',
  'account_id',
  'amount_cents',
  'currency',
  'amount_original_cents',
  'fx_rate_ppm',
  'purchase_date',
  'bill_competence',
  'settled_at',
  'description',
  'payee_id',
  'category_id',
  'is_business',
  'transfer_id',
  'parent_id',
  'imported_id',
  'import_source',
  'created_at',
  'updated_at',
] as const

const PLAN_COLUMNS = [
  'id',
  'account_id',
  'payee_id',
  'category_id',
  'description',
  'total_cents',
  'installments_count',
  'purchase_date',
  'first_competence',
  'is_business',
  'canceled_at',
  'created_at',
  'updated_at',
] as const

const INSTALLMENT_BOUND_COLUMNS = [
  'id',
  'plan_id',
  'seq',
  'due_date',
  'transaction_id',
] as const

const MAX_BOUND_PARAMS = 100
const TX_ROWS_PER_STATEMENT = Math.floor(MAX_BOUND_PARAMS / TX_COLUMNS.length) // 5
const INSTALLMENT_ROWS_PER_STATEMENT = Math.floor(
  MAX_BOUND_PARAMS / INSTALLMENT_BOUND_COLUMNS.length,
) // 20

const TX_TUPLE = `(${TX_COLUMNS.map(() => '?').join(', ')})`
const INSTALLMENT_TUPLE =
  "(?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))"

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size))
  return out
}

function transactionStatements(
  db: D1Database,
  rows: unknown[][],
): D1PreparedStatement[] {
  const head = `INSERT INTO transactions (${TX_COLUMNS.join(', ')}) VALUES `
  return chunk(rows, TX_ROWS_PER_STATEMENT).map((group) =>
    db
      .prepare(head + group.map(() => TX_TUPLE).join(', '))
      .bind(...group.flat()),
  )
}

function installmentStatements(
  db: D1Database,
  rows: unknown[][],
): D1PreparedStatement[] {
  const head = `INSERT INTO installments (${INSTALLMENT_BOUND_COLUMNS.join(', ')}, created_at) VALUES `
  return chunk(rows, INSTALLMENT_ROWS_PER_STATEMENT).map((group) =>
    db
      .prepare(head + group.map(() => INSTALLMENT_TUPLE).join(', '))
      .bind(...group.flat()),
  )
}

export async function createInstallmentPlan(
  db: D1Database,
  input: NewInstallmentPlan,
): Promise<{ plan: InstallmentPlan; installments: Installment[] }> {
  const count = input.installments_count
  if (!Number.isInteger(count) || count < 1 || count > 360) {
    throw new InstallmentPlanError(
      'constraint_violation',
      'installments_count deve ser inteiro entre 1 e 360',
    )
  }
  if (!Number.isInteger(input.total_cents) || input.total_cents <= 0) {
    throw new InstallmentPlanError(
      'constraint_violation',
      'total_cents deve ser inteiro positivo em centavos',
    )
  }

  const account = await db
    .prepare(
      `SELECT id, kind, currency, closing_day, due_day
         FROM accounts WHERE id = ? AND archived_at IS NULL`,
    )
    .bind(input.account_id)
    .first<AccountRow>()

  if (!account) {
    throw new InstallmentPlanError(
      'invalid_account',
      'conta não encontrada ou arquivada',
    )
  }
  if (account.kind !== 'credit_card') {
    throw new InstallmentPlanError(
      'invalid_account',
      'parcelamento exige uma conta do tipo credit_card',
    )
  }
  if (account.closing_day === null || account.due_day === null) {
    throw new InstallmentPlanError(
      'invalid_account',
      'cartão sem closing_day/due_day não calcula competência',
    )
  }
  if (account.currency !== 'BRL') {
    throw new InstallmentPlanError(
      'constraint_violation',
      'parcelamento só suporta contas em BRL',
    )
  }

  const now = nowIsoUtc()
  const planId = newId()
  const firstCompetence = billCompetence(
    input.purchase_date,
    account.closing_day,
  )
  const isBusiness = input.is_business === true ? 1 : 0
  const payeeId = input.payee_id ?? null
  const categoryId = input.category_id ?? null
  const amounts = splitInstallments(input.total_cents, count)

  const plan: InstallmentPlan = {
    id: planId,
    account_id: account.id,
    payee_id: payeeId,
    category_id: categoryId,
    description: input.description,
    total_cents: input.total_cents,
    installments_count: count,
    purchase_date: input.purchase_date,
    first_competence: firstCompetence,
    is_business: isBusiness,
    canceled_at: null,
    created_at: now,
    updated_at: now,
  }

  const installments: Installment[] = []
  const txRows: unknown[][] = []
  const installmentRows: unknown[][] = []

  for (let i = 0; i < count; i++) {
    const seq = i + 1
    const competence = addMonthsToCompetence(firstCompetence, i)
    const dueDate = competenceDueDate(competence, account.due_day)
    const transactionId = newId()
    const installmentId = newId()

    txRows.push([
      transactionId,
      account.id,
      -amounts[i], // saída: valor com sinal negativo
      'BRL',
      null, // amount_original_cents
      null, // fx_rate_ppm
      input.purchase_date,
      competence, // bill_competence
      null, // settled_at: parcela é PREVISTA até a fatura ser paga
      `${input.description} (${seq}/${count})`,
      payeeId,
      categoryId,
      isBusiness,
      null, // transfer_id
      null, // parent_id
      null, // imported_id
      'manual', // import_source
      now,
      now,
    ])

    installmentRows.push([installmentId, planId, seq, dueDate, transactionId])
    installments.push({
      id: installmentId,
      plan_id: planId,
      seq,
      due_date: dueDate,
      transaction_id: transactionId,
    })
  }

  const planStatement = db
    .prepare(
      `INSERT INTO installment_plans (${PLAN_COLUMNS.join(', ')})
       VALUES (${PLAN_COLUMNS.map(() => '?').join(', ')})`,
    )
    .bind(
      plan.id,
      plan.account_id,
      plan.payee_id,
      plan.category_id,
      plan.description,
      plan.total_cents,
      plan.installments_count,
      plan.purchase_date,
      plan.first_competence,
      plan.is_business,
      plan.canceled_at,
      plan.created_at,
      plan.updated_at,
    )

  // UM único batch: rollback real se qualquer statement abortar.
  await db.batch([
    planStatement,
    ...transactionStatements(db, txRows),
    ...installmentStatements(db, installmentRows),
  ])

  return { plan, installments }
}
