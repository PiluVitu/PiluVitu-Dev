import { env, SELF } from 'cloudflare:test'
import { describe, expect, test } from 'vitest'
import app, { type Bindings } from './index'
import type { Envelope } from './lib/envelope'

describe('worker financas (Task 2 — bindings)', () => {
  test('expõe o binding D1 "DB" e ele responde a uma query', async () => {
    expect(env.DB).toBeDefined()
    const row = await env.DB.prepare('SELECT 1 AS um').first<{ um: number }>()
    expect(row?.um).toBe(1)
  })

  test('expõe o binding ASSETS apontando para ./web/dist', async () => {
    const res = await env.ASSETS.fetch(
      'https://financas.piluvitu.com.br/index.html',
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
  })

  test('GET /api/health devolve o envelope (via SELF, env real do wrangler.jsonc)', async () => {
    const res = await SELF.fetch('https://financas.piluvitu.com.br/api/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      ok: true,
      data: { status: 'up' },
      notifications: [],
    })
  })

  // Antes da Task 4 esta rota devolvia 404 direto (não existia gate nenhum em
  // /api/*). Com o Access montado, uma rota desconhecida SEM o header some
  // no 401 not_authenticated antes de chegar no catch-all — o 404 só aparece
  // depois de passar pelo Access (ver 'rota /api inexistente...' abaixo, que
  // usa /api/health, isenta do gate, pra provar o catch-all isoladamente).
  test('rota desconhecida sob /api sem header do Access responde 401 (Access na frente do catch-all)', async () => {
    const res = await SELF.fetch(
      'https://financas.piluvitu.com.br/api/nao-existe',
    )
    expect(res.status).toBe(401)
  })
})

// Sem DB e sem rede: estes três casos não chegam a tocar D1 nem o JWKS.
const accessTestEnv = {
  ACCESS_TEAM_DOMAIN: 'indextest.cloudflareaccess.com',
  ACCESS_AUD: 'aud-de-teste-1234',
  ACCESS_ALLOWED_EMAILS: 'dono@exemplo.com',
} as unknown as Bindings

type CorpoErro = {
  ok: boolean
  data: null
  notifications: Array<{ code: string }>
}

describe('worker de finanças', () => {
  test('GET /api/health é público (não exige JWT do Access)', async () => {
    const res = await app.request('/api/health', {}, accessTestEnv)
    expect(res.status).toBe(200)

    const body = (await res.json()) as Envelope<{ status: string }>
    expect(body.ok).toBe(true)
    expect(body.data).toEqual({ status: 'up' })
    expect(body.notifications).toEqual([])
  })

  test('GET /api/accounts sem o header do Access responde 401', async () => {
    const res = await app.request('/api/accounts', {}, accessTestEnv)
    expect(res.status).toBe(401)
    expect(((await res.json()) as CorpoErro).notifications[0].code).toBe(
      'not_authenticated',
    )
  })

  test('GET /api/accounts com header inválido responde 401 invalid_token', async () => {
    const res = await app.request(
      '/api/accounts',
      { headers: { 'Cf-Access-Jwt-Assertion': 'nao-e-um-jwt' } },
      accessTestEnv,
    )
    expect(res.status).toBe(401)
    expect(((await res.json()) as CorpoErro).notifications[0].code).toBe(
      'invalid_token',
    )
  })

  test('rota /api inexistente devolve envelope JSON, não texto puro', async () => {
    // POST /api/health não casa com nenhum handler e cai no catch-all — é o que
    // garante que api<T>() (Task 11) sempre encontra um envelope para desembrulhar.
    const res = await app.request(
      '/api/health',
      { method: 'POST' },
      accessTestEnv,
    )
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toBe(
      'application/json; charset=utf-8',
    )
    expect(((await res.json()) as CorpoErro).notifications[0].code).toBe(
      'not_found',
    )
  })
})
