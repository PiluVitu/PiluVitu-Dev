import { nowIsoUtc } from '../lib/dates'
import { friendlyConstraintMessage, logConstraintError } from '../lib/errors'
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

// MEDIDO contra o D1 local (ver task brief): DELETE FROM debts numa divida
// completa (item + pagamento cash + alocacao) tem SUCESSO SEM ERRO. O motivo
// e a ORDEM em que o SQLite resolve as FKs em cascata a partir de debts:
// debt_items.debt_id e debt_payments.debt_id sao CASCADE, e o CASCADE em
// debt_payments apaga a linha de debt_payments ANTES do RESTRICT de
// debt_payments.transaction_id ter uma linha pra checar — o RESTRICT nunca
// chega a disparar porque a linha que ele protegeria ja nao existe mais.
// Resultado: debts/debt_items/debt_payments/debt_payment_allocations vao
// todos a zero, e a transaction (com o dinheiro de verdade) fica pra tras,
// orfa — o caixa continua batendo, mas a explicacao de "por que saiu esse
// dinheiro" desaparece. E perda de dado SILENCIOSA, nao um erro que alguem
// notaria. deleteDebt fecha essa porta checando ANTES se existe pagamento
// kind='cash' — se existir, recusa com DebtHasLedgerError em vez de deixar o
// CASCADE reescrever a historia. 'offset'/'forgiven' nunca tem
// transaction_id (CHECK kind = 'cash' OR transaction_id IS NULL em
// debt_payments), entao apagar esses e seguro.
export class DebtHasLedgerError extends Error {
  code = 'debt_has_ledger'
  constructor(
    message = 'a dívida tem pagamento em dinheiro (kind=cash) associado a um lançamento — apagar apagaria essa explicação do livro-caixa; dê baixa (written_off) em vez de excluir',
  ) {
    super(message)
    this.name = 'DebtHasLedgerError'
  }
}

export async function deleteDebt(db: D1Database, id: string): Promise<boolean> {
  const cashPayment = await db
    .prepare(
      `SELECT 1 FROM debt_payments WHERE debt_id = ? AND kind = 'cash' LIMIT 1`,
    )
    .bind(id)
    .first()
  if (cashPayment) {
    throw new DebtHasLedgerError()
  }

  // Sem pagamento cash: nada em debt_payments referencia transaction_id
  // NOT NULL, entao o CASCADE em debt_items/debt_payments/
  // debt_payment_allocations e seguro — nao ha RESTRICT nenhum pra escapar.
  const res = await db.prepare('DELETE FROM debts WHERE id = ?').bind(id).run()

  // meta.changes > 0, nao so "rodou sem erro": id inexistente casa 0 vezes
  // com o DELETE, e sem checar isto ficaria indistinguivel de uma exclusao
  // bem-sucedida. Mesma convencao de archiveAccount (domain/accounts.ts) —
  // id-nao-encontrado numa transicao de estado e resultado esperado, nao
  // excecao de programacao; quem chama (rota) traduz false em 404.
  return res.meta.changes > 0
}

// written_off e a saida para uma divida com HISTORICO REAL (pagamento cash)
// que deleteDebt recusa apagar — 'Perdoei essa divida'/'nunca vou receber
// isso' sem fingir que ela nunca existiu. So parte de 'open': 'settled' ja
// terminou bem (nao faz sentido baixar o que ja foi pago), 'written_off' ja
// e estado final (idempotente vira no-op, nao erro).
export async function writeOffDebt(
  db: D1Database,
  id: string,
): Promise<boolean> {
  const now = nowIsoUtc()
  // settled_at NAO e preenchido aqui: o CHECK (status <> 'settled' OR
  // settled_at IS NOT NULL) da migration 0001 e SO sobre 'settled' —
  // written_off nao tem CHECK nenhum exigindo settled_at, e preenche-lo
  // misturaria "foi pago" com "foi dado como perdido", duas historias
  // diferentes que a coluna settled_at conta hoje só para 'settled'.
  const res = await db
    .prepare(
      `UPDATE debts SET status = 'written_off', updated_at = ?
          WHERE id = ? AND status = 'open'`,
    )
    .bind(now, id)
    .run()
  return res.meta.changes > 0
}

// deleteDebtItem apaga o ITEM (estoque) — nao tem lancamento proprio nem
// filhos em cascata, entao e sempre um DELETE simples, sem batch(). Quando
// o item tem alocacao, debt_payment_allocations.item_id e RESTRICT
// (migration 0001): o proprio DELETE falha com SQLITE_CONSTRAINT/FOREIGN
// KEY antes de aplicar qualquer mudanca — nao ha nada pra desfazer porque e
// UM statement de UMA linha so. Mesmo padrao de "erro cru propaga" que
// addDebtItem ja usa contra debt_id inexistente: nenhum wrapper de erro
// novo aqui, quem traduz pra 4xx e a rota (Task 3).
//
// Filtra por id E debt_id — igual deleteDebtPayment abaixo. Sem o AND
// debt_id, um id de item solto apagaria o item de QUALQUER divida, mesma
// classe de furo que uma revisao anterior achou numa alocacao apontando
// pra item de outra divida.
export async function deleteDebtItem(
  db: D1Database,
  debt_id: string,
  item_id: string,
): Promise<boolean> {
  const res = await db
    .prepare('DELETE FROM debt_items WHERE id = ? AND debt_id = ?')
    .bind(item_id, debt_id)
    .run()
  return res.meta.changes > 0
}

// deleteDebtPayment apaga o PAGAMENTO (fluxo) e, se for kind='cash', o
// lancamento 1:1 junto — no MESMO db.batch(), nessa ORDEM. Motivo da ordem:
// debt_payments.transaction_id -> transactions e RESTRICT (migration 0001).
// Apagar a transaction ANTES do payment falharia (a FK ainda existe);
// apagar o payment primeiro faz a FK deixar de existir, e so entao a
// transaction pode sair — MEDIDO contra o D1 local (ver task brief).
// batch() faz rollback real: ou os dois somem, ou nenhum.
//
// debt_payment_allocations.payment_id e CASCADE — a alocacao some sozinha
// quando o payment sai, sem statement proprio nesse batch. E o que LIBERA
// o item pro RESTRICT de debt_payment_allocations.item_id parar de
// bloquear deleteDebtItem logo acima (as duas funcoes compoem).
//
// Terceiro statement do batch REABRE a divida se a exclusao a deixou sem
// nenhuma justificativa pra continuar 'settled' — mesmo raciocinio de
// addDebtItem reabrir uma divida settled quando chega item novo (ver
// acima): sem isto, apagar o (unico) pagamento que quitou a divida deixava
// status='settled' PRESO enquanto v_debt_item_balance ja mostrava o item de
// volta em aberto (a alocacao que o quitava sumiu por CASCADE) — a mesma
// tela mostrando "quitado" e "devendo" ao mesmo tempo, contraditorio e
// silencioso. So dispara quando EXISTS item com is_settled=0: uma divida ja
// 'open' (caso comum — pagamento parcial nunca fechou nada) vira no-op, e
// uma divida 'settled' por causa de OUTRO item/pagamento nao reabre a toa.
export async function deleteDebtPayment(
  db: D1Database,
  debt_id: string,
  payment_id: string,
): Promise<boolean> {
  const row = await db
    .prepare(
      'SELECT transaction_id FROM debt_payments WHERE id = ? AND debt_id = ?',
    )
    .bind(payment_id, debt_id)
    .first<{ transaction_id: string | null }>()
  if (!row) return false

  const now = nowIsoUtc()
  const statements: D1PreparedStatement[] = [
    db
      .prepare('DELETE FROM debt_payments WHERE id = ? AND debt_id = ?')
      .bind(payment_id, debt_id),
  ]
  if (row.transaction_id) {
    statements.push(
      db
        .prepare('DELETE FROM transactions WHERE id = ?')
        .bind(row.transaction_id),
    )
  }
  statements.push(
    db
      .prepare(
        `UPDATE debts SET status = 'open', settled_at = NULL, updated_at = ?
            WHERE id = ? AND status = 'settled'
              AND EXISTS (
                SELECT 1 FROM v_debt_item_balance WHERE debt_id = ? AND is_settled = 0
              )`,
      )
      .bind(now, debt_id, debt_id),
  )

  const results = await db.batch(statements)
  return results[0].meta.changes > 0
}

// trg_alloc_item_teto / trg_alloc_pagamento_teto abortam com
// SQLITE_CONSTRAINT_TRIGGER e o batch() inteiro reverte. A mensagem crua do
// D1 (ex.: "D1_ERROR: alocacao excede o valor do item: SQLITE_CONSTRAINT_
// TRIGGER") fica só no log — o usuário recebe a versão curada.
function translateD1Error(err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err)
  if (message.includes('SQLITE_CONSTRAINT_TRIGGER')) {
    logConstraintError('payDebt', message)
    return new OverAllocationError(friendlyConstraintMessage(message))
  }
  return err instanceof Error ? err : new Error(message)
}
