import { nowIsoUtc } from '../lib/dates'
import { newId } from '../lib/ids'
import type { Transaction } from './transactions'

export type DebtDirection = 'i_owe' | 'owed_to_me'
export type DebtStatus = 'open' | 'settled' | 'written_off'
export type DebtPaymentKind = 'cash' | 'offset' | 'forgiven'

export type Debt = {
  id: string
  payee_id: string
  direction: DebtDirection
  title: string
  currency: string
  opened_at: string
  status: DebtStatus
  settled_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type DebtItem = {
  id: string
  debt_id: string
  description: string
  amount_cents: number
  incurred_on: string
  transaction_id: string | null
  category_id: string | null
  created_at: string
}

// linha de v_debt_item_balance — responde "o Steam Deck ja esta quitado?"
export type DebtItemBalance = {
  item_id: string
  debt_id: string
  description: string
  amount_cents: number
  allocated_cents: number
  remaining_cents: number
  is_settled: number
}

export type DebtPayment = {
  id: string
  debt_id: string
  paid_on: string
  amount_cents: number
  kind: DebtPaymentKind
  transaction_id: string | null
  notes: string | null
  created_at: string
}

export type DebtPaymentAllocation = {
  id: string
  payment_id: string
  item_id: string
  amount_cents: number
  created_at: string
}

export type DebtPaymentWithAllocations = DebtPayment & {
  allocations: DebtPaymentAllocation[]
}

export async function createDebt(
  db: D1Database,
  input: {
    payee_id: string
    direction: DebtDirection
    title: string
    opened_at: string
    notes?: string
  },
): Promise<Debt> {
  const now = nowIsoUtc()
  const debt: Debt = {
    id: newId(),
    payee_id: input.payee_id,
    direction: input.direction,
    title: input.title,
    currency: 'BRL',
    opened_at: input.opened_at,
    status: 'open',
    settled_at: null,
    notes: input.notes ?? null,
    created_at: now,
    updated_at: now,
  }
  await db
    .prepare(
      `INSERT INTO debts
         (id, payee_id, direction, title, currency, opened_at, status, settled_at, notes, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .bind(
      debt.id,
      debt.payee_id,
      debt.direction,
      debt.title,
      debt.currency,
      debt.opened_at,
      debt.status,
      debt.settled_at,
      debt.notes,
      debt.created_at,
      debt.updated_at,
    )
    .run()
  return debt
}

// debt_items e ESTOQUE (dimensao patrimonial): nunca gera lancamento.
// transaction_id, quando existe, so APONTA para a compra original.
export async function addDebtItem(
  db: D1Database,
  input: {
    debt_id: string
    description: string
    amount_cents: number
    incurred_on: string
    transaction_id?: string | null
    category_id?: string | null
  },
): Promise<DebtItem> {
  const now = nowIsoUtc()
  const item: DebtItem = {
    id: newId(),
    debt_id: input.debt_id,
    description: input.description,
    amount_cents: input.amount_cents,
    incurred_on: input.incurred_on,
    transaction_id: input.transaction_id ?? null,
    category_id: input.category_id ?? null,
    created_at: now,
  }

  // Um item novo é dinheiro real ainda não pago — se a dívida já estava
  // 'settled', deixá-la assim escondia esse valor de commitments() (que só
  // olha status = 'open') e travava payDebt() pra sempre (o UPDATE de
  // quitação exige `AND status = 'open'`). Reabrir é o que o usuário quer
  // ao adicionar um item numa dívida que ele achava fechada — alternativa
  // descartada: recusar com 422 e esconder o formulário, mas isso empurra
  // pro usuário um passo manual ("reabra a dívida primeiro") pra um estado
  // que a própria ação de adicionar item já deixa óbvio. UM batch: o mesmo
  // INSERT que grava o item já reabre a dívida, sem round-trip extra.
  // WHERE status = 'settled' faz da segunda linha um no-op quando a dívida
  // já está aberta (ou written_off, que fica fora do escopo desta fatia).
  await db.batch([
    db
      .prepare(
        `INSERT INTO debt_items
           (id, debt_id, description, amount_cents, incurred_on, transaction_id, category_id, created_at)
         VALUES (?,?,?,?,?,?,?,?)`,
      )
      .bind(
        item.id,
        item.debt_id,
        item.description,
        item.amount_cents,
        item.incurred_on,
        item.transaction_id,
        item.category_id,
        item.created_at,
      ),
    db
      .prepare(
        `UPDATE debts SET status = 'open', settled_at = NULL, updated_at = ?
            WHERE id = ? AND status = 'settled'`,
      )
      .bind(now, input.debt_id),
  ])
  return item
}

export async function debtDetail(
  db: D1Database,
  debt_id: string,
): Promise<{
  debt: Debt | null
  items: DebtItemBalance[]
  payments: DebtPaymentWithAllocations[]
}> {
  const [debtRes, itemsRes, paymentsRes, allocsRes] = await db.batch([
    db.prepare('SELECT * FROM debts WHERE id = ?').bind(debt_id),
    db
      .prepare(
        'SELECT * FROM v_debt_item_balance WHERE debt_id = ? ORDER BY description',
      )
      .bind(debt_id),
    db
      .prepare(
        'SELECT * FROM debt_payments WHERE debt_id = ? ORDER BY paid_on, created_at',
      )
      .bind(debt_id),
    db
      .prepare(
        `SELECT a.* FROM debt_payment_allocations a
           JOIN debt_payments p ON p.id = a.payment_id
          WHERE p.debt_id = ? ORDER BY a.created_at`,
      )
      .bind(debt_id),
  ])

  const allocs = allocsRes.results as DebtPaymentAllocation[]
  const payments = (paymentsRes.results as DebtPayment[]).map((p) => ({
    ...p,
    allocations: allocs.filter((a) => a.payment_id === p.id),
  }))

  return {
    debt: ((debtRes.results as Debt[])[0] ?? null) as Debt | null,
    items: itemsRes.results as DebtItemBalance[],
    payments,
  }
}

export class OverAllocationError extends Error {
  constructor(message = 'alocacao excede o teto do item ou do pagamento') {
    super(message)
    this.name = 'OverAllocationError'
  }
}

export class InvalidPaymentError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'InvalidPaymentError'
    this.code = code
  }
}

export type Allocation = { item_id: string; amount_cents: number }

export type PayDebtInput = {
  debt_id: string
  paid_on: string
  amount_cents: number
  allocations: Allocation[]
  kind?: DebtPaymentKind
  account_id?: string | null
  description?: string
  notes?: string
}

// debt_payments e FLUXO: gera EXATAMENTE UMA transaction, elo 1:1 garantido
// por uq_debt_payments_tx. Tudo num batch() so — o D1 faz rollback real, entao
// um teto estourado nao deixa nem lancamento orfao nem alocacao parcial.
export async function payDebt(
  db: D1Database,
  input: PayDebtInput,
): Promise<{ payment: DebtPayment; transaction: Transaction | null }> {
  const debt = await db
    .prepare('SELECT * FROM debts WHERE id = ?')
    .bind(input.debt_id)
    .first<Debt>()
  if (!debt) throw new InvalidPaymentError('not_found', 'divida nao encontrada')

  const kind: DebtPaymentKind = input.kind ?? 'cash'
  if (input.amount_cents <= 0)
    throw new InvalidPaymentError(
      'constraint_violation',
      'valor do pagamento tem que ser positivo',
    )
  if (input.allocations.length === 0)
    throw new InvalidPaymentError(
      'constraint_violation',
      'pagamento precisa de ao menos uma alocacao',
    )
  if (kind === 'cash' && !input.account_id)
    throw new InvalidPaymentError(
      'invalid_account',
      'pagamento em dinheiro exige account_id',
    )
  if (kind !== 'cash' && input.account_id)
    throw new InvalidPaymentError(
      'invalid_account',
      'pagamento sem caixa nao aceita account_id',
    )

  const now = nowIsoUtc()
  const statements: D1PreparedStatement[] = []
  let transaction: Transaction | null = null

  if (kind === 'cash') {
    // Pagar uma divida com cartao de credito e um caso real (a compra entra
    // na fatura, nao sai do caixa agora), mas esta fatia grava settled_at =
    // paid_on e bill_competence = null incondicionalmente — regra que so
    // vale para dinheiro/conta corrente. Num cartao isso apagaria a
    // obrigacao futura de dentro de commitments() (que so olha fatura em
    // aberto) sem ela ter sido paga de verdade. Ver nota em CLAUDE.md.
    const account = await db
      .prepare('SELECT kind FROM accounts WHERE id = ?')
      .bind(input.account_id)
      .first<{ kind: string }>()
    if (!account)
      throw new InvalidPaymentError('invalid_account', 'conta nao encontrada')
    if (account.kind === 'credit_card')
      throw new InvalidPaymentError(
        'invalid_account',
        'pagamento de divida em cartao de credito nao e suportado nesta fatia — escolha uma conta corrente, poupanca ou dinheiro',
      )

    const category = await db
      .prepare("SELECT id FROM categories WHERE slug = 'quitacao-divida'")
      .first<{ id: string }>()
    if (!category)
      throw new InvalidPaymentError(
        'constraint_violation',
        "categoria 'quitacao-divida' ausente na migration 0001",
      )

    // i_owe: sai dinheiro (negativo). owed_to_me: entra (positivo).
    // A categoria e SEMPRE debt_settlement — nunca income/expense.
    const signed =
      debt.direction === 'i_owe' ? -input.amount_cents : input.amount_cents

    transaction = {
      id: newId(),
      account_id: input.account_id as string,
      amount_cents: signed,
      currency: 'BRL',
      amount_original_cents: null,
      fx_rate_ppm: null,
      purchase_date: input.paid_on,
      bill_competence: null,
      settled_at: input.paid_on,
      description: input.description ?? `Pgto dívida — ${debt.title}`,
      payee_id: debt.payee_id,
      category_id: category.id,
      is_business: 0,
      transfer_id: null,
      parent_id: null,
      imported_id: null,
      import_source: 'manual',
      created_at: now,
      updated_at: now,
    }

    // 19 colunas. Com o teto de 100 bound params, um INSERT multi-row de
    // transactions cabe 5 linhas (5*19=95); aqui e sempre 1 linha.
    statements.push(
      db
        .prepare(
          `INSERT INTO transactions
             (id, account_id, amount_cents, currency, amount_original_cents, fx_rate_ppm,
              purchase_date, bill_competence, settled_at, description, payee_id, category_id,
              is_business, transfer_id, parent_id, imported_id, import_source, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          transaction.id,
          transaction.account_id,
          transaction.amount_cents,
          transaction.currency,
          transaction.amount_original_cents,
          transaction.fx_rate_ppm,
          transaction.purchase_date,
          transaction.bill_competence,
          transaction.settled_at,
          transaction.description,
          transaction.payee_id,
          transaction.category_id,
          transaction.is_business,
          transaction.transfer_id,
          transaction.parent_id,
          transaction.imported_id,
          transaction.import_source,
          transaction.created_at,
          transaction.updated_at,
        ),
    )
  }

  const payment: DebtPayment = {
    id: newId(),
    debt_id: debt.id,
    paid_on: input.paid_on,
    amount_cents: input.amount_cents,
    kind,
    transaction_id: transaction ? transaction.id : null,
    notes: input.notes ?? null,
    created_at: now,
  }
  statements.push(
    db
      .prepare(
        `INSERT INTO debt_payments
           (id, debt_id, paid_on, amount_cents, kind, transaction_id, notes, created_at)
         VALUES (?,?,?,?,?,?,?,?)`,
      )
      .bind(
        payment.id,
        payment.debt_id,
        payment.paid_on,
        payment.amount_cents,
        payment.kind,
        payment.transaction_id,
        payment.notes,
        payment.created_at,
      ),
  )

  for (const alloc of input.allocations) {
    statements.push(
      db
        .prepare(
          `INSERT INTO debt_payment_allocations
             (id, payment_id, item_id, amount_cents, created_at)
           VALUES (?,?,?,?,?)`,
        )
        .bind(newId(), payment.id, alloc.item_id, alloc.amount_cents, now),
    )
  }

  // Ultimo statement do batch: ja enxerga as alocacoes recem-inseridas.
  // O EXISTS impede que uma divida sem itens vire settled.
  statements.push(
    db
      .prepare(
        `UPDATE debts SET status = 'settled', settled_at = ?, updated_at = ?
            WHERE id = ? AND status = 'open'
              AND EXISTS (SELECT 1 FROM debt_items WHERE debt_id = ?)
              AND NOT EXISTS (
                SELECT 1 FROM v_debt_item_balance WHERE debt_id = ? AND is_settled = 0
              )`,
      )
      .bind(input.paid_on, now, debt.id, debt.id, debt.id),
  )

  try {
    await db.batch(statements)
  } catch (err) {
    throw translateD1Error(err)
  }
  return { payment, transaction }
}

export type ListDebtsOptions = {
  status?: DebtStatus | null
  direction?: DebtDirection | null
}

export type DebtSummary = Debt & {
  // payee_name é o que permite a tela #/dividas (Task 14) mostrar "Pai" em
  // vez do payee_id cru. JOIN, não LEFT JOIN: debts.payee_id é NOT NULL
  // REFERENCES payees(id), então toda dívida tem payee de verdade.
  payee_name: string
  total_cents: number
  paid_cents: number
  remaining_cents: number
}

export async function listDebts(
  db: D1Database,
  opts: ListDebtsOptions = {},
): Promise<DebtSummary[]> {
  const status = opts.status ?? null
  const direction = opts.direction ?? null
  const res = await db
    .prepare(
      `SELECT d.*,
              p.name                                                 AS payee_name,
              COALESCE(i.total_cents, 0)                             AS total_cents,
              COALESCE(a.paid_cents, 0)                              AS paid_cents,
              COALESCE(i.total_cents, 0) - COALESCE(a.paid_cents, 0) AS remaining_cents
         FROM debts d
         JOIN payees p ON p.id = d.payee_id
         LEFT JOIN (
           SELECT debt_id, SUM(amount_cents) AS total_cents
             FROM debt_items GROUP BY debt_id
         ) i ON i.debt_id = d.id
         LEFT JOIN (
           SELECT it.debt_id, SUM(al.amount_cents) AS paid_cents
             FROM debt_payment_allocations al
             JOIN debt_items it ON it.id = al.item_id
            GROUP BY it.debt_id
         ) a ON a.debt_id = d.id
        WHERE (? IS NULL OR d.status = ?)
          AND (? IS NULL OR d.direction = ?)
        ORDER BY d.opened_at DESC, d.created_at DESC`,
    )
    .bind(status, status, direction, direction)
    .all<DebtSummary>()
  return res.results
}

// trg_alloc_item_teto / trg_alloc_pagamento_teto abortam com
// SQLITE_CONSTRAINT_TRIGGER e o batch() inteiro reverte.
function translateD1Error(err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err)
  if (message.includes('SQLITE_CONSTRAINT_TRIGGER'))
    return new OverAllocationError(message)
  return err instanceof Error ? err : new Error(message)
}
