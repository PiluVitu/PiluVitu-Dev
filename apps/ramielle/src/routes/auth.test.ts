import { env } from 'cloudflare:test'
import { betterAuth } from 'better-auth'
import { describe, expect, test } from 'vitest'
import app, { type Bindings } from '../index'
import type { Envelope } from '../lib/envelope'

const BASE_URL_TESTE = 'http://localhost:8787'
const SECRET_TESTE = 'a'.repeat(32)

function testEnv(adminEmails: string): Bindings {
  return {
    DB: env.DB,
    BETTER_AUTH_URL: BASE_URL_TESTE,
    BETTER_AUTH_SECRET: SECRET_TESTE,
    GOOGLE_CLIENT_ID: 'client-id-de-teste',
    GOOGLE_CLIENT_SECRET: 'client-secret-de-teste',
    ADMIN_EMAILS: adminEmails,
  }
}

// Mesmo padrão de src/lib/session.test.ts — chamada direta a
// auth.api.signUpEmail() não passa pelo onRequest do router, então não é
// contada contra o rate limit (não precisa de IP sintético aqui).
async function cookieDeSessaoValido(
  email: string,
  name: string,
): Promise<string> {
  const authDeTeste = betterAuth({
    database: env.DB,
    baseURL: BASE_URL_TESTE,
    secret: SECRET_TESTE,
    emailAndPassword: { enabled: true },
  })

  const cadastro = await authDeTeste.api.signUpEmail({
    body: { email, password: 'senha-forte-123', name },
    asResponse: true,
  })
  const cookie = cadastro.headers.getSetCookie()[0]?.split(';')[0]
  if (!cookie) throw new Error('signUpEmail não devolveu cookie de sessão')
  return cookie
}

type MeData = {
  id: number
  name: string
  email: string
  picture: string
  is_admin: boolean
}

describe('GET /auth/me', () => {
  test('sem cookie responde 401 not_authenticated com envelope', async () => {
    const res = await app.request('/auth/me', {}, testEnv(''))
    expect(res.status).toBe(401)
    const body = (await res.json()) as Envelope<null>
    expect(body.ok).toBe(false)
    expect(body.notifications[0]?.code).toBe('not_authenticated')
  })

  test('com sessão válida responde 200 — shape EXATO id/name/email/picture/is_admin (5 campos), sem google_sub nem created_at', async () => {
    const cookie = await cookieDeSessaoValido('me@example.com', 'Fulano de Tal')

    const res = await app.request(
      '/auth/me',
      { headers: { cookie } },
      testEnv('me@example.com'), // este e-mail É admin
    )
    expect(res.status).toBe(200)

    // Lê o TEXTO cru uma vez só — a asserção negativa de google_sub precisa
    // do JSON SERIALIZADO, não do objeto já desestruturado (um objeto que
    // "por acaso" não tem a chave passaria numa asserção só sobre o
    // objeto parseado).
    const texto = await res.text()
    const body = JSON.parse(texto) as Envelope<MeData>

    expect(body.ok).toBe(true)
    // toEqual (não toMatchObject): garante que NENHUM campo extra (como
    // created_at) sobra no shape — fix round 1, o contrato são 5 campos.
    expect(body.data).toEqual({
      id: expect.any(Number),
      name: 'Fulano de Tal',
      email: 'me@example.com',
      picture: '', // nunca null — mesma convenção do Go (sql.NullString.String)
      is_admin: true,
    })

    expect(texto).not.toContain('google_sub')
    expect(texto).not.toContain('googleSub')
    expect(texto).not.toContain('created_at')
  })

  test('a mesma conta SEM estar em ADMIN_EMAILS responde is_admin:false', async () => {
    const cookie = await cookieDeSessaoValido('comum@example.com', 'Comum')

    const res = await app.request(
      '/auth/me',
      { headers: { cookie } },
      testEnv('outro@example.com'),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<MeData>
    expect(body.data?.is_admin).toBe(false)
  })
})

describe('POST /auth/logout', () => {
  test('responde 200 no envelope e invalida a sessão — o MESMO cookie não vale mais depois', async () => {
    const cookie = await cookieDeSessaoValido('sai@example.com', 'Sai Daqui')
    const testEnvComum = testEnv('')

    // controle: a sessão está válida ANTES do logout.
    const antes = await app.request(
      '/auth/me',
      { headers: { cookie } },
      testEnvComum,
    )
    expect(antes.status).toBe(200)

    const resLogout = await app.request(
      '/auth/logout',
      { method: 'POST', headers: { cookie } },
      testEnvComum,
    )
    expect(resLogout.status).toBe(200)
    const bodyLogout = (await resLogout.json()) as Envelope<null>
    expect(bodyLogout.ok).toBe(true)
    // Paridade com o Go: `httpx.Data(w, 200, nil)` ⇒ `"data":null`. O
    // `{loggedOut:true}` anterior era campo inventado (revisão final ③).
    expect(bodyLogout.data).toBeNull()

    // depois do logout, o MESMO cookie deixa de valer.
    const depois = await app.request(
      '/auth/me',
      { headers: { cookie } },
      testEnvComum,
    )
    expect(depois.status).toBe(401)
  })

  test('sem cookie nenhum também responde 200 (encerrar sessão inexistente é no-op, não erro)', async () => {
    const res = await app.request(
      '/auth/logout',
      { method: 'POST' },
      testEnv(''),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<null>
    expect(body.ok).toBe(true)
    expect(body.data).toBeNull()
  })
})
