import { afterEach, describe, expect, test, vi } from 'vitest'
import { respostaComCorpoQueNuncaResolve } from '../../test-support/hanging-response'
import { publishDevTo } from './devto'

const BASE_URL_TESTE = 'https://devto-teste.invalido'

/**
 * Mesmo padrão de `lib/tmdb.test.ts`/`lib/gsheets.test.ts`: intercepta só
 * requisições cujo `url` começa com `BASE_URL_TESTE`.
 *
 * ⚠️ M5 (fix round 1, achado da revisão): a versão anterior delegava pro
 * `fetch` ORIGINAL quando a URL não batia — nenhum teste hoje alcança essa
 * ramificação (todo `publishDevTo` deste arquivo usa `baseUrl:
 * BASE_URL_TESTE`), mas a proteção contra chamar a plataforma real era o
 * `baseUrl`, não o mock. Agora lança — se algum teste futuro esquecer o
 * `baseUrl`, ele falha ALTO (erro explícito) em vez de silenciosamente
 * tentar `fetch` de verdade.
 */
function instalarMockDevTo(
  responder: (req: {
    url: URL
    headers: Headers
    body: unknown
    signal: AbortSignal | null | undefined
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
    if (!urlTexto.startsWith(BASE_URL_TESTE)) {
      throw new Error(`URL não mockada: ${urlTexto}`)
    }
    const headers = new Headers(init?.headers)
    const body = init?.body ? JSON.parse(init.body as string) : undefined
    return responder({
      url: new URL(urlTexto),
      headers,
      body,
      signal: init?.signal,
    })
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
  test('publica o artigo no path certo, envia api-key e o CORPO COMPLETO (I2)', async () => {
    const requisicoes: Array<{ url: URL; headers: Headers; body: unknown }> = []
    const mock = instalarMockDevTo(({ url, headers, body }) => {
      requisicoes.push({ url, headers, body })
      return jsonResponse(201, { url: 'https://dev.to/me/post-123', id: 1 })
    })
    try {
      const url = await publishDevTo(
        { apiKey: 'KEY', baseUrl: BASE_URL_TESTE },
        {
          title: 'T',
          bodyMd: 'corpo',
          description: 'desc',
          canonicalUrl: 'https://blog/p',
          tags: ['go', 'ai'],
        },
      )
      expect(url).toBe('https://dev.to/me/post-123')
      expect(requisicoes[0]?.url.pathname).toBe('/api/articles')
      expect(requisicoes[0]?.headers.get('api-key')).toBe('KEY')
      // ⚠️ I2 (fix round 1): `toEqual` COMPLETO, não campo a campo — pega
      // em silêncio um campo REMOVIDO (ex.: `description` sumindo, o caso
      // mudo do achado do revisor: dev.to gera descrição automática quando
      // o campo não vem, sem erro nenhum) que asserções soltas (`article
      // .title === 'T'` etc.) deixariam passar batido.
      expect(requisicoes[0]?.body).toEqual({
        article: {
          title: 'T',
          body_markdown: 'corpo',
          published: true,
          canonical_url: 'https://blog/p',
          description: 'desc',
          tags: ['go', 'ai'],
        },
      })
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

// ---------------------------------------------------------------------------
// ⚠️ I1 (fix round 1): o timeout precisa cobrir a LEITURA DO CORPO, não só
// o fetch inicial — uma plataforma que responde os headers e depois estola
// o corpo tinha que fazer o adapter FALHAR por timeout, nunca ficar
// pendurado pra sempre. `timeoutMs` curto (20ms) pra o teste não esperar
// os 30s reais.
// ---------------------------------------------------------------------------
describe('publishDevTo — timeout cobre a leitura do corpo (I1)', () => {
  test('corpo que nunca resolve: falha por timeout, não fica pendurado', async () => {
    const mock = instalarMockDevTo(({ signal }) =>
      respostaComCorpoQueNuncaResolve(500, signal),
    )
    try {
      await expect(
        publishDevTo(
          { apiKey: 'KEY', baseUrl: BASE_URL_TESTE, timeoutMs: 20 },
          { title: 'T', bodyMd: 'x' },
        ),
      ).rejects.toThrow(/tempo limite/)
    } finally {
      mock.restaurar()
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
