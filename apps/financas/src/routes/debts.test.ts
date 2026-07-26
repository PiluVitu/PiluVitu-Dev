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
