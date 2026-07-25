import { applyD1Migrations, env } from 'cloudflare:test'
import { Hono } from 'hono'
import { beforeAll, describe, expect, it } from 'vitest'
import { accountsRoutes } from './accounts'

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
})

// Monta so o router, sem o middleware do Access: o objetivo aqui e o
// contrato HTTP + envelope, nao a autenticacao (coberta na Task 4).
function app() {
  const hono = new Hono()
  hono.route('/api', accountsRoutes)
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

describe('rotas de contas', () => {
  it('POST /api/accounts devolve 201 com envelope ok', async () => {
    const res = await post('/api/accounts', {
      name: 'Nubank rota',
      scope: 'PF',
      kind: 'checking',
      opening_balance_cents: 1000,
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as {
      ok: boolean
      data: { id: string; name: string }
      notifications: unknown[]
    }
    expect(body.ok).toBe(true)
    expect(body.data.name).toBe('Nubank rota')
    expect(body.notifications).toEqual([])
  })

  it('POST /api/accounts com cartao sem fechamento devolve 422 explicando', async () => {
    const res = await post('/api/accounts', {
      name: 'Cartao rota torto',
      scope: 'PF',
      kind: 'credit_card',
    })
    expect(res.status).toBe(422)
    const body = (await res.json()) as {
      ok: boolean
      notifications: Array<{ type: string; code: string; message: string }>
    }
    expect(body.ok).toBe(false)
    expect(body.notifications[0].code).toBe('invalid_account')
    expect(body.notifications[0].message).toContain('closing_day')
  })

  it('GET /api/accounts?scope=PJ filtra e devolve balance_cents', async () => {
    await post('/api/accounts', {
      name: 'Inter PJ rota',
      scope: 'PJ',
      kind: 'checking',
      opening_balance_cents: 412000,
    })
    await post('/api/accounts', {
      name: 'Inter PF rota',
      scope: 'PF',
      kind: 'checking',
    })

    const res = await app().request(
      '/api/accounts?scope=PJ',
      {},
      { DB: env.DB },
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      data: Array<{ name: string; balance_cents: number }>
    }
    expect(body.data.map((a) => a.name)).toEqual(['Inter PJ rota'])
    expect(body.data[0].balance_cents).toBe(412000)
  })

  it('GET /api/accounts com scope invalido devolve 422', async () => {
    const res = await app().request(
      '/api/accounts?scope=XX',
      {},
      { DB: env.DB },
    )
    expect(res.status).toBe(422)
    const body = (await res.json()) as {
      notifications: Array<{ code: string }>
    }
    expect(body.notifications[0].code).toBe('invalid_scope')
  })

  it('POST /api/accounts/:id/archive tira a conta da listagem default', async () => {
    const criada = await post('/api/accounts', {
      name: 'Conta a arquivar',
      scope: 'PF',
      kind: 'savings',
    })
    const { data } = (await criada.json()) as { data: { id: string } }

    const arq = await post(`/api/accounts/${data.id}/archive`, {})
    expect(arq.status).toBe(200)

    const res = await app().request('/api/accounts', {}, { DB: env.DB })
    const body = (await res.json()) as { data: Array<{ id: string }> }
    expect(body.data.map((a) => a.id)).not.toContain(data.id)
  })
})
