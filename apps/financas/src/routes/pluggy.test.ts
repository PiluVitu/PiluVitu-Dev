import { Hono } from 'hono'
import { afterEach, describe, expect, it } from 'vitest'
import { errJson } from '../lib/envelope'
import { MAX_PAGINAS, PAGE_SIZE } from '../lib/pluggy'
import {
  CHAVE_ITEM_PLUGGY,
  MSG_AGUARDANDO_AUTORIZACAO,
  pluggyRoutes,
} from './pluggy'

/**
 * ⚠️ **NENHUM teste deste arquivo chama a API do Pluggy nem toca a rede.**
 * `globalThis.fetch` é substituído em cada teste e restaurado num
 * `afterEach` — e as URLs que o cliente monta apontam pra `api.pluggy.ai`,
 * então um teste que ESQUECESSE o stub sairia pela rede de verdade em vez
 * de falhar em silêncio: `chamadas` (que conta toda requisição) é o
 * detector, usado nas asserções de "nem chegou a tentar".
 */

// Marcadores improváveis: uma asserção negativa contra "secret"/"key"
// casaria com qualquer texto que mencione as palavras (mesma lição de
// lib/promeia.test.ts / lib/pluggy.test.ts).
const CLIENT_SECRET = 'SECRET-PLUGGY-ROTA-NAO-PODE-VAZAR-7b2e'
const API_KEY = 'APIKEY-PLUGGY-ROTA-NAO-PODE-VAZAR-4c9f'

const ITEM_ID = 'item-123'
const ACCOUNT_ID = 'acc-456'

/**
 * `env` NOVO por teste de propósito: a apiKey é memoizada num
 * `WeakMap` chaveado pelo objeto `env` (lib/pluggy.ts), então reusar o
 * mesmo objeto entre testes esconderia o `POST /auth` do segundo em
 * diante — e várias asserções aqui contam chamadas.
 */
function criarEnv(): {
  PLUGGY_CLIENT_ID: string
  PLUGGY_CLIENT_SECRET: string
} {
  return {
    PLUGGY_CLIENT_ID: 'client-id-de-teste',
    PLUGGY_CLIENT_SECRET: CLIENT_SECRET,
  }
}

const fetchOriginal = globalThis.fetch
afterEach(() => {
  globalThis.fetch = fetchOriginal
})

type Chamada = { url: string; method: string }

function jsonResponse(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

function transacao(
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'tx-1',
    description: 'Padaria X',
    amount: 45.9,
    date: '2026-07-10T14:00:00.000Z',
    currencyCode: 'BRL',
    type: 'DEBIT',
    status: 'POSTED',
    ...over,
  }
}

/**
 * Stub de rede roteado por URL. `paginas` é a lista de páginas que
 * `GET /transactions` devolve, na ordem — o `totalPages` sai do tamanho
 * dela, então o gerador para sozinho.
 */
function mockRede(opts: {
  chamadas: Chamada[]
  item?: Record<string, unknown>
  paginas?: Array<Array<Record<string, unknown>>>
  authStatus?: number
  transacoesStatus?: number
  transacoesHeaders?: Record<string, string>
  transacoesCorpo?: string
  /** Ignora `paginas` e responde SEMPRE prometendo mais páginas do que o teto. */
  paginasInfinitas?: boolean
}) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    opts.chamadas.push({ url, method: init?.method ?? 'GET' })

    if (url.endsWith('/auth')) {
      if (opts.authStatus !== undefined && opts.authStatus !== 200) {
        return jsonResponse({ message: 'nope' }, opts.authStatus)
      }
      return jsonResponse({ apiKey: API_KEY })
    }

    if (url.includes('/items/')) {
      return jsonResponse(
        opts.item ?? { id: ITEM_ID, status: 'UPDATED', executionStatus: null },
      )
    }

    if (url.includes('/transactions')) {
      if (opts.transacoesCorpo !== undefined) {
        return new Response(opts.transacoesCorpo, {
          status: opts.transacoesStatus ?? 200,
        })
      }
      if (
        opts.transacoesStatus !== undefined &&
        opts.transacoesStatus !== 200
      ) {
        return jsonResponse(
          { message: 'nope' },
          opts.transacoesStatus,
          opts.transacoesHeaders ?? {},
        )
      }
      const page = Number(new URL(url).searchParams.get('page') ?? '1')
      if (opts.paginasInfinitas) {
        return jsonResponse({
          results: [transacao({ id: `tx-p${page}` })],
          page,
          total: PAGE_SIZE * (MAX_PAGINAS + 5),
          totalPages: MAX_PAGINAS + 5,
        })
      }
      const paginas = opts.paginas ?? [[transacao()]]
      const results = paginas[page - 1] ?? []
      return jsonResponse({
        results,
        page,
        total: paginas.flat().length,
        totalPages: paginas.length,
      })
    }

    throw new Error(`URL inesperada em teste: ${url}`)
  }) as typeof fetch
}

function app() {
  const hono = new Hono()
  hono.route('/api/pluggy', pluggyRoutes)
  return hono
}

const JANELA = `from=2026-07-01&to=2026-07-31`

function get(
  query: string,
  bindings: Record<string, unknown> = criarEnv(),
): Promise<Response> {
  return Promise.resolve(
    app().request(`/api/pluggy/transactions?${query}`, {}, bindings),
  )
}

function urlPadrao(extra = ''): string {
  return `account_id=${ACCOUNT_ID}&item_id=${ITEM_ID}&${JANELA}${extra}`
}

type Corpo = {
  ok: boolean
  data: unknown
  notifications: Array<{ code: string; message: string; field?: string }>
}

async function corpo(res: Response): Promise<Corpo> {
  return (await res.json()) as Corpo
}

describe('GET /api/pluggy/transactions — desligado e validação', () => {
  it('sem os dois secrets: 503 pluggy_disabled e NENHUMA chamada de rede', async () => {
    const chamadas: Chamada[] = []
    mockRede({ chamadas })

    const res = await get(urlPadrao(), {})

    expect(res.status).toBe(503)
    const body = await corpo(res)
    expect(body.ok).toBe(false)
    expect(body.notifications[0].code).toBe('pluggy_disabled')
    // Desligado ≠ quebrado: não pode nem tentar falar com o Pluggy.
    expect(chamadas).toHaveLength(0)
  })

  it('secret vazio conta como desligado (não vira "credencial inválida")', async () => {
    const chamadas: Chamada[] = []
    mockRede({ chamadas })

    const res = await get(urlPadrao(), {
      PLUGGY_CLIENT_ID: 'client-id-de-teste',
      PLUGGY_CLIENT_SECRET: '   ',
    })

    expect(res.status).toBe(503)
    expect((await corpo(res)).notifications[0].code).toBe('pluggy_disabled')
    expect(chamadas).toHaveLength(0)
  })

  it('desligado responde ANTES da validação de parâmetro — "não configurei" vence "seu from está errado"', async () => {
    const chamadas: Chamada[] = []
    mockRede({ chamadas })

    // Sem secret NENHUM e sem parâmetro nenhum: quem responde tem que ser o
    // guard de configuração, não o de query. Pra quem nunca ligou o Pluggy,
    // "corrija o from" é uma resposta que não leva a lugar nenhum.
    const res = await get('', {})

    expect(res.status).toBe(503)
    expect((await corpo(res)).notifications[0].code).toBe('pluggy_disabled')
  })

  it('account_id ausente: 400 invalid_query, sem tocar a rede', async () => {
    const chamadas: Chamada[] = []
    mockRede({ chamadas })

    const res = await get(`item_id=${ITEM_ID}&${JANELA}`)

    expect(res.status).toBe(400)
    const body = await corpo(res)
    expect(body.notifications[0].code).toBe('invalid_query')
    expect(body.notifications[0].message).toMatch(/account_id/)
    expect(chamadas).toHaveLength(0)
  })

  it('item_id ausente: 400 invalid_query — a janela vazia sem explicação é o defeito', async () => {
    const chamadas: Chamada[] = []
    mockRede({ chamadas })

    const res = await get(`account_id=${ACCOUNT_ID}&${JANELA}`)

    expect(res.status).toBe(400)
    const body = await corpo(res)
    expect(body.notifications[0].code).toBe('invalid_query')
    expect(body.notifications[0].message).toMatch(/item_id/)
    expect(chamadas).toHaveLength(0)
  })

  it('sem from/to não existe default: 400 (nenhum caminho pede "tudo")', async () => {
    const chamadas: Chamada[] = []
    mockRede({ chamadas })

    const res = await get(`account_id=${ACCOUNT_ID}&item_id=${ITEM_ID}`)

    expect(res.status).toBe(400)
    expect((await corpo(res)).notifications[0].message).toMatch(/from/)
    expect(chamadas).toHaveLength(0)
  })

  it('from com data que NÃO existe no calendário: 400 (regex de formato deixaria passar)', async () => {
    const chamadas: Chamada[] = []
    mockRede({ chamadas })

    const res = await get(
      `account_id=${ACCOUNT_ID}&item_id=${ITEM_ID}&from=2026-02-30&to=2026-07-31`,
    )

    expect(res.status).toBe(400)
    expect((await corpo(res)).notifications[0].message).toMatch(/2026-02-30/)
    expect(chamadas).toHaveLength(0)
  })

  it('to inválido: 400', async () => {
    const chamadas: Chamada[] = []
    mockRede({ chamadas })

    const res = await get(
      `account_id=${ACCOUNT_ID}&item_id=${ITEM_ID}&from=2026-07-01&to=2026-13-01`,
    )

    expect(res.status).toBe(400)
    expect((await corpo(res)).notifications[0].message).toMatch(/to inválido/)
    expect(chamadas).toHaveLength(0)
  })

  it('intervalo invertido (from depois de to): 400, sem gastar requisição', async () => {
    const chamadas: Chamada[] = []
    mockRede({ chamadas })

    const res = await get(
      `account_id=${ACCOUNT_ID}&item_id=${ITEM_ID}&from=2026-07-31&to=2026-07-01`,
    )

    expect(res.status).toBe(400)
    expect((await corpo(res)).notifications[0].message).toMatch(/invertido/)
    expect(chamadas).toHaveLength(0)
  })
})

describe('GET /api/pluggy/transactions — caminho feliz', () => {
  it('devolve linhas JÁ MAPEADAS (sinal pelo type, data em Teresina)', async () => {
    const chamadas: Chamada[] = []
    mockRede({
      chamadas,
      paginas: [
        [
          // 22h de 15/07 em Teresina — o `slice(0,10)` cru daria 16/07.
          transacao({
            id: 'tx-compra',
            amount: 189.9,
            type: 'DEBIT',
            date: '2026-07-16T01:00:00.000Z',
            description: 'Mercado',
          }),
          // Estorno: CREDIT com amount NEGATIVO (cartão) => entrada.
          transacao({
            id: 'tx-estorno',
            amount: -50.25,
            type: 'CREDIT',
            date: '2026-07-20T13:00:00.000Z',
            description: 'Estorno',
          }),
        ],
      ],
    })

    const res = await get(urlPadrao())

    expect(res.status).toBe(200)
    const body = await corpo(res)
    expect(body.ok).toBe(true)
    const data = body.data as {
      linhas: Array<Record<string, unknown>>
      rejeitadas: unknown[]
      paginas: number
      recebidas: number
      from: string
      to: string
    }
    // Valor E sinal, nunca só "veio alguma coisa": o defeito que importa
    // aqui é numérico.
    expect(data.linhas).toEqual([
      {
        imported_id: 'tx-compra',
        purchase_date: '2026-07-15',
        amount_cents: -18990,
        description: 'Mercado',
      },
      {
        imported_id: 'tx-estorno',
        purchase_date: '2026-07-20',
        amount_cents: 5025,
        description: 'Estorno',
      },
    ])
    expect(data.rejeitadas).toEqual([])
    expect(data.paginas).toBe(1)
    expect(data.recebidas).toBe(2)
    expect(data.from).toBe('2026-07-01')
    expect(data.to).toBe('2026-07-31')
  })

  it('repassa a JANELA e a conta ao Pluggy (não busca tudo)', async () => {
    const chamadas: Chamada[] = []
    mockRede({ chamadas })

    await get(urlPadrao())

    const chamadaTx = chamadas.find((ch) => ch.url.includes('/transactions'))
    const params = new URL(chamadaTx?.url ?? '').searchParams
    expect(params.get('accountId')).toBe(ACCOUNT_ID)
    expect(params.get('from')).toBe('2026-07-01')
    expect(params.get('to')).toBe('2026-07-31')
    expect(params.get('pageSize')).toBe(String(PAGE_SIZE))
  })

  it('a fatura ABERTA (PENDING) sai em rejeitadas COM MOTIVO, nunca sumindo', async () => {
    const chamadas: Chamada[] = []
    mockRede({
      chamadas,
      paginas: [
        [
          transacao({ id: 'tx-ok' }),
          transacao({ id: 'tx-pendente', status: 'PENDING' }),
        ],
      ],
    })

    const res = await get(urlPadrao())
    const data = (await corpo(res)).data as {
      linhas: Array<{ imported_id: string }>
      rejeitadas: Array<{ index: number; id: string; motivo: string }>
    }

    expect(data.linhas.map((l) => l.imported_id)).toEqual(['tx-ok'])
    expect(data.rejeitadas).toHaveLength(1)
    expect(data.rejeitadas[0].id).toBe('tx-pendente')
    expect(data.rejeitadas[0].motivo).toMatch(/PENDING/)
    expect(data.rejeitadas[0].motivo).toMatch(/fatura/i)
  })

  it('index de rejeitada é GLOBAL, não reinicia na página 2', async () => {
    const chamadas: Chamada[] = []
    mockRede({
      chamadas,
      paginas: [
        [transacao({ id: 'p1-a' }), transacao({ id: 'p1-b' })],
        // 1ª linha da página 2 => index global 2, não 0.
        [transacao({ id: 'p2-a', status: 'PENDING' })],
      ],
    })

    const res = await get(urlPadrao())
    const data = (await corpo(res)).data as {
      paginas: number
      recebidas: number
      rejeitadas: Array<{ index: number; id: string }>
    }

    expect(data.paginas).toBe(2)
    expect(data.recebidas).toBe(3)
    expect(data.rejeitadas).toEqual([
      { index: 2, id: 'p2-a', motivo: expect.stringMatching(/PENDING/) },
    ])
  })
})

describe('GET /api/pluggy/transactions — cada causa com sua saída', () => {
  it('item pedindo re-autenticação: 409 pluggy_item_disconnected e ZERO página buscada', async () => {
    const chamadas: Chamada[] = []
    mockRede({
      chamadas,
      item: {
        id: ITEM_ID,
        status: 'LOGIN_ERROR',
        executionStatus: 'INVALID_CREDENTIALS',
      },
    })

    const res = await get(urlPadrao())

    expect(res.status).toBe(409)
    const body = await corpo(res)
    expect(body.notifications[0].code).toBe('pluggy_item_disconnected')
    // A mensagem é a do domínio, repassada crua — é ela que nomeia a porta.
    expect(body.notifications[0].message).toMatch(/Meu Pluggy/)
    expect(body.notifications[0].message).toMatch(/reconecte/i)
    // Checou o item ANTES de gastar as 40 páginas: só /auth e /items.
    expect(chamadas.filter((ch) => ch.url.includes('/transactions'))).toEqual(
      [],
    )
  })

  it('item em estado DESCONHECIDO não vira "reconecte" (allowlist)', async () => {
    const chamadas: Chamada[] = []
    mockRede({
      chamadas,
      item: {
        id: ITEM_ID,
        status: 'ESTADO_QUE_O_PLUGGY_INVENTOU_AMANHA',
        executionStatus: null,
      },
    })

    const res = await get(urlPadrao())

    expect(res.status).toBe(200)
  })

  it('429: 429 pluggy_rate_limited com os segundos do Retry-After', async () => {
    const chamadas: Chamada[] = []
    mockRede({
      chamadas,
      transacoesStatus: 429,
      transacoesHeaders: { 'retry-after': '42' },
    })

    const res = await get(urlPadrao())

    expect(res.status).toBe(429)
    const body = await corpo(res)
    expect(body.notifications[0].code).toBe('pluggy_rate_limited')
    expect(body.notifications[0].message).toMatch(/42 s/)
  })

  it('5xx do Pluggy: 503 pluggy_unreachable', async () => {
    const chamadas: Chamada[] = []
    mockRede({ chamadas, transacoesStatus: 503 })

    const res = await get(urlPadrao())

    expect(res.status).toBe(503)
    expect((await corpo(res)).notifications[0].code).toBe('pluggy_unreachable')
  })

  it('credencial recusada no /auth: 503 pluggy_invalid_credentials', async () => {
    const chamadas: Chamada[] = []
    mockRede({ chamadas, authStatus: 401 })

    const res = await get(urlPadrao())

    expect(res.status).toBe(503)
    const body = await corpo(res)
    expect(body.notifications[0].code).toBe('pluggy_invalid_credentials')
    expect(body.notifications[0].message).toMatch(/PLUGGY_CLIENT_ID/)
  })

  it('401 persistente numa rota de dado: 502 pluggy_token_expired (≠ credencial)', async () => {
    const chamadas: Chamada[] = []
    mockRede({ chamadas, transacoesStatus: 401 })

    const res = await get(urlPadrao())

    expect(res.status).toBe(502)
    const body = await corpo(res)
    expect(body.notifications[0].code).toBe('pluggy_token_expired')
    // Afirma só o provado: o /auth passou, então NÃO é caso de mexer nos
    // secrets. É o oposto do teste acima, e é essa a diferença que os dois
    // códigos existem pra guardar.
    expect(body.notifications[0].message).toMatch(/credencial está boa/)
  })

  it('corpo que não é o shape do Pluggy: 502 pluggy_ilegivel (≠ "está fora")', async () => {
    const chamadas: Chamada[] = []
    mockRede({ chamadas, transacoesCorpo: '<html>Bad Gateway</html>' })

    const res = await get(urlPadrao())

    expect(res.status).toBe(502)
    const body = await corpo(res)
    expect(body.notifications[0].code).toBe('pluggy_ilegivel')
    expect(body.notifications[0].message).toMatch(/NÃO é "o Pluggy está fora"/)
  })

  it('janela grande demais pro teto de páginas: 422 pluggy_janela_grande, nunca truncar', async () => {
    const chamadas: Chamada[] = []
    mockRede({ chamadas, paginasInfinitas: true })

    const res = await get(urlPadrao())

    expect(res.status).toBe(422)
    const body = await corpo(res)
    expect(body.notifications[0].code).toBe('pluggy_janela_grande')
    expect(body.notifications[0].message).toMatch(/intervalo menor/)
    // Parou no teto — não seguiu pagando subrequest indefinidamente.
    expect(
      chamadas.filter((ch) => ch.url.includes('/transactions')),
    ).toHaveLength(MAX_PAGINAS)
  })

  it('NENHUMA mensagem de erro vaza o clientSecret nem a apiKey', async () => {
    const cenarios: Array<Record<string, unknown>> = [
      { authStatus: 401 },
      { transacoesStatus: 401 },
      { transacoesStatus: 429 },
      { transacoesStatus: 503 },
      { transacoesCorpo: `{"nao":"o shape"}` },
      { item: { id: ITEM_ID, status: 'LOGIN_ERROR', executionStatus: null } },
    ]

    for (const cenario of cenarios) {
      const chamadas: Chamada[] = []
      mockRede({ chamadas, ...cenario })
      const res = await get(urlPadrao())
      const texto = await res.text()
      expect(texto).not.toContain(CLIENT_SECRET)
      expect(texto).not.toContain(API_KEY)
    }
  })
})

describe('pluggyRoutes — montagem', () => {
  it('registrada ACIMA do catch-all: a requisição chega no handler', async () => {
    const chamadas: Chamada[] = []
    mockRede({ chamadas })

    const hono = new Hono()
    hono.route('/api/pluggy', pluggyRoutes)
    hono.all('/api/*', () => errJson(404, 'not_found', 'rota nao encontrada'))

    const res = await hono.request(
      `/api/pluggy/transactions?${urlPadrao()}`,
      {},
      criarEnv(),
    )

    expect(res.status).toBe(200)
    expect((await corpo(res)).notifications).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Conectar — POST /api/pluggy/connect e GET /api/pluggy/accounts
// ---------------------------------------------------------------------------

/**
 * D1 de mentira, só o suficiente pra `getSetting`/`setSetting`. `store` fica
 * exposto porque várias asserções aqui são sobre O QUE FOI GRAVADO, não sobre
 * a resposta — é o gravar que impede o dono de perder a autorização que
 * acabou de dar.
 */
function fakeDB(inicial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(inicial))
  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first<T>(): Promise<T | null> {
              if (!sql.includes('SELECT value FROM settings')) return null
              const v = store.get(String(args[0]))
              return v === undefined ? null : ({ value: v } as T)
            },
            async run() {
              if (sql.includes('INSERT INTO settings')) {
                store.set(String(args[0]), String(args[1]))
              }
              return { success: true }
            },
          }
        },
      }
    },
  }
  return { db, store }
}

const ITEM_OAUTH_URL = 'https://connect.pluggy.ai/oauth/xyz789'

function itemCriado(over: Record<string, unknown> = {}) {
  return {
    id: 'item-novo-789',
    status: 'WAITING_USER_INPUT',
    executionStatus: null,
    connector: { id: 200, name: 'Meu Pluggy' },
    parameter: { name: 'oauthCode', type: 'oauth', data: ITEM_OAUTH_URL },
    ...over,
  }
}

/** Stub roteado por URL+método, cobrindo POST /items e GET /accounts. */
function mockConectar(opts: {
  chamadas: Chamada[]
  criar?: Record<string, unknown>
  criarStatus?: number
  criarHeaders?: Record<string, string>
  item?: Record<string, unknown>
  contas?: Array<Record<string, unknown>>
}) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    opts.chamadas.push({ url, method })

    if (url.endsWith('/auth')) return jsonResponse({ apiKey: API_KEY })

    if (url.endsWith('/items') && method === 'POST') {
      if (opts.criarStatus !== undefined && opts.criarStatus !== 200) {
        return jsonResponse(
          { message: 'nope' },
          opts.criarStatus,
          opts.criarHeaders ?? {},
        )
      }
      return jsonResponse(opts.criar ?? itemCriado())
    }

    if (url.includes('/items/')) {
      return jsonResponse(
        opts.item ?? { id: ITEM_ID, status: 'UPDATED', executionStatus: null },
      )
    }

    if (url.includes('/accounts')) {
      return jsonResponse({
        results: opts.contas ?? [
          { id: 'acc-banco', type: 'BANK', name: 'Conta Corrente' },
          { id: 'acc-cartao', type: 'CREDIT', name: 'Cartão' },
        ],
      })
    }

    throw new Error(`URL inesperada em teste: ${url}`)
  }) as typeof fetch
}

function envCom(db: unknown, extra: Record<string, unknown> = {}) {
  return { ...criarEnv(), DB: db, ...extra }
}

describe('POST /api/pluggy/connect', () => {
  it('sem os dois secrets: 503 pluggy_disabled e NENHUMA chamada de rede', async () => {
    const chamadas: Chamada[] = []
    mockConectar({ chamadas })
    const { db } = fakeDB()

    const res = await app().request(
      '/api/pluggy/connect',
      { method: 'POST' },
      { DB: db },
    )

    expect(res.status).toBe(503)
    expect((await corpo(res)).notifications[0].code).toBe('pluggy_disabled')
    expect(chamadas).toHaveLength(0)
  })

  it('cria o item com o conector 200 e devolve a URL de autorização', async () => {
    const chamadas: Chamada[] = []
    mockConectar({ chamadas })
    const { db } = fakeDB()

    const res = await app().request(
      '/api/pluggy/connect',
      { method: 'POST' },
      envCom(db),
    )

    expect(res.status).toBe(200)
    const body = await corpo(res)
    expect(body.data).toEqual({
      item_id: 'item-novo-789',
      status: 'WAITING_USER_INPUT',
      execution_status: null,
      authorize_url: ITEM_OAUTH_URL,
    })
    const criacao = chamadas.find(
      (c) => c.method === 'POST' && c.url.endsWith('/items'),
    )
    expect(criacao).toBeDefined()
  })

  it('⚠️ grava o item_id em settings — sem isso a autorização é dada e perdida', async () => {
    const chamadas: Chamada[] = []
    mockConectar({ chamadas })
    const { db, store } = fakeDB()

    await app().request('/api/pluggy/connect', { method: 'POST' }, envCom(db))

    expect(store.get(CHAVE_ITEM_PLUGGY)).toBe('item-novo-789')
  })

  it('⚠️ item recém-criado NÃO vira pluggy_item_disconnected', async () => {
    // `WAITING_USER_INPUT` está na allowlist de "precisa reconectar". Se esta
    // rota passasse o item por `assertItemConectado`, o dono leria "abra o app
    // Meu Pluggy e reconecte" no instante em que clicou em "Conectar banco" —
    // e a URL, única saída, sumiria da resposta.
    const chamadas: Chamada[] = []
    mockConectar({ chamadas })
    const { db } = fakeDB()

    const res = await app().request(
      '/api/pluggy/connect',
      { method: 'POST' },
      envCom(db),
    )

    expect(res.status).toBe(200)
    const body = await corpo(res)
    expect(body.notifications).toEqual([])
    expect((body.data as { authorize_url: string }).authorize_url).toBe(
      ITEM_OAUTH_URL,
    )
  })

  it('item que já volta autorizado tem authorize_url null', async () => {
    const chamadas: Chamada[] = []
    mockConectar({
      chamadas,
      criar: itemCriado({ status: 'UPDATED', parameter: null }),
    })
    const { db } = fakeDB()

    const res = await app().request(
      '/api/pluggy/connect',
      { method: 'POST' },
      envCom(db),
    )

    expect((await corpo(res)).data).toMatchObject({ authorize_url: null })
  })

  it('429 do Pluggy vira 429 pluggy_rate_limited', async () => {
    const chamadas: Chamada[] = []
    mockConectar({
      chamadas,
      criarStatus: 429,
      criarHeaders: { 'retry-after': '45' },
    })
    const { db } = fakeDB()

    const res = await app().request(
      '/api/pluggy/connect',
      { method: 'POST' },
      envCom(db),
    )

    expect(res.status).toBe(429)
    expect((await corpo(res)).notifications[0].code).toBe('pluggy_rate_limited')
  })

  it('nem o secret nem a apiKey aparecem na resposta', async () => {
    const chamadas: Chamada[] = []
    mockConectar({ chamadas, criarStatus: 500 })
    const { db } = fakeDB()

    const res = await app().request(
      '/api/pluggy/connect',
      { method: 'POST' },
      envCom(db),
    )
    const texto = JSON.stringify(await corpo(res))

    expect(texto).not.toContain(CLIENT_SECRET)
    expect(texto).not.toContain(API_KEY)
  })
})

describe('GET /api/pluggy/accounts', () => {
  function pegarContas(
    query = '',
    bindings?: Record<string, unknown>,
  ): Promise<Response> {
    return Promise.resolve(
      app().request(`/api/pluggy/accounts${query}`, {}, bindings),
    )
  }

  it('sem os dois secrets: 503 pluggy_disabled e NENHUMA chamada de rede', async () => {
    const chamadas: Chamada[] = []
    mockConectar({ chamadas })
    const { db } = fakeDB()

    const res = await pegarContas('', { DB: db })

    expect(res.status).toBe(503)
    expect(chamadas).toHaveLength(0)
  })

  it('sem item_id e sem conexão salva: 400 invalid_query apontando o campo', async () => {
    const chamadas: Chamada[] = []
    mockConectar({ chamadas })
    const { db } = fakeDB()

    const res = await pegarContas('', envCom(db))

    expect(res.status).toBe(400)
    const n = (await corpo(res)).notifications[0]
    expect(n.code).toBe('invalid_query')
    expect(n.field).toBe('item_id')
    expect(chamadas).toHaveLength(0)
  })

  it('usa o item_id salvo por POST /connect quando a query não traz um', async () => {
    const chamadas: Chamada[] = []
    mockConectar({ chamadas })
    const { db } = fakeDB({ [CHAVE_ITEM_PLUGGY]: 'item-salvo-1' })

    const res = await pegarContas('', envCom(db))

    expect(res.status).toBe(200)
    expect((await corpo(res)).data).toMatchObject({ item_id: 'item-salvo-1' })
    expect(chamadas.some((c) => c.url.includes('/items/item-salvo-1'))).toBe(
      true,
    )
  })

  it('o item_id da query tem precedência sobre o salvo', async () => {
    const chamadas: Chamada[] = []
    mockConectar({ chamadas })
    const { db } = fakeDB({ [CHAVE_ITEM_PLUGGY]: 'item-salvo-1' })

    await pegarContas('?item_id=item-da-query', envCom(db))

    expect(chamadas.some((c) => c.url.includes('/items/item-da-query'))).toBe(
      true,
    )
    expect(chamadas.some((c) => c.url.includes('item-salvo-1'))).toBe(false)
  })

  it('devolve as contas — o que vira o select da tela', async () => {
    const chamadas: Chamada[] = []
    mockConectar({ chamadas })
    const { db } = fakeDB({ [CHAVE_ITEM_PLUGGY]: ITEM_ID })

    const res = await pegarContas('', envCom(db))

    expect(res.status).toBe(200)
    const data = (await corpo(res)).data as { contas: Array<{ id: string }> }
    expect(data.contas.map((c) => c.id)).toEqual(['acc-banco', 'acc-cartao'])
  })

  it('⚠️ item não autorizado: 409 aguardando_autorizacao, SEM listar contas', async () => {
    // Sem este guard, `GET /accounts` responderia 200 com lista VAZIA — o
    // dono leria "conectei e não apareceu conta nenhuma", sem nada dizendo
    // que falta autorizar. Mesma classe de falha que tornou `item_id`
    // obrigatório em /transactions.
    const chamadas: Chamada[] = []
    mockConectar({
      chamadas,
      item: {
        id: ITEM_ID,
        status: 'WAITING_USER_INPUT',
        executionStatus: null,
      },
    })
    const { db } = fakeDB({ [CHAVE_ITEM_PLUGGY]: ITEM_ID })

    const res = await pegarContas('', envCom(db))

    expect(res.status).toBe(409)
    const n = (await corpo(res)).notifications[0]
    expect(n.code).toBe('pluggy_aguardando_autorizacao')
    expect(n.message).toBe(MSG_AGUARDANDO_AUTORIZACAO)
    expect(chamadas.some((c) => c.url.includes('/accounts'))).toBe(false)
  })

  it('⚠️ conexão CAÍDA é outro erro, com outra instrução', async () => {
    // Asserção negativa cruzada: achatar os dois num só daria a instrução
    // errada — "termine a autorização" para quem precisa REFAZER a conexão.
    const chamadas: Chamada[] = []
    mockConectar({
      chamadas,
      item: {
        id: ITEM_ID,
        status: 'LOGIN_ERROR',
        executionStatus: 'LOGIN_ERROR',
      },
    })
    const { db } = fakeDB({ [CHAVE_ITEM_PLUGGY]: ITEM_ID })

    const res = await pegarContas('', envCom(db))

    expect(res.status).toBe(409)
    const n = (await corpo(res)).notifications[0]
    expect(n.code).toBe('pluggy_item_disconnected')
    expect(n.message).not.toBe(MSG_AGUARDANDO_AUTORIZACAO)
  })
})

describe('POST /connect — a espera pela URL (o bug que o spike achou)', () => {
  it('⚠️ item criado SEM parameter ainda devolve a authorize_url', async () => {
    // Custa ~1s de suíte de propósito: é a rota de verdade, sem injeção, e a
    // espera é justamente o que esta asserção existe pra provar. Sem ela o
    // corpo sai com authorize_url: null e a tela dá beco sem saída.
    const chamadas: Chamada[] = []
    let primeira = true
    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      chamadas.push({ url, method })
      if (url.endsWith('/auth')) return jsonResponse({ apiKey: API_KEY })
      if (url.endsWith('/items') && method === 'POST') {
        // Como a API real responde: sem parameter, ainda em UPDATING.
        return jsonResponse(
          itemCriado({
            status: 'UPDATING',
            executionStatus: 'CREATED',
            parameter: null,
          }),
        )
      }
      if (url.includes('/items/')) {
        if (primeira) {
          primeira = false
          return jsonResponse(itemCriado())
        }
        return jsonResponse(itemCriado())
      }
      throw new Error(`URL inesperada em teste: ${url}`)
    }) as typeof fetch
    const { db } = fakeDB()

    const res = await app().request(
      '/api/pluggy/connect',
      { method: 'POST' },
      envCom(db),
    )

    expect(res.status).toBe(200)
    const data = (await corpo(res)).data as { authorize_url: string | null }
    expect(data.authorize_url).toBe(ITEM_OAUTH_URL)
    expect(chamadas.some((c) => c.url.includes('/items/'))).toBe(true)
  })
})
