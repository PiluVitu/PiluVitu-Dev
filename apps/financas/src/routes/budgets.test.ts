import { env } from 'cloudflare:test'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { app } from '../index'
import { createCategory } from '../domain/categories'
import type { Envelope } from '../lib/envelope'
import { budgetsRoutes } from './budgets'

// Só o router, sem a guarda de sessão: aqui se testa o contrato HTTP e o
// envelope. A guarda é coberta pelo bloco de 401 no fim.
function router() {
  const hono = new Hono()
  hono.route('/api/budgets', budgetsRoutes)
  return hono
}

function chamar(path: string, method = 'GET', body?: unknown) {
  return router().request(
    `/api/budgets${path}`,
    {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    { DB: env.DB },
  )
}

const despesa = (name: string) =>
  createCategory(env.DB, { name, kind: 'expense' })

type Linha = {
  category_id: string
  budget_cents: number | null
  spent_cents: number
}

describe('GET /api/budgets', () => {
  it('devolve o relatório do mês no envelope', async () => {
    const cat = await despesa('Mercado')
    await chamar(`/2026-08/${cat.id}`, 'PUT', { amount_cents: 40000 })
    const res = await chamar('?month=2026-08')
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<{
      month: string
      rows: Linha[]
    }>
    expect(body.ok).toBe(true)
    expect(body.data?.month).toBe('2026-08')
    expect(
      body.data?.rows.find((r) => r.category_id === cat.id)?.budget_cents,
    ).toBe(40000)
  })

  it.each(['', '?month=2026-13', '?month=agosto'])(
    'mês ausente ou malformado (%j) é 400 invalid_query',
    async (qs) => {
      const res = await chamar(qs)
      expect(res.status).toBe(400)
      const body = (await res.json()) as Envelope<null>
      expect(body.notifications[0].code).toBe('invalid_query')
    },
  )
})

describe('PUT /api/budgets/:month/:categoryId', () => {
  it('cria e depois atualiza', async () => {
    const cat = await despesa('Mercado')
    const a = await chamar(`/2026-08/${cat.id}`, 'PUT', { amount_cents: 10000 })
    const b = await chamar(`/2026-08/${cat.id}`, 'PUT', { amount_cents: 20000 })
    expect(a.status).toBe(200)
    expect(
      ((await b.json()) as Envelope<{ amount_cents: number }>).data
        ?.amount_cents,
    ).toBe(20000)
  })

  it.each([
    {},
    { amount_cents: 0 },
    { amount_cents: 1.5 },
    { amount_cents: '100' },
    { amount_cents: null },
  ])('corpo inválido %j é 422', async (corpo) => {
    const cat = await despesa('Mercado')
    const res = await chamar(`/2026-08/${cat.id}`, 'PUT', corpo)
    expect(res.status).toBe(422)
  })

  it('JSON malformado é 400', async () => {
    const cat = await despesa('Mercado')
    const res = await router().request(
      `/api/budgets/2026-08/${cat.id}`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: '{',
      },
      { DB: env.DB },
    )
    expect(res.status).toBe(400)
  })

  it('mês malformado no caminho é 400', async () => {
    const cat = await despesa('Mercado')
    expect(
      (await chamar(`/2026-13/${cat.id}`, 'PUT', { amount_cents: 1000 }))
        .status,
    ).toBe(400)
  })

  it('categoria inexistente ou de receita é 422', async () => {
    const receita = await createCategory(env.DB, {
      name: 'Salário',
      kind: 'income',
    })
    expect(
      (await chamar('/2026-08/nao-existe', 'PUT', { amount_cents: 1000 }))
        .status,
    ).toBe(422)
    expect(
      (await chamar(`/2026-08/${receita.id}`, 'PUT', { amount_cents: 1000 }))
        .status,
    ).toBe(422)
  })
})

describe('DELETE /api/budgets/:month/:categoryId', () => {
  it('remove e depois responde 404', async () => {
    const cat = await despesa('Mercado')
    await chamar(`/2026-08/${cat.id}`, 'PUT', { amount_cents: 1000 })
    expect((await chamar(`/2026-08/${cat.id}`, 'DELETE')).status).toBe(200)
    expect((await chamar(`/2026-08/${cat.id}`, 'DELETE')).status).toBe(404)
  })
})

describe('POST /api/budgets/:month/copy-previous', () => {
  it('copia e informa copiados e ignorados', async () => {
    const cat = await despesa('Mercado')
    await chamar(`/2026-07/${cat.id}`, 'PUT', { amount_cents: 30000 })
    const res = await chamar('/2026-08/copy-previous', 'POST')
    expect(res.status).toBe(200)
    expect(((await res.json()) as Envelope<unknown>).data).toEqual({
      copied: 1,
      skipped: 0,
    })
  })

  it('mês anterior vazio é 200 com copied 0', async () => {
    const res = await chamar('/2026-08/copy-previous', 'POST')
    expect(res.status).toBe(200)
    expect(((await res.json()) as Envelope<unknown>).data).toEqual({
      copied: 0,
      skipped: 0,
    })
  })

  it('mês malformado é 400', async () => {
    expect((await chamar('/ago/copy-previous', 'POST')).status).toBe(400)
  })
})

describe('guarda de sessão (app completo)', () => {
  const sem = (path: string, method: string) =>
    app.request(`/api/budgets${path}`, { method }, env)

  it.each([
    ['?month=2026-08', 'GET'],
    ['/2026-08/abc', 'PUT'],
    ['/2026-08/abc', 'DELETE'],
    ['/2026-08/copy-previous', 'POST'],
  ])('%s %s sem cookie de sessão responde 401', async (path, method) => {
    const res = await sem(path, method)
    expect(res.status).toBe(401)
    expect(((await res.json()) as Envelope<null>).notifications[0].code).toBe(
      'not_authenticated',
    )
  })
})
