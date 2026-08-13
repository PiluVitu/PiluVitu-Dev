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

// ⚠️ M4 (revisão): a versão anterior tinha `contador++ === 0 ? ADMIN :
// ADMIN` — os dois ramos do ternário eram IDÊNTICOS, e o comentário acima
// ("e-mail único por chamada") descrevia um comportamento que o código não
// tinha. Funciona (cada `test()` cadastrando o mesmo ADMIN de novo não
// colide de verdade) por causa do `isolatedStorage` do pool de testes — o D1
// é resetado a cada teste —, não por causa do ternário morto. Removido.
async function cookieDeAdmin(): Promise<string> {
  const authDeTeste = betterAuth({
    database: DB,
    baseURL: BASE_URL_TESTE,
    secret: SECRET_TESTE,
    emailAndPassword: { enabled: true },
  })
  const cadastro = await authDeTeste.api.signUpEmail({
    body: { email: ADMIN, password: 'senha-forte-123', name: 'Dono' },
    asResponse: true,
  })
  const cookie = cadastro.headers.getSetCookie()[0]?.split(';')[0]
  if (!cookie) throw new Error('signUpEmail não devolveu cookie')
  return cookie
}

// I1 (revisão): cookie de uma conta autenticada, mas SEM privilégio de
// admin — o e-mail não está em ADMIN_EMAILS (só ADMIN está, ver testEnv()).
// A votação do ramielle é LIVRE (qualquer conta Google loga), então esta
// conta é exatamente o votante comum que não deveria conseguir queimar
// inferência no Mac do dono.
async function cookieDeNaoAdmin(): Promise<string> {
  const authDeTeste = betterAuth({
    database: DB,
    baseURL: BASE_URL_TESTE,
    secret: SECRET_TESTE,
    emailAndPassword: { enabled: true },
  })
  const cadastro = await authDeTeste.api.signUpEmail({
    body: {
      email: 'atelier-naoadmin@exemplo.test',
      password: 'senha-forte-123',
      name: 'Não Admin',
    },
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
  // I1 (revisão) — a ÚNICA barreira entre qualquer conta Google e a GPU do
  // dono é `requireAdmin`. Escrito ANTES do caminho feliz, de propósito
  // (mesmo padrão de `routes/admin.test.ts`): é este o teste que a mutação
  // obrigatória (trocar requireAdmin por requireAuth nesta rota) tem que
  // quebrar. Antes desta task, NENHUM teste provava isto — a suíte inteira
  // ficava verde com o guard trocado.
  test('conta autenticada mas não-admin responde 403 admin_only, sem chamar o promeia', async () => {
    const cookie = await cookieDeNaoAdmin()
    const vistos = mockarPromeia(() => json(200, { ok: true, data: {} }))
    const res = await chamar('/admin/llm/proofread', { text: 't' }, cookie)
    expect(res.status).toBe(403)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('admin_only')
    expect(vistos).toHaveLength(0)
  })

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
  // I1 (revisão) — mesma barreira, mesma prova por mutação que
  // `/admin/llm/proofread` acima.
  test('conta autenticada mas não-admin responde 403 admin_only, sem chamar o promeia', async () => {
    const cookie = await cookieDeNaoAdmin()
    const vistos = mockarPromeia(() => json(200, { ok: true, data: {} }))
    const res = await chamar(
      '/admin/llm/refine',
      { text: 't', platform: 'bluesky', instruction: 'x' },
      cookie,
    )
    expect(res.status).toBe(403)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('admin_only')
    expect(vistos).toHaveLength(0)
  })

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

// I2 (o achado mais grave da revisão) — o modo de falha MAIS PROVÁVEL na
// prática (túnel Cloudflare respondendo no lugar de um Mac desligado/
// travado) tem que cair no MESMO lado da §5 que o TypeError de fetch já
// cobria acima ("Mac desligado ⇒ 503 promeia_unreachable"). Antes desta
// correção, os dois cenários abaixo caíam em "RECUSOU" — a frase errada,
// medida pelo revisor com o app real.
describe('I2 — o túnel Cloudflare respondendo no lugar do promeia cai no MESMO lado da §5 que "fetch falhou"', () => {
  test('túnel caído (530, HTML) ⇒ 503 promeia_unreachable, mandando SUBIR o promeia — não RECUSOU', async () => {
    const cookie = await cookieDeAdmin()
    mockarPromeia(
      () =>
        new Response('<html><body>530</body></html>', {
          status: 530,
          headers: { 'content-type': 'text/html' },
        }),
    )
    const res = await chamar('/admin/llm/proofread', { text: 't' }, cookie)
    expect(res.status).toBe(503)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('promeia_unreachable')
    expect(body.notifications[0]?.message).toContain('Suba o promeia')
  })

  test('timeout do túnel (524) ⇒ 503 promeia_unreachable, mandando SUBIR o promeia — não RECUSOU', async () => {
    const cookie = await cookieDeAdmin()
    mockarPromeia(() => new Response('', { status: 524 }))
    const res = await chamar('/admin/llm/proofread', { text: 't' }, cookie)
    expect(res.status).toBe(503)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('promeia_unreachable')
    expect(body.notifications[0]?.message).toContain('Suba o promeia')
  })
})

// M3 — o segundo operando de `err.status >= 500 || err.status === 503` era
// inalcançável (503 já é >= 500), e `errJson(status as 502 | 503, ...)` era
// um cast que não protegia nada (`errJson` recebe `number`). Prova de que a
// simplificação continua repassando 5xx do promeia intocado e mapeando 4xx
// (um 401 dele — token do promeia desatualizado, por exemplo) pra 502, não
// pro status cru do upstream.
describe('M3 — status do PromeiaRecusou: 5xx repassado, 4xx do promeia vira 502', () => {
  test('401 do PRÓPRIO promeia (token do promeia desatualizado) mapeia pra 502, não 401', async () => {
    const cookie = await cookieDeAdmin()
    mockarPromeia(() =>
      json(401, {
        ok: false,
        code: 'invalid_promeia_token',
        message: 'token do promeia ausente ou inválido',
      }),
    )
    const res = await chamar('/admin/llm/proofread', { text: 't' }, cookie)
    expect(res.status).toBe(502)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('invalid_promeia_token')
  })

  test('502 ollama_failed do promeia é repassado como 502, intocado', async () => {
    const cookie = await cookieDeAdmin()
    mockarPromeia(() =>
      json(502, {
        ok: false,
        code: 'ollama_failed',
        message: 'o Ollama respondeu e falhou',
      }),
    )
    const res = await chamar('/admin/llm/proofread', { text: 't' }, cookie)
    expect(res.status).toBe(502)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('ollama_failed')
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
