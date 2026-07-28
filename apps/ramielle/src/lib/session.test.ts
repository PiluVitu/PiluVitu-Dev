import { env } from 'cloudflare:test'
import { betterAuth } from 'better-auth'
import { Hono } from 'hono'
import { describe, expect, test } from 'vitest'
import type { AuthBindings } from './auth'
import { requireAdmin, requireAuth, type SessionVariables } from './session'

const BASE_URL_TESTE = 'http://localhost:8787'
const SECRET_TESTE = 'a'.repeat(32)

type Env = {
  Bindings: AuthBindings
  Variables: SessionVariables
}

function appProtegido() {
  const app = new Hono<Env>()
  app.get('/protegido', requireAuth<AuthBindings>(), (c) => {
    const user = c.get('votacaoUser')
    return c.json({
      visto: true,
      id: user.id,
      email: user.email,
      isAdmin: user.isAdmin,
      googleSub: user.googleSub,
    })
  })
  app.get('/admin-protegido', requireAdmin<AuthBindings>(), (c) =>
    c.json({ visto: true }),
  )
  return app
}

function testEnv(adminEmails: string): AuthBindings {
  return {
    DB: env.DB,
    BETTER_AUTH_URL: BASE_URL_TESTE,
    BETTER_AUTH_SECRET: SECRET_TESTE,
    GOOGLE_CLIENT_ID: 'client-id-de-teste',
    GOOGLE_CLIENT_SECRET: 'client-secret-de-teste',
    ADMIN_EMAILS: adminEmails,
  }
}

type CorpoErro = {
  ok: boolean
  data: null
  notifications: Array<{ code: string; type: string }>
}

/**
 * Gera um cookie de sessão GENUINAMENTE VÁLIDO via uma segunda instância
 * `betterAuth()` só do teste, com `emailAndPassword` ligado + `signUpEmail`
 * — mesmo padrão de `apps/financas/src/lib/session.test.ts`. Em produção
 * (`createAuth`, `lib/auth.ts`) `emailAndPassword` está desligado (login é
 * só Google via `requireHeaders`); isto é técnica de teste, que grava um
 * usuário/sessão REAIS no MESMO D1 que `getAuth(testEnv)` (a instância "de
 * produção" do guard) vai validar depois.
 *
 * Chamada direta a `auth.api.signUpEmail(...)` (não via `auth.handler()`)
 * não passa pelo `onRequest` do router — não é contada contra o rate limit
 * (mesmo achado documentado em `lib/auth.test.ts` da Task 3), então não
 * precisa de IP sintético nem de variar IP por teste aqui.
 */
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

describe('requireAuth — sem cookie', () => {
  test('responde 401 not_authenticated com envelope', async () => {
    const res = await appProtegido().request('/protegido', {}, testEnv(''))
    expect(res.status).toBe(401)
    const body = (await res.json()) as CorpoErro
    expect(body.ok).toBe(false)
    expect(body.notifications[0].code).toBe('not_authenticated')
  })
})

describe('requireAuth — controle positivo (sem isto, um next() trocado por errJson passaria por todos os 401/403 abaixo)', () => {
  test('um cookie genuinamente válido chega na rota protegida com 200', async () => {
    const cookie = await cookieDeSessaoValido('votante@example.com', 'Votante')

    const res = await appProtegido().request(
      '/protegido',
      { headers: { cookie } },
      testEnv('outro-admin@example.com'), // votante NÃO está na lista
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      visto: boolean
      email: string
      isAdmin: boolean
    }
    expect(body.visto).toBe(true)
    expect(body.email).toBe('votante@example.com')
    expect(body.isAdmin).toBe(false)
  })
})

describe('requireAuth — google_sub vem de account.accountId (o sub real do Google), com fallback pro id do Better Auth (fix round 1, Finding 1)', () => {
  test('com uma linha em account (providerId=google), o google_sub GRAVADO é o accountId — não o id do Better Auth', async () => {
    const cookie = await cookieDeSessaoValido(
      'comgoogle@example.com',
      'Com Google',
    )

    const usuarioBetterAuth = await env.DB.prepare(
      'SELECT id FROM user WHERE email = ?',
    )
      .bind('comgoogle@example.com')
      .first<{ id: string }>()
    if (!usuarioBetterAuth) {
      throw new Error('user não encontrado após signUpEmail')
    }

    // Simula o que um login social real deixaria pra trás: uma linha em
    // `account` vinculando este `user` a uma conta Google, com um
    // `accountId` (o `sub`) CONHECIDO — só as colunas NOT NULL do schema
    // (migration 0002) precisam ser preenchidas.
    const subConhecido = 'google-sub-conhecido-123456'
    await env.DB.prepare(
      `INSERT INTO account (id, accountId, providerId, userId, createdAt, updatedAt)
       VALUES (?, ?, 'google', ?, ?, ?)`,
    )
      .bind(
        'account-de-teste-comgoogle',
        subConhecido,
        usuarioBetterAuth.id,
        new Date().toISOString(),
        new Date().toISOString(),
      )
      .run()

    const res = await appProtegido().request(
      '/protegido',
      { headers: { cookie } },
      testEnv(''),
    )
    expect(res.status).toBe(200)

    // Lê a COLUNA de volta do D1 — não confia no que a rota devolveu.
    const linha = await env.DB.prepare(
      'SELECT google_sub FROM users WHERE email = ?',
    )
      .bind('comgoogle@example.com')
      .first<{ google_sub: string }>()
    expect(linha?.google_sub).toBe(subConhecido)
    expect(linha?.google_sub).not.toBe(usuarioBetterAuth.id)
  })

  test('sem linha em account (a técnica de teste via emailAndPassword), o fallback grava o id do Better Auth', async () => {
    const cookie = await cookieDeSessaoValido(
      'semgoogle@example.com',
      'Sem Google',
    )

    const usuarioBetterAuth = await env.DB.prepare(
      'SELECT id FROM user WHERE email = ?',
    )
      .bind('semgoogle@example.com')
      .first<{ id: string }>()
    if (!usuarioBetterAuth) {
      throw new Error('user não encontrado após signUpEmail')
    }

    const res = await appProtegido().request(
      '/protegido',
      { headers: { cookie } },
      testEnv(''),
    )
    expect(res.status).toBe(200)

    const linha = await env.DB.prepare(
      'SELECT google_sub FROM users WHERE email = ?',
    )
      .bind('semgoogle@example.com')
      .first<{ google_sub: string }>()
    expect(linha?.google_sub).toBe(usuarioBetterAuth.id)
  })
})

describe('requireAdmin — 403 para conta fora de ADMIN_EMAILS, 200 para conta dentro', () => {
  test('conta comum recebe 403 admin_only', async () => {
    const cookie = await cookieDeSessaoValido('comum@example.com', 'Comum')

    const res = await appProtegido().request(
      '/admin-protegido',
      { headers: { cookie } },
      testEnv('outro@example.com'),
    )

    expect(res.status).toBe(403)
    const body = (await res.json()) as CorpoErro
    expect(body.notifications[0].code).toBe('admin_only')
  })

  test('conta em ADMIN_EMAILS recebe 200', async () => {
    const cookie = await cookieDeSessaoValido('admin@example.com', 'Admin')

    const res = await appProtegido().request(
      '/admin-protegido',
      { headers: { cookie } },
      testEnv('admin@example.com'),
    )

    expect(res.status).toBe(200)
  })
})

describe('requireAdmin — o caso que prova o desenho: is_admin é RECALCULADO a cada request, nunca gravado no cadastro', () => {
  test('o MESMO cookie, com ADMIN_EMAILS trocado entre as duas chamadas, muda de 403 para 200', async () => {
    const cookie = await cookieDeSessaoValido(
      'flutuante@example.com',
      'Flutuante',
    )

    const primeira = await appProtegido().request(
      '/admin-protegido',
      { headers: { cookie } },
      testEnv('ninguem@example.com'),
    )
    expect(primeira.status).toBe(403)

    const segunda = await appProtegido().request(
      '/admin-protegido',
      { headers: { cookie } },
      testEnv('flutuante@example.com'), // MESMO e-mail do cookie acima
    )
    expect(segunda.status).toBe(200)
  })
})

describe('requireAuth — D1 indisponível durante getSession responde 503 auth_unavailable, não 500 sem envelope', () => {
  test('cookie com assinatura VÁLIDA + DB quebrado → 503 com envelope', async () => {
    // Um cookie malformado (ex.: assinatura que não bate) é rejeitado
    // LOCALMENTE por HMAC antes de qualquer tentativa de consulta ao D1 —
    // com um DB quebrado, esse cookie ainda daria 401, não 503, porque o DB
    // nunca chegaria a ser tocado. Por isso o cookie aqui precisa ser
    // gerado com o MESMO secret (via cookieDeSessaoValido), que passa da
    // verificação local e força o código a de fato buscar a linha de
    // `session` no D1 — onde o dbQuebrado abaixo estoura.
    const cookie = await cookieDeSessaoValido(
      'qualquer@example.com',
      'Qualquer',
    )

    const dbQuebrado = {
      prepare: () => {
        throw new Error('D1 indisponível (simulado)')
      },
      batch: async () => {
        throw new Error('D1 indisponível (simulado)')
      },
      exec: async () => {
        throw new Error('D1 indisponível (simulado)')
      },
    } as unknown as AuthBindings['DB']

    const testEnvQuebrado: AuthBindings = {
      ...testEnv('qualquer@example.com'),
      DB: dbQuebrado,
    }

    const res = await appProtegido().request(
      '/protegido',
      { headers: { cookie } },
      testEnvQuebrado,
    )

    expect(res.status).toBe(503)
    const body = (await res.json()) as CorpoErro
    expect(body.notifications[0].code).toBe('auth_unavailable')
  })
})

describe('requireAuth — I1 (revisão final): resolveSession protege TODAS as chamadas ao D1, não só getSession', () => {
  // getSession() sozinho já faz DUAS consultas ao D1 (MEDIDO via proxy
  // instrumentado antes de escrever este teste: `select ... from "session"
  // where "session"."token" = ?` seguido de `select ... from "user" where
  // "user"."id" = ?`) — antes de qualquer chamada de buscarGoogleSub/
  // upsertVotacaoUser. Um proxy que quebrasse já na SEGUNDA query estouraria
  // dentro do próprio getSession, sob o catch ORIGINAL (que já existia) —
  // não provaria nada sobre a extensão do I1. Por isso o contador deixa
  // passar as duas queries de getSession e só quebra a PARTIR da terceira
  // (buscarGoogleSub em diante) — exatamente o trecho que o catch original
  // não cobria.
  test('D1 que falha a partir da 3ª query (buscarGoogleSub/upsertVotacaoUser) responde 503 auth_unavailable, não 500 cru', async () => {
    const cookie = await cookieDeSessaoValido(
      'i1-terceira-query@example.com',
      'I1 Terceira Query',
    )

    const dbReal = env.DB
    let contador = 0
    const QUERIES_DE_GETSESSION = 2
    const dbQuebradoAPartirDaTerceira = {
      prepare: (sql: string) => {
        contador += 1
        if (contador > QUERIES_DE_GETSESSION) {
          throw new Error('D1 indisponível a partir da 3ª query (simulado)')
        }
        return dbReal.prepare(sql)
      },
      batch: dbReal.batch.bind(dbReal),
      exec: dbReal.exec.bind(dbReal),
    } as unknown as AuthBindings['DB']

    const testEnvQuebrado: AuthBindings = {
      ...testEnv(''),
      DB: dbQuebradoAPartirDaTerceira,
    }

    const res = await appProtegido().request(
      '/protegido',
      { headers: { cookie } },
      testEnvQuebrado,
    )

    expect(res.status).toBe(503)
    const body = (await res.json()) as CorpoErro
    expect(body.ok).toBe(false)
    expect(body.notifications[0].code).toBe('auth_unavailable')
  })
})

describe('requireAuth — upsertVotacaoUser é idempotente a cada request (conta as linhas, não confia no retorno)', () => {
  test('duas chamadas com o MESMO cookie mantêm 1 linha em users e o MESMO id', async () => {
    const cookie = await cookieDeSessaoValido(
      'idempotente@example.com',
      'Idempotente',
    )
    const env1 = testEnv('')

    const primeira = await appProtegido().request(
      '/protegido',
      { headers: { cookie } },
      env1,
    )
    const corpo1 = (await primeira.json()) as { id: number; googleSub: string }

    const segunda = await appProtegido().request(
      '/protegido',
      { headers: { cookie } },
      env1,
    )
    const corpo2 = (await segunda.json()) as { id: number; googleSub: string }

    expect(corpo2.id).toBe(corpo1.id)
    expect(corpo2.googleSub).toBe(corpo1.googleSub)

    const linhas = await env.DB.prepare(
      'SELECT count(*) AS n FROM users WHERE google_sub = ?',
    )
      .bind(corpo1.googleSub)
      .first<{ n: number }>()
    expect(linhas?.n).toBe(1)
  })
})
