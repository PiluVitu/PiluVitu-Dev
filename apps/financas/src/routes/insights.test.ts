import { applyD1Migrations, env } from 'cloudflare:test'
import { Hono } from 'hono'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import appMontado from '../index'
import { errJson } from '../lib/envelope'
import { insightsRoutes } from './insights'

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
})

const INGEST_TOKEN = 'token-de-teste-ingestao'
// ⚠️ Marcador improvável: uma asserção negativa contra a palavra "token"
// casaria com qualquer texto que a mencione (mesma lição de lib/promeia.test.ts).
const PROMEIA_TOKEN = 'TOKEN-PROMEIA-NAO-PODE-VAZAR-1a5d'
const PROMEIA_URL = 'https://promeia.exemplo.test'
const testEnv = {
  DB: env.DB,
  INGEST_TOKEN,
  PROMEIA_URL,
  PROMEIA_TOKEN,
}

// Monta só o router, sem o middleware de sessão do Better Auth — mesma
// convenção de routes/recurring.test.ts/routes/reserve.test.ts: o que
// está sob teste aqui é o contrato HTTP + envelope da própria rota
// (incl. a guarda do token, que mora NELA), não o middleware global de
// index.ts.
function app() {
  const hono = new Hono()
  hono.route('/api', insightsRoutes)
  return hono
}

// Monta EXATAMENTE como src/index.ts: insightsRoutes registrado ANTES do
// catch-all. Prova por EXECUÇÃO REAL (não leitura de index.ts) que a rota
// fica alcançável — mesmo padrão de routes/recurring.test.ts/reserve.test.ts.
function appComCatchAll() {
  const hono = new Hono()
  hono.route('/api', insightsRoutes)
  hono.all('/api/*', () => errJson(404, 'not_found', 'rota nao encontrada'))
  return hono
}

// `token` opcional: só as rotas guardadas por requireIngestToken(OrSession)
// precisam dele. Sem `token`, nenhum header Authorization é enviado — o
// caminho de sessão (fora do escopo deste arquivo, ver index.test.ts) é
// quem decidiria, e este testEnv não tem os campos de AuthBindings pra
// isso (de propósito: as duas rotas cobertas aqui, latest e a autenticação
// por TOKEN de numbers, não precisam deles).
function get(path: string, token?: string) {
  return app().request(
    path,
    token !== undefined
      ? { headers: { authorization: `Bearer ${token}` } }
      : {},
    testEnv,
  )
}

function post(path: string, body: unknown, token?: string) {
  return app().request(
    path,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token !== undefined ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    },
    testEnv,
  )
}

type Envelope = {
  ok: boolean
  data: any
  notifications: Array<{
    type: string
    code: string
    message: string
    field?: string
  }>
}

async function countInsights(): Promise<number> {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM insights').first<{
    n: number
  }>()
  return row?.n ?? 0
}

describe('rotas de insights', () => {
  describe('registro acima do catch-all', () => {
    it('GET /api/insights/latest alcança o handler real, não o catch-all', async () => {
      const res = await appComCatchAll().request(
        '/api/insights/latest',
        {},
        testEnv,
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as Envelope
      expect(body.notifications).toEqual([])
    })
  })

  describe('GET /api/insights/latest', () => {
    it('nenhum insight gravado ainda: 200 com data null (não 404)', async () => {
      const res = await get('/api/insights/latest')
      expect(res.status).toBe(200)
      const body = (await res.json()) as Envelope
      expect(body.ok).toBe(true)
      expect(body.data).toBeNull()
      expect(body.notifications).toEqual([])
    })

    it('devolve o insight mais recente já gravado', async () => {
      await env.DB.prepare(
        `INSERT INTO insights (id, texto, modelo, periodo, generated_at)
         VALUES ('i-latest-route', 'Você gastou mais em Mercado.',
                 'qwen2.5:7b-instruct', '2026-07', '2026-07-20T10:00:00Z')`,
      ).run()

      const res = await get('/api/insights/latest')
      expect(res.status).toBe(200)
      const body = (await res.json()) as Envelope
      expect(body.data).toEqual({
        id: 'i-latest-route',
        texto: 'Você gastou mais em Mercado.',
        modelo: 'qwen2.5:7b-instruct',
        periodo: '2026-07',
        generated_at: '2026-07-20T10:00:00Z',
      })
    })
  })

  // Task 4 (comando do Mac): esta rota passou a exigir requireIngestTokenOrSession
  // — sem sessão de navegador disponível neste testEnv (de propósito, ver
  // comentário do `get()` acima), todo teste abaixo passa o INGEST_TOKEN.
  // A cobertura de "sem token E sem sessão" e "sessão sozinha também
  // funciona" mora em src/index.test.ts (describe "fronteira do
  // INGEST_TOKEN"), que monta o app inteiro com AuthBindings completo —
  // é o único lugar que consegue provar as duas metades juntas.
  describe('GET /api/insights/numbers', () => {
    it('200 com envelope, mesmo sem nenhum lançamento no período', async () => {
      const res = await get(
        '/api/insights/numbers?competence=2100-01',
        INGEST_TOKEN,
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as Envelope
      expect(body.ok).toBe(true)
      expect(body.data.competence).toBe('2100-01')
      expect(body.data.total_cents).toBe(0)
      expect(body.data.top_categories).toEqual([])
    })

    it('400 invalid_query quando competence está ausente', async () => {
      const res = await get('/api/insights/numbers', INGEST_TOKEN)
      expect(res.status).toBe(400)
      const body = (await res.json()) as Envelope
      expect(body.notifications[0].code).toBe('invalid_query')
    })

    it('400 invalid_query quando competence é malformada', async () => {
      const res = await get(
        '/api/insights/numbers?competence=2026-13',
        INGEST_TOKEN,
      )
      expect(res.status).toBe(400)
      const body = (await res.json()) as Envelope
      expect(body.notifications[0].code).toBe('invalid_query')
    })

    it('token errado: 401 invalid_ingest_token, nunca chega no domínio', async () => {
      const res = await get(
        '/api/insights/numbers?competence=2026-07',
        'token-errado',
      )
      expect(res.status).toBe(401)
      const body = (await res.json()) as Envelope
      expect(body.notifications[0].code).toBe('invalid_ingest_token')
    })
  })

  describe('POST /api/insights', () => {
    const payload = {
      texto: 'Você gastou mais em Mercado este mês.',
      modelo: 'qwen2.5:7b-instruct',
      periodo: '2026-07',
    }

    it('sem header Authorization: 401 invalid_ingest_token, nada gravado', async () => {
      const antes = await countInsights()
      const res = await post('/api/insights', payload)
      expect(res.status).toBe(401)
      const body = (await res.json()) as Envelope
      expect(body.notifications[0].code).toBe('invalid_ingest_token')
      expect(await countInsights()).toBe(antes)
    })

    it('token errado: 401 invalid_ingest_token, nada gravado', async () => {
      const antes = await countInsights()
      const res = await post('/api/insights', payload, 'token-errado')
      expect(res.status).toBe(401)
      expect(await countInsights()).toBe(antes)
    })

    it('token correto e corpo válido: 201, grava exatamente uma linha', async () => {
      const antes = await countInsights()
      const res = await post('/api/insights', payload, INGEST_TOKEN)
      expect(res.status).toBe(201)
      const body = (await res.json()) as Envelope
      expect(body.ok).toBe(true)
      expect(body.data.texto).toBe(payload.texto)
      expect(body.data.modelo).toBe(payload.modelo)
      expect(body.data.periodo).toBe(payload.periodo)
      expect(body.data.id).toBeTruthy()
      expect(body.data.generated_at).toBeTruthy()
      expect(await countInsights()).toBe(antes + 1)
    })

    it('generated_at do corpo é IGNORADO — o servidor sempre grava o próprio relógio', async () => {
      const res = await post(
        '/api/insights',
        { ...payload, generated_at: '2000-01-01T00:00:00Z' },
        INGEST_TOKEN,
      )
      expect(res.status).toBe(201)
      const body = (await res.json()) as Envelope
      expect(body.data.generated_at).not.toBe('2000-01-01T00:00:00Z')
      // "agora" em teste é o relógio real do processo — só confirmamos que
      // não é o ano 2000 injetado pelo corpo, sem acoplar a um timestamp
      // exato (frágil).
      expect(String(body.data.generated_at).startsWith('20')).toBe(true)
      expect(String(body.data.generated_at).startsWith('2000')).toBe(false)
    })

    it('corpo não é JSON válido: 400 invalid_json (mesmo com token correto)', async () => {
      const res = await app().request(
        '/api/insights',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${INGEST_TOKEN}`,
          },
          body: '{ nao e json',
        },
        testEnv,
      )
      expect(res.status).toBe(400)
      const body = (await res.json()) as Envelope
      expect(body.notifications[0].code).toBe('invalid_json')
    })

    it('campo faltando/tipo errado: 422 invalid_insight', async () => {
      const antes = await countInsights()
      const res = await post(
        '/api/insights',
        { texto: 'x', modelo: 'm' /* periodo ausente */ },
        INGEST_TOKEN,
      )
      expect(res.status).toBe(422)
      const body = (await res.json()) as Envelope
      expect(body.notifications[0].code).toBe('invalid_insight')
      expect(await countInsights()).toBe(antes)
    })

    it('texto vazio: 422 invalid_insight, nada gravado', async () => {
      const antes = await countInsights()
      const res = await post(
        '/api/insights',
        { ...payload, texto: '   ' },
        INGEST_TOKEN,
      )
      expect(res.status).toBe(422)
      expect(await countInsights()).toBe(antes)
    })

    it('periodo fora do formato YYYY-MM: 422 invalid_insight, nada gravado', async () => {
      const antes = await countInsights()
      const res = await post(
        '/api/insights',
        { ...payload, periodo: '2026-13' },
        INGEST_TOKEN,
      )
      expect(res.status).toBe(422)
      const body = (await res.json()) as Envelope
      expect(body.notifications[0].code).toBe('invalid_insight')
      expect(await countInsights()).toBe(antes)
    })
  })
})

/**
 * `POST /api/insights/generate` — o botão que substitui o `make insight`.
 *
 * ⚠️ **Nenhum teste aqui alcança o Mac, o túnel ou o Ollama**: o `fetch`
 * global é substituído em todo caso que exercita a chamada ao promeia, e
 * restaurado num `afterEach`. Um teste que "esquecesse" o mock não sairia
 * pela rede em silêncio — `PROMEIA_URL` aponta pra um host `.test`
 * inexistente, então a chamada falharia alto.
 */
const fetchOriginal = globalThis.fetch
afterEach(() => {
  globalThis.fetch = fetchOriginal
  vi.useRealTimers()
})

type ChamadaPromeia = { url: string; init: RequestInit }

/** Substitui o `fetch` global e guarda o que foi enviado ao promeia. */
function mockarPromeia(
  responder: (chamada: ChamadaPromeia) => Response | Promise<Response>,
): ChamadaPromeia[] {
  const vistas: ChamadaPromeia[] = []
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const chamada = { url: String(url), init }
    vistas.push(chamada)
    return responder(chamada)
  }) as unknown as typeof fetch
  return vistas
}

function respostaJson(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function gerar(corpo: unknown, ambiente: Record<string, unknown> = testEnv) {
  return app().request(
    '/api/insights/generate',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(corpo),
    },
    ambiente,
  )
}

describe('POST /api/insights/generate', () => {
  it('promeia responde dentro da janela: 200 com o texto gerado', async () => {
    const vistas = mockarPromeia(() =>
      respostaJson(200, {
        ok: true,
        data: {
          competence: '2026-07',
          texto: 'Você gastou mais em Mercado neste mês.',
          modelo: 'qwen2.5:7b-instruct',
        },
      }),
    )

    const res = await gerar({ competence: '2026-07' })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope
    expect(body.ok).toBe(true)
    expect(body.data).toEqual({
      competence: '2026-07',
      texto: 'Você gastou mais em Mercado neste mês.',
      modelo: 'qwen2.5:7b-instruct',
    })

    // A cadeia inteira em uma asserção: o Worker (não o navegador) é quem
    // carrega o PROMEIA_TOKEN, e ele vai no header, nunca na URL.
    expect(vistas).toHaveLength(1)
    expect(vistas[0].url).toBe(`${PROMEIA_URL}/insight`)
    expect(vistas[0].init.method).toBe('POST')
    expect(
      (vistas[0].init.headers as Record<string, string>).authorization,
    ).toBe(`Bearer ${PROMEIA_TOKEN}`)
    expect(JSON.parse(vistas[0].init.body as string)).toEqual({
      competence: '2026-07',
    })
  })

  it('sem competence no corpo, manda null — o promeia usa o mês corrente', async () => {
    const vistas = mockarPromeia(() =>
      respostaJson(200, {
        ok: true,
        data: { competence: '2026-08', texto: 'leitura', modelo: 'm' },
      }),
    )
    const res = await gerar({})
    expect(res.status).toBe(200)
    expect(JSON.parse(vistas[0].init.body as string)).toEqual({
      competence: null,
    })
  })

  // ⚠️ O CAMINHO FELIZ MAIS COMUM, não uma exceção: a geração leva
  // 20,3-32,8 s medidos e a janela é de 8 s. Nada se perde — `run_insight`
  // (promeia) faz `POST /api/insights` por conta própria, e o handler dele é
  // um `def` SÍNCRONO (threadpool, sem checagem de desconexão), então
  // abortar o fetch daqui não interrompe o trabalho de lá.
  it('estourando a janela de 8 s: 202 {status:"gerando"}, nunca um erro', async () => {
    vi.useFakeTimers()

    let avisarQueChamou: () => void = () => {}
    const fetchChamado = new Promise<void>((r) => {
      avisarQueChamou = r
    })

    // Nunca resolve por conta própria: só reage ao abort da janela curta —
    // é o promeia levando os 20-33 s normais dele.
    globalThis.fetch = ((_url: string, init: RequestInit) => {
      avisarQueChamou()
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(new DOMException('abortado', 'AbortError')),
        )
      })
    }) as unknown as typeof fetch

    const pendente = gerar({ competence: '2026-07' })
    await fetchChamado
    await vi.advanceTimersByTimeAsync(8_000)

    const res = await pendente
    expect(res.status).toBe(202)
    const body = (await res.json()) as Envelope
    expect(body.ok).toBe(true)
    expect(body.data).toEqual({ status: 'gerando' })
    expect(body.notifications).toEqual([])
  })

  it('Mac/túnel fora (fetch rejeita): 503 promeia_unreachable com mensagem acionável', async () => {
    mockarPromeia(() => {
      throw new TypeError('fetch failed')
    })
    const res = await gerar({})
    expect(res.status).toBe(503)
    const body = (await res.json()) as Envelope
    expect(body.notifications[0].code).toBe('promeia_unreachable')
    expect(body.notifications[0].message).toContain('Ligue o Mac')
  })

  // ⚠️ O achado da spike: a Cloudflare SUBSTITUI o corpo do 502 da origem
  // pelo próprio error page (`text/plain`, 16 bytes) — 3/3, determinístico.
  // A regra herdada do ramielle ("erro sem code/message ⇒ inalcançável")
  // diria aqui "suba o promeia no Mac" com o promeia DE PÉ. As duas
  // asserções negativas abaixo são o que trava essa confusão.
  it('502 com o corpo comido pelo túnel: 502 promeia_ilegivel, NUNCA "suba o promeia"', async () => {
    mockarPromeia(
      () =>
        new Response('error code: 502', {
          status: 502,
          headers: { 'content-type': 'text/plain' },
        }),
    )
    const res = await gerar({})
    expect(res.status).toBe(502)
    const body = (await res.json()) as Envelope
    expect(body.notifications[0].code).toBe('promeia_ilegivel')
    expect(body.notifications[0].code).not.toBe('promeia_unreachable')
    expect(body.notifications[0].message).not.toContain('Ligue o Mac')
    expect(body.notifications[0].message).toContain('502')
  })

  it('túnel caído (530): aí sim 503 promeia_unreachable — a faixa da Cloudflare é a única evidência de ausência', async () => {
    mockarPromeia(() => new Response('<html>530</html>', { status: 530 }))
    const res = await gerar({})
    expect(res.status).toBe(503)
    const body = (await res.json()) as Envelope
    expect(body.notifications[0].code).toBe('promeia_unreachable')
  })

  it('promeia recusa (503 ollama_unreachable): repassa code E message, sem achatar', async () => {
    mockarPromeia(() =>
      respostaJson(503, {
        ok: false,
        code: 'ollama_unreachable',
        message:
          'não consegui conectar ao Ollama — inicie com `ollama serve` e tente de novo',
      }),
    )
    const res = await gerar({})
    expect(res.status).toBe(503)
    const body = (await res.json()) as Envelope
    expect(body.notifications[0].code).toBe('ollama_unreachable')
    // É esta frase que distingue "abra o Ollama" de "suba o promeia" — o
    // Worker nunca a reescreve.
    expect(body.notifications[0].message).toContain('ollama serve')
  })

  it('200 sem `data.texto`: 502 promeia_ilegivel, nunca um 200 vazio', async () => {
    mockarPromeia(() => respostaJson(200, { ok: true, data: { texto: '' } }))
    const res = await gerar({})
    expect(res.status).toBe(502)
    expect(((await res.json()) as Envelope).notifications[0].code).toBe(
      'promeia_ilegivel',
    )
  })

  it('sem PROMEIA_URL/PROMEIA_TOKEN: 503 promeia_disabled e NENHUMA chamada de rede', async () => {
    const vistas = mockarPromeia(() =>
      respostaJson(200, { ok: true, data: {} }),
    )
    const res = await gerar({}, { DB: env.DB, INGEST_TOKEN })
    expect(res.status).toBe(503)
    const body = (await res.json()) as Envelope
    expect(body.notifications[0].code).toBe('promeia_disabled')
    expect(body.notifications[0].message).toContain('PROMEIA_URL')
    expect(vistas).toHaveLength(0)
  })

  it('corpo não-JSON: 400 invalid_json, sem gastar uma ida ao Mac', async () => {
    const vistas = mockarPromeia(() =>
      respostaJson(200, { ok: true, data: {} }),
    )
    const res = await app().request(
      '/api/insights/generate',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{ nao e json',
      },
      testEnv,
    )
    expect(res.status).toBe(400)
    expect(((await res.json()) as Envelope).notifications[0].code).toBe(
      'invalid_json',
    )
    expect(vistas).toHaveLength(0)
  })

  it('competence malformada: 422 invalid_competence, sem gastar uma ida ao Mac', async () => {
    const vistas = mockarPromeia(() =>
      respostaJson(200, { ok: true, data: {} }),
    )
    const res = await gerar({ competence: '2026-13' })
    expect(res.status).toBe(422)
    const body = (await res.json()) as Envelope
    expect(body.notifications[0].code).toBe('invalid_competence')
    expect(body.notifications[0].field).toBe('competence')
    expect(vistas).toHaveLength(0)
  })

  it('o PROMEIA_TOKEN não aparece em nenhuma resposta de erro', async () => {
    const cenarios: Array<() => Response> = [
      () => new Response('error code: 502', { status: 502 }),
      () => new Response('<html>530</html>', { status: 530 }),
      () => respostaJson(503, { ok: false, code: 'x', message: 'falhou' }),
    ]
    for (const responder of cenarios) {
      mockarPromeia(responder)
      const res = await gerar({})
      expect(await res.text()).not.toContain(PROMEIA_TOKEN)
    }
  })

  // ⚠️ A guarda de sessão desta rota é a GLOBAL de src/index.ts (ela não
  // está em nenhuma das exceções de lá) — então provar isso exige o APP
  // MONTADO DE VERDADE, não o router isolado que os testes acima usam. Sem
  // esta prova, a rota poderia ter entrado nas exceções por engano e
  // qualquer requisição anônima dispararia uma rodada de GPU no Mac do dono.
  describe('sem sessão', () => {
    const envDoApp = {
      DB: env.DB,
      BETTER_AUTH_URL: 'http://localhost:8787',
      BETTER_AUTH_SECRET: 'a'.repeat(32),
      GOOGLE_CLIENT_ID: 'client-id-de-teste',
      GOOGLE_CLIENT_SECRET: 'client-secret-de-teste',
      ALLOWED_EMAIL: 'dono@exemplo.com',
      INGEST_TOKEN,
      PROMEIA_URL,
      PROMEIA_TOKEN,
    }

    it('sem cookie: 401 not_authenticated e o promeia NUNCA é chamado', async () => {
      const vistas = mockarPromeia(() =>
        respostaJson(200, { ok: true, data: { texto: 'nao deveria' } }),
      )
      const res = await appMontado.request(
        '/api/insights/generate',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ competence: '2026-07' }),
        },
        envDoApp,
      )
      expect(res.status).toBe(401)
      expect(((await res.json()) as Envelope).notifications[0].code).toBe(
        'not_authenticated',
      )
      expect(vistas).toHaveLength(0)
    })

    it('o INGEST_TOKEN (do comando do Mac) também não abre esta rota', async () => {
      const vistas = mockarPromeia(() =>
        respostaJson(200, { ok: true, data: { texto: 'nao deveria' } }),
      )
      const res = await appMontado.request(
        '/api/insights/generate',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${INGEST_TOKEN}`,
          },
          body: JSON.stringify({}),
        },
        envDoApp,
      )
      expect(res.status).toBe(401)
      expect(((await res.json()) as Envelope).notifications[0].code).toBe(
        'not_authenticated',
      )
      expect(vistas).toHaveLength(0)
    })
  })
})
