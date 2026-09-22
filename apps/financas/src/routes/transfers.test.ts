import { applyD1Migrations, env } from 'cloudflare:test'
import { Hono } from 'hono'
import { beforeEach, describe, expect, it } from 'vitest'
import { createAccount } from '../domain/accounts'
import { createTransaction } from '../domain/transactions'
import { transfersRoutes } from './transfers'

beforeEach(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
})

function router() {
  const hono = new Hono()
  hono.route('/api', transfersRoutes)
  return hono
}

function req(path: string, init: RequestInit = {}) {
  return router().request(path, init, { DB: env.DB })
}

async function cenario() {
  const pj = await createAccount(env.DB, {
    name: 'Inter Empresa',
    scope: 'PJ',
    kind: 'checking',
  })
  const pf = await createAccount(env.DB, {
    name: 'Inter',
    scope: 'PF',
    kind: 'checking',
  })
  await createTransaction(env.DB, {
    account_id: pj.id,
    amount_cents: -430000,
    purchase_date: '2026-09-02',
    description: 'Pix enviado  - Paulo Victor Torres Silva',
  })
  await createTransaction(env.DB, {
    account_id: pf.id,
    amount_cents: 430000,
    purchase_date: '2026-09-02',
    description: 'Pix recebido - Pilu Tech',
  })
}

describe('PUT/GET /api/transfers/self-names', () => {
  it('comeca vazio', async () => {
    const res = await req('/api/transfers/self-names')
    expect(res.status).toBe(200)
    expect(
      (await res.json<{ data: { names: string[] } }>()).data.names,
    ).toEqual([])
  })

  it('grava e devolve os nomes', async () => {
    const res = await req('/api/transfers/self-names', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ names: ['Pilu Tech', ' '] }),
    })
    expect(res.status).toBe(200)
    expect(
      (await res.json<{ data: { names: string[] } }>()).data.names,
    ).toEqual(['Pilu Tech'])
  })

  it('recusa corpo que nao e lista de strings', async () => {
    const res = await req('/api/transfers/self-names', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ names: 'Pilu Tech' }),
    })
    expect(res.status).toBe(422)
  })
})

describe('POST /api/transfers/pair', () => {
  beforeEach(async () => {
    await req('/api/transfers/self-names', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        names: ['Paulo Victor Torres Silva', 'Pilu Tech'],
      }),
    })
  })

  it('dry_run relata o par sem gravar', async () => {
    await cenario()
    const res = await req('/api/transfers/pair?dry_run=1', { method: 'POST' })
    const body = await res.json<{
      data: { dry_run: boolean; pares: number; total_cents: number }
    }>()
    expect(res.status).toBe(200)
    expect(body.data.dry_run).toBe(true)
    expect(body.data.pares).toBe(1)
    expect(body.data.total_cents).toBe(430000)

    const row = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM transactions WHERE transfer_id IS NOT NULL',
    ).first<{ n: number }>()
    expect(row?.n).toBe(0)
  })

  it('sem dry_run grava o transfer_id nas duas pernas', async () => {
    await cenario()
    const res = await req('/api/transfers/pair', { method: 'POST' })
    expect((await res.json<{ data: { pares: number } }>()).data.pares).toBe(1)

    const row = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM transactions WHERE transfer_id IS NOT NULL',
    ).first<{ n: number }>()
    expect(row?.n).toBe(2)
  })
})
