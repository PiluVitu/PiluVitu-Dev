import { env, SELF } from 'cloudflare:test'
import { betterAuth } from 'better-auth'
import { describe, expect, test } from 'vitest'
import app, { type Bindings } from './index'
import type { Envelope } from './lib/envelope'

// --------------------------------------------------------------------------
// Helpers de teste compartilhados pelos describes de "montagem" abaixo —
// mesmo padrão DUPLICADO (não importado de um util comum) já usado em
// routes/votacao.test.ts, routes/auth.test.ts e lib/session.test.ts: cada
// arquivo de teste monta seu próprio `testEnv`/`cookieDeSessaoValido`.
// --------------------------------------------------------------------------

const DB = env.DB
const BASE_URL_TESTE = 'http://localhost:8787'
const SECRET_TESTE = 'a'.repeat(32)

function testEnv(adminEmails = ''): Bindings {
  return {
    DB,
    BETTER_AUTH_URL: BASE_URL_TESTE,
    BETTER_AUTH_SECRET: SECRET_TESTE,
    GOOGLE_CLIENT_ID: 'client-id-de-teste',
    GOOGLE_CLIENT_SECRET: 'client-secret-de-teste',
    ADMIN_EMAILS: adminEmails,
  }
}

async function cookieDeSessaoValido(
  email: string,
  name: string,
): Promise<string> {
  const authDeTeste = betterAuth({
    database: DB,
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
    const res = await SELF.fetch('https://ramielle.piluvitu.com.br/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      ok: true,
      data: { db: 'up' },
      notifications: [],
    })
  })

  // Fix round 1, Finding 1: sem este teste, quem remover o try/catch de
  // GET /health num refactor não quebra teste nenhum — o único teste que
  // existia (envelope.test.ts) só prova que errJson(503, 'db_down', ...)
  // produz status 503, não que a ROTA captura a falha do D1. Injeta um DB
  // quebrado via terceiro argumento de app.request (Hono sobrescreve c.env
  // com ele) — não precisa de Miniflare real nem de derrubar o D1 de fato.
  test('banco fora do ar responde 503 no envelope, sem vazar erro cru', async () => {
    const dbQuebrado = {
      prepare: () => {
        throw new Error('D1_ERROR: no such table: sqlite_master')
      },
    }
    const res = await app.request('/health', {}, {
      DB: dbQuebrado,
    } as unknown as Bindings)
    expect(res.status).toBe(503)

    const body = (await res.json()) as Envelope<null>
    expect(body.ok).toBe(false)
    expect(body.notifications[0].code).toBe('db_down')

    // A mensagem é o produto: o texto cru do D1 nunca chega ao cliente.
    const texto = JSON.stringify(body)
    expect(texto).not.toContain('D1_ERROR')
    expect(texto).not.toContain('sqlite_master')
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

// --------------------------------------------------------------------------
// app.onError global (T6) — MEDIDO nas T2-T5: sem isto, uma exceção não
// mapeada dentro de uma rota sobe pro handler default do Hono e sai como
// `text/plain "Internal Server Error"`, FORA do envelope {ok,data,
// notifications} — o call<T>() do apps/web levanta 'invalid_envelope', um
// sintoma sem relação nenhuma com a causa real. Ver o comentário em
// index.ts para o raciocínio completo.
// --------------------------------------------------------------------------

describe('app.onError global', () => {
  test('exceção não mapeada de dentro de uma rota vira 500 DENTRO do envelope {ok:false, code:internal_error} — nunca texto cru fora do envelope, e nunca o erro real vazado no corpo', async () => {
    const cookie = await cookieDeSessaoValido(
      'onerror@example.com',
      'Quem Aciona',
    )

    // Shim que quebra SÓ o SELECT de `voting_sessions` (o texto exato que
    // domain/sessions.ts#listVotingSessions emite) — todo o resto da
    // resolução de sessão (getSession do Better Auth, buscarGoogleSub em
    // `account`, o upsert em `users`) passa direto pro D1 real, então o
    // login e o guard `requireAuth` completam normalmente. `GET
    // /votacao/sessions` não tem try/catch próprio em volta de
    // `listVotingSessions` (routes/votacao.ts) — a exceção sobe crua até o
    // Hono, que é exatamente o caminho que só o onError global cobre; sem
    // ele, esta chamada sairia como texto solto fora do envelope.
    const dbComVotingSessionsQuebrado = {
      prepare: (sql: string) => {
        if (sql.includes('FROM voting_sessions')) {
          throw new Error('D1_ERROR: disk I/O error (simulado)')
        }
        return DB.prepare(sql)
      },
      batch: DB.batch.bind(DB),
      exec: DB.exec.bind(DB),
      withSession: DB.withSession.bind(DB),
      dump: DB.dump.bind(DB),
    } as unknown as D1Database

    const res = await app.request(
      '/votacao/sessions',
      { headers: { cookie } },
      { ...testEnv(), DB: dbComVotingSessionsQuebrado },
    )
    expect(res.status).toBe(500)
    expect(res.headers.get('content-type')).toBe(
      'application/json; charset=utf-8',
    )

    const texto = await res.text()
    // O texto cru do D1 NUNCA chega ao cliente — é exatamente por aqui que
    // um D1_ERROR/SQLITE_* vazaria se `err.message` fosse incluído na
    // resposta (ver o comentário em index.ts pro porquê disto ser proibido).
    expect(texto).not.toContain('D1_ERROR')
    expect(texto).not.toContain('disk I/O')

    const body = JSON.parse(texto) as Envelope<null>
    expect(body.ok).toBe(false)
    expect(body.data).toBeNull()
    expect(body.notifications).toEqual([
      {
        type: 'error',
        code: 'internal_error',
        message: 'erro interno — tente novamente',
      },
    ])
  })
})

// --------------------------------------------------------------------------
// Montagem das 7 rotas de votação (T2-T6) + as 3 rotas de admin (fatia ③,
// Task 5) — PROVA POR EXECUÇÃO, não por leitura do arquivo, que
// `app.route('/votacao', votacaoRoutes)` e `app.route('/admin', adminRoutes)`
// estão registrados ACIMA do catch-all em index.ts. Cada uma das chamadas
// abaixo, sem cookie, tem que responder com o 401 `not_authenticated` da
// PRÓPRIA rota (vindo do guard requireAuth/requireAdmin) — nunca o 404
// `not_found` genérico do catch-all. Se qualquer uma destas tivesse ficado
// registrada abaixo do catch-all (ou não tivesse sido montada), cairia no
// 404 genérico em vez do 401 da rota — a mesma técnica de prova que
// cors.test.ts já usa pro preflight de /api/auth/*, agora estendida pra
// fatia ③.
// --------------------------------------------------------------------------

describe('rotas de votação/admin — todas montadas ACIMA do catch-all', () => {
  test.each([
    ['GET', '/votacao/categorias'],
    ['GET', '/votacao/sessions'],
    ['POST', '/votacao/sessions'],
    ['GET', '/votacao/sessions/1'],
    ['POST', '/votacao/sessions/1/votes'],
    ['GET', '/votacao/sessions/1/results'],
    ['POST', '/votacao/sessions/1/close'],
    ['POST', '/votacao/sessions/1/tiebreak'],
    ['GET', '/votacao/sessions/1/votes'],
    ['GET', '/admin/users'],
    ['GET', '/admin/backups'],
    ['POST', '/admin/backup'],
  ])(
    '%s %s responde 401 not_authenticated (da rota) — nunca 404 not_found (do catch-all)',
    async (method, path) => {
      const res = await app.request(path, { method }, testEnv())
      expect(res.status).toBe(401)
      const body = (await res.json()) as Envelope<null>
      expect(body.notifications[0]?.code).toBe('not_authenticated')
    },
  )
})
