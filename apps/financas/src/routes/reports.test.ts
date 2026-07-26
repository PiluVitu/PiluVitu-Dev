import { applyD1Migrations, env } from 'cloudflare:test'
import { Hono } from 'hono'
import { beforeAll, describe, expect, it } from 'vitest'
import { createAccount } from '../domain/accounts'
import { createTransaction } from '../domain/transactions'
import { reportsRoutes } from './reports'

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
})

// Monta so o router, sem o middleware do Access: o objetivo aqui e o
// contrato HTTP + envelope, nao a autenticacao (coberta na Task 4).
function app() {
  const hono = new Hono()
  hono.route('/api/reports', reportsRoutes)
  return hono
}

function get(path: string) {
  return app().request(path, {}, { DB: env.DB })
}

type Envelope<T> = {
  ok: boolean
  data: T
  notifications: Array<{ type: string; code: string; message: string }>
}

async function cartao(name: string) {
  return createAccount(env.DB, {
    name,
    scope: 'PF',
    kind: 'credit_card',
    closing_day: 25,
    due_day: 5,
  })
}

describe('GET /api/reports/commitments', () => {
  it('devolve 200 com envelope ok, competencias e o default de fixed_net_cents', async () => {
    const nubank = await cartao('Nubank cartao rota')
    await createTransaction(env.DB, {
      account_id: nubank.id,
      amount_cents: -124000,
      purchase_date: '2026-07-28',
      bill_competence: '2026-08',
      description: 'parcela rota',
    })

    const res = await get('/api/reports/commitments?from=2026-08&months=3')
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<{
      competences: string[]
      rows: Array<{ account_name: string; cells: number[] }>
      totals: number[]
      fixed_net_cents: number
      pct_of_fixed_net: number[]
    }>
    expect(body.ok).toBe(true)
    expect(body.notifications).toEqual([])
    expect(body.data.competences).toEqual(['2026-08', '2026-09', '2026-10'])
    expect(body.data.rows).toEqual([
      {
        account_id: nubank.id,
        account_name: 'Nubank cartao rota',
        cells: [124000, 0, 0],
      },
    ])
    expect(body.data.totals).toEqual([124000, 0, 0])
    expect(body.data.fixed_net_cents).toBe(360000)
  })

  it('conta sem parcela nenhuma na janela devolve rows vazio, nunca linha zerada', async () => {
    const res = await get('/api/reports/commitments?from=2100-01&months=2')
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<{
      rows: unknown[]
      totals: number[]
    }>
    expect(body.data.rows).toEqual([])
    expect(body.data.totals).toEqual([0, 0])
  })

  it('aceita fixed_net_cents customizado via query', async () => {
    const res = await get(
      '/api/reports/commitments?from=2026-08&months=1&fixed_net_cents=100000',
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<{ fixed_net_cents: number }>
    expect(body.data.fixed_net_cents).toBe(100000)
  })

  it('sem query nenhuma (from vazio) devolve 400 invalid_query', async () => {
    const res = await get('/api/reports/commitments')
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.ok).toBe(false)
    expect(body.notifications[0].code).toBe('invalid_query')
  })

  it("from='2026-8' (formato invalido) devolve 400 invalid_query", async () => {
    const res = await get('/api/reports/commitments?from=2026-8&months=6')
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.ok).toBe(false)
    expect(body.notifications[0].code).toBe('invalid_query')
  })

  it('months=0 devolve 400 invalid_query', async () => {
    const res = await get('/api/reports/commitments?from=2026-08&months=0')
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.ok).toBe(false)
    expect(body.notifications[0].code).toBe('invalid_query')
  })

  it('months nao numerico devolve 400 invalid_query', async () => {
    const res = await get('/api/reports/commitments?from=2026-08&months=abc')
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.ok).toBe(false)
    expect(body.notifications[0].code).toBe('invalid_query')
  })
})
