import { env } from 'cloudflare:test'
import { mesFortaleza } from '@piluvitu/ia/uso'
import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import appMontado from '../index'
import { todayInTeresina } from '../lib/dates'
import { errJson } from '../lib/envelope'
import { TETOS_FINANCAS } from '../lib/ia'
import { insightsRoutes } from './insights'

// Marcador improvável: uma asserção negativa contra "sk-ant" casaria com
// qualquer texto que só mencione o prefixo.
const CHAVE = 'sk-ant-CHAVE-ROTA-INSIGHT-NAO-PODE-VAZAR-4e2a'
const testEnv = { DB: env.DB, ANTHROPIC_API_KEY: CHAVE }

// Só o router, sem o middleware de sessão: aqui está sob teste o contrato
// HTTP + envelope da rota. A guarda de sessão é provada no describe
// "sem sessão" (app montado) e em src/index.test.ts.
function app() {
  const hono = new Hono()
  hono.route('/api', insightsRoutes)
  return hono
}

// Monta como src/index.ts: insightsRoutes antes do catch-all.
function appComCatchAll() {
  const hono = new Hono()
  hono.route('/api', insightsRoutes)
  hono.all('/api/*', () => errJson(404, 'not_found', 'rota nao encontrada'))
  return hono
}

function get(path: string) {
  return app().request(path, {}, testEnv)
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

async function contar(tabela: 'insights' | 'uso_ia'): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM ${tabela}`,
  ).first<{ n: number }>()
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

    it('POST /api/insights (a ingestão do Mac) não existe mais: cai no catch-all', async () => {
      const res = await appComCatchAll().request(
        '/api/insights',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer qualquer-token',
          },
          body: JSON.stringify({
            texto: 't',
            modelo: 'm',
            periodo: '2026-07',
          }),
        },
        testEnv,
      )
      expect(res.status).toBe(404)
      expect(((await res.json()) as Envelope).notifications[0].code).toBe(
        'not_found',
      )
      expect(await contar('insights')).toBe(0)
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
                 'claude-sonnet-5-5', '2026-07', '2026-07-20T10:00:00Z')`,
      ).run()

      const res = await get('/api/insights/latest')
      expect(res.status).toBe(200)
      const body = (await res.json()) as Envelope
      expect(body.data).toEqual({
        id: 'i-latest-route',
        texto: 'Você gastou mais em Mercado.',
        modelo: 'claude-sonnet-5-5',
        periodo: '2026-07',
        generated_at: '2026-07-20T10:00:00Z',
      })
    })
  })

  describe('GET /api/insights/numbers', () => {
    it('200 com envelope, mesmo sem nenhum lançamento no período', async () => {
      const res = await get('/api/insights/numbers?competence=2100-01')
      expect(res.status).toBe(200)
      const body = (await res.json()) as Envelope
      expect(body.ok).toBe(true)
      expect(body.data.competence).toBe('2100-01')
      expect(body.data.total_cents).toBe(0)
      expect(body.data.top_categories).toEqual([])
    })

    it('400 invalid_query quando competence está ausente', async () => {
      const res = await get('/api/insights/numbers')
      expect(res.status).toBe(400)
      const body = (await res.json()) as Envelope
      expect(body.notifications[0].code).toBe('invalid_query')
    })

    it('400 invalid_query quando competence é malformada', async () => {
      const res = await get('/api/insights/numbers?competence=2026-13')
      expect(res.status).toBe(400)
      const body = (await res.json()) as Envelope
      expect(body.notifications[0].code).toBe('invalid_query')
    })
  })
})

/**
 * `POST /api/insights/generate`: o Worker gera o insight na Claude e responde
 * só quando ele está gravado.
 *
 * O `fetch` global é trocado em todo teste deste bloco: nenhum alcança a API.
 */
type Chamada = { url: string; corpo: string; headers: Record<string, string> }

let chamadas: Chamada[]
let responder: () => Response

function respostaClaude(texto: string): Response {
  return Response.json({
    id: 'msg_teste',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-5-5',
    content: [{ type: 'text', text: texto }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: 800,
      output_tokens: 150,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
    },
  })
}

beforeEach(() => {
  chamadas = []
  responder = () => respostaClaude('Leitura do mês.')
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const req = new Request(input, init)
    chamadas.push({
      url: req.url,
      corpo: await req.text(),
      headers: Object.fromEntries(req.headers),
    })
    return responder()
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

function gerar(
  corpo: unknown,
  ambiente: Record<string, unknown> = testEnv,
  bruto = false,
) {
  return app().request(
    '/api/insights/generate',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: bruto ? String(corpo) : JSON.stringify(corpo),
    },
    ambiente,
  )
}

async function gastarTeto() {
  await env.DB.prepare(
    `INSERT INTO uso_ia (id, feature, mes, modelo, estado, reservado_micro, custo_micro, criado_em)
     VALUES ('gasto', 'insight', ?, 'claude-sonnet-5-5', 'concluido', 0, ?, '2026-10-01T00:00:00Z')`,
  )
    .bind(mesFortaleza(), TETOS_FINANCAS.insight)
    .run()
}

describe('POST /api/insights/generate', () => {
  it('200 síncrono com o insight já gravado', async () => {
    responder = () => respostaClaude('  Setembro foi tranquilo.  ')

    const res = await gerar({ competence: '2026-09' })

    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope
    expect(body.ok).toBe(true)
    expect(body.notifications).toEqual([])
    expect(body.data).toMatchObject({
      texto: 'Setembro foi tranquilo.',
      modelo: 'claude-sonnet-5-5',
      periodo: '2026-09',
    })
    expect(chamadas).toHaveLength(1)
    expect(new URL(chamadas[0].url).host).toBe('api.anthropic.com')

    const latest = (await (
      await get('/api/insights/latest')
    ).json()) as Envelope
    expect(latest.data).toEqual(body.data)
  })

  it('sem competence no corpo, usa o mês corrente de Teresina', async () => {
    const res = await gerar({})

    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope
    expect(body.data.periodo).toBe(todayInTeresina().slice(0, 7))
  })

  it('sem ANTHROPIC_API_KEY: 503 claude_desligado, sem chamar a API', async () => {
    const res = await gerar({ competence: '2026-09' }, { DB: env.DB })

    expect(res.status).toBe(503)
    const body = (await res.json()) as Envelope
    expect(body.notifications[0].code).toBe('claude_desligado')
    expect(body.notifications[0].message).toContain('ANTHROPIC_API_KEY')
    expect(chamadas).toHaveLength(0)
    expect(await contar('insights')).toBe(0)
  })

  it('teto do mês atingido: 429 teto_atingido com teto, gasto e mês', async () => {
    await gastarTeto()

    const res = await gerar({ competence: '2026-09' })

    expect(res.status).toBe(429)
    const body = (await res.json()) as Envelope
    expect(body.notifications[0].code).toBe('teto_atingido')
    expect(body.notifications[0].message).toContain('US$ 2,00')
    expect(body.notifications[0].message).toContain(mesFortaleza())
    expect(chamadas).toHaveLength(0)
    expect(await contar('insights')).toBe(0)
  })

  it('competence malformada: 422 invalid_competence, sem reserva nem chamada', async () => {
    const res = await gerar({ competence: '2026-13' })

    expect(res.status).toBe(422)
    const body = (await res.json()) as Envelope
    expect(body.notifications[0]).toMatchObject({
      code: 'invalid_competence',
      field: 'competence',
    })
    expect(chamadas).toHaveLength(0)
    expect(await contar('uso_ia')).toBe(0)
  })

  it('competence que não é string: 422 invalid_competence', async () => {
    const res = await gerar({ competence: 202609 })

    expect(res.status).toBe(422)
    const body = (await res.json()) as Envelope
    expect(body.notifications[0].code).toBe('invalid_competence')
    expect(chamadas).toHaveLength(0)
  })

  it('corpo não-JSON: 400 invalid_json, sem chamar a API', async () => {
    const res = await gerar('{nao e json', testEnv, true)

    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope
    expect(body.notifications[0].code).toBe('invalid_json')
    expect(chamadas).toHaveLength(0)
  })

  it('a Claude recusa a chave (401): 502 claude_recusou, sem a chave no corpo', async () => {
    responder = () =>
      Response.json(
        {
          type: 'error',
          error: {
            type: 'authentication_error',
            message: `invalid x-api-key: ${CHAVE}`,
          },
        },
        { status: 401 },
      )

    const res = await gerar({ competence: '2026-09' })
    const texto = await res.text()

    expect(res.status).toBe(502)
    expect(JSON.parse(texto).notifications[0].code).toBe('claude_recusou')
    expect(texto).not.toContain(CHAVE)
    expect(await contar('insights')).toBe(0)
  })

  it('a Claude fora do ar (529): 503 claude_indisponivel, nada gravado', async () => {
    responder = () =>
      Response.json(
        { type: 'error', error: { type: 'overloaded_error', message: 'x' } },
        { status: 529, headers: { 'retry-after-ms': '1' } },
      )

    const res = await gerar({ competence: '2026-09' })

    expect(res.status).toBe(503)
    const body = (await res.json()) as Envelope
    expect(body.notifications[0].code).toBe('claude_indisponivel')
    expect(await contar('insights')).toBe(0)
  })

  // A guarda de sessão desta rota é a global de src/index.ts; provar isso
  // exige o app montado de verdade, não o router isolado.
  describe('sem sessão', () => {
    const envDoApp = {
      DB: env.DB,
      BETTER_AUTH_URL: 'http://localhost:8787',
      BETTER_AUTH_SECRET: 'a'.repeat(32),
      GOOGLE_CLIENT_ID: 'client-id-de-teste',
      GOOGLE_CLIENT_SECRET: 'client-secret-de-teste',
      ALLOWED_EMAIL: 'dono@exemplo.com',
      ANTHROPIC_API_KEY: CHAVE,
    }

    it('sem cookie: 401 not_authenticated e a Claude NUNCA é chamada', async () => {
      const res = await appMontado.request(
        '/api/insights/generate',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ competence: '2026-09' }),
        },
        envDoApp,
      )
      expect(res.status).toBe(401)
      expect(((await res.json()) as Envelope).notifications[0].code).toBe(
        'not_authenticated',
      )
      expect(chamadas).toHaveLength(0)
      expect(await contar('uso_ia')).toBe(0)
    })

    it('um Bearer qualquer também não abre esta rota', async () => {
      const res = await appMontado.request(
        '/api/insights/generate',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer ingest-token-antigo',
          },
          body: JSON.stringify({}),
        },
        envDoApp,
      )
      expect(res.status).toBe(401)
      expect(((await res.json()) as Envelope).notifications[0].code).toBe(
        'not_authenticated',
      )
      expect(chamadas).toHaveLength(0)
    })
  })
})
