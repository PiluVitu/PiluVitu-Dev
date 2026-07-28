import { applyD1Migrations, env } from 'cloudflare:test'
import { Hono } from 'hono'
import { beforeAll, describe, expect, it } from 'vitest'
import { errJson } from '../lib/envelope'
import { insightsRoutes } from './insights'

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
})

const INGEST_TOKEN = 'token-de-teste-ingestao'
const testEnv = { DB: env.DB, INGEST_TOKEN }

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

function get(path: string) {
  return app().request(path, {}, testEnv)
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
  notifications: Array<{ type: string; code: string; message: string }>
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
