import { env } from 'cloudflare:test'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { createAccount } from '../domain/accounts'
import { app } from '../index'
import type { Envelope } from '../lib/envelope'
import { goalsRoutes } from './goals'

// Só o router, sem a guarda de sessão: aqui se testa o contrato HTTP e o
// envelope. A guarda é coberta pelo bloco de 401 no fim.
function chamar(path: string, method = 'GET', body?: unknown) {
  const hono = new Hono()
  hono.route('/api/goals', goalsRoutes)
  return hono.request(
    `/api/goals${path}`,
    {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    { DB: env.DB },
  )
}

const conta = (nome = 'Conta teste') =>
  createAccount(env.DB, { name: nome, scope: 'PF', kind: 'savings' })

type Meta = {
  id: string
  name: string
  pct: number
  status: string
  editable: boolean
}

const corpo = (account_id: string, patch = {}) => ({
  name: 'Viagem',
  target_cents: 500000,
  account_id,
  target_date: '2030-12-31',
  ...patch,
})

describe('POST /api/goals', () => {
  it('cria e devolve 201 com a meta', async () => {
    const c = await conta()
    const res = await chamar('', 'POST', corpo(c.id))
    expect(res.status).toBe(201)
    const body = (await res.json()) as Envelope<{ id: string; name: string }>
    expect(body.data?.name).toBe('Viagem')
  })

  it.each([
    [{ name: '' }],
    [{ target_cents: 0 }],
    [{ target_cents: 1.5 }],
    [{ target_cents: '100' }],
    [{ target_date: '2030-02-31' }],
    [{ account_id: 'nao-existe' }],
  ])('corpo inválido %j é 422', async (patch) => {
    const c = await conta()
    const res = await chamar('', 'POST', corpo(c.id, patch))
    expect(res.status).toBe(422)
    expect(((await res.json()) as Envelope<null>).notifications[0].code).toBe(
      'constraint_violation',
    )
  })

  it.each([
    ['omitido', undefined],
    ['nulo', null],
    ['objeto', { id: 'x' }],
    ['vazio', ''],
  ])('conta %s é 422, não 500', async (_titulo, valor) => {
    const base = { name: 'Viagem', target_cents: 500000, account_id: valor }
    const res = await chamar('', 'POST', base)
    expect(res.status).toBe(422)
    expect(((await res.json()) as Envelope<null>).notifications[0].code).toBe(
      'constraint_violation',
    )
  })

  it('segunda meta na mesma conta é 422', async () => {
    const c = await conta()
    await chamar('', 'POST', corpo(c.id))
    expect((await chamar('', 'POST', corpo(c.id))).status).toBe(422)
  })

  it('JSON malformado é 400', async () => {
    const hono = new Hono()
    hono.route('/api/goals', goalsRoutes)
    const res = await hono.request(
      '/api/goals',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      },
      { DB: env.DB },
    )
    expect(res.status).toBe(400)
  })
})

describe('GET /api/goals', () => {
  it('lista com progresso calculado', async () => {
    const c = await conta()
    await chamar('', 'POST', corpo(c.id))
    const res = await chamar('')
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<Meta[]>
    expect(body.data).toHaveLength(1)
    expect(body.data?.[0]).toMatchObject({
      pct: 0,
      status: 'em_andamento',
      editable: true,
    })
  })
})

describe('PUT /api/goals/:id', () => {
  it('atualiza e responde 404 quando não existe', async () => {
    const c = await conta()
    const criada = (await (
      await chamar('', 'POST', corpo(c.id))
    ).json()) as Envelope<{ id: string }>
    const id = criada.data?.id
    const ok = await chamar(`/${id}`, 'PUT', corpo(c.id, { name: 'Carro' }))
    expect(ok.status).toBe(200)
    expect(((await ok.json()) as Envelope<{ name: string }>).data?.name).toBe(
      'Carro',
    )
    expect((await chamar('/nao-existe', 'PUT', corpo(c.id))).status).toBe(404)
  })

  it.each([
    ['omitido', undefined],
    ['nulo', null],
    ['objeto', { id: 'x' }],
  ])('PUT com conta %s é 422, não 500', async (_titulo, valor) => {
    const c = await conta()
    const criada = (await (
      await chamar('', 'POST', corpo(c.id))
    ).json()) as Envelope<{ id: string }>
    const res = await chamar(`/${criada.data?.id}`, 'PUT', {
      name: 'Viagem',
      target_cents: 500000,
      account_id: valor,
    })
    expect(res.status).toBe(422)
  })

  it('corpo inválido é 422', async () => {
    const c = await conta()
    const criada = (await (
      await chamar('', 'POST', corpo(c.id))
    ).json()) as Envelope<{ id: string }>
    expect(
      (
        await chamar(
          `/${criada.data?.id}`,
          'PUT',
          corpo(c.id, { target_cents: -5 }),
        )
      ).status,
    ).toBe(422)
  })
})

describe('DELETE /api/goals/:id', () => {
  it('remove e depois responde 404', async () => {
    const c = await conta()
    const criada = (await (
      await chamar('', 'POST', corpo(c.id))
    ).json()) as Envelope<{ id: string }>
    expect((await chamar(`/${criada.data?.id}`, 'DELETE')).status).toBe(200)
    expect((await chamar(`/${criada.data?.id}`, 'DELETE')).status).toBe(404)
  })
})

describe('guarda de sessão (app completo)', () => {
  it.each([
    ['', 'GET'],
    ['', 'POST'],
    ['/abc', 'PUT'],
    ['/abc', 'DELETE'],
  ])('%s %s sem cookie de sessão responde 401', async (path, method) => {
    const res = await app.request(`/api/goals${path}`, { method }, env)
    expect(res.status).toBe(401)
    expect(((await res.json()) as Envelope<null>).notifications[0].code).toBe(
      'not_authenticated',
    )
  })
})
