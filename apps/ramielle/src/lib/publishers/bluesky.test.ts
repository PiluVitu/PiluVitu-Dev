import { afterEach, describe, expect, test, vi } from 'vitest'
import { publishBluesky } from './bluesky'

const BASE_URL_TESTE = 'https://bluesky-teste.invalido'

type RequisicaoCapturada = { path: string; headers: Headers; body: unknown }

/**
 * Mesmo padrão de `lib/tmdb.test.ts` (intercepta por prefixo de URL,
 * delega o resto, restaura no `finally`), mas roteando por `pathname` —
 * espelha o `switch` do `httptest.Server` de `bluesky_test.go` (Go), que
 * também distingue `createSession` de `createRecord` pelo path.
 */
function instalarMockBluesky(
  responder: (req: RequisicaoCapturada) => Response | Promise<Response>,
): { restaurar: () => void; requisicoes: RequisicaoCapturada[] } {
  const requisicoes: RequisicaoCapturada[] = []
  const fetchOriginal = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlTexto =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url
    if (urlTexto.startsWith(BASE_URL_TESTE)) {
      const url = new URL(urlTexto)
      const headers = new Headers(init?.headers)
      const body = init?.body ? JSON.parse(init.body as string) : undefined
      const req = { path: url.pathname, headers, body }
      requisicoes.push(req)
      return responder(req)
    }
    return fetchOriginal(input as Parameters<typeof fetch>[0], init)
  }) as typeof fetch
  return {
    restaurar: () => {
      globalThis.fetch = fetchOriginal
    },
    requisicoes,
  }
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('publishBluesky — sem canonicalUrl, 1 única escrita (porte de TestBlueskyPublish)', () => {
  test('createSession → createRecord único, devolve a url do post principal', async () => {
    const mock = instalarMockBluesky((req) => {
      if (req.path.endsWith('createSession')) {
        return jsonResponse(200, { accessJwt: 'JWT', did: 'did:plc:abc' })
      }
      if (req.path.endsWith('createRecord')) {
        expect(req.headers.get('Authorization')).toBe('Bearer JWT')
        return jsonResponse(200, {
          uri: 'at://did:plc:abc/app.bsky.feed.post/rkey9',
          cid: 'c',
        })
      }
      throw new Error(`path inesperado: ${req.path}`)
    })
    try {
      const url = await publishBluesky(
        {
          handle: 'me.bsky.social',
          appPassword: 'app-pass',
          baseUrl: BASE_URL_TESTE,
        },
        { text: 'olá mundo' },
      )
      expect(url).toBe('https://bsky.app/profile/me.bsky.social/post/rkey9')
      const createRecordCalls = mock.requisicoes.filter((r) =>
        r.path.endsWith('createRecord'),
      )
      expect(createRecordCalls).toHaveLength(1)
    } finally {
      mock.restaurar()
    }
  })
})

describe('publishBluesky — com canonicalUrl, DUAS escritas (porte de TestBlueskyPublishWithLinkReply)', () => {
  function montarMockDuasEscritas(): ReturnType<typeof instalarMockBluesky> {
    const mainUri = 'at://did:plc:abc/app.bsky.feed.post/rkey9'
    const mainCid = 'cid-main'
    let chamadasCreateRecord = 0
    return instalarMockBluesky((req) => {
      if (req.path.endsWith('createSession')) {
        return jsonResponse(200, { accessJwt: 'JWT', did: 'did:plc:abc' })
      }
      if (req.path.endsWith('createRecord')) {
        chamadasCreateRecord += 1
        if (chamadasCreateRecord === 1) {
          return jsonResponse(200, { uri: mainUri, cid: mainCid })
        }
        return jsonResponse(200, {
          uri: 'at://did:plc:abc/app.bsky.feed.post/rkey10',
          cid: 'cid-reply',
        })
      }
      throw new Error(`path inesperado: ${req.path}`)
    })
  }

  test('faz exatamente 2 createRecord — o principal (sem link) e a reply (com link)', async () => {
    const mock = montarMockDuasEscritas()
    const canonicalUrl = 'https://blog/x'
    try {
      const url = await publishBluesky(
        {
          handle: 'me.bsky.social',
          appPassword: 'app-pass',
          baseUrl: BASE_URL_TESTE,
        },
        { text: 'meu hook', canonicalUrl },
      )
      expect(url).toBe('https://bsky.app/profile/me.bsky.social/post/rkey9')

      const createRecordCalls = mock.requisicoes.filter((r) =>
        r.path.endsWith('createRecord'),
      )
      expect(createRecordCalls).toHaveLength(2)

      const primeiroRecord = (
        createRecordCalls[0]?.body as { record: Record<string, unknown> }
      ).record
      expect(primeiroRecord.text).toBe('meu hook')
      expect(primeiroRecord.text as string).not.toContain('http')

      const segundoRecord = (
        createRecordCalls[1]?.body as { record: Record<string, unknown> }
      ).record
      expect(segundoRecord.text).toBe(canonicalUrl)

      const facets = segundoRecord.facets as Array<{
        index: { byteStart: number; byteEnd: number }
        features: Array<{ $type: string; uri: string }>
      }>
      expect(facets).toHaveLength(1)
      expect(facets[0]?.index).toEqual({
        byteStart: 0,
        byteEnd: new TextEncoder().encode(canonicalUrl).length,
      })
      expect(facets[0]?.features[0]).toEqual({
        $type: 'app.bsky.richtext.facet#link',
        uri: canonicalUrl,
      })

      const reply = segundoRecord.reply as {
        root: { uri: string; cid: string }
        parent: { uri: string; cid: string }
      }
      expect(reply.parent).toEqual({
        uri: 'at://did:plc:abc/app.bsky.feed.post/rkey9',
        cid: 'cid-main',
      })
      expect(reply.root).toEqual({
        uri: 'at://did:plc:abc/app.bsky.feed.post/rkey9',
        cid: 'cid-main',
      })
    } finally {
      mock.restaurar()
    }
  })
})

describe('publishBluesky — rejeita texto > 300 caracteres (porte de TestBlueskyRejectsTooLong)', () => {
  test('301 caracteres ASCII lança, sem chamar a rede', async () => {
    const mock = instalarMockBluesky(() => {
      throw new Error('não deveria chamar a rede')
    })
    try {
      await expect(
        publishBluesky(
          { handle: 'h', appPassword: 'p', baseUrl: BASE_URL_TESTE },
          { text: 'x'.repeat(301) },
        ),
      ).rejects.toThrow(/300 caracteres/)
    } finally {
      mock.restaurar()
    }
  })

  test('exatamente 300 caracteres ASCII NÃO lança (limite é inclusive)', async () => {
    const mock = instalarMockBluesky((req) => {
      if (req.path.endsWith('createSession')) {
        return jsonResponse(200, { accessJwt: 'JWT', did: 'did:plc:abc' })
      }
      return jsonResponse(200, {
        uri: 'at://did:plc:abc/app.bsky.feed.post/rkey1',
        cid: 'c',
      })
    })
    try {
      await expect(
        publishBluesky(
          { handle: 'h', appPassword: 'p', baseUrl: BASE_URL_TESTE },
          { text: 'x'.repeat(300) },
        ),
      ).resolves.not.toThrow()
    } finally {
      mock.restaurar()
    }
  })
})

// ---------------------------------------------------------------------------
// ⚠️ armadilha 1: contagem por CODE POINT, não `.length` (UTF-16 units).
// '😀' é fora do BMP: 1 code point, mas 2 unidades UTF-16 (surrogate pair).
// 300 emojis = 300 code points (não deveria rejeitar) mas 600 de `.length`
// (rejeitaria se o código usasse `.length`) — é este par que discrimina a
// implementação certa da errada. Ver a mutação obrigatória no relatório da
// task: trocar `[...t].length` por `t.length` neste arquivo faz o segundo
// teste abaixo falhar.
// ---------------------------------------------------------------------------
describe('publishBluesky — code point ≠ .length (armadilha 1, bluesky.go:41)', () => {
  test('301 emojis (301 code points, 602 unidades UTF-16) lança', async () => {
    const mock = instalarMockBluesky(() => {
      throw new Error('não deveria chamar a rede')
    })
    try {
      await expect(
        publishBluesky(
          { handle: 'h', appPassword: 'p', baseUrl: BASE_URL_TESTE },
          { text: '😀'.repeat(301) },
        ),
      ).rejects.toThrow(/300 caracteres/)
    } finally {
      mock.restaurar()
    }
  })

  test('300 emojis (300 code points, MAS 600 unidades UTF-16) NÃO lança — só passa com contagem por code point', async () => {
    const mock = instalarMockBluesky((req) => {
      if (req.path.endsWith('createSession')) {
        return jsonResponse(200, { accessJwt: 'JWT', did: 'did:plc:abc' })
      }
      return jsonResponse(200, {
        uri: 'at://did:plc:abc/app.bsky.feed.post/rkey1',
        cid: 'c',
      })
    })
    try {
      await expect(
        publishBluesky(
          { handle: 'h', appPassword: 'p', baseUrl: BASE_URL_TESTE },
          { text: '😀'.repeat(300) },
        ),
      ).resolves.not.toThrow()
    } finally {
      mock.restaurar()
    }
  })
})

// ---------------------------------------------------------------------------
// ⚠️ armadilha 1 (parte 2): offset do facet em BYTES UTF-8, não `.length`.
// 'á' é 1 code point, 1 unidade UTF-16, mas 2 bytes em UTF-8 — divergência
// mínima suficiente pra provar que o cálculo usa TextEncoder, não .length.
// ---------------------------------------------------------------------------
describe('publishBluesky — facet em bytes UTF-8, não .length (armadilha 1, bluesky.go:78)', () => {
  test('URL com acento: byteEnd é a contagem de BYTES UTF-8, maior que .length', async () => {
    const canonicalUrl = 'https://blog/á' // 'á' = 1 unidade UTF-16, 2 bytes UTF-8
    expect(new TextEncoder().encode(canonicalUrl).length).toBe(
      canonicalUrl.length + 1,
    )

    let facetCapturado: { byteStart: number; byteEnd: number } | undefined
    const mock = instalarMockBluesky((req) => {
      if (req.path.endsWith('createSession')) {
        return jsonResponse(200, { accessJwt: 'JWT', did: 'did:plc:abc' })
      }
      const body = req.body as {
        record: { facets?: Array<{ index: typeof facetCapturado }> }
      }
      if (body.record.facets) {
        facetCapturado = body.record.facets[0]?.index
        return jsonResponse(200, {
          uri: 'at://did:plc:abc/app.bsky.feed.post/rkey-reply',
          cid: 'cid-reply',
        })
      }
      return jsonResponse(200, {
        uri: 'at://did:plc:abc/app.bsky.feed.post/rkey9',
        cid: 'cid-main',
      })
    })
    try {
      await publishBluesky(
        { handle: 'h', appPassword: 'p', baseUrl: BASE_URL_TESTE },
        { text: 'hook', canonicalUrl },
      )
      expect(facetCapturado).toEqual({
        byteStart: 0,
        byteEnd: new TextEncoder().encode(canonicalUrl).length,
      })
      expect(facetCapturado?.byteEnd).not.toBe(canonicalUrl.length)
    } finally {
      mock.restaurar()
    }
  })
})

// ---------------------------------------------------------------------------
// ⚠️ armadilha 2: se a SEGUNDA escrita (reply com link) falhar, a função
// lança — mas o post PRINCIPAL já foi criado com sucesso no passo anterior.
// Republicar duplicaria. Provado abaixo: o mock confirma que createRecord
// foi chamado (e respondeu 200) na primeira vez, ANTES da segunda falhar.
// ---------------------------------------------------------------------------
describe('publishBluesky — armadilha 2: falha da 2ª escrita não desfaz a 1ª', () => {
  test('reply falha (500) → função lança, mas o createRecord principal já respondeu sucesso', async () => {
    let chamadasCreateRecord = 0
    let primeiraChamadaTeveSucesso = false
    const mock = instalarMockBluesky((req) => {
      if (req.path.endsWith('createSession')) {
        return jsonResponse(200, { accessJwt: 'JWT', did: 'did:plc:abc' })
      }
      chamadasCreateRecord += 1
      if (chamadasCreateRecord === 1) {
        primeiraChamadaTeveSucesso = true
        return jsonResponse(200, {
          uri: 'at://did:plc:abc/app.bsky.feed.post/rkey9',
          cid: 'cid-main',
        })
      }
      // 2ª chamada (a reply com o link) falha.
      return new Response('erro simulado no servidor', { status: 500 })
    })
    try {
      await expect(
        publishBluesky(
          {
            handle: 'me.bsky.social',
            appPassword: 'p',
            baseUrl: BASE_URL_TESTE,
          },
          { text: 'hook', canonicalUrl: 'https://blog/x' },
        ),
      ).rejects.toThrow()

      // O post principal JÁ EXISTE: a 1ª chamada de createRecord aconteceu
      // e respondeu sucesso ANTES da 2ª falhar — a função não tem como
      // desfazer isso, e o comentário em bluesky.ts registra a exposição.
      expect(chamadasCreateRecord).toBe(2)
      expect(primeiraChamadaTeveSucesso).toBe(true)
    } finally {
      mock.restaurar()
    }
  })
})

describe('publishBluesky — uri em formato inesperado', () => {
  test('uri sem "/" lança "unexpected uri format"', async () => {
    const mock = instalarMockBluesky((req) => {
      if (req.path.endsWith('createSession')) {
        return jsonResponse(200, { accessJwt: 'JWT', did: 'did:plc:abc' })
      }
      return jsonResponse(200, { uri: 'sem-barra-nenhuma', cid: 'c' })
    })
    try {
      await expect(
        publishBluesky(
          { handle: 'h', appPassword: 'p', baseUrl: BASE_URL_TESTE },
          { text: 'x' },
        ),
      ).rejects.toThrow(/unexpected uri format/)
    } finally {
      mock.restaurar()
    }
  })
})

describe('publishBluesky — outros modos de falha', () => {
  test('createSession falhando (credenciais inválidas) lança', async () => {
    const mock = instalarMockBluesky((req) => {
      if (req.path.endsWith('createSession')) {
        return new Response('senha incorreta', { status: 401 })
      }
      throw new Error('não deveria chegar em createRecord')
    })
    try {
      await expect(
        publishBluesky(
          { handle: 'h', appPassword: 'senha-errada', baseUrl: BASE_URL_TESTE },
          { text: 'x' },
        ),
      ).rejects.toThrow()
    } finally {
      mock.restaurar()
    }
  })

  test('falha de rede lança', async () => {
    const fetchOriginal = globalThis.fetch
    globalThis.fetch = (async () => {
      throw new TypeError('network error simulado')
    }) as typeof fetch
    try {
      await expect(
        publishBluesky(
          { handle: 'h', appPassword: 'p', baseUrl: BASE_URL_TESTE },
          { text: 'x' },
        ),
      ).rejects.toThrow()
    } finally {
      globalThis.fetch = fetchOriginal
    }
  })
})

// --------------------------------------------------------------------------
// BLUESKY_APP_PASSWORD NUNCA vaza.
// --------------------------------------------------------------------------

describe('publishBluesky — BLUESKY_APP_PASSWORD NUNCA vaza', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('createSession falhando: a senha NUNCA aparece na mensagem lançada', async () => {
    const senhaMarcador = 'MARCADOR-BLUESKY-APP-PASSWORD-NAO-PODE-VAZAR-2d9'
    const mock = instalarMockBluesky(() => {
      return new Response('corpo de erro qualquer', { status: 401 })
    })
    try {
      const erro = await publishBluesky(
        { handle: 'h', appPassword: senhaMarcador, baseUrl: BASE_URL_TESTE },
        { text: 'x' },
      ).catch((e: unknown) => e)
      expect(erro).toBeInstanceOf(Error)
      expect((erro as Error).message).not.toContain(senhaMarcador)
    } finally {
      mock.restaurar()
    }
  })

  test('falha de rede: a senha NUNCA aparece, mesmo que o erro original cite a URL', async () => {
    const senhaMarcador = 'MARCADOR-BLUESKY-APP-PASSWORD-REDE-6a3'
    const fetchOriginal = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const urlTexto =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
      throw new TypeError(`fetch failed: ${urlTexto}`)
    }) as typeof fetch
    try {
      const erro = await publishBluesky(
        { handle: 'h', appPassword: senhaMarcador, baseUrl: BASE_URL_TESTE },
        { text: 'x' },
      ).catch((e: unknown) => e)
      expect(erro).toBeInstanceOf(Error)
      expect((erro as Error).message).not.toContain(senhaMarcador)
    } finally {
      globalThis.fetch = fetchOriginal
    }
  })
})
