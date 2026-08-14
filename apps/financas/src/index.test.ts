import { env, SELF } from 'cloudflare:test'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { describe, expect, test } from 'vitest'
import app, { onErrorGlobal, type Bindings } from './index'
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

// --------------------------------------------------------------------------
// Rede de segurança GLOBAL: sem `app.onError`, qualquer exceção que uma rota
// deixe escapar sai pelo handler default do Hono como `text/plain "Internal
// Server Error"` — FORA do envelope {ok,data,notifications} que toda outra
// resposta desta API usa. `api<T>()` (web/src/api.ts) não acha o envelope e
// a tela renderiza, dentro de um role="alert", a string literal "resposta sem
// envelope (HTTP 500)", que não diz nada ao dono. O achado C2 do fix final
// (tabela `settings` ausente 500ando três telas) tratou UM caso pontual; este
// describe cobre o buraco genérico.
// --------------------------------------------------------------------------
describe('app.onError global', () => {
  /**
   * Shim que quebra SÓ o statement pedido — todo o resto passa pro D1 real
   * do Miniflare, então a guarda do INGEST_TOKEN e o parse do corpo
   * completam normalmente e a exceção nasce lá no fundo, dentro do domínio,
   * exatamente como nasceria em produção. Mesmo padrão de `apps/ramielle`.
   */
  function dbQueQuebraEm(marcador: string): D1Database {
    return {
      prepare: (sql: string) => {
        if (sql.includes(marcador)) {
          throw new Error('D1_ERROR: disk I/O error (simulado)')
        }
        return env.DB.prepare(sql)
      },
      batch: env.DB.batch.bind(env.DB),
      exec: env.DB.exec.bind(env.DB),
      withSession: env.DB.withSession.bind(env.DB),
      dump: env.DB.dump.bind(env.DB),
    } as unknown as D1Database
  }

  test('exceção comum de dentro de uma rota vira 500 DENTRO do envelope, code internal_error', async () => {
    // POST /api/insights: `createInsight` relança qualquer erro que não seja
    // RangeError (routes/insights.ts, `throw err`), então a exceção sobe crua
    // até o Hono — o caminho que só o onError global cobre. Rota escolhida
    // por autenticar com o INGEST_TOKEN (sem precisar forjar cookie de
    // sessão), não por ser especial: o handler é do app inteiro.
    const res = await app.request(
      '/api/insights',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${INGEST_TOKEN}`,
        },
        body: JSON.stringify({
          texto: 'Insight que nunca chega ao banco.',
          modelo: 'qwen2.5:7b-instruct',
          periodo: '2026-07',
        }),
      },
      { ...authTestEnv, DB: dbQueQuebraEm('INSERT INTO insights') },
    )

    expect(res.status).toBe(500)
    expect(res.headers.get('content-type')).toBe(
      'application/json; charset=utf-8',
    )

    const texto = await res.text()
    // Nunca "Internal Server Error" cru: é o corpo do handler default do
    // Hono, o sintoma exato que este handler existe pra eliminar.
    expect(texto).not.toContain('Internal Server Error')

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

  test('a mensagem interna do erro NÃO aparece no corpo (só no log do servidor)', async () => {
    const res = await app.request(
      '/api/insights',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${INGEST_TOKEN}`,
        },
        body: JSON.stringify({
          texto: 'Insight que nunca chega ao banco.',
          modelo: 'qwen2.5:7b-instruct',
          periodo: '2026-07',
        }),
      },
      { ...authTestEnv, DB: dbQueQuebraEm('INSERT INTO insights') },
    )

    const texto = await res.text()
    // É por aqui que um D1_ERROR/SQLITE_* cru vazaria pro cliente se
    // `err.message`/`String(err)` entrasse na resposta — mesma disciplina de
    // `friendlyConstraintMessage` (lib/errors.ts) em toda rota do módulo.
    expect(texto).not.toContain('D1_ERROR')
    expect(texto).not.toContain('disk I/O')
    expect(texto).not.toContain('simulado')
    expect(texto).not.toContain('insights') // nem o nome da tabela/statement
  })

  test('HTTPException preserva o status deliberado do lançador, nunca vira 500', async () => {
    // Hoje NENHUMA rota deste Worker lança HTTPException (medido: zero
    // ocorrências em src/) — mas um middleware do Hono ou uma dependência
    // futura pode, e transformar um 404/401 deliberado em 500 esconderia a
    // causa. O handler é exercitado através de um Hono real (mesmo caminho
    // de erro do app de produção), não chamado direto, pra provar que o
    // `instanceof` sobrevive ao trajeto pelo framework.
    const appDeTeste = new Hono()
    appDeTeste.onError(onErrorGlobal)
    appDeTeste.get('/deliberado', () => {
      throw new HTTPException(404, { message: 'não encontrei o recurso' })
    })

    const res = await appDeTeste.request('/deliberado')
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toBe(
      'application/json; charset=utf-8',
    )

    const body = (await res.json()) as Envelope<null>
    expect(body.ok).toBe(false)
    expect(body.notifications[0].code).toBe('http_error')
    // A mensagem do lançador também não vaza — mesma regra do 500.
    expect(body.notifications[0].message).not.toContain('não encontrei')
  })

  test('HTTPException que carrega Response própria devolve exatamente ela', async () => {
    const appDeTeste = new Hono()
    appDeTeste.onError(onErrorGlobal)
    appDeTeste.get('/com-resposta', () => {
      throw new HTTPException(401, {
        res: new Response('{"ok":false}', {
          status: 401,
          headers: { 'content-type': 'application/json; charset=utf-8' },
        }),
      })
    })

    const res = await appDeTeste.request('/com-resposta')
    expect(res.status).toBe(401)
    expect(await res.text()).toBe('{"ok":false}')
  })
})
