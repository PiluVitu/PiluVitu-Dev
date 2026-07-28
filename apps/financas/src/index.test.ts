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
const INGEST_TOKEN = 'ingest-token-e2e-de-teste'
const authTestEnv = {
  DB: env.DB,
  BETTER_AUTH_URL: 'http://localhost:8787',
  BETTER_AUTH_SECRET: 'a'.repeat(32),
  GOOGLE_CLIENT_ID: 'client-id-de-teste',
  GOOGLE_CLIENT_SECRET: 'client-secret-de-teste',
  ALLOWED_EMAIL: 'dono@exemplo.com',
  INGEST_TOKEN,
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
    // Fix round 1: `expect(status).not.toBe(401)` também passa com 500 ou
    // com o nosso próprio 503 auth_unavailable — não distingue "não foi a
    // nossa guarda que respondeu" de "algo quebrou". MEDIDO: sem cookie,
    // GET /api/auth/get-session responde 200 com corpo `null` cru (nem
    // {session:null}, nem o nosso envelope {ok,data,notifications}) — é o
    // próprio Better Auth respondendo, não a nossa guarda (que teria
    // devolvido 401 not_authenticated dentro do envelope).
    expect(res.status).toBe(200)
    expect(await res.json()).toBeNull()
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

// Fatia ⑨, Task 3 (+ extensão de escopo na Task 4, comando do Mac) — a
// fronteira de segurança do INGEST_TOKEN, provada contra o APP MONTADO DE
// VERDADE (mesma cadeia de middleware de src/index.ts, não um router
// isolado como routes/insights.test.ts usa) — é o único jeito de provar
// que as exceções do middleware global (POST /api/insights desde a Task 3;
// GET /api/insights/numbers desde a Task 4) não vazaram pra nenhuma outra
// rota. O escopo do token continua o mesmo depois da extensão: lê
// agregado (numbers), escreve prosa (insights) — nunca toca o livro-caixa.
describe('worker de finanças — fronteira do INGEST_TOKEN (fatia ⑨, Task 3 + Task 4)', () => {
  test('o token do Mac NÃO abre /api/accounts — nem com header correto, sem sessão', async () => {
    const res = await app.request(
      '/api/accounts',
      { headers: { authorization: `Bearer ${INGEST_TOKEN}` } },
      authTestEnv,
    )
    expect(res.status).toBe(401)
    expect(((await res.json()) as CorpoErro).notifications[0].code).toBe(
      'not_authenticated',
    )
  })

  test('o token do Mac NÃO abre nenhuma outra rota de escrita — POST /api/payees também ignora o header', async () => {
    const res = await app.request(
      '/api/payees',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${INGEST_TOKEN}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ name: 'Teste', kind: 'other' }),
      },
      authTestEnv,
    )
    expect(res.status).toBe(401)
    expect(((await res.json()) as CorpoErro).notifications[0].code).toBe(
      'not_authenticated',
    )
  })

  test('GET /api/insights/latest continua exigindo sessão — o token do Mac NÃO abre esta rota (Task 4 estendeu só /numbers)', async () => {
    const semNada = await app.request('/api/insights/latest', {}, authTestEnv)
    expect(semNada.status).toBe(401)
    expect(((await semNada.json()) as CorpoErro).notifications[0].code).toBe(
      'not_authenticated',
    )

    // Mesmo com o Bearer CORRETO: /latest não tem a exceção do middleware
    // global (só POST /insights e GET /insights/numbers têm, ver
    // src/index.ts) — a requisição nunca sai do requireSession() global,
    // então o resultado é idêntico ao caso sem header nenhum.
    const comToken = await app.request(
      '/api/insights/latest',
      { headers: { authorization: `Bearer ${INGEST_TOKEN}` } },
      authTestEnv,
    )
    expect(comToken.status).toBe(401)
    expect(((await comToken.json()) as CorpoErro).notifications[0].code).toBe(
      'not_authenticated',
    )
  })

  // Task 4 (comando do Mac): o MESMO INGEST_TOKEN que já autenticava a
  // ESCRITA (POST /insights) passa a autenticar também esta LEITURA — e
  // só esta, entre as duas leituras de insight. As três pernas abaixo
  // provam a extensão completa: sem nada barra, token errado barra, token
  // certo abre (sem cookie nenhum — o comando do Mac não tem sessão de
  // navegador).
  describe('GET /api/insights/numbers — extensão de escopo do INGEST_TOKEN (Task 4)', () => {
    test('sem sessão e sem token: 401 not_authenticated (cai no requireSession(), igual antes da Task 4)', async () => {
      const res = await app.request(
        '/api/insights/numbers?competence=2026-07',
        {},
        authTestEnv,
      )
      expect(res.status).toBe(401)
      expect(((await res.json()) as CorpoErro).notifications[0].code).toBe(
        'not_authenticated',
      )
    })

    test('token de ingestão errado: 401 invalid_ingest_token — nunca cai pro fallback de sessão', async () => {
      const res = await app.request(
        '/api/insights/numbers?competence=2026-07',
        { headers: { authorization: 'Bearer token-errado' } },
        authTestEnv,
      )
      expect(res.status).toBe(401)
      expect(((await res.json()) as CorpoErro).notifications[0].code).toBe(
        'invalid_ingest_token',
      )
    })

    test('token de ingestão correto, SEM cookie nenhum: 200 com os números — o comando do Mac consegue ler', async () => {
      const res = await app.request(
        '/api/insights/numbers?competence=2026-07',
        { headers: { authorization: `Bearer ${INGEST_TOKEN}` } },
        authTestEnv,
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        ok: boolean
        data: { competence: string; top_categories: unknown[] }
      }
      expect(body.ok).toBe(true)
      expect(body.data.competence).toBe('2026-07')
      expect(body.data.top_categories).toEqual([])
    })
  })

  test('POST /api/insights sem token: 401 invalid_ingest_token (chega na rota — a exceção do middleware global funcionou)', async () => {
    const res = await app.request(
      '/api/insights',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          texto: 't',
          modelo: 'm',
          periodo: '2026-07',
        }),
      },
      authTestEnv,
    )
    // Se a exceção do middleware não existisse, isto sairia 401
    // not_authenticated (a guarda de sessão barrando ANTES da rota).
    // invalid_ingest_token só aparece quando a requisição chegou na rota
    // e foi a GUARDA DO TOKEN quem barrou — prova que a exceção em
    // index.ts está funcionando e que é a rota (não a sessão) quem decide.
    expect(res.status).toBe(401)
    expect(((await res.json()) as CorpoErro).notifications[0].code).toBe(
      'invalid_ingest_token',
    )
  })

  test('cookie de sessão (mesmo formato de um genuíno) NÃO substitui o token em POST /api/insights', async () => {
    const res = await app.request(
      '/api/insights',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          // Mesmo formato usado no teste de 401 not_authenticated acima
          // ('GET /api/accounts com cookie de sessão inexistente') — o
          // ponto aqui não é a validade do cookie, é provar que ele é
          // IRRELEVANTE para esta rota: sem o header Authorization, a
          // resposta é a mesma (invalid_ingest_token), cookie ou não.
          cookie:
            'better-auth.session_token=token-que-nao-existe.assinatura-que-nao-bate',
        },
        body: JSON.stringify({
          texto: 't',
          modelo: 'm',
          periodo: '2026-07',
        }),
      },
      authTestEnv,
    )
    expect(res.status).toBe(401)
    expect(((await res.json()) as CorpoErro).notifications[0].code).toBe(
      'invalid_ingest_token',
    )
  })

  test('POST /api/insights com o token correto: 201, alcança o handler de verdade (registro acima do catch-all)', async () => {
    const res = await app.request(
      '/api/insights',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${INGEST_TOKEN}`,
        },
        body: JSON.stringify({
          texto: 'Insight de ponta a ponta.',
          modelo: 'qwen2.5:7b-instruct',
          periodo: '2026-07',
        }),
      },
      authTestEnv,
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect((body as { data: { texto: string } }).data.texto).toBe(
      'Insight de ponta a ponta.',
    )
  })
})
