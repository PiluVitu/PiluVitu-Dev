import { applyD1Migrations, env } from 'cloudflare:test'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { nowIsoUtc } from '../lib/dates'
import { newId } from '../lib/ids'
import { commitments } from './reports'
import type { DebtItemBalance } from './debts'
import {
  addDebtItem,
  createDebt,
  debtDetail,
  DebtHasLedgerError,
  deleteDebt,
  deleteDebtItem,
  deleteDebtPayment,
  InvalidPaymentError,
  listDebts,
  OverAllocationError,
  payDebt,
  writeOffDebt,
} from './debts'

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
})

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM debt_payment_allocations'),
    env.DB.prepare('DELETE FROM debt_payments'),
    env.DB.prepare('DELETE FROM debt_items'),
    env.DB.prepare('DELETE FROM debts'),
    env.DB.prepare('DELETE FROM transactions'),
    env.DB.prepare('DELETE FROM accounts'),
    env.DB.prepare('DELETE FROM payees'),
  ])
})

async function seedPai() {
  const now = nowIsoUtc()
  const payee_id = newId()
  const account_id = newId()
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO payees (id, name, norm_name, kind, created_at) VALUES (?,?,?,?,?)',
    ).bind(payee_id, 'Pai', 'PAI', 'person', now),
    env.DB.prepare(
      'INSERT INTO accounts (id, name, scope, kind, currency, opening_balance_cents, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)',
    ).bind(account_id, 'Nubank', 'PF', 'checking', 'BRL', 0, now, now),
  ])
  return { payee_id, account_id }
}

describe('debts — cadastro e saldo por item', () => {
  it('cria a dívida com o pai e devolve o saldo de cada item', async () => {
    const { payee_id } = await seedPai()
    const debt = await createDebt(env.DB, {
      payee_id,
      direction: 'i_owe',
      title: 'Pai',
      opened_at: '2026-03-05',
    })
    const steam = await addDebtItem(env.DB, {
      debt_id: debt.id,
      description: 'Steam Deck OLED 1TB',
      amount_cents: 280000,
      incurred_on: '2026-03-05',
    })
    const mac = await addDebtItem(env.DB, {
      debt_id: debt.id,
      description: 'MacBook Air',
      amount_cents: 450000,
      incurred_on: '2026-03-05',
    })

    expect(debt.status).toBe('open')
    expect(debt.settled_at).toBeNull()

    const detail = await debtDetail(env.DB, debt.id)
    expect(detail.debt?.title).toBe('Pai')
    expect(detail.items).toHaveLength(2)
    expect(detail.payments).toHaveLength(0)

    const byId = new Map(detail.items.map((i) => [i.item_id, i]))
    expect(byId.get(steam.id)?.remaining_cents).toBe(280000)
    expect(byId.get(mac.id)?.allocated_cents).toBe(0)
    expect(byId.get(mac.id)?.is_settled).toBe(0)
  })

  it('addDebtItem reabre uma divida settled — sem isto o item novo ficava preso: nunca em commitments(), nunca mais quitavel', async () => {
    const { payee_id, account_id } = await seedPai()
    const debt = await createDebt(env.DB, {
      payee_id,
      direction: 'i_owe',
      title: 'Pai',
      opened_at: '2026-07-01',
    })
    const item1 = await addDebtItem(env.DB, {
      debt_id: debt.id,
      description: 'Item 1',
      amount_cents: 50000,
      incurred_on: '2026-07-01',
    })

    await payDebt(env.DB, {
      debt_id: debt.id,
      paid_on: '2026-07-05',
      amount_cents: 50000,
      account_id,
      allocations: [{ item_id: item1.id, amount_cents: 50000 }],
    })

    const quitada = await env.DB.prepare(
      'SELECT status, settled_at FROM debts WHERE id = ?',
    )
      .bind(debt.id)
      .first<{ status: string; settled_at: string | null }>()
    expect(quitada?.status).toBe('settled')
    expect(quitada?.settled_at).not.toBeNull()

    // Um item novo chega DEPOIS da divida ter sido dada como quitada — cai
    // por fora do CENARIO comum, mas e exatamente o que a task 5 acusa:
    // addDebtItem ignorava debt.status por completo.
    const item2 = await addDebtItem(env.DB, {
      debt_id: debt.id,
      description: 'Item 2 (chegou depois da quitacao)',
      amount_cents: 20000,
      incurred_on: '2026-07-10',
    })

    const reaberta = await env.DB.prepare(
      'SELECT status, settled_at FROM debts WHERE id = ?',
    )
      .bind(debt.id)
      .first<{ status: string; settled_at: string | null }>()
    expect(reaberta?.status).toBe('open')
    expect(reaberta?.settled_at).toBeNull()

    // E o item novo pode ser quitado de verdade: o UPDATE de quitacao do
    // payDebt exige "AND status = 'open'", que so volta a valer por causa
    // do reabrir acima — sem ele, este segundo payDebt gravaria o pagamento
    // mas a divida ficaria presa em 'settled' para sempre.
    await payDebt(env.DB, {
      debt_id: debt.id,
      paid_on: '2026-07-15',
      amount_cents: 20000,
      account_id,
      allocations: [{ item_id: item2.id, amount_cents: 20000 }],
    })

    const final = await env.DB.prepare('SELECT status FROM debts WHERE id = ?')
      .bind(debt.id)
      .first<{ status: string }>()
    expect(final?.status).toBe('settled')
  })

  it('nao cria item em divida inexistente', async () => {
    await expect(
      addDebtItem(env.DB, {
        debt_id: 'nao-existe',
        description: 'Fantasma',
        amount_cents: 1000,
        incurred_on: '2026-03-05',
      }),
    ).rejects.toThrow(/FOREIGN KEY|SQLITE_CONSTRAINT/)
  })
})

describe('debts — pagamento alocado', () => {
  it('CENARIO DO DONO: divida com o pai deixa o MacBook quitado e o Steam Deck com 136000', async () => {
    const { payee_id, account_id } = await seedPai()
    const debt = await createDebt(env.DB, {
      payee_id,
      direction: 'i_owe',
      title: 'Pai',
      opened_at: '2026-03-05',
    })
    const steam = await addDebtItem(env.DB, {
      debt_id: debt.id,
      description: 'Steam Deck OLED 1TB',
      amount_cents: 280000,
      incurred_on: '2026-03-05',
    })
    const mac = await addDebtItem(env.DB, {
      debt_id: debt.id,
      description: 'MacBook Air',
      amount_cents: 450000,
      incurred_on: '2026-03-05',
    })

    // 100000 + 100000 + 394000 = 594000 pagos de 730000 => faltam 136000,
    // que e o "deve R$ 1.360 de R$ 7.300" da tela do spec §6.
    await payDebt(env.DB, {
      debt_id: debt.id,
      paid_on: '2026-03-05',
      amount_cents: 100000,
      account_id,
      allocations: [{ item_id: mac.id, amount_cents: 100000 }],
    })
    await payDebt(env.DB, {
      debt_id: debt.id,
      paid_on: '2026-04-05',
      amount_cents: 100000,
      account_id,
      allocations: [{ item_id: mac.id, amount_cents: 100000 }],
    })
    await payDebt(env.DB, {
      debt_id: debt.id,
      paid_on: '2026-05-10',
      amount_cents: 394000,
      account_id,
      allocations: [
        { item_id: mac.id, amount_cents: 250000 },
        { item_id: steam.id, amount_cents: 144000 },
      ],
    })

    const detail = await debtDetail(env.DB, debt.id)
    const byId = new Map(detail.items.map((i) => [i.item_id, i]))

    expect(byId.get(mac.id)?.remaining_cents).toBe(0)
    expect(byId.get(mac.id)?.is_settled).toBe(1)
    expect(byId.get(steam.id)?.allocated_cents).toBe(144000)
    expect(byId.get(steam.id)?.remaining_cents).toBe(136000)
    expect(byId.get(steam.id)?.is_settled).toBe(0)

    expect(detail.payments).toHaveLength(3)
    expect(detail.payments[2].allocations).toHaveLength(2)
    expect(detail.payments.every((p) => p.transaction_id !== null)).toBe(true)
  })

  it('AS TRES QUERIES DO §5.4: 1x no caixa, 1x na divida, 0x na despesa', async () => {
    const { payee_id, account_id } = await seedPai()
    const debt = await createDebt(env.DB, {
      payee_id,
      direction: 'i_owe',
      title: 'Pai',
      opened_at: '2026-07-01',
    })
    const steam = await addDebtItem(env.DB, {
      debt_id: debt.id,
      description: 'Steam Deck OLED 1TB',
      amount_cents: 280000,
      incurred_on: '2026-07-01',
    })
    const mac = await addDebtItem(env.DB, {
      debt_id: debt.id,
      description: 'MacBook Air',
      amount_cents: 450000,
      incurred_on: '2026-07-01',
    })

    await payDebt(env.DB, {
      debt_id: debt.id,
      paid_on: '2026-07-10',
      amount_cents: 50000,
      account_id,
      allocations: [
        { item_id: steam.id, amount_cents: 30000 },
        { item_id: mac.id, amount_cents: 20000 },
      ],
    })

    const cashflow = await env.DB.prepare(
      `SELECT COALESCE(SUM(amount_cents), 0) AS total FROM v_cashflow WHERE competence_month = ?`,
    )
      .bind('2026-07')
      .first<{ total: number }>()
    expect(cashflow?.total).toBe(-50000)

    const balance = await env.DB.prepare(
      'SELECT * FROM v_debt_item_balance WHERE debt_id = ? ORDER BY description',
    )
      .bind(debt.id)
      .all<DebtItemBalance>()
    const allocated = balance.results.reduce(
      (acc, r) => acc + r.allocated_cents,
      0,
    )
    expect(allocated).toBe(50000)

    const asExpense = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM transactions t
         JOIN categories c ON c.id = t.category_id
        WHERE c.kind = 'expense'`,
    ).first<{ n: number }>()
    expect(asExpense?.n).toBe(0)

    const txCount = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM transactions',
    ).first<{
      n: number
    }>()
    expect(txCount?.n).toBe(1)
  })
})

describe('debts — tetos do banco (I1/I2)', () => {
  async function debtDe1000() {
    const { payee_id, account_id } = await seedPai()
    const debt = await createDebt(env.DB, {
      payee_id,
      direction: 'i_owe',
      title: 'Pai',
      opened_at: '2026-07-01',
    })
    const item = await addDebtItem(env.DB, {
      debt_id: debt.id,
      description: 'Item de mil',
      amount_cents: 100000,
      incurred_on: '2026-07-01',
    })
    return { debt, item, account_id }
  }

  async function counts() {
    const [tx, pay, alloc] = await env.DB.batch([
      env.DB.prepare('SELECT COUNT(*) AS n FROM transactions'),
      env.DB.prepare('SELECT COUNT(*) AS n FROM debt_payments'),
      env.DB.prepare('SELECT COUNT(*) AS n FROM debt_payment_allocations'),
    ])
    return {
      transactions: (tx.results as Array<{ n: number }>)[0].n,
      payments: (pay.results as Array<{ n: number }>)[0].n,
      allocations: (alloc.results as Array<{ n: number }>)[0].n,
    }
  }

  it('superalocacao aborta e NADA persiste', async () => {
    const { debt, item, account_id } = await debtDe1000()
    await payDebt(env.DB, {
      debt_id: debt.id,
      paid_on: '2026-07-05',
      amount_cents: 30000,
      account_id,
      allocations: [{ item_id: item.id, amount_cents: 30000 }],
    })
    expect(await counts()).toEqual({
      transactions: 1,
      payments: 1,
      allocations: 1,
    })

    await expect(
      payDebt(env.DB, {
        debt_id: debt.id,
        paid_on: '2026-07-06',
        amount_cents: 90000,
        account_id,
        allocations: [{ item_id: item.id, amount_cents: 90000 }],
      }),
    ).rejects.toBeInstanceOf(OverAllocationError)

    // nem transaction, nem payment, nem alocacao parcial
    expect(await counts()).toEqual({
      transactions: 1,
      payments: 1,
      allocations: 1,
    })
  })

  it('alocar EXATAMENTE ate o teto do item passa', async () => {
    const { debt, item, account_id } = await debtDe1000()
    await payDebt(env.DB, {
      debt_id: debt.id,
      paid_on: '2026-07-05',
      amount_cents: 30000,
      account_id,
      allocations: [{ item_id: item.id, amount_cents: 30000 }],
    })
    await payDebt(env.DB, {
      debt_id: debt.id,
      paid_on: '2026-07-06',
      amount_cents: 70000,
      account_id,
      allocations: [{ item_id: item.id, amount_cents: 70000 }],
    })

    const balance = await env.DB.prepare(
      'SELECT * FROM v_debt_item_balance WHERE item_id = ?',
    )
      .bind(item.id)
      .first<DebtItemBalance>()
    expect(balance?.allocated_cents).toBe(100000)
    expect(balance?.remaining_cents).toBe(0)
    expect(balance?.is_settled).toBe(1)
  })

  it('alocacao maior que o proprio pagamento aborta (I1)', async () => {
    const { debt, item, account_id } = await debtDe1000()
    await expect(
      payDebt(env.DB, {
        debt_id: debt.id,
        paid_on: '2026-07-05',
        amount_cents: 10000,
        account_id,
        allocations: [{ item_id: item.id, amount_cents: 20000 }],
      }),
    ).rejects.toBeInstanceOf(OverAllocationError)
    expect(await counts()).toEqual({
      transactions: 0,
      payments: 0,
      allocations: 0,
    })
  })
})

describe('debts — kind do pagamento e direcao da divida', () => {
  it("kind='offset' e kind='forgiven' NAO criam transaction", async () => {
    const { payee_id } = await seedPai()
    const debt = await createDebt(env.DB, {
      payee_id,
      direction: 'i_owe',
      title: 'Pai',
      opened_at: '2026-07-01',
    })
    const item = await addDebtItem(env.DB, {
      debt_id: debt.id,
      description: 'Item de mil',
      amount_cents: 100000,
      incurred_on: '2026-07-01',
    })

    const offset = await payDebt(env.DB, {
      debt_id: debt.id,
      paid_on: '2026-07-05',
      amount_cents: 30000,
      kind: 'offset',
      allocations: [{ item_id: item.id, amount_cents: 30000 }],
    })
    const forgiven = await payDebt(env.DB, {
      debt_id: debt.id,
      paid_on: '2026-07-06',
      amount_cents: 20000,
      kind: 'forgiven',
      allocations: [{ item_id: item.id, amount_cents: 20000 }],
    })

    expect(offset.transaction).toBeNull()
    expect(forgiven.transaction).toBeNull()
    expect(offset.payment.transaction_id).toBeNull()

    const tx = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM transactions',
    ).first<{ n: number }>()
    expect(tx?.n).toBe(0)

    const balance = await env.DB.prepare(
      'SELECT * FROM v_debt_item_balance WHERE item_id = ?',
    )
      .bind(item.id)
      .first<DebtItemBalance>()
    expect(balance?.allocated_cents).toBe(50000)
  })

  it('recusa pagamento numa conta credit_card e nao persiste nada (nao suportado nesta fatia)', async () => {
    // payDebt hardcoda settled_at = paid_on e bill_competence = null — regra
    // que so vale para dinheiro/conta corrente. Num cartao isso apagaria a
    // obrigacao futura de dentro de commitments() sem o dinheiro ter saido
    // de fato (a compra ainda estaria na fatura em aberto).
    const { payee_id } = await seedPai()
    const cartao_id = newId()
    const now = nowIsoUtc()
    await env.DB.prepare(
      `INSERT INTO accounts
         (id, name, scope, kind, currency, closing_day, due_day, opening_balance_cents, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    )
      .bind(
        cartao_id,
        'Nubank cartao',
        'PF',
        'credit_card',
        'BRL',
        25,
        5,
        0,
        now,
        now,
      )
      .run()

    const debt = await createDebt(env.DB, {
      payee_id,
      direction: 'i_owe',
      title: 'Pai',
      opened_at: '2026-07-01',
    })
    const item = await addDebtItem(env.DB, {
      debt_id: debt.id,
      description: 'Item de mil',
      amount_cents: 100000,
      incurred_on: '2026-07-01',
    })

    await expect(
      payDebt(env.DB, {
        debt_id: debt.id,
        paid_on: '2026-07-05',
        amount_cents: 30000,
        account_id: cartao_id,
        allocations: [{ item_id: item.id, amount_cents: 30000 }],
      }),
    ).rejects.toMatchObject({
      name: 'InvalidPaymentError',
      code: 'invalid_account',
    })

    const counted = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM debt_payments',
    ).first<{
      n: number
    }>()
    expect(counted?.n).toBe(0)
  })

  it("kind='cash' sem account_id e recusado", async () => {
    const { payee_id } = await seedPai()
    const debt = await createDebt(env.DB, {
      payee_id,
      direction: 'i_owe',
      title: 'Pai',
      opened_at: '2026-07-01',
    })
    const item = await addDebtItem(env.DB, {
      debt_id: debt.id,
      description: 'Item de mil',
      amount_cents: 100000,
      incurred_on: '2026-07-01',
    })

    await expect(
      payDebt(env.DB, {
        debt_id: debt.id,
        paid_on: '2026-07-05',
        amount_cents: 30000,
        allocations: [{ item_id: item.id, amount_cents: 30000 }],
      }),
    ).rejects.toMatchObject({
      name: 'InvalidPaymentError',
      code: 'invalid_account',
    })

    const counted = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM debt_payments',
    ).first<{
      n: number
    }>()
    expect(counted?.n).toBe(0)
  })

  it("direction='owed_to_me': o recebimento entra positivo e NUNCA vira categoria income", async () => {
    const { payee_id, account_id } = await seedPai()
    const debt = await createDebt(env.DB, {
      payee_id,
      direction: 'owed_to_me',
      title: 'Amigo',
      opened_at: '2026-07-01',
    })
    const item = await addDebtItem(env.DB, {
      debt_id: debt.id,
      description: 'Notebook do amigo',
      amount_cents: 320000,
      incurred_on: '2026-07-01',
    })

    const { transaction } = await payDebt(env.DB, {
      debt_id: debt.id,
      paid_on: '2026-07-10',
      amount_cents: 50000,
      account_id,
      allocations: [{ item_id: item.id, amount_cents: 50000 }],
    })
    expect(transaction?.amount_cents).toBe(50000)

    const kind = await env.DB.prepare(
      'SELECT c.kind AS kind FROM transactions t JOIN categories c ON c.id = t.category_id WHERE t.id = ?',
    )
      .bind(transaction?.id)
      .first<{ kind: string }>()
    expect(kind?.kind).toBe('debt_settlement')

    // classificar como income inflaria o faturamento e distorceria o DAS
    const asIncome = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM transactions t
         JOIN categories c ON c.id = t.category_id
        WHERE c.kind = 'income'`,
    ).first<{ n: number }>()
    expect(asIncome?.n).toBe(0)
  })
})

describe('debts — quitacao automatica', () => {
  it('quitar o ultimo item marca a divida como settled', async () => {
    const { payee_id, account_id } = await seedPai()
    const debt = await createDebt(env.DB, {
      payee_id,
      direction: 'i_owe',
      title: 'Pai',
      opened_at: '2026-07-01',
    })
    const a = await addDebtItem(env.DB, {
      debt_id: debt.id,
      description: 'Item A',
      amount_cents: 100000,
      incurred_on: '2026-07-01',
    })
    const b = await addDebtItem(env.DB, {
      debt_id: debt.id,
      description: 'Item B',
      amount_cents: 50000,
      incurred_on: '2026-07-01',
    })

    await payDebt(env.DB, {
      debt_id: debt.id,
      paid_on: '2026-07-10',
      amount_cents: 100000,
      account_id,
      allocations: [{ item_id: a.id, amount_cents: 100000 }],
    })
    const meio = await debtDetail(env.DB, debt.id)
    expect(meio.debt?.status).toBe('open')
    expect(meio.debt?.settled_at).toBeNull()

    await payDebt(env.DB, {
      debt_id: debt.id,
      paid_on: '2026-08-10',
      amount_cents: 50000,
      account_id,
      allocations: [{ item_id: b.id, amount_cents: 50000 }],
    })
    const fim = await debtDetail(env.DB, debt.id)
    expect(fim.debt?.status).toBe('settled')
    expect(fim.debt?.settled_at).toBe('2026-08-10')
  })

  it('divida sem itens nao vira settled', async () => {
    const { payee_id } = await seedPai()
    const vazia = await createDebt(env.DB, {
      payee_id,
      direction: 'i_owe',
      title: 'Sem itens',
      opened_at: '2026-07-01',
    })
    const outra = await createDebt(env.DB, {
      payee_id,
      direction: 'i_owe',
      title: 'Com item',
      opened_at: '2026-07-01',
    })
    const item = await addDebtItem(env.DB, {
      debt_id: outra.id,
      description: 'Item',
      amount_cents: 1000,
      incurred_on: '2026-07-01',
    })
    await payDebt(env.DB, {
      debt_id: outra.id,
      paid_on: '2026-07-10',
      amount_cents: 1000,
      kind: 'forgiven',
      allocations: [{ item_id: item.id, amount_cents: 1000 }],
    })

    const detail = await debtDetail(env.DB, vazia.id)
    expect(detail.debt?.status).toBe('open')
  })
})

describe('debts — listagem com totais', () => {
  it('devolve total, pago e restante por divida e filtra por direcao', async () => {
    const { payee_id, account_id } = await seedPai()
    const pai = await createDebt(env.DB, {
      payee_id,
      direction: 'i_owe',
      title: 'Pai',
      opened_at: '2026-03-05',
    })
    const steam = await addDebtItem(env.DB, {
      debt_id: pai.id,
      description: 'Steam Deck OLED 1TB',
      amount_cents: 280000,
      incurred_on: '2026-03-05',
    })
    const mac = await addDebtItem(env.DB, {
      debt_id: pai.id,
      description: 'MacBook Air',
      amount_cents: 450000,
      incurred_on: '2026-03-05',
    })
    await payDebt(env.DB, {
      debt_id: pai.id,
      paid_on: '2026-05-10',
      amount_cents: 594000,
      account_id,
      allocations: [
        { item_id: mac.id, amount_cents: 450000 },
        { item_id: steam.id, amount_cents: 144000 },
      ],
    })
    await createDebt(env.DB, {
      payee_id,
      direction: 'owed_to_me',
      title: 'Amigo',
      opened_at: '2026-06-01',
    })

    const todas = await listDebts(env.DB)
    expect(todas).toHaveLength(2)

    const doPai = todas.find((d) => d.id === pai.id)
    expect(doPai?.total_cents).toBe(730000)
    expect(doPai?.paid_cents).toBe(594000)
    expect(doPai?.remaining_cents).toBe(136000)
    // payee_name é o que permite a tela #/dividas (Task 14) mostrar "Pai" em
    // vez do UUID cru do payee_id.
    expect(doPai?.payee_name).toBe('Pai')

    const amigo = todas.find((d) => d.title === 'Amigo')
    expect(amigo?.total_cents).toBe(0)
    expect(amigo?.remaining_cents).toBe(0)

    const soDevo = await listDebts(env.DB, { direction: 'i_owe' })
    expect(soDevo.map((d) => d.title)).toEqual(['Pai'])

    const abertas = await listDebts(env.DB, { status: 'open' })
    expect(abertas).toHaveLength(2)
  })
})

describe('debts — exclusao e baixa', () => {
  // As CINCO tabelas, sempre — contar so a tabela-alvo e exatamente o que
  // esconde o defeito de transaction orfa (ver DebtHasLedgerError acima):
  // um DELETE FROM debts com CASCADE mal contido pode zerar debts/itens/
  // pagamentos/alocacoes e ainda assim deixar transactions=1 pra tras.
  async function countsAll() {
    const [debts, items, payments, allocations, transactions] =
      await env.DB.batch([
        env.DB.prepare('SELECT COUNT(*) AS n FROM debts'),
        env.DB.prepare('SELECT COUNT(*) AS n FROM debt_items'),
        env.DB.prepare('SELECT COUNT(*) AS n FROM debt_payments'),
        env.DB.prepare('SELECT COUNT(*) AS n FROM debt_payment_allocations'),
        env.DB.prepare('SELECT COUNT(*) AS n FROM transactions'),
      ])
    const one = (r: { results: unknown }) =>
      (r.results as Array<{ n: number }>)[0].n
    return {
      debts: one(debts),
      debt_items: one(items),
      debt_payments: one(payments),
      debt_payment_allocations: one(allocations),
      transactions: one(transactions),
    }
  }

  it('1) divida sem pagamento nenhum: deleteDebt apaga divida + itens, transactions fica INALTERADA', async () => {
    const { payee_id, account_id } = await seedPai()
    const debt = await createDebt(env.DB, {
      payee_id,
      direction: 'i_owe',
      title: 'Sem pagamento',
      opened_at: '2026-07-01',
    })
    await addDebtItem(env.DB, {
      debt_id: debt.id,
      description: 'Item A',
      amount_cents: 50000,
      incurred_on: '2026-07-01',
    })

    // Transaction NAO relacionada a esta divida — prova que o DELETE FROM
    // debts nao mexe em transactions em geral, nao so que 0 continua 0.
    const now = nowIsoUtc()
    await env.DB.prepare(
      `INSERT INTO transactions
         (id, account_id, amount_cents, currency, purchase_date, description, is_business, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    )
      .bind(
        newId(),
        account_id,
        -1000,
        'BRL',
        '2026-07-01',
        'Cafe',
        0,
        now,
        now,
      )
      .run()

    const before = await countsAll()
    expect(before).toEqual({
      debts: 1,
      debt_items: 1,
      debt_payments: 0,
      debt_payment_allocations: 0,
      transactions: 1,
    })

    const ok = await deleteDebt(env.DB, debt.id)
    expect(ok).toBe(true)

    const after = await countsAll()
    expect(after).toEqual({
      debts: 0,
      debt_items: 0,
      debt_payments: 0,
      debt_payment_allocations: 0,
      transactions: 1, // inalterada
    })
  })

  it('2) divida com pagamento cash: deleteDebt LANCA DebtHasLedgerError e as CINCO tabelas ficam identicas', async () => {
    const { payee_id, account_id } = await seedPai()
    const debt = await createDebt(env.DB, {
      payee_id,
      direction: 'i_owe',
      title: 'Com pagamento cash',
      opened_at: '2026-07-01',
    })
    const item = await addDebtItem(env.DB, {
      debt_id: debt.id,
      description: 'Item A',
      amount_cents: 100000,
      incurred_on: '2026-07-01',
    })
    await payDebt(env.DB, {
      debt_id: debt.id,
      paid_on: '2026-07-05',
      amount_cents: 30000,
      account_id,
      allocations: [{ item_id: item.id, amount_cents: 30000 }],
    })

    const before = await countsAll()
    expect(before).toEqual({
      debts: 1,
      debt_items: 1,
      debt_payments: 1,
      debt_payment_allocations: 1,
      transactions: 1,
    })

    await expect(deleteDebt(env.DB, debt.id)).rejects.toMatchObject({
      name: 'DebtHasLedgerError',
      code: 'debt_has_ledger',
    })
    await expect(deleteDebt(env.DB, debt.id)).rejects.toBeInstanceOf(
      DebtHasLedgerError,
    )
    // A mensagem e a fonte unica que a rota (routes/debts.ts#mapError) repassa
    // sem reescrever — guarda aqui, onde o texto de fato mora, contra uma
    // edicao futura que remova a citacao da alternativa ('Dar baixa').
    await expect(deleteDebt(env.DB, debt.id)).rejects.toThrow(/Dar baixa/)

    // Nao "quase igual" — IDENTICAS, valor a valor.
    const after = await countsAll()
    expect(after).toEqual(before)
  })

  it('3) divida com pagamento offset (sem lancamento): deleteDebt apaga normalmente', async () => {
    const { payee_id } = await seedPai()
    const debt = await createDebt(env.DB, {
      payee_id,
      direction: 'i_owe',
      title: 'Com pagamento offset',
      opened_at: '2026-07-01',
    })
    const item = await addDebtItem(env.DB, {
      debt_id: debt.id,
      description: 'Item A',
      amount_cents: 100000,
      incurred_on: '2026-07-01',
    })
    await payDebt(env.DB, {
      debt_id: debt.id,
      paid_on: '2026-07-05',
      amount_cents: 30000,
      kind: 'offset',
      allocations: [{ item_id: item.id, amount_cents: 30000 }],
    })

    const before = await countsAll()
    expect(before).toEqual({
      debts: 1,
      debt_items: 1,
      debt_payments: 1,
      debt_payment_allocations: 1,
      transactions: 0,
    })

    const ok = await deleteDebt(env.DB, debt.id)
    expect(ok).toBe(true)

    const after = await countsAll()
    expect(after).toEqual({
      debts: 0,
      debt_items: 0,
      debt_payments: 0,
      debt_payment_allocations: 0,
      transactions: 0,
    })
  })

  it('4) id inexistente: deleteDebt devolve false, sem excecao', async () => {
    await expect(deleteDebt(env.DB, 'nao-existe')).resolves.toBe(false)
  })

  it('5) writeOffDebt marca status=written_off e preserva itens/pagamentos/lancamentos', async () => {
    const { payee_id, account_id } = await seedPai()
    const debt = await createDebt(env.DB, {
      payee_id,
      direction: 'i_owe',
      title: 'Baixada',
      opened_at: '2026-07-01',
    })
    const item = await addDebtItem(env.DB, {
      debt_id: debt.id,
      description: 'Item A',
      amount_cents: 100000,
      incurred_on: '2026-07-01',
    })
    // Pagamento PARCIAL: divida fica 'open' (nao 'settled'), pra provar que
    // writeOffDebt e quem faz a transicao, nao um efeito colateral do
    // ultimo payDebt.
    await payDebt(env.DB, {
      debt_id: debt.id,
      paid_on: '2026-07-05',
      amount_cents: 30000,
      account_id,
      allocations: [{ item_id: item.id, amount_cents: 30000 }],
    })

    const antes = await env.DB.prepare('SELECT status FROM debts WHERE id = ?')
      .bind(debt.id)
      .first<{ status: string }>()
    expect(antes?.status).toBe('open')

    const before = await countsAll()

    const ok = await writeOffDebt(env.DB, debt.id)
    expect(ok).toBe(true)

    const depois = await env.DB.prepare(
      'SELECT status, settled_at FROM debts WHERE id = ?',
    )
      .bind(debt.id)
      .first<{ status: string; settled_at: string | null }>()
    expect(depois?.status).toBe('written_off')

    // Nenhuma linha some — baixa preserva o historico inteiro, so muda o status.
    const after = await countsAll()
    expect(after).toEqual(before)
    expect(after).toEqual({
      debts: 1,
      debt_items: 1,
      debt_payments: 1,
      debt_payment_allocations: 1,
      transactions: 1,
    })
  })

  it('writeOffDebt em divida ja settled/written_off nao faz nada — devolve false', async () => {
    const { payee_id } = await seedPai()
    const debt = await createDebt(env.DB, {
      payee_id,
      direction: 'i_owe',
      title: 'Ja baixada',
      opened_at: '2026-07-01',
    })
    const primeira = await writeOffDebt(env.DB, debt.id) // abre -> written_off
    expect(primeira).toBe(true)

    const segunda = await writeOffDebt(env.DB, debt.id) // written_off -> no-op
    expect(segunda).toBe(false)
  })

  it('writeOffDebt numa divida ja settled tambem nao faz nada — guarda e WHERE status=open, nao status<>written_off', async () => {
    // A guarda de writeOffDebt e WHERE status = 'open' — 'settled' tem que
    // ser recusado pelo MESMO motivo que 'written_off' (nao faz sentido dar
    // baixa no que ja foi pago), mas por um caminho DIFERENTE do teste
    // acima: aqui a divida chega em 'settled' via payDebt (quitacao real,
    // com settled_at preenchido pelo CHECK da migration 0001), nao por um
    // writeOffDebt anterior. Prova que o guard nao deixa escapar o lado
    // 'settled' do enum, so testado indiretamente ate aqui.
    const { payee_id, account_id } = await seedPai()
    const debt = await createDebt(env.DB, {
      payee_id,
      direction: 'i_owe',
      title: 'Quitada de verdade',
      opened_at: '2026-07-01',
    })
    const item = await addDebtItem(env.DB, {
      debt_id: debt.id,
      description: 'Item A',
      amount_cents: 50000,
      incurred_on: '2026-07-01',
    })
    await payDebt(env.DB, {
      debt_id: debt.id,
      paid_on: '2026-07-05',
      amount_cents: 50000,
      account_id,
      allocations: [{ item_id: item.id, amount_cents: 50000 }],
    })

    const antes = await env.DB.prepare(
      'SELECT status, settled_at FROM debts WHERE id = ?',
    )
      .bind(debt.id)
      .first<{ status: string; settled_at: string | null }>()
    expect(antes?.status).toBe('settled')
    expect(antes?.settled_at).not.toBeNull()

    const ok = await writeOffDebt(env.DB, debt.id)
    expect(ok).toBe(false)

    // Nao mudou NADA — nem status, nem settled_at.
    const depois = await env.DB.prepare(
      'SELECT status, settled_at FROM debts WHERE id = ?',
    )
      .bind(debt.id)
      .first<{ status: string; settled_at: string | null }>()
    expect(depois).toEqual(antes)
  })

  it('6) divida baixada SAI do comprometido — commitments() antes e depois provam o efeito, nao so a coluna status', async () => {
    const { payee_id } = await seedPai()
    const debt = await createDebt(env.DB, {
      payee_id,
      direction: 'i_owe',
      title: 'Vai ser baixada',
      opened_at: '2026-07-01',
    })
    await addDebtItem(env.DB, {
      debt_id: debt.id,
      description: 'Item A',
      amount_cents: 100000,
      incurred_on: '2026-07-01',
    })

    const antes = await commitments(env.DB, {
      from: '2026-07',
      months: 1,
      fixed_net_cents: 360000,
    })
    expect(antes.totals[0]).toEqual({ min: 100000, max: 100000 })

    const ok = await writeOffDebt(env.DB, debt.id)
    expect(ok).toBe(true)

    const depois = await commitments(env.DB, {
      from: '2026-07',
      months: 1,
      fixed_net_cents: 360000,
    })
    expect(depois.totals[0]).toEqual({ min: 0, max: 0 })
    expect(depois.rows).toEqual([])
  })

  describe('deleteDebtItem', () => {
    it('7) item sem alocacao: apaga e as OUTRAS quatro tabelas ficam intactas', async () => {
      const { payee_id } = await seedPai()
      const debt = await createDebt(env.DB, {
        payee_id,
        direction: 'i_owe',
        title: 'Item avulso',
        opened_at: '2026-07-01',
      })
      const item = await addDebtItem(env.DB, {
        debt_id: debt.id,
        description: 'Item A',
        amount_cents: 50000,
        incurred_on: '2026-07-01',
      })

      const before = await countsAll()
      expect(before).toEqual({
        debts: 1,
        debt_items: 1,
        debt_payments: 0,
        debt_payment_allocations: 0,
        transactions: 0,
      })

      const ok = await deleteDebtItem(env.DB, debt.id, item.id)
      expect(ok).toBe(true)

      const after = await countsAll()
      expect(after).toEqual({
        debts: 1,
        debt_items: 0,
        debt_payments: 0,
        debt_payment_allocations: 0,
        transactions: 0,
      })
    })

    it('8) item com alocacao: RESTRICT dispara e NADA e apagado (nem o proprio item)', async () => {
      const { payee_id, account_id } = await seedPai()
      const debt = await createDebt(env.DB, {
        payee_id,
        direction: 'i_owe',
        title: 'Item alocado',
        opened_at: '2026-07-01',
      })
      const item = await addDebtItem(env.DB, {
        debt_id: debt.id,
        description: 'Item A',
        amount_cents: 100000,
        incurred_on: '2026-07-01',
      })
      await payDebt(env.DB, {
        debt_id: debt.id,
        paid_on: '2026-07-05',
        amount_cents: 30000,
        account_id,
        allocations: [{ item_id: item.id, amount_cents: 30000 }],
      })

      const before = await countsAll()
      expect(before).toEqual({
        debts: 1,
        debt_items: 1,
        debt_payments: 1,
        debt_payment_allocations: 1,
        transactions: 1,
      })

      await expect(deleteDebtItem(env.DB, debt.id, item.id)).rejects.toThrow(
        /FOREIGN KEY|SQLITE_CONSTRAINT/,
      )

      // Nao "quase igual" — IDENTICAS, valor a valor (mesma disciplina do
      // teste 2 de deleteDebt acima).
      const after = await countsAll()
      expect(after).toEqual(before)
    })

    it('id de item inexistente: devolve false', async () => {
      const { payee_id } = await seedPai()
      const debt = await createDebt(env.DB, {
        payee_id,
        direction: 'i_owe',
        title: 'Sem item',
        opened_at: '2026-07-01',
      })
      await expect(deleteDebtItem(env.DB, debt.id, 'nao-existe')).resolves.toBe(
        false,
      )
    })

    it('item que pertence a OUTRA divida: devolve false, sem apagar por id solto', async () => {
      const { payee_id } = await seedPai()
      const debtA = await createDebt(env.DB, {
        payee_id,
        direction: 'i_owe',
        title: 'Divida A',
        opened_at: '2026-07-01',
      })
      const debtB = await createDebt(env.DB, {
        payee_id,
        direction: 'i_owe',
        title: 'Divida B',
        opened_at: '2026-07-01',
      })
      const itemDeA = await addDebtItem(env.DB, {
        debt_id: debtA.id,
        description: 'Item da A',
        amount_cents: 50000,
        incurred_on: '2026-07-01',
      })

      const ok = await deleteDebtItem(env.DB, debtB.id, itemDeA.id)
      expect(ok).toBe(false)

      const after = await countsAll()
      expect(after.debt_items).toBe(1) // continua la, intacto
    })
  })

  describe('deleteDebtPayment', () => {
    it('9) pagamento cash: some JUNTO com o lancamento — transactions perde EXATAMENTE 1 linha, a certa', async () => {
      const { payee_id, account_id } = await seedPai()
      const debt = await createDebt(env.DB, {
        payee_id,
        direction: 'i_owe',
        title: 'Pagamento cash',
        opened_at: '2026-07-01',
      })
      const item = await addDebtItem(env.DB, {
        debt_id: debt.id,
        description: 'Item A',
        amount_cents: 100000,
        incurred_on: '2026-07-01',
      })
      const { payment } = await payDebt(env.DB, {
        debt_id: debt.id,
        paid_on: '2026-07-05',
        amount_cents: 30000,
        account_id,
        allocations: [{ item_id: item.id, amount_cents: 30000 }],
      })

      // Transaction NAO relacionada a este pagamento — prova seletividade,
      // nao so contagem (mesma disciplina do teste 1 de deleteDebt acima).
      const now = nowIsoUtc()
      const unrelatedId = newId()
      await env.DB.prepare(
        `INSERT INTO transactions
           (id, account_id, amount_cents, currency, purchase_date, description, is_business, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      )
        .bind(
          unrelatedId,
          account_id,
          -1000,
          'BRL',
          '2026-07-01',
          'Cafe',
          0,
          now,
          now,
        )
        .run()

      const before = await countsAll()
      expect(before).toEqual({
        debts: 1,
        debt_items: 1,
        debt_payments: 1,
        debt_payment_allocations: 1,
        transactions: 2,
      })

      const ok = await deleteDebtPayment(env.DB, debt.id, payment.id)
      expect(ok).toBe(true)

      const after = await countsAll()
      expect(after).toEqual({
        debts: 1,
        debt_items: 1,
        debt_payments: 0,
        debt_payment_allocations: 0,
        transactions: 1, // so a NAO relacionada sobrou
      })

      const restante = await env.DB.prepare(
        'SELECT id FROM transactions',
      ).first<{ id: string }>()
      expect(restante?.id).toBe(unrelatedId)

      // Pagamento parcial (30000 de 100000): a divida nunca chegou a
      // 'settled', entao o UPDATE de reabertura e um no-op — permanece 'open'.
      const debtStatus = await env.DB.prepare(
        'SELECT status FROM debts WHERE id = ?',
      )
        .bind(debt.id)
        .first<{ status: string }>()
      expect(debtStatus?.status).toBe('open')
    })

    it('10) pagamento offset: some SEM tocar transactions', async () => {
      const { payee_id, account_id } = await seedPai()
      const debt = await createDebt(env.DB, {
        payee_id,
        direction: 'i_owe',
        title: 'Pagamento offset',
        opened_at: '2026-07-01',
      })
      const item = await addDebtItem(env.DB, {
        debt_id: debt.id,
        description: 'Item A',
        amount_cents: 100000,
        incurred_on: '2026-07-01',
      })
      const { payment } = await payDebt(env.DB, {
        debt_id: debt.id,
        paid_on: '2026-07-05',
        amount_cents: 30000,
        kind: 'offset',
        allocations: [{ item_id: item.id, amount_cents: 30000 }],
      })

      // Transaction nao relacionada — prova que "sem tocar transactions" e
      // literal, nao so "zero antes e zero depois" coincidente.
      const now = nowIsoUtc()
      await env.DB.prepare(
        `INSERT INTO transactions
           (id, account_id, amount_cents, currency, purchase_date, description, is_business, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      )
        .bind(
          newId(),
          account_id,
          -1000,
          'BRL',
          '2026-07-01',
          'Cafe',
          0,
          now,
          now,
        )
        .run()

      const before = await countsAll()
      expect(before).toEqual({
        debts: 1,
        debt_items: 1,
        debt_payments: 1,
        debt_payment_allocations: 1,
        transactions: 1,
      })

      const ok = await deleteDebtPayment(env.DB, debt.id, payment.id)
      expect(ok).toBe(true)

      const after = await countsAll()
      expect(after).toEqual({
        debts: 1,
        debt_items: 1,
        debt_payments: 0,
        debt_payment_allocations: 0,
        transactions: 1, // inalterada
      })
    })

    it('11) apagar o pagamento LIBERA o item: alocacao some por CASCADE, item volta a poder ser apagado', async () => {
      const { payee_id } = await seedPai()
      const debt = await createDebt(env.DB, {
        payee_id,
        direction: 'i_owe',
        title: 'Libera item',
        opened_at: '2026-07-01',
      })
      const item = await addDebtItem(env.DB, {
        debt_id: debt.id,
        description: 'Item A',
        amount_cents: 100000,
        incurred_on: '2026-07-01',
      })
      const { payment } = await payDebt(env.DB, {
        debt_id: debt.id,
        paid_on: '2026-07-05',
        amount_cents: 100000,
        kind: 'offset',
        allocations: [{ item_id: item.id, amount_cents: 100000 }],
      })

      // Enquanto a alocacao existe, o RESTRICT bloqueia o item.
      await expect(deleteDebtItem(env.DB, debt.id, item.id)).rejects.toThrow(
        /FOREIGN KEY|SQLITE_CONSTRAINT/,
      )

      const ok = await deleteDebtPayment(env.DB, debt.id, payment.id)
      expect(ok).toBe(true)

      const meio = await countsAll()
      expect(meio.debt_payment_allocations).toBe(0) // cascade junto do pagamento

      // Se as duas funcoes nao compoem, isto falha de novo com o mesmo RESTRICT.
      const okItem = await deleteDebtItem(env.DB, debt.id, item.id)
      expect(okItem).toBe(true)

      const fim = await countsAll()
      expect(fim).toEqual({
        debts: 1,
        debt_items: 0,
        debt_payments: 0,
        debt_payment_allocations: 0,
        transactions: 0,
      })
    })

    it('12) id de pagamento inexistente: devolve false', async () => {
      const { payee_id } = await seedPai()
      const debt = await createDebt(env.DB, {
        payee_id,
        direction: 'i_owe',
        title: 'Sem pagamento',
        opened_at: '2026-07-01',
      })
      await expect(
        deleteDebtPayment(env.DB, debt.id, 'nao-existe'),
      ).resolves.toBe(false)
    })

    it('13) pagamento que pertence a OUTRA divida: devolve false, sem apagar por id solto', async () => {
      const { payee_id, account_id } = await seedPai()
      const debtA = await createDebt(env.DB, {
        payee_id,
        direction: 'i_owe',
        title: 'Divida A',
        opened_at: '2026-07-01',
      })
      const debtB = await createDebt(env.DB, {
        payee_id,
        direction: 'i_owe',
        title: 'Divida B',
        opened_at: '2026-07-01',
      })
      const itemDeA = await addDebtItem(env.DB, {
        debt_id: debtA.id,
        description: 'Item da A',
        amount_cents: 50000,
        incurred_on: '2026-07-01',
      })
      const { payment } = await payDebt(env.DB, {
        debt_id: debtA.id,
        paid_on: '2026-07-05',
        amount_cents: 30000,
        account_id,
        allocations: [{ item_id: itemDeA.id, amount_cents: 30000 }],
      })

      const before = await countsAll()

      const ok = await deleteDebtPayment(env.DB, debtB.id, payment.id)
      expect(ok).toBe(false)

      // NADA mudou — nem no pagamento da A, nem em mais nada.
      const after = await countsAll()
      expect(after).toEqual(before)
    })

    it('apagar o (unico) pagamento que quitou a divida REABRE — settled volta a open', async () => {
      // Sem isto, apagar o pagamento que quitou a divida deixava
      // status='settled' PRESO enquanto v_debt_item_balance ja mostrava o
      // item de volta em aberto (a alocacao que o quitava sumiu por
      // CASCADE) — a tela mostraria "quitado" e "devendo" ao mesmo tempo.
      // Mesmo raciocinio de addDebtItem reabrir uma divida settled quando
      // chega item novo (ver domain/debts.ts).
      const { payee_id, account_id } = await seedPai()
      const debt = await createDebt(env.DB, {
        payee_id,
        direction: 'i_owe',
        title: 'Fica presa se nao reabrir',
        opened_at: '2026-07-01',
      })
      const item = await addDebtItem(env.DB, {
        debt_id: debt.id,
        description: 'Item A',
        amount_cents: 50000,
        incurred_on: '2026-07-01',
      })
      const { payment } = await payDebt(env.DB, {
        debt_id: debt.id,
        paid_on: '2026-07-05',
        amount_cents: 50000,
        account_id,
        allocations: [{ item_id: item.id, amount_cents: 50000 }],
      })

      const antes = await env.DB.prepare(
        'SELECT status, settled_at FROM debts WHERE id = ?',
      )
        .bind(debt.id)
        .first<{ status: string; settled_at: string | null }>()
      expect(antes?.status).toBe('settled')
      expect(antes?.settled_at).not.toBeNull()

      await deleteDebtPayment(env.DB, debt.id, payment.id)

      const depois = await env.DB.prepare(
        'SELECT status, settled_at FROM debts WHERE id = ?',
      )
        .bind(debt.id)
        .first<{ status: string; settled_at: string | null }>()
      expect(depois?.status).toBe('open')
      expect(depois?.settled_at).toBeNull()

      const balance = await env.DB.prepare(
        'SELECT remaining_cents, is_settled FROM v_debt_item_balance WHERE item_id = ?',
      )
        .bind(item.id)
        .first<{ remaining_cents: number; is_settled: number }>()
      expect(balance?.remaining_cents).toBe(50000)
      expect(balance?.is_settled).toBe(0)
    })

    it('divida com DOIS itens quitados por DOIS pagamentos: apagar um so desassenta o proprio item, reabre a divida, e NAO mexe no outro item/pagamento', async () => {
      // A guarda EXISTS is_settled=0 e provadamente correta por inspecao —
      // este teste e cobertura contra uma futura regressao (ex.: inverter
      // pra NOT EXISTS is_settled=1, ou esquecer o AND debt_id), nao uma
      // duvida sobre o comportamento atual.
      const { payee_id, account_id } = await seedPai()
      const debt = await createDebt(env.DB, {
        payee_id,
        direction: 'i_owe',
        title: 'Dois itens, dois pagamentos',
        opened_at: '2026-07-01',
      })
      const itemA = await addDebtItem(env.DB, {
        debt_id: debt.id,
        description: 'Item A',
        amount_cents: 30000,
        incurred_on: '2026-07-01',
      })
      const itemB = await addDebtItem(env.DB, {
        debt_id: debt.id,
        description: 'Item B',
        amount_cents: 70000,
        incurred_on: '2026-07-01',
      })
      const { payment: paymentA } = await payDebt(env.DB, {
        debt_id: debt.id,
        paid_on: '2026-07-05',
        amount_cents: 30000,
        kind: 'offset',
        allocations: [{ item_id: itemA.id, amount_cents: 30000 }],
      })
      const { payment: paymentB } = await payDebt(env.DB, {
        debt_id: debt.id,
        paid_on: '2026-07-06',
        amount_cents: 70000,
        kind: 'offset',
        allocations: [{ item_id: itemB.id, amount_cents: 70000 }],
      })

      // Os dois itens quitados => o segundo payDebt fechou a divida.
      const antes = await env.DB.prepare(
        'SELECT status FROM debts WHERE id = ?',
      )
        .bind(debt.id)
        .first<{ status: string }>()
      expect(antes?.status).toBe('settled')

      const before = await countsAll()
      expect(before).toEqual({
        debts: 1,
        debt_items: 2,
        debt_payments: 2,
        debt_payment_allocations: 2,
        transactions: 0,
      })

      // Apaga SO o pagamento do item A.
      const ok = await deleteDebtPayment(env.DB, debt.id, paymentA.id)
      expect(ok).toBe(true)

      // A divida reabre (item A ficou sem alocacao).
      const depois = await env.DB.prepare(
        'SELECT status, settled_at FROM debts WHERE id = ?',
      )
        .bind(debt.id)
        .first<{ status: string; settled_at: string | null }>()
      expect(depois?.status).toBe('open')
      expect(depois?.settled_at).toBeNull()

      // Item A: desquitado.
      const balanceA = await env.DB.prepare(
        'SELECT remaining_cents, is_settled FROM v_debt_item_balance WHERE item_id = ?',
      )
        .bind(itemA.id)
        .first<{ remaining_cents: number; is_settled: number }>()
      expect(balanceA?.remaining_cents).toBe(30000)
      expect(balanceA?.is_settled).toBe(0)

      // Item B: continua QUITADO — o pagamento/alocacao dele nunca foi tocado.
      const balanceB = await env.DB.prepare(
        'SELECT remaining_cents, is_settled FROM v_debt_item_balance WHERE item_id = ?',
      )
        .bind(itemB.id)
        .first<{ remaining_cents: number; is_settled: number }>()
      expect(balanceB?.remaining_cents).toBe(0)
      expect(balanceB?.is_settled).toBe(1)

      // Cinco tabelas: so o pagamento/alocacao de A sumiram; item A continua
      // existindo (so a alocacao foi embora), payment/alocacao de B intactos.
      const after = await countsAll()
      expect(after).toEqual({
        debts: 1,
        debt_items: 2,
        debt_payments: 1,
        debt_payment_allocations: 1,
        transactions: 0,
      })

      // O pagamento que sobrou e mesmo o da B, nao um resto acidental de A.
      const restante = await env.DB.prepare(
        'SELECT id FROM debt_payments',
      ).first<{ id: string }>()
      expect(restante?.id).toBe(paymentB.id)
    })
  })
})
