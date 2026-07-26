import { applyD1Migrations, env } from 'cloudflare:test'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { nowIsoUtc } from '../lib/dates'
import { newId } from '../lib/ids'
import type { DebtItemBalance } from './debts'
import {
  addDebtItem,
  createDebt,
  debtDetail,
  InvalidPaymentError,
  listDebts,
  OverAllocationError,
  payDebt,
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
