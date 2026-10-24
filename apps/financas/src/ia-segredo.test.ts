/**
 * Sentinela da ANTHROPIC_API_KEY (Review Focus 3 do plano da IA): a chave não
 * pode sair pelo corpo nem pelos headers da resposta, nem pelo console, e só
 * pode viajar para api.anthropic.com.
 *
 * Exercita a rota real do insight (`POST /api/insights/generate`), montada sem
 * a guarda de sessão, que é provada à parte em routes/insights.test.ts.
 *
 * O `fetch` global é trocado: nenhum teste alcança a API de verdade.
 */
import { env } from 'cloudflare:test'
import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import devVarsExemplo from '../.dev.vars.example?raw'
import wranglerJsonc from '../wrangler.jsonc?raw'
import { type Bindings } from './index'
import { insightsRoutes } from './routes/insights'

const SENTINELA = 'SENTINELA-ia-financas-b71d'
const CHAVE = `sk-ant-${SENTINELA}`

function gerarInsight(ambiente: Bindings) {
  return new Hono<{ Bindings: Bindings }>()
    .route('/api', insightsRoutes)
    .request(
      '/api/insights/generate',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ competence: '2026-09' }),
      },
      ambiente,
    )
}

function testEnv(extra: Partial<Bindings> = {}): Bindings {
  return {
    DB: env.DB,
    BETTER_AUTH_URL: 'http://localhost:5273',
    BETTER_AUTH_SECRET: 'a'.repeat(32),
    GOOGLE_CLIENT_ID: 'client-id-de-teste',
    GOOGLE_CLIENT_SECRET: 'client-secret-de-teste',
    ALLOWED_EMAIL: 'dono@exemplo.test',
    ...extra,
  }
}

type Chamada = { url: string; headers: Record<string, string> }

let chamadas: Chamada[]
let saidasDoConsole: unknown[][]

function comoTexto(valor: unknown): string {
  if (valor instanceof Error) {
    return `${valor.name} ${valor.message} ${valor.stack ?? ''}`
  }
  try {
    return JSON.stringify(valor) ?? String(valor)
  } catch {
    return String(valor)
  }
}

beforeEach(() => {
  chamadas = []
  saidasDoConsole = []
  // A API real ecoa o começo da chave no corpo do 401; o mock ecoa a chave
  // inteira, para provar que nada do corpo da API chega à nossa resposta.
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const req = new Request(input, init)
    chamadas.push({ url: req.url, headers: Object.fromEntries(req.headers) })
    return new Response(
      JSON.stringify({
        type: 'error',
        error: {
          type: 'authentication_error',
          message: `invalid x-api-key: ${CHAVE}`,
        },
      }),
      { status: 401, headers: { 'content-type': 'application/json' } },
    )
  })
  for (const metodo of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, metodo).mockImplementation((...args: unknown[]) => {
      saidasDoConsole.push(args)
    })
  }
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ANTHROPIC_API_KEY não vaza', () => {
  it('não está no wrangler.jsonc (é secret, nunca vars)', () => {
    expect(wranglerJsonc).not.toContain('ANTHROPIC_API_KEY')
    expect(wranglerJsonc).not.toContain('sk-ant-')
  })

  it('não há chave no .dev.vars.example commitado', () => {
    expect(devVarsExemplo).not.toContain('sk-ant-')
  })

  it('com 401 da API, corpo, headers e console saem sem a chave', async () => {
    const res = await gerarInsight(testEnv({ ANTHROPIC_API_KEY: CHAVE }))
    const corpo = await res.text()

    expect(res.status).toBe(502)
    expect(JSON.parse(corpo)).toMatchObject({
      ok: false,
      notifications: [{ type: 'error', code: 'claude_recusou' }],
    })
    expect(corpo).not.toContain(SENTINELA)
    for (const [nome, valor] of res.headers) {
      expect(`${nome}: ${valor}`).not.toContain(SENTINELA)
    }
    for (const args of saidasDoConsole) {
      expect(args.map(comoTexto).join(' ')).not.toContain(SENTINELA)
    }
  })

  it('a chave só viaja para api.anthropic.com, e a reserva é liberada', async () => {
    await gerarInsight(testEnv({ ANTHROPIC_API_KEY: CHAVE }))

    expect(chamadas.length).toBeGreaterThan(0)
    for (const chamada of chamadas) {
      const levaAChave = Object.values(chamada.headers).some((v) =>
        v.includes(SENTINELA),
      )
      if (levaAChave) {
        expect(new URL(chamada.url).host).toBe('api.anthropic.com')
      }
    }
    expect(
      chamadas.some((c) => c.headers.authorization === `Bearer ${CHAVE}`),
    ).toBe(true)

    const linha = await env.DB.prepare('SELECT estado FROM uso_ia').first<{
      estado: string
    }>()
    expect(linha?.estado).toBe('falhou')
  })

  it('sem a chave, responde claude_desligado sem chamar a API', async () => {
    const res = await gerarInsight(testEnv())

    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({
      notifications: [{ code: 'claude_desligado' }],
    })
    expect(chamadas).toHaveLength(0)
    const linhas = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM uso_ia',
    ).first<{ n: number }>()
    expect(linhas?.n).toBe(0)
  })
})
