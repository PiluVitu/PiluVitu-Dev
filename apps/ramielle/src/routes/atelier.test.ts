/**
 * Testes de `POST /admin/llm/proofread` e `/llm/refine` contra o app REAL
 * (`../index`). Mesmo padrão de `routes/admin.test.ts`: cookie de sessão
 * genuíno via uma segunda instância `betterAuth()` (emailAndPassword, técnica
 * de teste — produção é só Google).
 *
 * ⚠️ O `fetch` global é substituído nos testes que exercitam a chamada ao
 * promeia — **nenhum teste alcança o Mac de verdade**.
 */
import { env } from 'cloudflare:test'
import { betterAuth } from 'better-auth'
import { afterEach, describe, expect, test } from 'vitest'
import app, { type Bindings } from '../index'
import type { Envelope } from '../lib/envelope'

const DB = env.DB
const BASE_URL_TESTE = 'http://localhost:8787'
const SECRET_TESTE = 'a'.repeat(32)
const ADMIN = 'dono@exemplo.test'
const TOKEN_MARCADOR = 'TOKEN-PROMEIA-NAO-PODE-VAZAR-7c1b'

function testEnv(extra: Partial<Bindings> = {}): Bindings {
  return {
    DB,
    BETTER_AUTH_URL: BASE_URL_TESTE,
    BETTER_AUTH_SECRET: SECRET_TESTE,
    GOOGLE_CLIENT_ID: 'client-id-de-teste',
    GOOGLE_CLIENT_SECRET: 'client-secret-de-teste',
    ADMIN_EMAILS: ADMIN,
    PROMEIA_URL: 'https://promeia.exemplo.test',
    PROMEIA_TOKEN: TOKEN_MARCADOR,
    ...extra,
  }
}

let contador = 0
async function cookieDeAdmin(): Promise<string> {
  const authDeTeste = betterAuth({
    database: DB,
    baseURL: BASE_URL_TESTE,
    secret: SECRET_TESTE,
    emailAndPassword: { enabled: true },
  })
  // E-mail único por chamada: o mesmo admin cadastrado duas vezes falharia.
  const email = contador++ === 0 ? ADMIN : ADMIN
  const cadastro = await authDeTeste.api.signUpEmail({
    body: { email, password: 'senha-forte-123', name: 'Dono' },
    asResponse: true,
  })
  const cookie = cadastro.headers.getSetCookie()[0]?.split(';')[0]
  if (!cookie) throw new Error('signUpEmail não devolveu cookie')
  return cookie
}

const fetchOriginal = globalThis.fetch
afterEach(() => {
  globalThis.fetch = fetchOriginal
})

function mockarPromeia(responder: () => Response | Promise<Response>) {
  const vistos: RequestInit[] = []
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    if (String(url).startsWith('https://promeia.exemplo.test')) {
      vistos.push(init)
      return responder()
    }
    throw new Error(`promeia chamado sem mock: ${url}`)
  }) as unknown as typeof fetch
  return vistos
}

function json(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

async function chamar(
  caminho: string,
  corpo: unknown,
  cookie: string,
  ambiente = testEnv(),
) {
  return app.request(
    caminho,
    {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify(corpo),
    },
    ambiente,
  )
}

describe('POST /admin/llm/proofread', () => {
  test('caminho feliz devolve corrected no envelope', async () => {
    const cookie = await cookieDeAdmin()
    mockarPromeia(() => json(200, { ok: true, data: { corrected: 'Olá.' } }))

    const res = await chamar('/admin/llm/proofread', { text: 'Ola.' }, cookie)
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<{ corrected: string }>
    expect(body.ok).toBe(true)
    expect(body.data?.corrected).toBe('Olá.')
  })

  test('repassa o careful pro promeia', async () => {
    const cookie = await cookieDeAdmin()
    const vistos = mockarPromeia(() =>
      json(200, { ok: true, data: { corrected: 'x' } }),
    )
    await chamar('/admin/llm/proofread', { text: 't', careful: true }, cookie)
    expect(JSON.parse(vistos[0]?.body as string)).toEqual({
      text: 't',
      careful: true,
    })
  })

  test('text vazio dá 400 com a mensagem do Go, sem chamar o promeia', async () => {
    const cookie = await cookieDeAdmin()
    const vistos = mockarPromeia(() => json(200, { ok: true, data: {} }))
    const res = await chamar('/admin/llm/proofread', { text: '' }, cookie)
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('invalid_json')
    expect(body.notifications[0]?.message).toBe(
      "Corpo inválido: 'text' é obrigatório.",
    )
    expect(vistos).toHaveLength(0)
  })
})

describe('POST /admin/llm/refine', () => {
  test('caminho feliz devolve refined', async () => {
    const cookie = await cookieDeAdmin()
    mockarPromeia(() => json(200, { ok: true, data: { refined: 'curto' } }))
    const res = await chamar(
      '/admin/llm/refine',
      { platform: 'bluesky', text: 'longo', instruction: 'encurta' },
      cookie,
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<{ refined: string }>
    expect(body.data?.refined).toBe('curto')
  })
})

describe('degradação — os DOIS casos da §5 do spec, com frases diferentes', () => {
  test('Mac desligado ⇒ 503 promeia_unreachable, mandando SUBIR o promeia', async () => {
    const cookie = await cookieDeAdmin()
    mockarPromeia(() => {
      throw new TypeError('fetch failed')
    })
    const res = await chamar('/admin/llm/proofread', { text: 't' }, cookie)
    expect(res.status).toBe(503)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('promeia_unreachable')
    expect(body.notifications[0]?.message).toContain('Suba o promeia')
  })

  test('Mac de pé mas Ollama sem o modelo ⇒ repassa o code E a mensagem acionável', async () => {
    // ⚠️ É o ponto da §5: mandar subir algo que já está de pé faz perder tempo
    // no lugar errado. A mensagem do promeia cita o comando exato.
    const cookie = await cookieDeAdmin()
    mockarPromeia(() =>
      json(503, {
        ok: false,
        code: 'ollama_model_missing',
        message: "modelo 'qwen' não instalado. Instale com: ollama pull qwen",
      }),
    )
    const res = await chamar('/admin/llm/proofread', { text: 't' }, cookie)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('ollama_model_missing')
    expect(body.notifications[0]?.message).toContain('ollama pull qwen')
    // E NUNCA manda subir o promeia — ele está de pé.
    expect(body.notifications[0]?.message).not.toContain('Suba o promeia')
  })

  test('sem PROMEIA_URL/TOKEN a feature está DESLIGADA (503), não quebrada', async () => {
    const cookie = await cookieDeAdmin()
    const res = await chamar(
      '/admin/llm/proofread',
      { text: 't' },
      cookie,
      testEnv({ PROMEIA_URL: '', PROMEIA_TOKEN: '' }),
    )
    expect(res.status).toBe(503)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('promeia_disabled')
  })
})

describe('o PROMEIA_TOKEN nunca chega ao navegador', () => {
  test('não aparece na resposta em nenhum dos caminhos de erro', async () => {
    const cookie = await cookieDeAdmin()
    const cenarios: Array<() => Response | Promise<Response>> = [
      () => {
        throw new TypeError('fetch failed')
      },
      () => json(500, { ok: false, code: 'x', message: 'falhou' }),
      () => new Response('erro cru', { status: 502 }),
    ]
    for (const responder of cenarios) {
      mockarPromeia(responder)
      const res = await chamar('/admin/llm/proofread', { text: 't' }, cookie)
      expect(await res.text()).not.toContain(TOKEN_MARCADOR)
    }
  })
})
