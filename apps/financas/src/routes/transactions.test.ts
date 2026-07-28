import { applyD1Migrations, env } from 'cloudflare:test'
import { Hono } from 'hono'
import { beforeAll, describe, expect, it } from 'vitest'
import { createAccount } from '../domain/accounts'
import { createRecurring } from '../domain/recurring'
import { transactionsRoutes } from './transactions'

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
})

function app() {
  const hono = new Hono()
  hono.route('/api', transactionsRoutes)
  return hono
}

function post(path: string, body: unknown) {
  return app().request(
    path,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
    { DB: env.DB },
  )
}

describe('rotas de lancamentos', () => {
  it('POST /api/transactions em cartao devolve 201 com a competencia derivada', async () => {
    const card = await createAccount(env.DB, {
      name: 'Cartao rota',
      scope: 'PF',
      kind: 'credit_card',
      closing_day: 25,
      due_day: 5,
    })
    const res = await post('/api/transactions', {
      account_id: card.id,
      amount_cents: -12990,
      purchase_date: '2026-07-28',
      description: 'Steam',
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as {
      ok: boolean
      data: { bill_competence: string }
    }
    expect(body.ok).toBe(true)
    expect(body.data.bill_competence).toBe('2026-08')
  })

  it('POST /api/transactions com amount_cents = 0 devolve 422 em vez de 500', async () => {
    const acc = await createAccount(env.DB, {
      name: 'Conta rota zero',
      scope: 'PF',
      kind: 'checking',
    })
    const res = await post('/api/transactions', {
      account_id: acc.id,
      amount_cents: 0,
      purchase_date: '2026-07-28',
      description: 'nada',
    })
    expect(res.status).toBe(422)
    const body = (await res.json()) as {
      ok: boolean
      notifications: Array<{ type: string; code: string }>
    }
    expect(body.ok).toBe(false)
    expect(body.notifications[0].code).toBe('constraint_violation')
    expect(body.notifications[0].type).toBe('error')
  })

  it('POST /api/transfers devolve as duas pernas com o mesmo transfer_id', async () => {
    const de = await createAccount(env.DB, {
      name: 'Origem rota',
      scope: 'PF',
      kind: 'checking',
      opening_balance_cents: 500000,
    })
    const para = await createAccount(env.DB, {
      name: 'Destino rota',
      scope: 'PF',
      kind: 'checking',
    })
    const res = await post('/api/transfers', {
      from_account_id: de.id,
      to_account_id: para.id,
      amount_cents: 150000,
      date: '2026-07-20',
      description: 'PIX interno',
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as {
      data: {
        transfer_id: string
        out: { amount_cents: number; transfer_id: string }
        inbound: { amount_cents: number; transfer_id: string }
      }
    }
    expect(body.data.out.amount_cents).toBe(-150000)
    expect(body.data.inbound.amount_cents).toBe(150000)
    expect(body.data.out.transfer_id).toBe(body.data.transfer_id)
    expect(body.data.inbound.transfer_id).toBe(body.data.transfer_id)
  })

  it('POST /api/transfers para conta inexistente devolve 422 com mensagem legivel, sem texto cru do D1', async () => {
    // createTransfer nao pre-valida existencia das contas — a FK do schema
    // e quem barra, e o D1 devolve algo como "D1_ERROR: FOREIGN KEY
    // constraint failed: SQLITE_CONSTRAINT_FOREIGNKEY". Isso nunca pode
    // chegar cru pro usuario (nem o "D1_ERROR:", nem o nome da constraint).
    const de = await createAccount(env.DB, {
      name: 'Origem transfer fantasma',
      scope: 'PF',
      kind: 'checking',
      opening_balance_cents: 500000,
    })
    const res = await post('/api/transfers', {
      from_account_id: de.id,
      to_account_id: 'conta-que-nao-existe',
      amount_cents: 1000,
      date: '2026-07-20',
      description: 'PIX pra ninguem',
    })
    expect(res.status).toBe(422)
    const body = (await res.json()) as {
      ok: boolean
      notifications: Array<{ code: string; message: string }>
    }
    expect(body.ok).toBe(false)
    expect(body.notifications[0].code).toBe('constraint_violation')
    const msg = body.notifications[0].message
    expect(msg).not.toMatch(/D1_ERROR|SQLITE_CONSTRAINT|FOREIGN KEY/i)
    expect(msg.length).toBeGreaterThan(0)
  })

  it('GET /api/transactions filtra por account_id e periodo', async () => {
    const acc = await createAccount(env.DB, {
      name: 'Conta rota extrato',
      scope: 'PF',
      kind: 'checking',
    })
    await post('/api/transactions', {
      account_id: acc.id,
      amount_cents: -1000,
      purchase_date: '2026-06-30',
      description: 'junho',
      settled_at: '2026-06-30',
    })
    await post('/api/transactions', {
      account_id: acc.id,
      amount_cents: -2000,
      purchase_date: '2026-07-15',
      description: 'julho',
      settled_at: '2026-07-15',
    })

    const res = await app().request(
      `/api/transactions?account_id=${acc.id}&from=2026-07-01&to=2026-07-31`,
      {},
      { DB: env.DB },
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Array<{ description: string }> }
    expect(body.data.map((t) => t.description)).toEqual(['julho'])
  })

  // Task 7 da fatia ⑥ (docs/superpowers/specs/2026-07-27-financas-recorrentes-design.md
  // §3.1): o vinculo explicito que a tela Lancar oferece ("este lancamento
  // e o Starlink de agosto").
  it('POST /api/transactions com recurring_expense_id valido devolve 201 com o vinculo gravado', async () => {
    const acc = await createAccount(env.DB, {
      name: 'Conta rota recorrente',
      scope: 'PJ',
      kind: 'checking',
    })
    const recorrente = await createRecurring(env.DB, {
      description: 'Starlink',
      scope: 'PJ',
      day_of_month: 10,
      amount_min_cents: 18900,
      amount_max_cents: 18900,
      starts_on: '2026-01-01',
    })

    const res = await post('/api/transactions', {
      account_id: acc.id,
      amount_cents: -18900,
      purchase_date: '2026-08-10',
      description: 'Starlink de agosto',
      settled_at: '2026-08-10',
      recurring_expense_id: recorrente.id,
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as {
      data: { recurring_expense_id: string | null }
    }
    expect(body.data.recurring_expense_id).toBe(recorrente.id)
  })

  it('POST /api/transactions com recurring_expense_id inexistente devolve 422 com mensagem legivel, sem texto cru do D1', async () => {
    // Mesmo caminho de erro do teste equivalente de to_account_id em
    // /api/transfers, acima: a FK do schema (migration 0006) e quem barra,
    // e o D1_ERROR cru (com "FOREIGN KEY"/"SQLITE_CONSTRAINT") nunca pode
    // vazar pro cliente — cozido por friendlyConstraintMessage, com o
    // original so no console via logConstraintError.
    const acc = await createAccount(env.DB, {
      name: 'Conta rota recorrente fantasma',
      scope: 'PJ',
      kind: 'checking',
    })
    const res = await post('/api/transactions', {
      account_id: acc.id,
      amount_cents: -1000,
      purchase_date: '2026-08-10',
      description: 'vinculo invalido',
      recurring_expense_id: 'recorrente-que-nao-existe',
    })
    expect(res.status).toBe(422)
    const body = (await res.json()) as {
      ok: boolean
      notifications: Array<{ code: string; message: string }>
    }
    expect(body.ok).toBe(false)
    expect(body.notifications[0].code).toBe('constraint_violation')
    const msg = body.notifications[0].message
    expect(msg).not.toMatch(/D1_ERROR|SQLITE_CONSTRAINT|FOREIGN KEY/i)
    expect(msg.length).toBeGreaterThan(0)

    const { results } = await env.DB.prepare(
      'SELECT id FROM transactions WHERE account_id = ?',
    )
      .bind(acc.id)
      .all()
    expect(results).toHaveLength(0)
  })

  it('GET /api/transactions com limit invalido devolve 422', async () => {
    const res = await app().request(
      '/api/transactions?limit=abc',
      {},
      { DB: env.DB },
    )
    expect(res.status).toBe(422)
    const body = (await res.json()) as {
      notifications: Array<{ code: string }>
    }
    expect(body.notifications[0].code).toBe('invalid_limit')
  })
})
