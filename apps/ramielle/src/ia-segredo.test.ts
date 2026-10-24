/**
 * Sentinela da ANTHROPIC_API_KEY (Review Focus 3 do plano da IA): a chave não
 * pode sair pelo corpo nem pelos headers da resposta, nem pelo console, e só
 * pode viajar para api.anthropic.com.
 *
 * No PR1 nenhuma rota de produção chama a Claude ainda, então a rota abaixo
 * existe só neste teste, montada na frente do app real, e faz exatamente o
 * que as rotas dos PRs 2-4 vão fazer: `comOrcamento` + `respostaDeErroIa`.
 *
 * O `fetch` global é trocado: nenhum teste alcança a API de verdade.
 */
import { env } from 'cloudflare:test'
import { comOrcamento } from '@piluvitu/ia/uso'
import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import devVarsExemplo from '../.dev.vars.example?raw'
import wranglerJsonc from '../wrangler.jsonc?raw'
import app, { type Bindings } from './index'
import { okJson } from './lib/envelope'
import { respostaDeErroIa, TETOS_RAMIELLE } from './lib/ia'

const SENTINELA = 'SENTINELA-ia-ramielle-3e8c'
const CHAVE = `sk-ant-${SENTINELA}`

function montarApp() {
  const rotaDeTeste = new Hono<{ Bindings: Bindings }>()
  rotaDeTeste.post('/__teste/ia', async (c) => {
    try {
      const resposta = await comOrcamento(
        c.env.DB,
        {
          feature: 'revisao',
          tetoMicro: TETOS_RAMIELLE.revisao,
          apiKey: c.env.ANTHROPIC_API_KEY,
        },
        {
          modelo: 'claude-haiku-5-5',
          system: 'Responda curto.',
          user: 'oi',
          maxTokens: 100,
        },
      )
      return okJson({ texto: resposta.texto })
    } catch (err) {
      return respostaDeErroIa(err)
    }
  })
  return new Hono<{ Bindings: Bindings }>()
    .route('/', rotaDeTeste)
    .route('/', app)
}

function testEnv(extra: Partial<Bindings> = {}): Bindings {
  return {
    DB: env.DB,
    BETTER_AUTH_URL: 'http://localhost:8787',
    BETTER_AUTH_SECRET: 'a'.repeat(32),
    GOOGLE_CLIENT_ID: 'client-id-de-teste',
    GOOGLE_CLIENT_SECRET: 'client-secret-de-teste',
    ADMIN_EMAILS: 'dono@exemplo.test',
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
    const res = await montarApp().request(
      '/__teste/ia',
      { method: 'POST' },
      testEnv({ ANTHROPIC_API_KEY: CHAVE }),
    )
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
    await montarApp().request(
      '/__teste/ia',
      { method: 'POST' },
      testEnv({ ANTHROPIC_API_KEY: CHAVE }),
    )

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
    const res = await montarApp().request(
      '/__teste/ia',
      { method: 'POST' },
      testEnv(),
    )

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
