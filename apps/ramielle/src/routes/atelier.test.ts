/**
 * Testes de `POST /admin/llm/proofread` e `/llm/refine` contra o app REAL
 * (`../index`). Mesmo padrão de `routes/admin.test.ts`: cookie de sessão
 * genuíno via uma segunda instância `betterAuth()` (emailAndPassword, técnica
 * de teste — produção é só Google).
 *
 * O `fetch` global é trocado pelo da Anthropic falsa
 * (`test-support/anthropic-mock.ts`): nenhum teste alcança a API real.
 */
import { env } from 'cloudflare:test'
import { betterAuth } from 'better-auth'
import { mesFortaleza } from '@piluvitu/ia/uso'
import { afterEach, describe, expect, test, vi } from 'vitest'
import app, { type Bindings } from '../index'
import type { Envelope } from '../lib/envelope'
import { TETOS_RAMIELLE } from '../lib/ia'
import {
  blocosDoPedido,
  erroClaude,
  mockarAnthropic,
  respostaClaude,
  responderLote,
  type PedidoAnthropic,
} from '../test-support/anthropic-mock'
import {
  MAX_LOTES_PROOFREAD,
  TETO_CARACTERES_BLOCO,
  TETO_CARACTERES_LOTE,
} from '../domain/revisao/revisao'
import {
  MAX_CARACTERES_CORPO_RESUMO,
  MAX_CARACTERES_TITULO_RESUMO,
  MAX_TOKENS_RESUMO,
  TETO_CARACTERES_RESUMO,
} from '../domain/revisao/resumo'

const DB = env.DB
const BASE_URL_TESTE = 'http://localhost:8787'
const SECRET_TESTE = 'a'.repeat(32)
const ADMIN = 'dono@exemplo.test'
const SENTINELA = 'SENTINELA-atelier-9d2f'
const CHAVE = `sk-ant-${SENTINELA}`

function testEnv(extra: Partial<Bindings> = {}): Bindings {
  return {
    DB,
    BETTER_AUTH_URL: BASE_URL_TESTE,
    BETTER_AUTH_SECRET: SECRET_TESTE,
    GOOGLE_CLIENT_ID: 'client-id-de-teste',
    GOOGLE_CLIENT_SECRET: 'client-secret-de-teste',
    ADMIN_EMAILS: ADMIN,
    ANTHROPIC_API_KEY: CHAVE,
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
// orçamento de IA do dono.
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

afterEach(() => {
  vi.restoreAllMocks()
})

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

async function encherTeto(feature: 'revisao' | 'hooks' | 'resumo') {
  await DB.prepare(
    `INSERT INTO uso_ia (id, feature, mes, modelo, estado, reservado_micro, custo_micro, criado_em)
     VALUES (?, ?, ?, 'claude-sonnet-5-5', 'concluido', 0, ?, '2026-10-01T00:00:00Z')`,
  )
    .bind(`cheio-${feature}`, feature, mesFortaleza(), TETOS_RAMIELLE[feature])
    .run()
}

describe('POST /admin/llm/proofread', () => {
  // A única barreira entre qualquer conta Google e o orçamento de IA é
  // `requireAdmin`: trocar por requireAuth tem que quebrar este teste.
  test('conta autenticada mas não-admin responde 403 admin_only, sem chamar a Claude', async () => {
    const cookie = await cookieDeNaoAdmin()
    const pedidos = mockarAnthropic(() => respostaClaude('x'))
    const res = await chamar('/admin/llm/proofread', { text: 't' }, cookie)
    expect(res.status).toBe(403)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('admin_only')
    expect(pedidos).toHaveLength(0)
  })

  test('caminho feliz devolve corrected no envelope', async () => {
    const cookie = await cookieDeAdmin()
    mockarAnthropic(responderLote(() => 'Olá.'))

    const res = await chamar('/admin/llm/proofread', { text: 'Ola.' }, cookie)
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<{ corrected: string }>
    expect(body.ok).toBe(true)
    expect(body.data?.corrected).toBe('Olá.')
  })

  test('manda ao Sonnet, com o prompt de revisão, maxTokens 4096, o lote em JSON e sem temperature', async () => {
    const cookie = await cookieDeAdmin()
    const pedidos = mockarAnthropic(responderLote((b) => b))
    await chamar('/admin/llm/proofread', { text: 'texto\n' }, cookie)
    expect(pedidos).toHaveLength(1)
    expect(pedidos[0]?.model).toBe('claude-sonnet-5-5')
    expect(pedidos[0]?.max_tokens).toBe(4096)
    expect(pedidos[0]?.messages).toEqual([
      { role: 'user', content: JSON.stringify({ blocos: ['texto\n'] }) },
    ])
    expect(pedidos[0]?.output_config).toEqual({
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: { blocos: { type: 'array', items: { type: 'string' } } },
          required: ['blocos'],
          additionalProperties: false,
        },
      },
    })
    expect(pedidos[0]).not.toHaveProperty('temperature')
    expect(pedidos[0]).not.toHaveProperty('thinking')
  })

  test('careful é ignorado: continua Sonnet', async () => {
    const cookie = await cookieDeAdmin()
    const pedidos = mockarAnthropic(responderLote((b) => b))
    const res = await chamar(
      '/admin/llm/proofread',
      { text: 't', careful: true },
      cookie,
    )
    expect(res.status).toBe(200)
    expect(pedidos.map((p) => p.model)).toEqual(['claude-sonnet-5-5'])
  })

  test('cerca não fechada, tabela e JSX voltam byte a byte e nunca chegam à Claude', async () => {
    const cookie = await cookieDeAdmin()
    const tabela = '| col | outra |\n|---|---|\n| x | y |\n'
    const jsx = '<Aviso tipo="info">\n  nao corrija isto\n</Aviso>\n'
    const cercaAberta = '```ts\nconst naoFechada = 1\n\nmais codigo sem fim\n'
    const texto = `Paragrafo um.\n\n${tabela}\n${jsx}\nParagrafo dois.\n\n${cercaAberta}`
    const pedidos = mockarAnthropic(
      responderLote((b) => `CORRIGIDO(${b.trim()})`),
    )

    const res = await chamar('/admin/llm/proofread', { text: texto }, cookie)
    const body = (await res.json()) as Envelope<{ corrected: string }>

    expect(body.data?.corrected).toBe(
      `CORRIGIDO(Paragrafo um.)\n\n${tabela}\n${jsx}\nCORRIGIDO(Paragrafo dois.)\n\n${cercaAberta}`,
    )
    expect(pedidos.map(blocosDoPedido)).toEqual([
      ['Paragrafo um.\n', 'Paragrafo dois.\n'],
    ])
  })

  test('text vazio dá 400 com a mensagem do Go, sem chamar a Claude', async () => {
    const cookie = await cookieDeAdmin()
    const pedidos = mockarAnthropic(() => respostaClaude('x'))
    const res = await chamar('/admin/llm/proofread', { text: '' }, cookie)
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('invalid_json')
    expect(body.notifications[0]?.message).toBe(
      "Corpo inválido: 'text' é obrigatório.",
    )
    expect(pedidos).toHaveLength(0)
  })
})

// O plano Free do Workers corta em 50 subrequests (fetch externo) por request,
// e cada chamada lógica à Claude pode virar 2 fetches (maxRetries: 1 da SDK).
// O mock registra um pedido por fetch, inclusive os que respondem 529.
const LIMITE_SUBREQUESTS = 50

function falhaNaPrimeiraTentativa(
  responder: (pedido: PedidoAnthropic) => Response,
): (pedido: PedidoAnthropic) => Response {
  let tentativa = 0
  return (pedido) =>
    tentativa++ % 2 === 0
      ? erroClaude(529, 'overloaded_error')
      : responder(pedido)
}

function artigoComSessentaBlocos() {
  const tabela = '| col | outra |\n|---|---|\n| x | y |\n'
  const partes: string[] = []
  const corrigidas: string[] = []
  const paragrafos: string[] = []
  const passthrough: string[] = []
  for (let i = 0; i < 60; i++) {
    const paragrafo = `Paragrafo ${i} com acentuaçao errada. ${'texto '.repeat(30).trim()}\n`
    paragrafos.push(paragrafo)
    partes.push(paragrafo)
    corrigidas.push(`CORRIGIDO(${i})\n`)
    let extra: string | null = null
    if (i % 10 === 4) extra = '```ts\nconst bloco = ' + i + '\n```\n'
    if (i === 30) extra = tabela
    if (extra !== null) {
      passthrough.push(extra)
      partes.push(extra)
      corrigidas.push(extra)
    }
  }
  return {
    texto: partes.join('\n'),
    esperado: corrigidas.join('\n'),
    paragrafos,
    passthrough,
  }
}

describe('POST /admin/llm/proofread em lotes (limite de subrequests)', () => {
  test('artigo com 60 blocos de prosa, cercas e tabela: poucos pedidos, correções na ordem e passthrough idêntico', async () => {
    const cookie = await cookieDeAdmin()
    const { texto, esperado, paragrafos, passthrough } =
      artigoComSessentaBlocos()
    const pedidos = mockarAnthropic(
      responderLote((b) => `CORRIGIDO(${b.split(' ')[1]})`),
    )

    const res = await chamar('/admin/llm/proofread', { text: texto }, cookie)
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<{ corrected: string }>
    expect(body.data?.corrected).toBe(esperado)

    expect(pedidos.length).toBeGreaterThan(1)
    expect(pedidos.length).toBeLessThanOrEqual(4)
    expect(pedidos.flatMap(blocosDoPedido)).toEqual(paragrafos)
    for (const pedido of pedidos) {
      for (const trecho of passthrough) {
        expect(pedido.messages[0]?.content).not.toContain(
          JSON.stringify(trecho).slice(1, -1),
        )
      }
    }
  })

  test(`pior caso: ${MAX_LOTES_PROOFREAD} lotes com retry em todos fica abaixo de ${LIMITE_SUBREQUESTS} fetches`, async () => {
    const cookie = await cookieDeAdmin()
    const grande = `${'x'.repeat(TETO_CARACTERES_LOTE)}\n`
    const texto = Array.from(
      { length: MAX_LOTES_PROOFREAD },
      () => grande,
    ).join('\n')
    const pedidos = mockarAnthropic(
      falhaNaPrimeiraTentativa(responderLote((b) => b)),
    )

    const res = await chamar('/admin/llm/proofread', { text: texto }, cookie)
    expect(res.status).toBe(200)
    expect(pedidos).toHaveLength(2 * MAX_LOTES_PROOFREAD)
    expect(pedidos.length).toBeLessThanOrEqual(LIMITE_SUBREQUESTS / 2)
  })

  test(`acima de ${MAX_LOTES_PROOFREAD} lotes ⇒ 413 text_too_large com mensagem acionável, sem chamar a Claude`, async () => {
    const cookie = await cookieDeAdmin()
    const grande = `${'x'.repeat(TETO_CARACTERES_LOTE)}\n`
    const texto = Array.from(
      { length: MAX_LOTES_PROOFREAD + 1 },
      () => grande,
    ).join('\n')
    const pedidos = mockarAnthropic(responderLote((b) => b))

    const res = await chamar('/admin/llm/proofread', { text: texto }, cookie)
    expect(res.status).toBe(413)
    const body = (await res.json()) as Envelope<null>
    expect(body.ok).toBe(false)
    expect(body.data).toBeNull()
    expect(body.notifications[0]?.code).toBe('text_too_large')
    expect(body.notifications[0]?.message).toContain('em partes')
    expect(pedidos).toHaveLength(0)
  })

  test('resposta com número de blocos diferente ⇒ 502 claude_recusou de formato, sem texto parcial', async () => {
    const cookie = await cookieDeAdmin()
    mockarAnthropic((p) =>
      respostaClaude(
        JSON.stringify({
          blocos: blocosDoPedido(p)
            .slice(1)
            .map((b) => `CORRIGIDO ${b}`),
        }),
      ),
    )

    const res = await chamar(
      '/admin/llm/proofread',
      { text: 'Um.\n\nDois.\n\nTrês.\n' },
      cookie,
    )
    expect(res.status).toBe(502)
    const cru = await res.text()
    const body = JSON.parse(cru) as Envelope<null>
    expect(body.data).toBeNull()
    expect(body.notifications[0]?.code).toBe('claude_recusou')
    expect(body.notifications[0]?.message).toContain('fora do formato')
    expect(cru).not.toContain('CORRIGIDO')
  })

  test('o primeiro lote certo e o segundo com contagem errada ⇒ 502, nada do primeiro é devolvido', async () => {
    const cookie = await cookieDeAdmin()
    const grande = `${'x'.repeat(TETO_CARACTERES_LOTE)}\n`
    let lote = 0
    const pedidos = mockarAnthropic((p) => {
      const blocos = blocosDoPedido(p)
      const saida =
        lote++ === 0 ? blocos.map(() => 'CORRIGIDO') : [...blocos, 'extra']
      return respostaClaude(JSON.stringify({ blocos: saida }))
    })

    const res = await chamar(
      '/admin/llm/proofread',
      { text: `${grande}\n${grande}` },
      cookie,
    )
    expect(pedidos).toHaveLength(2)
    expect(res.status).toBe(502)
    const cru = await res.text()
    expect((JSON.parse(cru) as Envelope<null>).notifications[0]?.code).toBe(
      'claude_recusou',
    )
    expect(cru).not.toContain('CORRIGIDO')
  })

  test('um item vazio com a contagem certa ⇒ 502 claude_recusou de formato, sem texto', async () => {
    const cookie = await cookieDeAdmin()
    mockarAnthropic((p) =>
      respostaClaude(
        JSON.stringify({
          blocos: blocosDoPedido(p).map((b, i) =>
            i === 1 ? '   ' : `CORRIGIDO ${b}`,
          ),
        }),
      ),
    )

    const res = await chamar(
      '/admin/llm/proofread',
      {
        text: '# Título\n\nPrimeiro parágrafo com erro.\n\nSegundo parágrafo.\n',
      },
      cookie,
    )
    expect(res.status).toBe(502)
    const cru = await res.text()
    const body = JSON.parse(cru) as Envelope<null>
    expect(body.data).toBeNull()
    expect(body.notifications[0]?.code).toBe('claude_recusou')
    expect(body.notifications[0]?.message).toContain('fora do formato')
    expect(cru).not.toContain('CORRIGIDO')
  })

  test('um bloco de prosa acima de TETO_CARACTERES_BLOCO ⇒ 413 text_too_large, sem chamar a Claude nem gravar em uso_ia', async () => {
    const cookie = await cookieDeAdmin()
    const pedidos = mockarAnthropic(responderLote((b) => b))
    const antes = await DB.prepare('SELECT COUNT(*) AS n FROM uso_ia').first<{
      n: number
    }>()

    const res = await chamar(
      '/admin/llm/proofread',
      { text: `Curto.\n\n${'x'.repeat(TETO_CARACTERES_BLOCO + 1)}\n` },
      cookie,
    )
    expect(res.status).toBe(413)
    const body = (await res.json()) as Envelope<null>
    expect(body.data).toBeNull()
    expect(body.notifications[0]?.code).toBe('text_too_large')
    expect(body.notifications[0]?.message).toContain('em partes')
    expect(pedidos).toHaveLength(0)
    const depois = await DB.prepare('SELECT COUNT(*) AS n FROM uso_ia').first<{
      n: number
    }>()
    expect(depois?.n).toBe(antes?.n)
  })

  test('resposta em JSON ilegível ⇒ 502 claude_recusou de formato, sem texto', async () => {
    const cookie = await cookieDeAdmin()
    mockarAnthropic(() => respostaClaude('Um corrigido.\n\nDois corrigido.'))

    const res = await chamar(
      '/admin/llm/proofread',
      { text: 'Um.\n\nDois.\n' },
      cookie,
    )
    expect(res.status).toBe(502)
    const cru = await res.text()
    const body = JSON.parse(cru) as Envelope<null>
    expect(body.data).toBeNull()
    expect(body.notifications[0]?.code).toBe('claude_recusou')
    expect(body.notifications[0]?.message).toContain('fora do formato')
    expect(cru).not.toContain('corrigido')
  })
})

describe('POST /admin/llm/refine: pior caso de subrequests', () => {
  test(`refine e encurtamento, os dois com retry, ficam em 4 fetches (limite ${LIMITE_SUBREQUESTS})`, async () => {
    const cookie = await cookieDeAdmin()
    const pedidos = mockarAnthropic(
      falhaNaPrimeiraTentativa(() => respostaClaude('palavra '.repeat(60))),
    )

    const res = await chamar(
      '/admin/llm/refine',
      { platform: 'bluesky', text: 'texto', instruction: 'x' },
      cookie,
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<{ refined: string }>
    expect(Array.from(body.data?.refined ?? '').length).toBeLessThanOrEqual(300)
    expect(pedidos).toHaveLength(4)
    expect(pedidos.length).toBeLessThan(LIMITE_SUBREQUESTS)
  })
})

describe('POST /admin/llm/refine', () => {
  test('conta autenticada mas não-admin responde 403 admin_only, sem chamar a Claude', async () => {
    const cookie = await cookieDeNaoAdmin()
    const pedidos = mockarAnthropic(() => respostaClaude('x'))
    const res = await chamar(
      '/admin/llm/refine',
      { text: 't', platform: 'bluesky', instruction: 'x' },
      cookie,
    )
    expect(res.status).toBe(403)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('admin_only')
    expect(pedidos).toHaveLength(0)
  })

  test('caminho feliz devolve refined, pelo Haiku e sem temperature', async () => {
    const cookie = await cookieDeAdmin()
    const pedidos = mockarAnthropic(() => respostaClaude('curto'))
    const res = await chamar(
      '/admin/llm/refine',
      { platform: 'bluesky', text: 'longo', instruction: 'encurta' },
      cookie,
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<{ refined: string }>
    expect(body.data?.refined).toBe('curto')
    expect(pedidos.map((p) => p.model)).toEqual(['claude-haiku-5-5'])
    expect(pedidos[0]).not.toHaveProperty('temperature')
    expect(pedidos[0]?.messages[0]?.content).toContain(
      'Plataforma: bluesky (limite 300 chars)',
    )
  })

  test('text vazio dá 400, sem chamar a Claude', async () => {
    const cookie = await cookieDeAdmin()
    const pedidos = mockarAnthropic(() => respostaClaude('x'))
    const res = await chamar('/admin/llm/refine', { text: '' }, cookie)
    expect(res.status).toBe(400)
    expect(pedidos).toHaveLength(0)
  })
})

describe('falhas da Claude viram o envelope de erro da IA', () => {
  test('sem ANTHROPIC_API_KEY ⇒ 503 claude_desligado, sem chamar a API', async () => {
    const cookie = await cookieDeAdmin()
    const pedidos = mockarAnthropic(() => respostaClaude('x'))
    for (const caminho of ['/admin/llm/proofread', '/admin/llm/refine']) {
      const res = await chamar(
        caminho,
        { text: 't' },
        cookie,
        testEnv({ ANTHROPIC_API_KEY: undefined }),
      )
      expect(res.status).toBe(503)
      const body = (await res.json()) as Envelope<null>
      expect(body.notifications[0]?.code).toBe('claude_desligado')
    }
    expect(pedidos).toHaveLength(0)
  })

  test('529 (overloaded) ⇒ 503 claude_indisponivel', async () => {
    const cookie = await cookieDeAdmin()
    mockarAnthropic(() => erroClaude(529, 'overloaded_error'))
    for (const caminho of ['/admin/llm/proofread', '/admin/llm/refine']) {
      const res = await chamar(caminho, { text: 't' }, cookie)
      expect(res.status).toBe(503)
      const body = (await res.json()) as Envelope<null>
      expect(body.notifications[0]?.code).toBe('claude_indisponivel')
    }
  })

  test('teto da revisão atingido ⇒ 429 teto_atingido, sem chamar a API', async () => {
    const cookie = await cookieDeAdmin()
    await encherTeto('revisao')
    const pedidos = mockarAnthropic(() => respostaClaude('x'))
    const res = await chamar('/admin/llm/proofread', { text: 't' }, cookie)
    expect(res.status).toBe(429)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('teto_atingido')
    expect(pedidos).toHaveLength(0)
  })

  test('o refine conta no teto de hooks, não no da revisão', async () => {
    const cookie = await cookieDeAdmin()
    await encherTeto('hooks')
    mockarAnthropic((p) =>
      p.model === 'claude-sonnet-5-5'
        ? responderLote((b) => b)(p)
        : respostaClaude('x'),
    )
    const refine = await chamar(
      '/admin/llm/refine',
      { text: 't', platform: 'bluesky' },
      cookie,
    )
    expect(refine.status).toBe(429)
    const proofread = await chamar(
      '/admin/llm/proofread',
      { text: 't' },
      cookie,
    )
    expect(proofread.status).toBe(200)
  })

  test('a chave não aparece na resposta em nenhum caminho de erro', async () => {
    const cookie = await cookieDeAdmin()
    const respostas = [
      () => erroClaude(401, 'authentication_error'),
      () => erroClaude(529, 'overloaded_error'),
      () => respostaClaude('', { stop_reason: 'max_tokens' }),
    ]
    for (const responder of respostas) {
      vi.restoreAllMocks()
      mockarAnthropic(responder)
      const res = await chamar('/admin/llm/proofread', { text: 't' }, cookie)
      expect(res.status).toBeGreaterThanOrEqual(500)
      expect(await res.text()).not.toContain(SENTINELA)
      for (const [nome, valor] of res.headers) {
        expect(`${nome}: ${valor}`).not.toContain(SENTINELA)
      }
    }
  })
})

describe('POST /admin/llm/resumo', () => {
  const RESUMO = {
    tldr: 'Contei como levei a revisão de posts para a Claude dentro do Worker.',
    metaDescription:
      'Como a revisão de posts do blog saiu do Mac e foi para a Claude num Worker da Cloudflare.',
    tags: ['cloudflare', 'claude'],
  }
  const responderResumo = () => respostaClaude(JSON.stringify(RESUMO))

  test('sem sessão ⇒ 401 not_authenticated, sem chamar a Claude', async () => {
    const pedidos = mockarAnthropic(responderResumo)
    const res = await app.request(
      '/admin/llm/resumo',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'T', body: 'Prosa.' }),
      },
      testEnv(),
    )
    expect(res.status).toBe(401)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('not_authenticated')
    expect(pedidos).toHaveLength(0)
  })

  test('conta autenticada mas não-admin ⇒ 403 admin_only, sem chamar a Claude', async () => {
    const cookie = await cookieDeNaoAdmin()
    const pedidos = mockarAnthropic(responderResumo)
    const res = await chamar(
      '/admin/llm/resumo',
      { title: 'T', body: 'Prosa.' },
      cookie,
    )
    expect(res.status).toBe(403)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('admin_only')
    expect(pedidos).toHaveLength(0)
  })

  test('caminho feliz: 200 com {tldr, metaDescription, tags}, pelo Haiku, com json_schema e sem temperature/thinking', async () => {
    const cookie = await cookieDeAdmin()
    const pedidos = mockarAnthropic(responderResumo)
    const res = await chamar(
      '/admin/llm/resumo',
      {
        title: 'Claude no Worker',
        body: 'Um parágrafo.\n\n```ts\nconst x = 1\n```\n',
      },
      cookie,
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<typeof RESUMO>
    expect(body.ok).toBe(true)
    expect(body.data).toEqual(RESUMO)
    expect(pedidos).toHaveLength(1)
    const pedido = pedidos[0] as PedidoAnthropic
    expect(pedido.model).toBe('claude-haiku-5-5')
    expect(pedido.max_tokens).toBe(MAX_TOKENS_RESUMO)
    expect(pedido).not.toHaveProperty('temperature')
    expect(pedido).not.toHaveProperty('thinking')
    expect(pedido.output_config).toMatchObject({
      format: { type: 'json_schema' },
    })
    expect(pedido.messages[0]?.content).toContain('Um parágrafo.')
    expect(pedido.messages[0]?.content).not.toContain('const x = 1')
  })

  test('registra o uso na feature resumo', async () => {
    const cookie = await cookieDeAdmin()
    mockarAnthropic(responderResumo)
    await chamar('/admin/llm/resumo', { title: 'T', body: 'Prosa.' }, cookie)
    const linhas = await DB.prepare(
      `SELECT feature, modelo, estado FROM uso_ia`,
    ).all()
    expect(linhas.results).toEqual([
      { feature: 'resumo', modelo: 'claude-haiku-5-5', estado: 'concluido' },
    ])
  })

  test.each([
    [
      'metaDescription com 161 caracteres',
      JSON.stringify({ ...RESUMO, metaDescription: 'm'.repeat(161) }),
    ],
    ['tag "Next JS"', JSON.stringify({ ...RESUMO, tags: ['Next JS'] })],
    ['campo extra', JSON.stringify({ ...RESUMO, extra: 1 })],
    ['JSON quebrado', '{"tldr": "corta'],
  ])('%s ⇒ 502 claude_recusou, sem data', async (_, texto) => {
    const cookie = await cookieDeAdmin()
    mockarAnthropic(() => respostaClaude(texto))
    const res = await chamar(
      '/admin/llm/resumo',
      { title: 'T', body: 'Prosa.' },
      cookie,
    )
    expect(res.status).toBe(502)
    const body = (await res.json()) as Envelope<null>
    expect(body.ok).toBe(false)
    expect(body.data ?? null).toBeNull()
    expect(body.notifications[0]?.code).toBe('claude_recusou')
  })

  test('stop_reason max_tokens ⇒ 502 claude_recusou, mesmo com um JSON que parece válido', async () => {
    const cookie = await cookieDeAdmin()
    mockarAnthropic(() =>
      respostaClaude(JSON.stringify(RESUMO), { stop_reason: 'max_tokens' }),
    )
    const res = await chamar(
      '/admin/llm/resumo',
      { title: 'T', body: 'Prosa.' },
      cookie,
    )
    expect(res.status).toBe(502)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('claude_recusou')
  })

  test('sem ANTHROPIC_API_KEY ⇒ 503 claude_desligado, sem chamar a API nem gravar uso', async () => {
    const cookie = await cookieDeAdmin()
    const pedidos = mockarAnthropic(responderResumo)
    const res = await chamar(
      '/admin/llm/resumo',
      { title: 'T', body: 'Prosa.' },
      cookie,
      testEnv({ ANTHROPIC_API_KEY: undefined }),
    )
    expect(res.status).toBe(503)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('claude_desligado')
    expect(pedidos).toHaveLength(0)
    const uso = await DB.prepare('SELECT COUNT(*) AS n FROM uso_ia').first()
    expect(uso).toEqual({ n: 0 })
  })

  test('teto do resumo atingido ⇒ 429 teto_atingido, sem chamar a API', async () => {
    const cookie = await cookieDeAdmin()
    await encherTeto('resumo')
    const pedidos = mockarAnthropic(responderResumo)
    const res = await chamar(
      '/admin/llm/resumo',
      { title: 'T', body: 'Prosa.' },
      cookie,
    )
    expect(res.status).toBe(429)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('teto_atingido')
    expect(pedidos).toHaveLength(0)
  })

  test('o teto do resumo é só dele: com o de hooks cheio, o resumo passa', async () => {
    const cookie = await cookieDeAdmin()
    await encherTeto('hooks')
    mockarAnthropic(responderResumo)
    const res = await chamar(
      '/admin/llm/resumo',
      { title: 'T', body: 'Prosa.' },
      cookie,
    )
    expect(res.status).toBe(200)
  })

  test.each([
    ['sem body', { title: 'T' }],
    ['body vazio', { title: 'T', body: '' }],
    ['body que não é string', { title: 'T', body: 1 }],
    ['title que não é string', { title: 1, body: 'Prosa.' }],
    [
      'title acima do máximo',
      { title: 't'.repeat(MAX_CARACTERES_TITULO_RESUMO + 1), body: 'Prosa.' },
    ],
  ])('%s ⇒ 400 invalid_json, sem chamar a Claude', async (_, corpo) => {
    const cookie = await cookieDeAdmin()
    const pedidos = mockarAnthropic(responderResumo)
    const res = await chamar('/admin/llm/resumo', corpo, cookie)
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('invalid_json')
    expect(pedidos).toHaveLength(0)
  })

  test('JSON ilegível no corpo ⇒ 400 invalid_json', async () => {
    const cookie = await cookieDeAdmin()
    const res = await app.request(
      '/admin/llm/resumo',
      {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: '{',
      },
      testEnv(),
    )
    expect(res.status).toBe(400)
  })

  test(`body acima de ${MAX_CARACTERES_CORPO_RESUMO} caracteres ⇒ 413 text_too_large, sem chamar a Claude nem gravar uso`, async () => {
    const cookie = await cookieDeAdmin()
    const pedidos = mockarAnthropic(responderResumo)
    const res = await chamar(
      '/admin/llm/resumo',
      { title: 'T', body: 'a'.repeat(MAX_CARACTERES_CORPO_RESUMO + 1) },
      cookie,
    )
    expect(res.status).toBe(413)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('text_too_large')
    expect(pedidos).toHaveLength(0)
    const uso = await DB.prepare('SELECT COUNT(*) AS n FROM uso_ia').first()
    expect(uso).toEqual({ n: 0 })
  })

  test(`primeiro parágrafo acima de ${TETO_CARACTERES_RESUMO} caracteres ⇒ 413 text_too_large, sem chamar a Claude`, async () => {
    const cookie = await cookieDeAdmin()
    const pedidos = mockarAnthropic(responderResumo)
    const res = await chamar(
      '/admin/llm/resumo',
      { title: 'T', body: 'p'.repeat(TETO_CARACTERES_RESUMO + 1) },
      cookie,
    )
    expect(res.status).toBe(413)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('text_too_large')
    expect(body.notifications[0]?.message).toContain('24 mil')
    expect(pedidos).toHaveLength(0)
  })

  test('artigo só com código ⇒ 422 sem_prosa, sem chamar a Claude', async () => {
    const cookie = await cookieDeAdmin()
    const pedidos = mockarAnthropic(responderResumo)
    const res = await chamar(
      '/admin/llm/resumo',
      { title: 'T', body: '```ts\nconst so = "codigo"\n```\n' },
      cookie,
    )
    expect(res.status).toBe(422)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('sem_prosa')
    expect(pedidos).toHaveLength(0)
  })

  test(`pior caso de subrequests: o maior corpo aceito, com 529 na 1ª tentativa, fica em 2 fetches (limite ${LIMITE_SUBREQUESTS})`, async () => {
    const cookie = await cookieDeAdmin()
    const paragrafo = `${'palavra '.repeat(120).trim()}\n\n`
    const corpoMaximo = paragrafo
      .repeat(Math.ceil(MAX_CARACTERES_CORPO_RESUMO / paragrafo.length))
      .slice(0, MAX_CARACTERES_CORPO_RESUMO)
    expect(corpoMaximo.length).toBe(MAX_CARACTERES_CORPO_RESUMO)
    const pedidos = mockarAnthropic(falhaNaPrimeiraTentativa(responderResumo))

    const res = await chamar(
      '/admin/llm/resumo',
      { title: 't'.repeat(MAX_CARACTERES_TITULO_RESUMO), body: corpoMaximo },
      cookie,
    )
    expect(res.status).toBe(200)
    expect(pedidos).toHaveLength(2)
    expect(pedidos.length).toBeLessThan(LIMITE_SUBREQUESTS)
    expect((pedidos[1]?.messages[0]?.content ?? '').length).toBeLessThanOrEqual(
      TETO_CARACTERES_RESUMO + MAX_CARACTERES_TITULO_RESUMO + 200,
    )
  })

  test('529 nas duas tentativas ⇒ 503 claude_indisponivel em 2 fetches', async () => {
    const cookie = await cookieDeAdmin()
    const pedidos = mockarAnthropic(() => erroClaude(529, 'overloaded_error'))
    const res = await chamar(
      '/admin/llm/resumo',
      { title: 'T', body: 'Prosa.' },
      cookie,
    )
    expect(res.status).toBe(503)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('claude_indisponivel')
    expect(pedidos).toHaveLength(2)
  })

  test('a chave não aparece na resposta em nenhum caminho de erro', async () => {
    const cookie = await cookieDeAdmin()
    const respostas = [
      () => erroClaude(401, 'authentication_error'),
      () => erroClaude(529, 'overloaded_error'),
      () => respostaClaude('', { stop_reason: 'max_tokens' }),
      () => respostaClaude('{"tldr": 1}'),
    ]
    for (const responder of respostas) {
      vi.restoreAllMocks()
      mockarAnthropic(responder)
      const res = await chamar(
        '/admin/llm/resumo',
        { title: 'T', body: 'Prosa.' },
        cookie,
      )
      expect(res.status).toBeGreaterThanOrEqual(500)
      expect(await res.text()).not.toContain(SENTINELA)
      for (const [nome, valor] of res.headers) {
        expect(`${nome}: ${valor}`).not.toContain(SENTINELA)
      }
    }
  })
})
