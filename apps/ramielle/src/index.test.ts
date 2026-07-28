import { env, SELF } from 'cloudflare:test'
import { describe, expect, test } from 'vitest'
import app, { type Bindings } from './index'
import type { Envelope } from './lib/envelope'

describe('worker ramielle — bindings', () => {
  test('expõe o binding D1 "DB" e ele responde a uma query', async () => {
    expect(env.DB).toBeDefined()
    const row = await env.DB.prepare('SELECT 1 AS um').first<{ um: number }>()
    expect(row?.um).toBe(1)
  })
})

describe('GET /health', () => {
  test('responde 200 com o envelope {ok:true, data:{db:"up"}}', async () => {
    const res = await app.request('/health', {}, env as unknown as Bindings)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe(
      'application/json; charset=utf-8',
    )

    const body = (await res.json()) as Envelope<{ db: string }>
    expect(body).toEqual({ ok: true, data: { db: 'up' }, notifications: [] })
  })

  test('via SELF.fetch (env real do wrangler.jsonc) responde o mesmo envelope', async () => {
    const res = await SELF.fetch('https://api.piluvitu.com.br/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      ok: true,
      data: { db: 'up' },
      notifications: [],
    })
  })
})

describe('rota inexistente', () => {
  test('responde 404 no envelope, nunca HTML', async () => {
    const res = await app.request('/nao-existe', {}, env as unknown as Bindings)
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toBe(
      'application/json; charset=utf-8',
    )

    const body = (await res.json()) as Envelope<null>
    expect(body.ok).toBe(false)
    expect(body.data).toBeNull()
    expect(body.notifications).toEqual([
      {
        type: 'error',
        code: 'not_found',
        message: 'rota não encontrada',
      },
    ])
  })
})
