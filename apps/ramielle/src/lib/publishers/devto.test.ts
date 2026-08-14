import { afterEach, describe, expect, test, vi } from 'vitest'
import { publishDevTo } from './devto'

const BASE_URL_TESTE = 'https://devto-teste.invalido'

/**
 * Mesmo padrão de `lib/tmdb.test.ts`/`lib/gsheets.test.ts`: intercepta só
 * requisições cujo `url` começa com `BASE_URL_TESTE`, delega o resto pro
 * `fetch` original, sempre restaurado no `finally` de quem chama.
 */
function instalarMockDevTo(
  responder: (req: {
    url: URL
    headers: Headers
    body: unknown
  }) => Response | Promise<Response>,
): { restaurar: () => void } {
  const fetchOriginal = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlTexto =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url
    if (urlTexto.startsWith(BASE_URL_TESTE)) {
      const headers = new Headers(init?.headers)
      const body = init?.body ? JSON.parse(init.body as string) : undefined
      return responder({ url: new URL(urlTexto), headers, body })
    }
    return fetchOriginal(input as Parameters<typeof fetch>[0], init)
  }) as typeof fetch
  return {
    restaurar: () => {
      globalThis.fetch = fetchOriginal
    },
  }
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('publishDevTo — caminho feliz (porte de TestDevToPublish, devto_test.go)', () => {
  test('publica o artigo, envia api-key e o corpo com published:true/canonical_url', async () => {
    const requisicoes: Array<{ headers: Headers; body: unknown }> = []
    const mock = instalarMockDevTo(({ headers, body }) => {
      requisicoes.push({ headers, body })
      return jsonResponse(201, { url: 'https://dev.to/me/post-123', id: 1 })
    })
    try {
      const url = await publishDevTo(
        { apiKey: 'KEY', baseUrl: BASE_URL_TESTE },
        {
          title: 'T',
          bodyMd: 'corpo',
          canonicalUrl: 'https://blog/p',
          tags: ['go', 'ai'],
        },
      )
      expect(url).toBe('https://dev.to/me/post-123')
      expect(requisicoes[0]?.headers.get('api-key')).toBe('KEY')
      const article = (
        requisicoes[0]?.body as { article: Record<string, unknown> }
      ).article
      expect(article.canonical_url).toBe('https://blog/p')
      expect(article.published).toBe(true)
      expect(article.title).toBe('T')
      expect(article.body_markdown).toBe('corpo')
    } finally {
      mock.restaurar()
    }
  })

  test('aceita status 200, não só 201 (armadilha 7)', async () => {
    const mock = instalarMockDevTo(() =>
      jsonResponse(200, { url: 'https://dev.to/me/post-200' }),
    )
    try {
      const url = await publishDevTo(
        { apiKey: 'KEY', baseUrl: BASE_URL_TESTE },
        { title: 'T', bodyMd: 'x' },
      )
      expect(url).toBe('https://dev.to/me/post-200')
    } finally {
      mock.restaurar()
    }
  })
})

describe('publishDevTo — truncamento silencioso pra 4 tags (armadilha 6, devto.go:34-37)', () => {
  test('6 tags enviadas viram só as 4 primeiras no corpo, sem erro', async () => {
    const requisicoes: Array<{ body: unknown }> = []
    const mock = instalarMockDevTo(({ body }) => {
      requisicoes.push({ body })
      return jsonResponse(201, { url: 'https://dev.to/me/x' })
    })
    try {
      await publishDevTo(
        { apiKey: 'KEY', baseUrl: BASE_URL_TESTE },
        {
          title: 'T',
          bodyMd: 'x',
          tags: ['um', 'dois', 'tres', 'quatro', 'cinco', 'seis'],
        },
      )
      const article = (requisicoes[0]?.body as { article: { tags: string[] } })
        .article
      expect(article.tags).toEqual(['um', 'dois', 'tres', 'quatro'])
    } finally {
      mock.restaurar()
    }
  })

  test('4 tags ou menos não são truncadas', async () => {
    const requisicoes: Array<{ body: unknown }> = []
    const mock = instalarMockDevTo(({ body }) => {
      requisicoes.push({ body })
      return jsonResponse(201, { url: 'https://dev.to/me/x' })
    })
    try {
      await publishDevTo(
        { apiKey: 'KEY', baseUrl: BASE_URL_TESTE },
        { title: 'T', bodyMd: 'x', tags: ['a', 'b'] },
      )
      const article = (requisicoes[0]?.body as { article: { tags: string[] } })
        .article
      expect(article.tags).toEqual(['a', 'b'])
    } finally {
      mock.restaurar()
    }
  })

  test('sem tags nenhuma (undefined) vira lista vazia, não quebra', async () => {
    const requisicoes: Array<{ body: unknown }> = []
    const mock = instalarMockDevTo(({ body }) => {
      requisicoes.push({ body })
      return jsonResponse(201, { url: 'https://dev.to/me/x' })
    })
    try {
      await publishDevTo(
        { apiKey: 'KEY', baseUrl: BASE_URL_TESTE },
        { title: 'T', bodyMd: 'x' },
      )
      const article = (requisicoes[0]?.body as { article: { tags: string[] } })
        .article
      expect(article.tags).toEqual([])
    } finally {
      mock.restaurar()
    }
  })
})

describe('publishDevTo — status fora de 200/201 lança', () => {
  test('422 lança incluindo status e corpo (truncado)', async () => {
    const mock = instalarMockDevTo(
      () => new Response('title já existe', { status: 422 }),
    )
    try {
      await expect(
        publishDevTo(
          { apiKey: 'KEY', baseUrl: BASE_URL_TESTE },
          { title: 'T', bodyMd: 'x' },
        ),
      ).rejects.toThrow(/422/)
    } finally {
      mock.restaurar()
    }
  })

  test('resposta 2xx com JSON quebrado lança', async () => {
    const mock = instalarMockDevTo(
      () => new Response('não é json', { status: 201 }),
    )
    try {
      await expect(
        publishDevTo(
          { apiKey: 'KEY', baseUrl: BASE_URL_TESTE },
          { title: 'T', bodyMd: 'x' },
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
        publishDevTo(
          { apiKey: 'KEY', baseUrl: BASE_URL_TESTE },
          { title: 'T', bodyMd: 'x' },
        ),
      ).rejects.toThrow()
    } finally {
      globalThis.fetch = fetchOriginal
    }
  })
})

// --------------------------------------------------------------------------
// DEVTO_API_KEY NUNCA vaza — mesmo padrão de "segredo NUNCA vaza" já usado
// pro TMDB_API_KEY (lib/tmdb.test.ts) e PROMEIA_TOKEN (lib/promeia.test.ts).
// Marcador improvável: `not.toContain('key')`/`not.toContain('api')` casaria
// com qualquer texto que mencione a palavra — usamos um marcador único.
// --------------------------------------------------------------------------

describe('publishDevTo — DEVTO_API_KEY NUNCA vaza', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('status de erro: a chave NUNCA aparece na mensagem de erro lançada', async () => {
    const chaveMarcador = 'MARCADOR-DEVTO-API-KEY-NAO-PODE-VAZAR-7c1'
    const mock = instalarMockDevTo(
      () => new Response('corpo de erro qualquer', { status: 500 }),
    )
    try {
      const erro = await publishDevTo(
        { apiKey: chaveMarcador, baseUrl: BASE_URL_TESTE },
        { title: 'T', bodyMd: 'x' },
      ).catch((e: unknown) => e)
      expect(erro).toBeInstanceOf(Error)
      expect((erro as Error).message).not.toContain(chaveMarcador)
    } finally {
      mock.restaurar()
    }
  })

  test('falha de rede: a chave NUNCA aparece, mesmo que o erro original do fetch cite a URL', async () => {
    const chaveMarcador = 'MARCADOR-DEVTO-API-KEY-REDE-9e2'
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
      const erro = await publishDevTo(
        { apiKey: chaveMarcador, baseUrl: BASE_URL_TESTE },
        { title: 'T', bodyMd: 'x' },
      ).catch((e: unknown) => e)
      expect(erro).toBeInstanceOf(Error)
      expect((erro as Error).message).not.toContain(chaveMarcador)
    } finally {
      globalThis.fetch = fetchOriginal
    }
  })
})
