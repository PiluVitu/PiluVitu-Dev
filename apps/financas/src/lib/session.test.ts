// apps/financas/src/lib/session.test.ts
import { env } from 'cloudflare:test'
import { betterAuth } from 'better-auth'
import { Hono } from 'hono'
import { describe, expect, test } from 'vitest'
import type { AuthBindings } from './auth'
import { decidirAcesso, isRotaDeAuth, requireSession } from './session'

const PERMITIDO = 'dono@exemplo.com'

describe('decidirAcesso — matriz pura', () => {
  test('sessão nula é 401 not_authenticated', () => {
    expect(decidirAcesso(null, PERMITIDO)).toMatchObject({
      ok: false,
      status: 401,
      code: 'not_authenticated',
    })
  })

  test('sessão sem user é 401 not_authenticated', () => {
    expect(decidirAcesso({}, PERMITIDO)).toMatchObject({
      ok: false,
      status: 401,
      code: 'not_authenticated',
    })
  })

  test('e-mail fora da allowlist é 403 email_not_allowed', () => {
    expect(
      decidirAcesso({ user: { email: 'invasor@gmail.com' } }, PERMITIDO),
    ).toMatchObject({ ok: false, status: 403, code: 'email_not_allowed' })
  })

  test('e-mail permitido, caixa e espaço não importam', () => {
    expect(
      decidirAcesso({ user: { email: ' Dono@Exemplo.COM ' } }, PERMITIDO),
    ).toEqual({ ok: true })
  })

  test('ALLOWED_EMAIL vazio barra até o próprio dono (fail closed)', () => {
    expect(decidirAcesso({ user: { email: PERMITIDO } }, '')).toMatchObject({
      ok: false,
      status: 403,
      code: 'email_not_allowed',
    })
  })
})

describe('isRotaDeAuth', () => {
  test('casa o path exato e qualquer sub-rota de /api/auth', () => {
    expect(isRotaDeAuth('/api/auth')).toBe(true)
    expect(isRotaDeAuth('/api/auth/callback/google')).toBe(true)
    expect(isRotaDeAuth('/api/auth/get-session')).toBe(true)
  })

  test('não casa outras rotas de /api', () => {
    expect(isRotaDeAuth('/api/accounts')).toBe(false)
    expect(isRotaDeAuth('/api/authx')).toBe(false)
  })
})

const BASE_URL_TESTE = 'http://localhost:8787'
const SECRET_TESTE = 'a'.repeat(32)

function appProtegido() {
  const app = new Hono<{ Bindings: AuthBindings }>()
  app.use('*', requireSession())
  app.get('/protegido', (c) => c.json({ visto: true }))
  return app
}

type CorpoErro = {
  ok: boolean
  data: null
  notifications: Array<{ code: string; type: string }>
}

describe('requireSession — integração HTTP', () => {
  test('sem cookie responde 401 not_authenticated com envelope', async () => {
    const testEnv: AuthBindings = {
      DB: env.DB,
      BETTER_AUTH_URL: BASE_URL_TESTE,
      BETTER_AUTH_SECRET: SECRET_TESTE,
      GOOGLE_CLIENT_ID: 'x',
      GOOGLE_CLIENT_SECRET: 'y',
      ALLOWED_EMAIL: PERMITIDO,
    }

    const res = await appProtegido().request('/protegido', {}, testEnv)
    expect(res.status).toBe(401)
    const body = (await res.json()) as CorpoErro
    expect(body.ok).toBe(false)
    expect(body.notifications[0].code).toBe('not_authenticated')
  })

  test('sessão válida com e-mail FORA da allowlist é barrada com 403 — camada 2, independente do hook de criação', async () => {
    // Instância SÓ deste teste, com emailAndPassword ligado e SEM o hook
    // de allowlist — simula um usuário que entrou por QUALQUER caminho
    // fora do hook de criação (seed manual, bug futuro, config trocada
    // temporariamente). Produção mantém emailAndPassword desligado
    // (ver auth.ts); isto é técnica de teste, medida funcionando no
    // spike S6a (signUpEmail devolve um set-cookie real e assinado).
    const authDeTeste = betterAuth({
      database: env.DB,
      baseURL: BASE_URL_TESTE,
      secret: SECRET_TESTE,
      emailAndPassword: { enabled: true },
    })

    const cadastro = await authDeTeste.api.signUpEmail({
      body: {
        email: 'invasor@gmail.com',
        password: 'senha-forte-123',
        name: 'Invasor',
      },
      asResponse: true,
    })
    const cookie = cadastro.headers.getSetCookie()[0]?.split(';')[0]
    if (!cookie) throw new Error('signUpEmail não devolveu cookie de sessão')

    const testEnv: AuthBindings = {
      DB: env.DB,
      BETTER_AUTH_URL: BASE_URL_TESTE,
      BETTER_AUTH_SECRET: SECRET_TESTE,
      GOOGLE_CLIENT_ID: 'client-id-de-teste',
      GOOGLE_CLIENT_SECRET: 'client-secret-de-teste',
      ALLOWED_EMAIL: PERMITIDO, // dono, NÃO invasor@gmail.com
    }

    const res = await appProtegido().request(
      '/protegido',
      { headers: { cookie } },
      testEnv,
    )
    expect(res.status).toBe(403)
    const body = (await res.json()) as CorpoErro
    expect(body.notifications[0].code).toBe('email_not_allowed')
  })
})
