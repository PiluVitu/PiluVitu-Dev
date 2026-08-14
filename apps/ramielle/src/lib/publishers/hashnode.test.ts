import { afterEach, describe, expect, test, vi } from 'vitest'
import { respostaComCorpoQueNuncaResolve } from '../../test-support/hanging-response'
import { publishHashnode } from './hashnode'

const BASE_URL_TESTE = 'https://hashnode-teste.invalido'

/**
 * ⚠️ M5 (fix round 1): lança em vez de delegar pro `fetch` real quando a
 * URL não bate — ver o comentário equivalente em `devto.test.ts`.
 */
function instalarMockHashnode(
  responder: (req: {
    url: URL
    headers: Headers
    body: { query: string; variables: unknown }
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
    const body = JSON.parse(init?.body as string)
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

describe('publishHashnode — caminho feliz (porte de TestHashnodePublish, hashnode_test.go)', () => {
  test('publica no path certo, header Authorization SEM "Bearer ", variables COMPLETO (I2)', async () => {
    const requisicoes: Array<{ url: URL; headers: Headers; body: unknown }> = []
    const mock = instalarMockHashnode(({ url, headers, body }) => {
      requisicoes.push({ url, headers, body })
      return jsonResponse(200, {
        data: { publishPost: { post: { url: 'https://hn.dev/p' } } },
      })
    })
    try {
      const url = await publishHashnode(
        { token: 'TOK', publicationId: 'PUBID', baseUrl: BASE_URL_TESTE },
        { title: 'T', bodyMd: 'corpo', canonicalUrl: 'https://blog/p' },
      )
      expect(url).toBe('https://hn.dev/p')
      expect(requisicoes[0]?.url.pathname).toBe('/')
      // ⚠️ Header SEM "Bearer " — o token cru, literal.
      expect(requisicoes[0]?.headers.get('Authorization')).toBe('TOK')
      expect(requisicoes[0]?.headers.get('Authorization')).not.toMatch(
        /^Bearer/,
      )
      const corpo = requisicoes[0]?.body as {
        query: string
        variables: unknown
      }
      expect(corpo.query).toContain('publishPost')
      // ⚠️ I2 (fix round 1): `toEqual` COMPLETO em `variables` — pega em
      // silêncio um campo REMOVIDO (ex.: `publicationId`, o achado do
      // revisor: sem ele, o Hashnode publica no lugar errado ou recusa sem
      // um teste solto por campo detectar).
      expect(corpo.variables).toEqual({
        input: {
          title: 'T',
          contentMarkdown: 'corpo',
          publicationId: 'PUBID',
          originalArticleURL: 'https://blog/p',
          tags: [],
        },
      })
    } finally {
      mock.restaurar()
    }
  })
})

describe('publishHashnode — só >=500/401/403 são erro IMEDIATO (armadilha 7, hashnode.go:61)', () => {
  test('500 lança imediatamente', async () => {
    const mock = instalarMockHashnode(
      () => new Response('erro interno', { status: 500 }),
    )
    try {
      await expect(
        publishHashnode(
          { token: 'TOK', publicationId: 'PUBID', baseUrl: BASE_URL_TESTE },
          { title: 'T', bodyMd: 'x' },
        ),
      ).rejects.toThrow(/500/)
    } finally {
      mock.restaurar()
    }
  })

  test('401 lança imediatamente', async () => {
    const mock = instalarMockHashnode(
      () => new Response('token inválido', { status: 401 }),
    )
    try {
      await expect(
        publishHashnode(
          { token: 'TOK', publicationId: 'PUBID', baseUrl: BASE_URL_TESTE },
          { title: 'T', bodyMd: 'x' },
        ),
      ).rejects.toThrow(/401/)
    } finally {
      mock.restaurar()
    }
  })

  test('403 lança imediatamente', async () => {
    const mock = instalarMockHashnode(
      () => new Response('proibido', { status: 403 }),
    )
    try {
      await expect(
        publishHashnode(
          { token: 'TOK', publicationId: 'PUBID', baseUrl: BASE_URL_TESTE },
          { title: 'T', bodyMd: 'x' },
        ),
      ).rejects.toThrow(/403/)
    } finally {
      mock.restaurar()
    }
  })

  // ⚠️ O caso que prova a divergência de um `if (!res.ok) throw` genérico:
  // um 4xx FORA da lista (400, não 401/403/5xx) NÃO lança na hora — só é
  // pego ao decodificar o corpo. Se o corpo tiver uma url válida mesmo assim
  // (GraphQL às vezes responde 200 com erro de validação, mas pode variar),
  // a função SUCEDE.
  test('400 (fora da lista de erro imediato) com corpo válido NÃO lança — só >=500/401/403 são imediatos', async () => {
    const mock = instalarMockHashnode(() =>
      jsonResponse(400, {
        data: {
          publishPost: { post: { url: 'https://hn.dev/mesmo-com-400' } },
        },
      }),
    )
    try {
      const url = await publishHashnode(
        { token: 'TOK', publicationId: 'PUBID', baseUrl: BASE_URL_TESTE },
        { title: 'T', bodyMd: 'x' },
      )
      expect(url).toBe('https://hn.dev/mesmo-com-400')
    } finally {
      mock.restaurar()
    }
  })

  test('400 (fora da lista) com corpo de erro GraphQL é pego pelo `errors[]`, não pelo status', async () => {
    const mock = instalarMockHashnode(() =>
      jsonResponse(400, { errors: [{ message: 'título duplicado' }] }),
    )
    try {
      await expect(
        publishHashnode(
          { token: 'TOK', publicationId: 'PUBID', baseUrl: BASE_URL_TESTE },
          { title: 'T', bodyMd: 'x' },
        ),
      ).rejects.toThrow(/título duplicado/)
    } finally {
      mock.restaurar()
    }
  })

  test('422 (fora da lista) sem url na resposta lança "resposta sem url" — pego pelo corpo, não pelo status', async () => {
    const mock = instalarMockHashnode(() => jsonResponse(422, {}))
    try {
      await expect(
        publishHashnode(
          { token: 'TOK', publicationId: 'PUBID', baseUrl: BASE_URL_TESTE },
          { title: 'T', bodyMd: 'x' },
        ),
      ).rejects.toThrow(/resposta sem url/)
    } finally {
      mock.restaurar()
    }
  })
})

describe('publishHashnode — outros modos de falha', () => {
  test('errors[] não-vazio no corpo (mesmo com 200) lança com a mensagem do primeiro erro', async () => {
    const mock = instalarMockHashnode(() =>
      jsonResponse(200, { errors: [{ message: 'publicationId inválido' }] }),
    )
    try {
      await expect(
        publishHashnode(
          { token: 'TOK', publicationId: 'PUBID', baseUrl: BASE_URL_TESTE },
          { title: 'T', bodyMd: 'x' },
        ),
      ).rejects.toThrow(/publicationId inválido/)
    } finally {
      mock.restaurar()
    }
  })

  test('200 sem post.url nenhuma lança "resposta sem url"', async () => {
    const mock = instalarMockHashnode(() => jsonResponse(200, { data: {} }))
    try {
      await expect(
        publishHashnode(
          { token: 'TOK', publicationId: 'PUBID', baseUrl: BASE_URL_TESTE },
          { title: 'T', bodyMd: 'x' },
        ),
      ).rejects.toThrow(/resposta sem url/)
    } finally {
      mock.restaurar()
    }
  })

  test('JSON quebrado lança', async () => {
    const mock = instalarMockHashnode(
      () => new Response('não é json', { status: 200 }),
    )
    try {
      await expect(
        publishHashnode(
          { token: 'TOK', publicationId: 'PUBID', baseUrl: BASE_URL_TESTE },
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
        publishHashnode(
          { token: 'TOK', publicationId: 'PUBID', baseUrl: BASE_URL_TESTE },
          { title: 'T', bodyMd: 'x' },
        ),
      ).rejects.toThrow()
    } finally {
      globalThis.fetch = fetchOriginal
    }
  })
})

// ---------------------------------------------------------------------------
// ⚠️ I1 (fix round 1): timeout precisa cobrir a leitura do corpo — ver o
// comentário equivalente em `devto.test.ts`.
// ---------------------------------------------------------------------------
describe('publishHashnode — timeout cobre a leitura do corpo (I1)', () => {
  test('corpo que nunca resolve: falha por timeout, não fica pendurado', async () => {
    const mock = instalarMockHashnode(({ signal }) =>
      respostaComCorpoQueNuncaResolve(500, signal),
    )
    try {
      await expect(
        publishHashnode(
          {
            token: 'TOK',
            publicationId: 'PUBID',
            baseUrl: BASE_URL_TESTE,
            timeoutMs: 20,
          },
          { title: 'T', bodyMd: 'x' },
        ),
      ).rejects.toThrow(/tempo limite/)
    } finally {
      mock.restaurar()
    }
  })
})

// --------------------------------------------------------------------------
// HASHNODE_API_TOKEN NUNCA vaza.
// --------------------------------------------------------------------------

describe('publishHashnode — HASHNODE_API_TOKEN NUNCA vaza', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('status de erro imediato (500): o token NUNCA aparece na mensagem lançada', async () => {
    const tokenMarcador = 'MARCADOR-HASHNODE-TOKEN-NAO-PODE-VAZAR-4b2'
    const mock = instalarMockHashnode(
      () => new Response('corpo de erro qualquer', { status: 500 }),
    )
    try {
      const erro = await publishHashnode(
        {
          token: tokenMarcador,
          publicationId: 'PUBID',
          baseUrl: BASE_URL_TESTE,
        },
        { title: 'T', bodyMd: 'x' },
      ).catch((e: unknown) => e)
      expect(erro).toBeInstanceOf(Error)
      expect((erro as Error).message).not.toContain(tokenMarcador)
    } finally {
      mock.restaurar()
    }
  })

  test('falha de rede: o token NUNCA aparece, mesmo que o erro original cite a URL', async () => {
    const tokenMarcador = 'MARCADOR-HASHNODE-TOKEN-REDE-8f1'
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
      const erro = await publishHashnode(
        {
          token: tokenMarcador,
          publicationId: 'PUBID',
          baseUrl: BASE_URL_TESTE,
        },
        { title: 'T', bodyMd: 'x' },
      ).catch((e: unknown) => e)
      expect(erro).toBeInstanceOf(Error)
      expect((erro as Error).message).not.toContain(tokenMarcador)
    } finally {
      globalThis.fetch = fetchOriginal
    }
  })
})
