import { env, SELF } from 'cloudflare:test'
import { describe, expect, test } from 'vitest'
import app, { type Bindings } from './index'
import type { Envelope } from './lib/envelope'

describe('worker financas — bindings', () => {
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

  test('rota desconhecida sob /api sem cookie de sessão responde 401 (guarda do Better Auth na frente do catch-all)', async () => {
    const res = await SELF.fetch(
      'https://financas.piluvitu.com.br/api/nao-existe',
    )
    expect(res.status).toBe(401)
  })
})

// Sem DB e sem rede: estes casos não precisam de sessão real.
const authTestEnv = {
  DB: env.DB,
  BETTER_AUTH_URL: 'http://localhost:8787',
  BETTER_AUTH_SECRET: 'a'.repeat(32),
  GOOGLE_CLIENT_ID: 'client-id-de-teste',
  GOOGLE_CLIENT_SECRET: 'client-secret-de-teste',
  ALLOWED_EMAIL: 'dono@exemplo.com',
} as unknown as Bindings

type CorpoErro = {
  ok: boolean
  data: null
  notifications: Array<{ code: string }>
}

describe('worker de finanças', () => {
  test('GET /api/health é público (não exige sessão)', async () => {
    const res = await app.request('/api/health', {}, authTestEnv)
    expect(res.status).toBe(200)

    const body = (await res.json()) as Envelope<{ status: string }>
    expect(body.ok).toBe(true)
    expect(body.data).toEqual({ status: 'up' })
    expect(body.notifications).toEqual([])
  })

  test('GET /api/accounts sem cookie de sessão responde 401 not_authenticated', async () => {
    const res = await app.request('/api/accounts', {}, authTestEnv)
    expect(res.status).toBe(401)
    expect(((await res.json()) as CorpoErro).notifications[0].code).toBe(
      'not_authenticated',
    )
  })

  test('GET /api/accounts com cookie de sessão inexistente responde 401 not_authenticated', async () => {
    // Formato real (medido, spike S6a): '<token>.<assinatura>'. Um par que
    // nunca foi emitido por getAuth() não bate com nenhuma linha de
    // session — getSession() devolve null (não lança), decidirAcesso trata
    // igual a "sem sessão".
    const res = await app.request(
      '/api/accounts',
      {
        headers: {
          cookie:
            'better-auth.session_token=token-que-nao-existe.assinatura-que-nao-bate',
        },
      },
      authTestEnv,
    )
    expect(res.status).toBe(401)
    expect(((await res.json()) as CorpoErro).notifications[0].code).toBe(
      'not_authenticated',
    )
  })

  test('/api/auth/* não é barrado pela guarda de sessão', async () => {
    const res = await app.request('/api/auth/get-session', {}, authTestEnv)
    // Não é a nossa guarda que responde: se fosse, seria 401 not_authenticated
    // no nosso envelope. O Better Auth responde por conta própria, fora do
    // envelope { ok, data, notifications }.
    expect(res.status).not.toBe(401)
  })

  test('rota /api inexistente devolve envelope JSON, não texto puro', async () => {
    const res = await app.request(
      '/api/health',
      { method: 'POST' },
      authTestEnv,
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
