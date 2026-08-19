/**
 * ⚠️ **NENHUM teste deste arquivo toca a API do Pluggy nem a rede** — o
 * `fetch` é sempre INJETADO (`opts.fetchImpl`), mesma disciplina de
 * `promeia.test.ts`. Um teste que esquecesse o mock bateria em
 * `api.pluggy.ai` de verdade, com a credencial de mentira, e queimaria cota
 * de rate limit do dono.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  AMOSTRA_OMITIDA,
  MAX_PAGINAS,
  MSG_CREDENCIAL_INVALIDA,
  PAGE_SIZE,
  PLUGGY_BASE_URL,
  PluggyCredencialInvalida,
  PluggyDesligado,
  PluggyInalcancavel,
  PluggyItemDesconectado,
  PluggyRateLimitado,
  PluggyRespostaIlegivel,
  PluggyTokenExpirado,
  RETRY_AFTER_PADRAO_S,
  VALIDADE_API_KEY_MS,
  assertItemConectado,
  autenticar,
  buscarItem,
  buscarPaginaDeTransacoes,
  esquecerApiKey,
  paginasDeTransacoes,
  pluggyConfigurado,
  precisaReconectar,
  type PluggyBindings,
  type PluggyItem,
} from './pluggy'

// ⚠️ Marcadores IMPROVÁVEIS: `not.toContain('secret')` casaria com qualquer
// texto que mencione a palavra — asserção negativa só vale com um valor que
// não apareceria por acaso.
const SECRET = 'SEGREDO-PLUGGY-NAO-PODE-VAZAR-9f3a'
const API_KEY = 'APIKEY-PLUGGY-NAO-PODE-VAZAR-1c7d'

function env(extra: Partial<PluggyBindings> = {}): PluggyBindings {
  return {
    PLUGGY_CLIENT_ID: 'client-id-de-teste',
    PLUGGY_CLIENT_SECRET: SECRET,
    ...extra,
  }
}

function json(
  status: number,
  corpo: unknown,
  headers: HeadersInit = {},
): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

const AUTH_OK = () => json(200, { apiKey: API_KEY })

/** Fila de respostas: a i-ésima chamada devolve a i-ésima resposta. */
function fetchEmSequencia(...respostas: Array<() => Response>) {
  let i = 0
  return vi.fn(async () => {
    const r = respostas[Math.min(i, respostas.length - 1)]
    i++
    return r()
  }) as unknown as typeof fetch & { mock: { calls: unknown[][] } }
}

function chamadas(f: unknown): Array<[string, RequestInit]> {
  return (f as { mock: { calls: Array<[string, RequestInit]> } }).mock.calls
}

// ---------------------------------------------------------------------------

describe('pluggyConfigurado — ④ sem os secrets, DESLIGADO (não quebrado)', () => {
  it.each([
    ['os dois ausentes', {}],
    ['só o id', { PLUGGY_CLIENT_ID: 'x' }],
    ['só o secret', { PLUGGY_CLIENT_SECRET: 'x' }],
    ['id vazio', { PLUGGY_CLIENT_ID: '', PLUGGY_CLIENT_SECRET: 'x' }],
    [
      'secret só com espaço',
      { PLUGGY_CLIENT_ID: 'x', PLUGGY_CLIENT_SECRET: '   ' },
    ],
  ])('devolve null: %s', (_nome, bindings) => {
    expect(pluggyConfigurado(bindings as PluggyBindings)).toBeNull()
  })

  it('devolve a config (com trim) quando os dois estão presentes', () => {
    expect(
      pluggyConfigurado({
        PLUGGY_CLIENT_ID: ' abc ',
        PLUGGY_CLIENT_SECRET: ' def ',
      }),
    ).toEqual({ clientId: 'abc', clientSecret: 'def' })
  })

  it('sem os secrets, autenticar lança PluggyDesligado e NÃO gasta requisição', async () => {
    const f = fetchEmSequencia(AUTH_OK)
    await expect(autenticar({}, { fetchImpl: f })).rejects.toBeInstanceOf(
      PluggyDesligado,
    )
    // A distinção importa: um /auth com credencial VAZIA voltaria 401 e viraria
    // "corrija a credencial" — mandando o dono arrumar o que ele nunca configurou.
    expect(chamadas(f)).toHaveLength(0)
  })
})

describe('① POST /auth — apiKey de 2 h memoizada por ISOLATE', () => {
  it('manda clientId/clientSecret no corpo e devolve a apiKey', async () => {
    const f = fetchEmSequencia(AUTH_OK)
    const chave = await autenticar(env(), { fetchImpl: f })

    expect(chave).toBe(API_KEY)
    const [url, init] = chamadas(f)[0]
    expect(url).toBe(`${PLUGGY_BASE_URL}/auth`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      clientId: 'client-id-de-teste',
      clientSecret: SECRET,
    })
    // A credencial vai no CORPO, nunca na URL (query string entra em log de proxy).
    expect(url).not.toContain(SECRET)
  })

  it('a segunda chamada REUSA a chave do isolate (um /auth só)', async () => {
    const e = env()
    const f = fetchEmSequencia(AUTH_OK)
    await autenticar(e, { fetchImpl: f })
    await autenticar(e, { fetchImpl: f })
    expect(chamadas(f)).toHaveLength(1)
  })

  it('env DIFERENTE não compartilha a chave (WeakMap por identidade)', async () => {
    const f = fetchEmSequencia(AUTH_OK)
    await autenticar(env(), { fetchImpl: f })
    await autenticar(env(), { fetchImpl: f })
    expect(chamadas(f)).toHaveLength(2)
  })

  it('renova quando a chave passa da validade de 2 h', async () => {
    const e = env()
    const f = fetchEmSequencia(AUTH_OK)
    let agora = 1_000_000
    const opts = { fetchImpl: f, agora: () => agora }

    await autenticar(e, opts)
    agora += VALIDADE_API_KEY_MS + 1
    await autenticar(e, opts)

    expect(chamadas(f)).toHaveLength(2)
  })

  it('renova ANTES do vencimento exato (margem), pra não expirar no meio da paginação', async () => {
    const e = env()
    const f = fetchEmSequencia(AUTH_OK)
    let agora = 1_000_000
    const opts = { fetchImpl: f, agora: () => agora }

    await autenticar(e, opts)
    // Ainda dentro das 2 h, mas dentro da margem de renovação.
    agora += VALIDADE_API_KEY_MS - 60_000
    await autenticar(e, opts)

    expect(chamadas(f)).toHaveLength(2)
  })

  it('duas chamadas CONCORRENTES compartilham UM /auth', async () => {
    const e = env()
    let liberar!: () => void
    const espera = new Promise<void>((r) => {
      liberar = r
    })
    const f = vi.fn(async () => {
      await espera
      return json(200, { apiKey: API_KEY })
    }) as unknown as typeof fetch

    const p1 = autenticar(e, { fetchImpl: f })
    const p2 = autenticar(e, { fetchImpl: f })
    liberar()

    expect(await p1).toBe(API_KEY)
    expect(await p2).toBe(API_KEY)
    expect(chamadas(f)).toHaveLength(1)
  })

  it('um /auth que FALHA não fica memoizado (a próxima tentativa tenta de novo)', async () => {
    const e = env()
    const f = fetchEmSequencia(() => json(500, { message: 'boom' }), AUTH_OK)

    await expect(autenticar(e, { fetchImpl: f })).rejects.toBeInstanceOf(
      PluggyInalcancavel,
    )
    expect(await autenticar(e, { fetchImpl: f })).toBe(API_KEY)
    expect(chamadas(f)).toHaveLength(2)
  })

  it('esquecerApiKey força uma renovação', async () => {
    const e = env()
    const f = fetchEmSequencia(AUTH_OK)
    await autenticar(e, { fetchImpl: f })
    esquecerApiKey(e)
    await autenticar(e, { fetchImpl: f })
    expect(chamadas(f)).toHaveLength(2)
  })
})

describe('③ erros do /auth mapeados por CAUSA', () => {
  it.each([401, 403])(
    'HTTP %i => PluggyCredencialInvalida (corrija o secret, repetir não resolve)',
    async (status) => {
      const f = fetchEmSequencia(() => json(status, { message: 'nope' }))
      await expect(autenticar(env(), { fetchImpl: f })).rejects.toBeInstanceOf(
        PluggyCredencialInvalida,
      )
    },
  )

  it('a mensagem de credencial inválida nomeia os DOIS secrets', () => {
    expect(MSG_CREDENCIAL_INVALIDA).toContain('PLUGGY_CLIENT_ID')
    expect(MSG_CREDENCIAL_INVALIDA).toContain('PLUGGY_CLIENT_SECRET')
  })

  it('429 => PluggyRateLimitado com os segundos do Retry-After', async () => {
    const f = fetchEmSequencia(() =>
      json(429, { message: 'slow down' }, { 'retry-after': '17' }),
    )
    await expect(autenticar(env(), { fetchImpl: f })).rejects.toMatchObject({
      name: 'PluggyRateLimitado',
      retryAfterSegundos: 17,
    })
  })

  it('429 sem header legível cai no padrão medido (60 s)', async () => {
    const f = fetchEmSequencia(() => json(429, {}, { 'retry-after': 'depois' }))
    const erro = await autenticar(env(), { fetchImpl: f }).catch((e) => e)
    expect(erro).toBeInstanceOf(PluggyRateLimitado)
    expect((erro as PluggyRateLimitado).retryAfterSegundos).toBe(
      RETRY_AFTER_PADRAO_S,
    )
    expect(erro.message).toContain('60 s')
  })

  it('5xx => PluggyInalcancavel carregando o status', async () => {
    const f = fetchEmSequencia(() => json(503, { message: 'manutenção' }))
    await expect(autenticar(env(), { fetchImpl: f })).rejects.toMatchObject({
      name: 'PluggyInalcancavel',
      status: 503,
    })
  })

  it('200 sem apiKey => PluggyRespostaIlegivel', async () => {
    const f = fetchEmSequencia(() => json(200, { qualquerCoisa: true }))
    await expect(autenticar(env(), { fetchImpl: f })).rejects.toBeInstanceOf(
      PluggyRespostaIlegivel,
    )
  })

  it('⚠️ a amostra do /auth é OMITIDA — ela carregaria a apiKey pro log', async () => {
    // Corpo com shape errado, mas contendo a chave (o /auth sempre a carrega).
    const f = fetchEmSequencia(() => json(200, { key: API_KEY }))
    const erro = await autenticar(env(), { fetchImpl: f }).catch((e) => e)
    expect(erro).toBeInstanceOf(PluggyRespostaIlegivel)
    expect((erro as PluggyRespostaIlegivel).amostra).toBe(AMOSTRA_OMITIDA)
    expect((erro as PluggyRespostaIlegivel).amostra).not.toContain(API_KEY)
  })

  it('fetch que rejeita => PluggyInalcancavel(status null), sem URL nem credencial', async () => {
    const f = vi.fn(async () => {
      throw new Error(`falhou chamando ${PLUGGY_BASE_URL}/auth com ${SECRET}`)
    }) as unknown as typeof fetch

    const erro = await autenticar(env(), { fetchImpl: f }).catch((e) => e)
    expect(erro).toBeInstanceOf(PluggyInalcancavel)
    expect((erro as PluggyInalcancavel).status).toBeNull()
    expect(erro.message).not.toContain(SECRET)
    expect(erro.message).not.toContain(PLUGGY_BASE_URL)
  })

  it('timeout também vira PluggyInalcancavel (aqui não existe janela curta deliberada)', async () => {
    const f = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_, rej) => {
          init.signal?.addEventListener('abort', () =>
            rej(new Error('The operation was aborted')),
          )
        }),
    ) as unknown as typeof fetch

    await expect(
      autenticar(env(), { fetchImpl: f, timeoutMs: 5 }),
    ).rejects.toBeInstanceOf(PluggyInalcancavel)
  })
})

describe('③ item desconectado — o erro mais importante na prática', () => {
  const base: PluggyItem = { id: 'item-1', status: 'UPDATED' }

  it.each([
    ['UPDATED', undefined, false],
    ['UPDATING', undefined, false],
    ['LOGIN_ERROR', undefined, true],
    ['WAITING_USER_INPUT', undefined, true],
    ['UPDATED', 'INVALID_CREDENTIALS', true],
    ['UPDATED', 'INVALID_CREDENTIALS_MFA', true],
    ['UPDATED', 'ACCOUNT_LOCKED', true],
    ['UPDATED', 'USER_INPUT_TIMEOUT', true],
    ['UPDATED', 'SUCCESS', false],
    // ⚠️ ALLOWLIST: estado desconhecido NÃO vira "reconecte" — mandar o dono
    // refazer uma conexão que está de pé é perder tempo arrumando o que já
    // está certo.
    ['ESTADO_QUE_O_PLUGGY_INVENTOU_AMANHA', undefined, false],
    ['UPDATED', 'EXECUCAO_DESCONHECIDA', false],
  ])('precisaReconectar(%s / %s) === %s', (status, exec, esperado) => {
    expect(
      precisaReconectar({ ...base, status, executionStatus: exec ?? null }),
    ).toBe(esperado)
  })

  it('assertItemConectado não lança pro item saudável', () => {
    expect(() => assertItemConectado(base)).not.toThrow()
  })

  it('assertItemConectado manda RECONECTAR no app Meu Pluggy, não "deu erro"', () => {
    const erro = (() => {
      try {
        assertItemConectado({
          id: 'item-1',
          status: 'LOGIN_ERROR',
          executionStatus: 'INVALID_CREDENTIALS',
        })
        return null
      } catch (e) {
        return e as PluggyItemDesconectado
      }
    })()

    expect(erro).toBeInstanceOf(PluggyItemDesconectado)
    expect(erro!.message).toContain('Meu Pluggy')
    expect(erro!.message).toContain('reconecte')
    // Diz que insistir não adianta — senão o dono fica tentando de novo.
    expect(erro!.message).toContain('não adianta tentar de')
    expect(erro!.itemId).toBe('item-1')
    expect(erro!.status).toBe('LOGIN_ERROR')
    expect(erro!.executionStatus).toBe('INVALID_CREDENTIALS')
  })

  it('buscarItem manda a apiKey no X-API-KEY e devolve o item', async () => {
    const f = fetchEmSequencia(AUTH_OK, () =>
      json(200, {
        id: 'item-1',
        status: 'UPDATED',
        executionStatus: 'SUCCESS',
      }),
    )
    const item = await buscarItem(env(), 'item-1', { fetchImpl: f })

    expect(item.status).toBe('UPDATED')
    const [url, init] = chamadas(f)[1]
    expect(url).toBe(`${PLUGGY_BASE_URL}/items/item-1`)
    expect((init.headers as Record<string, string>)['X-API-KEY']).toBe(API_KEY)
  })

  it('itemId vazio lança RangeError sem gastar requisição', async () => {
    const f = fetchEmSequencia(AUTH_OK)
    await expect(
      buscarItem(env(), '  ', { fetchImpl: f }),
    ).rejects.toBeInstanceOf(RangeError)
    expect(chamadas(f)).toHaveLength(0)
  })
})

describe('③ erros de rota autenticada — token expirado × credencial', () => {
  it('401 numa chamada de dado renova a chave UMA vez e repete', async () => {
    const f = fetchEmSequencia(
      AUTH_OK,
      () => json(401, { message: 'expired' }),
      AUTH_OK,
      () => json(200, { id: 'item-1', status: 'UPDATED' }),
    )
    const item = await buscarItem(env(), 'item-1', { fetchImpl: f })
    expect(item.id).toBe('item-1')
    expect(chamadas(f)).toHaveLength(4)
  })

  it('401 DE NOVO depois de renovar => PluggyTokenExpirado, e a mensagem inocenta a credencial', async () => {
    const f = fetchEmSequencia(
      AUTH_OK,
      () => json(401, {}),
      AUTH_OK,
      () => json(401, {}),
    )
    const erro = await buscarItem(env(), 'item-1', { fetchImpl: f }).catch(
      (e) => e,
    )

    expect(erro).toBeInstanceOf(PluggyTokenExpirado)
    expect(erro.message).toContain('a credencial está boa')
    // Não pode virar "corrija o secret": o /auth acabou de passar.
    expect(erro).not.toBeInstanceOf(PluggyCredencialInvalida)
    // Renova UMA vez só — repetir viraria laço e queimaria cota.
    expect(chamadas(f)).toHaveLength(4)
  })

  it('429 numa chamada de dado => PluggyRateLimitado (sem backoff automático)', async () => {
    const f = fetchEmSequencia(AUTH_OK, () =>
      json(429, {}, { 'retry-after': '60' }),
    )
    await expect(
      buscarItem(env(), 'item-1', { fetchImpl: f }),
    ).rejects.toMatchObject({
      name: 'PluggyRateLimitado',
      retryAfterSegundos: 60,
    })
    // 2 chamadas: auth + a que tomou 429. Nenhuma tentativa automática.
    expect(chamadas(f)).toHaveLength(2)
  })

  it('5xx numa chamada de dado => PluggyInalcancavel', async () => {
    const f = fetchEmSequencia(AUTH_OK, () => json(502, {}))
    await expect(
      buscarItem(env(), 'item-1', { fetchImpl: f }),
    ).rejects.toMatchObject({ name: 'PluggyInalcancavel', status: 502 })
  })

  it('404 => PluggyRespostaIlegivel com amostra do corpo (aqui a amostra é permitida)', async () => {
    const f = fetchEmSequencia(AUTH_OK, () =>
      json(404, { message: 'not found' }),
    )
    const erro = await buscarItem(env(), 'item-1', { fetchImpl: f }).catch(
      (e) => e,
    )
    expect(erro).toBeInstanceOf(PluggyRespostaIlegivel)
    expect((erro as PluggyRespostaIlegivel).amostra).toContain('not found')
  })

  it('200 com corpo que não é o shape do item => PluggyRespostaIlegivel', async () => {
    const f = fetchEmSequencia(AUTH_OK, () => json(200, { semId: true }))
    await expect(
      buscarItem(env(), 'item-1', { fetchImpl: f }),
    ).rejects.toBeInstanceOf(PluggyRespostaIlegivel)
  })
})

describe('② GET /transactions — página a página', () => {
  const pagina = (page: number, totalPages: number, n = 2) =>
    json(200, {
      results: Array.from({ length: n }, (_, i) => ({
        id: `tx-${page}-${i}`,
        description: 'compra',
        amount: 10,
        date: '2026-08-01T03:00:00.000Z',
      })),
      page,
      total: totalPages * n,
      totalPages,
    })

  it('monta a query com accountId, pageSize=500 e a página pedida', async () => {
    const f = fetchEmSequencia(AUTH_OK, () => pagina(1, 1))
    await buscarPaginaDeTransacoes(
      env(),
      { accountId: 'acc-1', from: '2025-08-01', to: '2026-08-01', page: 3 },
      { fetchImpl: f },
    )

    const url = new URL(chamadas(f)[1][0])
    expect(url.pathname).toBe('/transactions')
    expect(url.searchParams.get('accountId')).toBe('acc-1')
    expect(url.searchParams.get('pageSize')).toBe(String(PAGE_SIZE))
    expect(PAGE_SIZE).toBe(500)
    expect(url.searchParams.get('page')).toBe('3')
    expect(url.searchParams.get('from')).toBe('2025-08-01')
    expect(url.searchParams.get('to')).toBe('2026-08-01')
  })

  it.each([
    ['from', { accountId: 'acc-1', from: '2026-02-30' }],
    ['to', { accountId: 'acc-1', to: '2026-13-01' }],
    ['accountId', { accountId: '   ' }],
  ])(
    'recusa %s inválido com RangeError, antes de gastar requisição',
    async (_campo, filtro) => {
      const f = fetchEmSequencia(AUTH_OK)
      await expect(
        buscarPaginaDeTransacoes(env(), filtro, { fetchImpl: f }),
      ).rejects.toBeInstanceOf(RangeError)
      expect(chamadas(f)).toHaveLength(0)
    },
  )

  it('o gerador percorre as páginas e PARA em totalPages', async () => {
    const f = fetchEmSequencia(
      AUTH_OK,
      () => pagina(1, 3),
      () => pagina(2, 3),
      () => pagina(3, 3),
      () => pagina(4, 3), // não deve ser pedida
    )

    const lotes: string[][] = []
    for await (const lote of paginasDeTransacoes(
      env(),
      { accountId: 'acc-1' },
      { fetchImpl: f },
    )) {
      lotes.push(lote.map((t) => t.id))
    }

    expect(lotes).toEqual([
      ['tx-1-0', 'tx-1-1'],
      ['tx-2-0', 'tx-2-1'],
      ['tx-3-0', 'tx-3-1'],
    ])
    // 1 auth + 3 páginas. A 4ª nunca é pedida.
    expect(chamadas(f)).toHaveLength(4)
  })

  it('página vazia encerra mesmo se totalPages prometer mais (o servidor se contradisse)', async () => {
    const f = fetchEmSequencia(
      AUTH_OK,
      () => pagina(1, 9),
      () => json(200, { results: [], page: 2, total: 18, totalPages: 9 }),
      () => pagina(3, 9),
    )

    const lotes: unknown[][] = []
    for await (const lote of paginasDeTransacoes(
      env(),
      { accountId: 'acc-1' },
      { fetchImpl: f },
    )) {
      lotes.push(lote)
    }

    expect(lotes).toHaveLength(1)
    expect(chamadas(f)).toHaveLength(3)
  })

  it('mês sem nada: nenhuma página é rendida (nunca um lote vazio)', async () => {
    const f = fetchEmSequencia(AUTH_OK, () =>
      json(200, { results: [], page: 1, total: 0, totalPages: 0 }),
    )
    const lotes: unknown[] = []
    for await (const lote of paginasDeTransacoes(
      env(),
      { accountId: 'acc-1' },
      { fetchImpl: f },
    )) {
      lotes.push(lote)
    }
    expect(lotes).toEqual([])
  })

  it('⚠️ estourar MAX_PAGINAS LANÇA — truncar em silêncio seria falha com cara de sucesso', async () => {
    const f = fetchEmSequencia(AUTH_OK, () => pagina(1, 9999))

    const percorrer = async () => {
      const lotes: unknown[] = []
      for await (const lote of paginasDeTransacoes(
        env(),
        { accountId: 'acc-1' },
        { fetchImpl: f },
      )) {
        lotes.push(lote)
      }
      return lotes
    }

    const erro = await percorrer().catch((e) => e)
    expect(erro).toBeInstanceOf(RangeError)
    // A mensagem tem que dizer o que FAZER, não só que estourou.
    expect(erro.message).toContain('from/to')
    // Teto vem do limite de 50 subrequests por invocação do plano free.
    expect(MAX_PAGINAS).toBeLessThan(50)
    expect(chamadas(f)).toHaveLength(1 + MAX_PAGINAS)
  })

  it('devolve as transações VERBATIM (o cliente não converte sinal nem data)', async () => {
    // ⚠️ As duas armadilhas: `amount` positivo é DÉBITO no Pluggy (oposto
    // deste schema) e `date` vem em UTC. Converter é da fatia do mapeador —
    // este teste trava que o cliente entrega o valor do fio, intacto.
    const f = fetchEmSequencia(AUTH_OK, () =>
      json(200, {
        results: [
          {
            id: 'uuid-do-pluggy',
            description: 'PADARIA',
            amount: 58.3,
            date: '2026-08-01T02:30:00.000Z',
            category: null,
          },
        ],
        page: 1,
        total: 1,
        totalPages: 1,
      }),
    )

    const p = await buscarPaginaDeTransacoes(
      env(),
      { accountId: 'acc-1' },
      { fetchImpl: f },
    )
    expect(p.results[0]).toEqual({
      id: 'uuid-do-pluggy',
      description: 'PADARIA',
      amount: 58.3,
      date: '2026-08-01T02:30:00.000Z',
      category: null,
    })
  })

  it('corpo sem `results` => PluggyRespostaIlegivel', async () => {
    const f = fetchEmSequencia(AUTH_OK, () => json(200, { page: 1 }))
    await expect(
      buscarPaginaDeTransacoes(env(), { accountId: 'acc-1' }, { fetchImpl: f }),
    ).rejects.toBeInstanceOf(PluggyRespostaIlegivel)
  })
})

describe('⚠️ credencial e apiKey fora de TODA mensagem de erro', () => {
  const cenarios: Array<[string, () => Promise<unknown>]> = [
    [
      'credencial inválida',
      () =>
        autenticar(env(), {
          fetchImpl: fetchEmSequencia(() =>
            json(401, { message: `recusei ${SECRET}` }),
          ),
        }),
    ],
    [
      'rate limit',
      () =>
        autenticar(env(), {
          fetchImpl: fetchEmSequencia(() => json(429, { message: SECRET })),
        }),
    ],
    [
      'Pluggy fora do ar',
      () =>
        autenticar(env(), {
          fetchImpl: fetchEmSequencia(() => json(500, { message: SECRET })),
        }),
    ],
    [
      'resposta ilegível do /auth',
      () =>
        autenticar(env(), {
          fetchImpl: fetchEmSequencia(() => json(200, { key: API_KEY })),
        }),
    ],
    [
      'fetch rejeitando com a requisição inteira no erro',
      () =>
        autenticar(env(), {
          fetchImpl: vi.fn(async () => {
            throw new Error(`POST /auth body={"clientSecret":"${SECRET}"}`)
          }) as unknown as typeof fetch,
        }),
    ],
    [
      'token expirado',
      () =>
        buscarItem(env(), 'item-1', {
          fetchImpl: fetchEmSequencia(
            AUTH_OK,
            () => json(401, { message: API_KEY }),
            AUTH_OK,
            () => json(401, { message: API_KEY }),
          ),
        }),
    ],
    [
      'desligado',
      () => autenticar({}, { fetchImpl: fetchEmSequencia(AUTH_OK) }),
    ],
  ]

  it.each(cenarios)(
    '%s: nem o secret nem a apiKey vazam',
    async (_nome, agir) => {
      const erro = (await agir().then(
        () => null,
        (e) => e,
      )) as Error | null

      expect(erro).not.toBeNull()
      expect(erro!.message).not.toContain(SECRET)
      expect(erro!.message).not.toContain(API_KEY)
    },
  )
})
