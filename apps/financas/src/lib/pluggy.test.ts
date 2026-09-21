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
  aguardarAutorizacao,
  CONNECTOR_MEU_PLUGGY,
  criarItem,
  MAX_SONDAGENS_AUTORIZACAO,
  esquecerApiKey,
  listarContas,
  paginasDeTransacoes,
  pluggyConfigurado,
  precisaReconectar,
  urlDeAutorizacao,
  type PluggyBindings,
  type PluggyItem,
  type PluggyItemCriado,
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

describe('② GET /v2/transactions — cursor a cursor', () => {
  // ⚠️ v2: a resposta é `{results, next}`. `next` é a query string PRONTA da
  // próxima requisição, já URL-encoded — MEDIDO contra a API real:
  // "?accountId=…&after=MjAyNS0xMC0xOFQxNzoyMDo1Ni4wMDBafDNiNzE3…%3D%3D".
  const pagina = (marca: number, next: string | null, n = 2) =>
    json(200, {
      results: Array.from({ length: n }, (_, i) => ({
        id: `tx-${marca}-${i}`,
        description: 'compra',
        amount: 10,
        date: '2026-08-01T03:00:00.000Z',
      })),
      next,
    })

  const CURSOR = '?accountId=acc-1&after=Y3Vyc29yLWRlLXRlc3Rl%3D%3D'

  it('⚠️ bate em /v2/transactions com dateFrom/dateTo, NUNCA no v1', async () => {
    // O v1 (`/transactions` com page/pageSize) foi DESCONTINUADO e responde
    // `410 ENDPOINT_DEPRECATED`. Se alguém voltar o path ou os nomes dos
    // parâmetros, a sincronização inteira morre em produção de novo.
    const f = fetchEmSequencia(AUTH_OK, () => pagina(1, null))
    await buscarPaginaDeTransacoes(
      env(),
      { accountId: 'acc-1', from: '2025-08-01', to: '2026-08-01' },
      { fetchImpl: f },
    )

    const url = new URL(chamadas(f)[1][0])
    expect(url.pathname).toBe('/v2/transactions')
    expect(url.searchParams.get('accountId')).toBe('acc-1')
    expect(url.searchParams.get('dateFrom')).toBe('2025-08-01')
    expect(url.searchParams.get('dateTo')).toBe('2026-08-01')
    // Os nomes do v1 são recusados com `400 property X should not exist`.
    expect(url.searchParams.get('from')).toBeNull()
    expect(url.searchParams.get('to')).toBeNull()
    expect(url.searchParams.get('pageSize')).toBeNull()
    expect(url.searchParams.get('page')).toBeNull()
  })

  it('⚠️ o cursor é usado VERBATIM — reencodar dá 400 Invalid cursor', async () => {
    // O `after` é base64 e termina em `%3D%3D`. Remontar via URLSearchParams
    // reencodaria o `%` e o Pluggy recusaria. Concatenar é o contrato.
    const f = fetchEmSequencia(AUTH_OK, () => pagina(2, null))
    await buscarPaginaDeTransacoes(
      env(),
      { accountId: 'acc-1', cursor: CURSOR },
      { fetchImpl: f },
    )

    expect(chamadas(f)[1][0]).toBe(
      `${PLUGGY_BASE_URL}/v2/transactions${CURSOR}`,
    )
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

  it('o gerador segue o cursor e PARA quando next é null', async () => {
    const f = fetchEmSequencia(
      AUTH_OK,
      () => pagina(1, CURSOR),
      () => pagina(2, CURSOR),
      () => pagina(3, null),
      () => pagina(4, CURSOR), // não deve ser pedida
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

  it('a 2ª requisição usa o cursor devolvido pela 1ª', async () => {
    const f = fetchEmSequencia(
      AUTH_OK,
      () => pagina(1, CURSOR),
      () => pagina(2, null),
    )

    for await (const _ of paginasDeTransacoes(
      env(),
      { accountId: 'acc-1', from: '2026-08-01' },
      { fetchImpl: f },
    )) {
      // percorre
    }

    expect(chamadas(f)[1][0]).toContain('dateFrom=2026-08-01')
    expect(chamadas(f)[2][0]).toBe(
      `${PLUGGY_BASE_URL}/v2/transactions${CURSOR}`,
    )
  })

  it('página vazia encerra mesmo com cursor prometendo mais (servidor se contradisse)', async () => {
    const f = fetchEmSequencia(
      AUTH_OK,
      () => pagina(1, CURSOR),
      () => json(200, { results: [], next: CURSOR }),
      () => pagina(3, null),
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
      json(200, { results: [], next: null }),
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
    // Cursor que nunca acaba: o v2 não promete total nenhum, então o teto é
    // a única defesa contra varrer para sempre.
    const f = fetchEmSequencia(AUTH_OK, () => pagina(1, CURSOR))

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

// ---------------------------------------------------------------------------
// ②-bis Conectar — `criarItem` / `urlDeAutorizacao` / `listarContas`
// ---------------------------------------------------------------------------

const ITEM_NOVO = {
  id: 'item-recem-criado',
  status: 'WAITING_USER_INPUT',
  executionStatus: null,
  connector: { id: CONNECTOR_MEU_PLUGGY, name: 'Meu Pluggy' },
  parameter: {
    name: 'oauthCode',
    type: 'oauth',
    label: 'Oauth Code',
    instructions: 'Log into Meu Pluggy to continue',
    data: 'https://connect.pluggy.ai/oauth/abc123',
    expiresAt: '2026-09-21T23:59:59.000Z',
  },
}

describe('criarItem', () => {
  it('faz POST /items com o conector 200 e `parameters` vazio', async () => {
    const f = fetchEmSequencia(AUTH_OK, () => json(200, ITEM_NOVO))

    await criarItem(env(), { fetchImpl: f })

    const [url, init] = chamadas(f)[1]
    expect(url).toBe(`${PLUGGY_BASE_URL}/items`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      connectorId: 200,
      parameters: {},
    })
    expect((init.headers as Record<string, string>)['content-type']).toBe(
      'application/json',
    )
  })

  it('devolve o item com o `parameter` que carrega a URL', async () => {
    const f = fetchEmSequencia(AUTH_OK, () => json(200, ITEM_NOVO))

    const item = await criarItem(env(), { fetchImpl: f })

    expect(item.id).toBe('item-recem-criado')
    expect(item.status).toBe('WAITING_USER_INPUT')
    expect(item.parameter?.data).toBe('https://connect.pluggy.ai/oauth/abc123')
  })

  it('⚠️ o retry de 401 REENVIA como POST, não como GET', async () => {
    // Sem repassar o `envio` na recursão, a segunda tentativa viraria um
    // `GET /items` — que não cria conexão nenhuma e ainda responde 200 com
    // outro shape. Falha silenciosa, o pior tipo.
    const f = fetchEmSequencia(
      AUTH_OK,
      () => json(401, { message: 'expired' }),
      AUTH_OK,
      () => json(200, ITEM_NOVO),
    )

    await criarItem(env(), { fetchImpl: f })

    const [, reenvio] = chamadas(f)[3]
    expect(reenvio.method).toBe('POST')
    expect(JSON.parse(reenvio.body as string).connectorId).toBe(200)
  })

  it('corpo sem `id`/`status` vira PluggyRespostaIlegivel', async () => {
    const f = fetchEmSequencia(AUTH_OK, () => json(200, { foo: 'bar' }))

    await expect(criarItem(env(), { fetchImpl: f })).rejects.toBeInstanceOf(
      PluggyRespostaIlegivel,
    )
  })

  it('429 vira PluggyRateLimitado', async () => {
    const f = fetchEmSequencia(AUTH_OK, () =>
      json(429, { message: 'slow down' }, { 'retry-after': '30' }),
    )

    await expect(criarItem(env(), { fetchImpl: f })).rejects.toBeInstanceOf(
      PluggyRateLimitado,
    )
  })

  it('sem secrets lança PluggyDesligado ANTES de qualquer fetch', async () => {
    const f = fetchEmSequencia(AUTH_OK)

    await expect(
      criarItem(env({ PLUGGY_CLIENT_SECRET: '' }), { fetchImpl: f }),
    ).rejects.toBeInstanceOf(PluggyDesligado)
    expect(chamadas(f)).toHaveLength(0)
  })

  it('nem o secret nem a apiKey vazam na mensagem de erro', async () => {
    const f = fetchEmSequencia(AUTH_OK, () => json(200, { nada: true }))

    const erro = await criarItem(env(), { fetchImpl: f }).catch((e) => e)

    expect(String(erro)).not.toContain(SECRET)
    expect(String(erro)).not.toContain(API_KEY)
  })
})

describe('⚠️ a armadilha: item recém-criado × assertItemConectado', () => {
  it('assertItemConectado LANÇA num item recém-criado — por isso criarItem nunca passa por ela', () => {
    // Caracterização, não bug: `WAITING_USER_INPUT` está na allowlist de
    // "precisa reconectar" porque, num item que JÁ ESTEVE DE PÉ, é o que
    // significa. Num item recém-nascido é o caminho feliz. Se alguém um dia
    // encadear criarItem → assertItemConectado, este teste explica o estrago:
    // o dono lê "abra o app Meu Pluggy e reconecte" logo depois de clicar em
    // "Conectar banco", e a URL de autorização some.
    expect(() => assertItemConectado(ITEM_NOVO as PluggyItem)).toThrow(
      PluggyItemDesconectado,
    )
    expect(urlDeAutorizacao(ITEM_NOVO as PluggyItemCriado)).not.toBeNull()
  })
})

describe('urlDeAutorizacao', () => {
  it('devolve a URL quando o parâmetro é oauth', () => {
    expect(urlDeAutorizacao(ITEM_NOVO as PluggyItemCriado)).toBe(
      'https://connect.pluggy.ai/oauth/abc123',
    )
  })

  it('devolve null quando não há parameter (item já autorizado)', () => {
    const pronto = { id: 'i', status: 'UPDATED', parameter: null }
    expect(urlDeAutorizacao(pronto as PluggyItemCriado)).toBeNull()
  })

  it('devolve null quando o parâmetro NÃO é oauth', () => {
    // MFA por SMS, por exemplo: tem `parameter`, mas não há URL pra abrir —
    // devolver `data` aqui mandaria o navegador pra um lugar que não existe.
    const mfa = {
      id: 'i',
      status: 'WAITING_USER_INPUT',
      parameter: { name: 'token', type: 'number', data: '123456' },
    }
    expect(urlDeAutorizacao(mfa as PluggyItemCriado)).toBeNull()
  })

  it('devolve null quando `data` vem vazio ou só espaço', () => {
    const vazio = {
      id: 'i',
      status: 'WAITING_USER_INPUT',
      parameter: { type: 'oauth', data: '   ' },
    }
    expect(urlDeAutorizacao(vazio as PluggyItemCriado)).toBeNull()
  })
})

describe('listarContas', () => {
  const CONTAS = {
    results: [
      {
        id: 'conta-corrente-uuid',
        type: 'BANK',
        subtype: 'CHECKING_ACCOUNT',
        name: 'Conta Corrente',
        number: '1234',
      },
      {
        id: 'cartao-uuid',
        type: 'CREDIT',
        subtype: 'CREDIT_CARD',
        name: 'Cartão Platinum',
        number: '5678',
      },
    ],
  }

  it('monta GET /accounts?itemId= com o id escapado', async () => {
    const f = fetchEmSequencia(AUTH_OK, () => json(200, CONTAS))

    await listarContas(env(), 'item/com barra', { fetchImpl: f })

    const [url, init] = chamadas(f)[1]
    expect(url).toBe(
      `${PLUGGY_BASE_URL}/accounts?itemId=${encodeURIComponent('item/com barra')}`,
    )
    expect(init.method).toBe('GET')
    expect(init.body).toBeUndefined()
  })

  it('devolve as contas com id e type — o que vira o select', async () => {
    const f = fetchEmSequencia(AUTH_OK, () => json(200, CONTAS))

    const contas = await listarContas(env(), 'item-1', { fetchImpl: f })

    expect(contas).toHaveLength(2)
    expect(contas.map((c) => c.id)).toEqual([
      'conta-corrente-uuid',
      'cartao-uuid',
    ])
    expect(contas.map((c) => c.type)).toEqual(['BANK', 'CREDIT'])
  })

  it('itemId vazio é RangeError, sem tocar a rede', async () => {
    const f = fetchEmSequencia(AUTH_OK)

    await expect(
      listarContas(env(), '   ', { fetchImpl: f }),
    ).rejects.toBeInstanceOf(RangeError)
    expect(chamadas(f)).toHaveLength(0)
  })

  it('`results` que não é lista vira PluggyRespostaIlegivel', async () => {
    const f = fetchEmSequencia(AUTH_OK, () =>
      json(200, { results: 'nao-lista' }),
    )

    await expect(
      listarContas(env(), 'item-1', { fetchImpl: f }),
    ).rejects.toBeInstanceOf(PluggyRespostaIlegivel)
  })

  it('conta sem `id` derruba a lista inteira em vez de virar undefined no select', async () => {
    // Deixar passar poria `value={undefined}` no <option>, e o dono salvaria
    // uma conexão que nunca sincroniza — erro que só aparece muito depois.
    const f = fetchEmSequencia(AUTH_OK, () =>
      json(200, { results: [{ type: 'BANK', name: 'sem id' }] }),
    )

    await expect(
      listarContas(env(), 'item-1', { fetchImpl: f }),
    ).rejects.toBeInstanceOf(PluggyRespostaIlegivel)
  })

  it('conta sem `type` também', async () => {
    const f = fetchEmSequencia(AUTH_OK, () =>
      json(200, { results: [{ id: 'x', name: 'sem type' }] }),
    )

    await expect(
      listarContas(env(), 'item-1', { fetchImpl: f }),
    ).rejects.toBeInstanceOf(PluggyRespostaIlegivel)
  })

  it('lista vazia é resposta legítima, não erro', async () => {
    const f = fetchEmSequencia(AUTH_OK, () => json(200, { results: [] }))

    await expect(
      listarContas(env(), 'item-1', { fetchImpl: f }),
    ).resolves.toEqual([])
  })
})

describe('aguardarAutorizacao — a doc do Pluggy está ERRADA e isto prova', () => {
  /** ⚠️ Nenhum teste aqui dorme de verdade: `dormir` é sempre injetado. */
  const naoDorme = async () => {}

  const CRIADO_SEM_URL = {
    id: 'item-novo-789',
    status: 'UPDATING',
    executionStatus: 'CREATED',
    parameter: null,
  }

  it('item que JÁ tem URL volta na hora, sem sondar nada', async () => {
    const f = fetchEmSequencia(AUTH_OK)

    const r = await aguardarAutorizacao(env(), ITEM_NOVO as PluggyItemCriado, {
      fetchImpl: f,
      dormir: naoDorme,
    })

    expect(r).toBe(ITEM_NOVO)
    expect(chamadas(f)).toHaveLength(0)
  })

  it('⚠️ MEDIDO: POST /items devolve parameter null, e a URL só aparece depois', async () => {
    // Este é o caso REAL, medido contra api.pluggy.ai em 2026-09-21. A doc
    // afirma que a criação já devolve WAITING_USER_INPUT + parameter.data;
    // ela devolve UPDATING/CREATED/null. Sem esta espera, a rota responderia
    // authorize_url: null e a tela diria "já está autorizado" — o dono nunca
    // receberia o link e ficaria com uma conexão que não lista conta nenhuma.
    const f = fetchEmSequencia(AUTH_OK, () => json(200, ITEM_NOVO))

    const r = await aguardarAutorizacao(
      env(),
      CRIADO_SEM_URL as PluggyItemCriado,
      { fetchImpl: f, dormir: naoDorme },
    )

    expect(r.parameter?.data).toBe('https://connect.pluggy.ai/oauth/abc123')
  })

  it('desiste depois de MAX_SONDAGENS e devolve o último item, sem lançar', async () => {
    const f = fetchEmSequencia(AUTH_OK, () => json(200, CRIADO_SEM_URL))

    const r = await aguardarAutorizacao(
      env(),
      CRIADO_SEM_URL as PluggyItemCriado,
      { fetchImpl: f, dormir: naoDorme },
    )

    expect(r.status).toBe('UPDATING')
    // 1 auth + exatamente MAX_SONDAGENS buscas: não sonda a mais (queimaria
    // subrequest do orçamento de 50) nem a menos.
    expect(chamadas(f)).toHaveLength(1 + MAX_SONDAGENS_AUTORIZACAO)
  })

  it('para cedo quando o item sai do limbo já autorizado', async () => {
    // Não pede nada ao dono e não está mais criando: continuar sondando só
    // gastaria subrequest sem chance de mudar a resposta.
    const f = fetchEmSequencia(AUTH_OK, () =>
      json(200, { id: 'item-novo-789', status: 'UPDATED', parameter: null }),
    )

    const r = await aguardarAutorizacao(
      env(),
      CRIADO_SEM_URL as PluggyItemCriado,
      { fetchImpl: f, dormir: naoDorme },
    )

    expect(r.status).toBe('UPDATED')
    expect(chamadas(f)).toHaveLength(2)
  })
})
