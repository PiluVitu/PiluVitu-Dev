import { applyD1Migrations, env } from 'cloudflare:test'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { nowIsoUtc } from '../lib/dates'
import { newId } from '../lib/ids'
import { debtsRoutes } from './debts'

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

type Envelopish = {
  ok: boolean
  data: any
  notifications: Array<{ type: string; code?: string; message: string }>
}

async function call(path: string, init?: RequestInit) {
  const res = await debtsRoutes.request(path, init, env)
  const text = await res.text()
  let body: Envelopish
  try {
    body = JSON.parse(text) as Envelopish
  } catch {
    body = {
      ok: false,
      data: null,
      notifications: [{ type: 'error', message: text }],
    }
  }
  return { status: res.status, body }
}

const post = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

const del = (): RequestInit => ({ method: 'DELETE' })

async function criarDivida(payee_id: string, opened_at = '2026-07-01') {
  const res = await call(
    '/',
    post({ payee_id, direction: 'i_owe', title: 'Pai', opened_at }),
  )
  return res.body.data.id as string
}

async function adicionarItem(
  debtId: string,
  amount_cents = 100000,
  description = 'Item de teste',
) {
  const res = await call(
    `/${debtId}/items`,
    post({ description, amount_cents, incurred_on: '2026-07-01' }),
  )
  return res.body.data.id as string
}

describe('rotas de dividas — caminho feliz', () => {
  it('cria divida, itens e pagamento e devolve o detalhe com os saldos', async () => {
    const { payee_id, account_id } = await seedPai()

    const criada = await call(
      '/',
      post({
        payee_id,
        direction: 'i_owe',
        title: 'Pai',
        opened_at: '2026-03-05',
      }),
    )
    expect(criada.status).toBe(201)
    expect(criada.body.ok).toBe(true)
    expect(criada.body.notifications).toEqual([])
    const debtId = criada.body.data.id as string

    const steam = await call(
      `/${debtId}/items`,
      post({
        description: 'Steam Deck OLED 1TB',
        amount_cents: 280000,
        incurred_on: '2026-03-05',
      }),
    )
    const mac = await call(
      `/${debtId}/items`,
      post({
        description: 'MacBook Air',
        amount_cents: 450000,
        incurred_on: '2026-03-05',
      }),
    )
    expect(steam.status).toBe(201)
    expect(mac.status).toBe(201)

    const pago = await call(
      `/${debtId}/payments`,
      post({
        paid_on: '2026-05-10',
        amount_cents: 594000,
        account_id,
        allocations: [
          { item_id: mac.body.data.id, amount_cents: 450000 },
          { item_id: steam.body.data.id, amount_cents: 144000 },
        ],
      }),
    )
    expect(pago.status).toBe(201)
    expect(pago.body.data.transaction.amount_cents).toBe(-594000)

    const detalhe = await call(`/${debtId}`)
    expect(detalhe.status).toBe(200)
    const items = detalhe.body.data.items as Array<{
      description: string
      remaining_cents: number
    }>
    expect(
      items.find((i) => i.description.startsWith('Steam'))?.remaining_cents,
    ).toBe(136000)
    expect(
      items.find((i) => i.description.startsWith('MacBook'))?.remaining_cents,
    ).toBe(0)

    const lista = await call('/?direction=i_owe')
    expect(lista.status).toBe(200)
    expect(lista.body.data).toHaveLength(1)
    expect(lista.body.data[0].remaining_cents).toBe(136000)
    expect(lista.body.data[0].payee_name).toBe('Pai')
  })

  it('divida inexistente devolve 404 not_found', async () => {
    const res = await call('/nao-existe')
    expect(res.status).toBe(404)
    expect(res.body.ok).toBe(false)
    expect(res.body.notifications[0].code).toBe('not_found')
  })

  it('query de status invalida devolve 400 invalid_query', async () => {
    const res = await call('/?status=qualquer')
    expect(res.status).toBe(400)
    expect(res.body.notifications[0].code).toBe('invalid_query')
  })
})

describe('rotas de dividas — erros de negocio', () => {
  async function debtComItem() {
    const { payee_id, account_id } = await seedPai()
    const criada = await call(
      '/',
      post({
        payee_id,
        direction: 'i_owe',
        title: 'Pai',
        opened_at: '2026-07-01',
      }),
    )
    const debtId = criada.body.data.id as string
    const item = await call(
      `/${debtId}/items`,
      post({
        description: 'Item de mil',
        amount_cents: 100000,
        incurred_on: '2026-07-01',
      }),
    )
    return { debtId, itemId: item.body.data.id as string, account_id }
  }

  it('superalocacao devolve 422 over_allocation e nao persiste nada', async () => {
    const { debtId, itemId, account_id } = await debtComItem()
    await call(
      `/${debtId}/payments`,
      post({
        paid_on: '2026-07-05',
        amount_cents: 30000,
        account_id,
        allocations: [{ item_id: itemId, amount_cents: 30000 }],
      }),
    )

    const res = await call(
      `/${debtId}/payments`,
      post({
        paid_on: '2026-07-06',
        amount_cents: 90000,
        account_id,
        allocations: [{ item_id: itemId, amount_cents: 90000 }],
      }),
    )
    expect(res.status).toBe(422)
    expect(res.body.ok).toBe(false)
    expect(res.body.notifications[0].code).toBe('over_allocation')
    // A mensagem do gatilho SQLITE_CONSTRAINT_TRIGGER e curada — nunca o
    // texto cru do D1 (que incluiria "D1_ERROR:"/"SQLITE_CONSTRAINT").
    const msg = res.body.notifications[0].message as string
    expect(msg).not.toMatch(/D1_ERROR|SQLITE_CONSTRAINT/i)
    expect(msg.length).toBeGreaterThan(0)

    const pagamentos = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM debt_payments',
    ).first<{
      n: number
    }>()
    expect(pagamentos?.n).toBe(1)
  })

  it("kind='cash' sem account_id devolve 422 invalid_account", async () => {
    const { debtId, itemId } = await debtComItem()
    const res = await call(
      `/${debtId}/payments`,
      post({
        paid_on: '2026-07-05',
        amount_cents: 30000,
        allocations: [{ item_id: itemId, amount_cents: 30000 }],
      }),
    )
    expect(res.status).toBe(422)
    expect(res.body.notifications[0].code).toBe('invalid_account')
  })

  it('corpo que nao e JSON devolve 400 invalid_json', async () => {
    const res = await call('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'isso nao e json',
    })
    expect(res.status).toBe(400)
    expect(res.body.notifications[0].code).toBe('invalid_json')
  })

  it('item em divida inexistente devolve 422 constraint_violation', async () => {
    const res = await call(
      '/nao-existe/items',
      post({
        description: 'Fantasma',
        amount_cents: 1000,
        incurred_on: '2026-07-01',
      }),
    )
    expect(res.status).toBe(422)
    expect(res.body.notifications[0].code).toBe('constraint_violation')
  })
})

describe('rotas de exclusao e baixa (Task 3)', () => {
  it('DELETE /:id sem pagamento cash apaga a divida e devolve 200', async () => {
    const { payee_id } = await seedPai()
    const debtId = await criarDivida(payee_id)
    await adicionarItem(debtId)

    const res = await call(`/${debtId}`, del())
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.data).toEqual({ id: debtId, deleted: true })

    const row = await env.DB.prepare('SELECT 1 FROM debts WHERE id = ?')
      .bind(debtId)
      .first()
    expect(row).toBeNull()
  })

  it('DELETE /:id de divida inexistente devolve 404 not_found', async () => {
    const res = await call('/nao-existe', del())
    expect(res.status).toBe(404)
    expect(res.body.ok).toBe(false)
    expect(res.body.notifications[0].code).toBe('not_found')
  })

  it("DELETE /:id com pagamento cash devolve 422 debt_has_ledger citando 'Dar baixa'", async () => {
    const { payee_id, account_id } = await seedPai()
    const debtId = await criarDivida(payee_id)
    const itemId = await adicionarItem(debtId, 100000)
    await call(
      `/${debtId}/payments`,
      post({
        paid_on: '2026-07-05',
        amount_cents: 100000,
        account_id,
        allocations: [{ item_id: itemId, amount_cents: 100000 }],
      }),
    )

    const res = await call(`/${debtId}`, del())
    expect(res.status).toBe(422)
    expect(res.body.ok).toBe(false)
    expect(res.body.notifications[0].code).toBe('debt_has_ledger')
    // A mensagem e a feature: sem citar a alternativa, o dono fica travado
    // com uma divida que nao pode excluir e nenhuma pista do que fazer.
    expect(res.body.notifications[0].message).toContain('Dar baixa')

    // Recusa nao apaga nada.
    const row = await env.DB.prepare('SELECT 1 FROM debts WHERE id = ?')
      .bind(debtId)
      .first()
    expect(row).not.toBeNull()
  })

  it('POST /:id/write-off muda status para written_off e devolve 200', async () => {
    const { payee_id } = await seedPai()
    const debtId = await criarDivida(payee_id)

    const res = await call(`/${debtId}/write-off`, { method: 'POST' })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.data).toEqual({ id: debtId, written_off: true })

    const row = await env.DB.prepare('SELECT status FROM debts WHERE id = ?')
      .bind(debtId)
      .first<{ status: string }>()
    expect(row?.status).toBe('written_off')
  })

  it('POST /:id/write-off de divida inexistente devolve 404 not_found', async () => {
    const res = await call('/nao-existe/write-off', { method: 'POST' })
    expect(res.status).toBe(404)
    expect(res.body.notifications[0].code).toBe('not_found')
  })

  it('DELETE /:id/items/:itemId sem alocacao apaga o item e devolve 200', async () => {
    const { payee_id } = await seedPai()
    const debtId = await criarDivida(payee_id)
    const itemId = await adicionarItem(debtId)

    const res = await call(`/${debtId}/items/${itemId}`, del())
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ id: itemId, deleted: true })

    const row = await env.DB.prepare('SELECT 1 FROM debt_items WHERE id = ?')
      .bind(itemId)
      .first()
    expect(row).toBeNull()
  })

  it('DELETE /:id/items/:itemId de item inexistente devolve 404 not_found', async () => {
    const { payee_id } = await seedPai()
    const debtId = await criarDivida(payee_id)

    const res = await call(`/${debtId}/items/nao-existe`, del())
    expect(res.status).toBe(404)
    expect(res.body.notifications[0].code).toBe('not_found')
  })

  it('DELETE /:id/items/:itemId com alocacao devolve 422 constraint_violation cozido — sem SQLITE_CONSTRAINT nem nome de tabela', async () => {
    const { payee_id, account_id } = await seedPai()
    const debtId = await criarDivida(payee_id)
    const itemId = await adicionarItem(debtId, 100000)
    await call(
      `/${debtId}/payments`,
      post({
        paid_on: '2026-07-05',
        amount_cents: 50000,
        account_id,
        allocations: [{ item_id: itemId, amount_cents: 50000 }],
      }),
    )

    const res = await call(`/${debtId}/items/${itemId}`, del())
    expect(res.status).toBe(422)
    expect(res.body.notifications[0].code).toBe('constraint_violation')
    const msg = res.body.notifications[0].message as string
    // O texto cru do D1 ("D1_ERROR: FOREIGN KEY constraint failed:
    // SQLITE_CONSTRAINT_FOREIGNKEY") nunca pode chegar ao usuario — nem o
    // codigo da constraint, nem o nome de tabela/coluna do schema.
    expect(msg).not.toMatch(/D1_ERROR|SQLITE_CONSTRAINT/i)
    expect(msg).not.toMatch(
      /debt_items|debt_payment_allocations|debt_payments/i,
    )
    expect(msg.length).toBeGreaterThan(0)

    // Item continua la — RESTRICT bloqueou o proprio DELETE, nada mudou.
    const row = await env.DB.prepare('SELECT 1 FROM debt_items WHERE id = ?')
      .bind(itemId)
      .first()
    expect(row).not.toBeNull()
  })

  it('DELETE /:id/payments/:paymentId apaga pagamento cash + transaction e devolve 200', async () => {
    const { payee_id, account_id } = await seedPai()
    const debtId = await criarDivida(payee_id)
    const itemId = await adicionarItem(debtId, 100000)
    const pago = await call(
      `/${debtId}/payments`,
      post({
        paid_on: '2026-07-05',
        amount_cents: 100000,
        account_id,
        allocations: [{ item_id: itemId, amount_cents: 100000 }],
      }),
    )
    const paymentId = pago.body.data.payment.id as string
    const transactionId = pago.body.data.transaction.id as string

    const res = await call(`/${debtId}/payments/${paymentId}`, del())
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ id: paymentId, deleted: true })

    const payRow = await env.DB.prepare(
      'SELECT 1 FROM debt_payments WHERE id = ?',
    )
      .bind(paymentId)
      .first()
    expect(payRow).toBeNull()
    const txRow = await env.DB.prepare(
      'SELECT 1 FROM transactions WHERE id = ?',
    )
      .bind(transactionId)
      .first()
    expect(txRow).toBeNull()
  })

  it('DELETE /:id/payments/:paymentId de pagamento inexistente devolve 404 not_found', async () => {
    const { payee_id } = await seedPai()
    const debtId = await criarDivida(payee_id)

    const res = await call(`/${debtId}/payments/nao-existe`, del())
    expect(res.status).toBe(404)
    expect(res.body.notifications[0].code).toBe('not_found')
  })
})
