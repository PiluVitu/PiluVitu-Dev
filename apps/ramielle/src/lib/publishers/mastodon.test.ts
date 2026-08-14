import { afterEach, describe, expect, test, vi } from 'vitest'
import { respostaComCorpoQueNuncaResolve } from '../../test-support/hanging-response'
import { publishMastodon } from './mastodon'

type RequisicaoCapturada = {
  url: URL
  headers: Headers
  body: unknown
  signal: AbortSignal | null | undefined
}

/**
 * Mesmo padrão de `lib/tmdb.test.ts`, mas o Mastodon NÃO tem `baseUrl`
 * separada de teste no Go (`NewMastodon(instanceURL, token)` já recebe a
 * URL completa) — então aqui interceptamos TUDO que passa por
 * `globalThis.fetch` (nenhum teste deste arquivo precisa de fetch real —
 * M5 do fix round 1 não se aplica aqui pela mesma razão que já não se
 * aplicava antes: não há branch de delegação nenhuma pra corrigir).
 */
function instalarMockMastodon(
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
    const headers = new Headers(init?.headers)
    const body = init?.body ? JSON.parse(init.body as string) : undefined
    const req = {
      url: new URL(urlTexto),
      headers,
      body,
      signal: init?.signal,
    }
    requisicoes.push(req)
    return responder(req)
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

describe('publishMastodon — caminho feliz (porte de TestMastodonPublish)', () => {
  test('posta com Authorization: Bearer, corpo COMPLETO (I2) e devolve a url do toot', async () => {
    const mock = instalarMockMastodon((req) => {
      expect(req.headers.get('Authorization')).toBe('Bearer TOK')
      expect(req.url.pathname).toBe('/api/v1/statuses')
      expect(req.body).toEqual({ status: 'toot!' })
      return jsonResponse(200, { url: 'https://mast.odon/@me/9', id: '9' })
    })
    try {
      const url = await publishMastodon(
        { instanceUrl: 'https://mast.odon', token: 'TOK' },
        { text: 'toot!' },
      )
      expect(url).toBe('https://mast.odon/@me/9')
    } finally {
      mock.restaurar()
    }
  })

  test('instanceUrl com barra(s) no final não gera // duplicado no path', async () => {
    const mock = instalarMockMastodon((req) => {
      expect(req.url.pathname).toBe('/api/v1/statuses')
      expect(req.url.toString()).not.toContain('//api')
      return jsonResponse(200, { url: 'https://mast.odon/@me/1' })
    })
    try {
      await publishMastodon(
        { instanceUrl: 'https://mast.odon///', token: 'TOK' },
        { text: 'x' },
      )
    } finally {
      mock.restaurar()
    }
  })
})

describe('publishMastodon — com canonicalUrl (porte de TestMastodonPublishWithCanonicalURL)', () => {
  test('status postado é hook + "\\n\\n" + canonicalUrl', async () => {
    const canonicalUrl = 'https://blog/artigo'
    const hookText = 'escrevi sobre algo interessante'
    let statusPostado = ''
    const mock = instalarMockMastodon((req) => {
      statusPostado = (req.body as { status: string }).status
      return jsonResponse(200, { url: 'https://mast.odon/@me/10' })
    })
    try {
      const url = await publishMastodon(
        { instanceUrl: 'https://mast.odon', token: 'TOK' },
        { text: hookText, canonicalUrl },
      )
      expect(url).toBe('https://mast.odon/@me/10')
      expect(statusPostado).toBe(`${hookText}\n\n${canonicalUrl}`)
      expect(statusPostado).toContain(canonicalUrl)
    } finally {
      mock.restaurar()
    }
  })
})

describe('publishMastodon — limite de 500 caracteres (porte de Test*RejectsTooLong)', () => {
  test('501 caracteres sem url lança', async () => {
    const mock = instalarMockMastodon(() => {
      throw new Error('não deveria chamar a rede')
    })
    try {
      await expect(
        publishMastodon(
          { instanceUrl: 'https://x', token: 't' },
          { text: 'x'.repeat(501) },
        ),
      ).rejects.toThrow(/500 caracteres/)
    } finally {
      mock.restaurar()
    }
  })

  test('exatamente 500 caracteres NÃO lança (limite é inclusive)', async () => {
    const mock = instalarMockMastodon(() =>
      jsonResponse(200, { url: 'https://mast.odon/@me/limite' }),
    )
    try {
      await expect(
        publishMastodon(
          { instanceUrl: 'https://x', token: 't' },
          { text: 'x'.repeat(500) },
        ),
      ).resolves.not.toThrow()
    } finally {
      mock.restaurar()
    }
  })

  test('490 caracteres de hook + URL de 10 excede 500 depois de anexar (porte de TestMastodonRejectsTooLongWithURL)', async () => {
    // 490 + "\n\n" (2) + 10 = 502 > 500 → lança.
    const mock = instalarMockMastodon(() => {
      throw new Error('não deveria chamar a rede')
    })
    try {
      await expect(
        publishMastodon(
          { instanceUrl: 'https://x', token: 't' },
          {
            text: 'x'.repeat(490),
            canonicalUrl: 'y'.repeat(10),
          },
        ),
      ).rejects.toThrow(/500 caracteres/)
    } finally {
      mock.restaurar()
    }
  })

  test('hook curto + URL cabendo nos 500 depois de anexar NÃO lança', async () => {
    const mock = instalarMockMastodon(() =>
      jsonResponse(200, { url: 'https://mast.odon/@me/x' }),
    )
    try {
      await expect(
        publishMastodon(
          { instanceUrl: 'https://x', token: 't' },
          { text: 'oi', canonicalUrl: 'https://blog/p' },
        ),
      ).resolves.not.toThrow()
    } finally {
      mock.restaurar()
    }
  })
})

// ---------------------------------------------------------------------------
// ⚠️ armadilha 1: contagem por CODE POINT, não `.length` (mastodon.go:42).
// Mesmo raciocínio de `bluesky.test.ts` — '😀' é 1 code point, 2 unidades
// UTF-16 (surrogate pair).
// ---------------------------------------------------------------------------
describe('publishMastodon — code point ≠ .length (armadilha 1, mastodon.go:42)', () => {
  test('501 emojis (501 code points, 1002 unidades UTF-16) lança', async () => {
    const mock = instalarMockMastodon(() => {
      throw new Error('não deveria chamar a rede')
    })
    try {
      await expect(
        publishMastodon(
          { instanceUrl: 'https://x', token: 't' },
          { text: '😀'.repeat(501) },
        ),
      ).rejects.toThrow(/500 caracteres/)
    } finally {
      mock.restaurar()
    }
  })

  test('500 emojis (500 code points, MAS 1000 unidades UTF-16) NÃO lança — só passa com contagem por code point', async () => {
    const mock = instalarMockMastodon(() =>
      jsonResponse(200, { url: 'https://mast.odon/@me/emoji' }),
    )
    try {
      await expect(
        publishMastodon(
          { instanceUrl: 'https://x', token: 't' },
          { text: '😀'.repeat(500) },
        ),
      ).resolves.not.toThrow()
    } finally {
      mock.restaurar()
    }
  })
})

describe('publishMastodon — outros modos de falha', () => {
  test('status fora de 2xx lança, incluindo o corpo (truncado)', async () => {
    const mock = instalarMockMastodon(
      () => new Response('token expirado', { status: 401 }),
    )
    try {
      await expect(
        publishMastodon(
          { instanceUrl: 'https://x', token: 'expirado' },
          { text: 'x' },
        ),
      ).rejects.toThrow(/401/)
    } finally {
      mock.restaurar()
    }
  })

  test('JSON quebrado lança', async () => {
    const mock = instalarMockMastodon(
      () => new Response('não é json', { status: 200 }),
    )
    try {
      await expect(
        publishMastodon(
          { instanceUrl: 'https://x', token: 't' },
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
        publishMastodon(
          { instanceUrl: 'https://x', token: 't' },
          { text: 'x' },
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
describe('publishMastodon — timeout cobre a leitura do corpo (I1)', () => {
  test('corpo que nunca resolve: falha por timeout, não fica pendurado', async () => {
    const mock = instalarMockMastodon(({ signal }) =>
      respostaComCorpoQueNuncaResolve(500, signal),
    )
    try {
      await expect(
        publishMastodon(
          { instanceUrl: 'https://x', token: 't', timeoutMs: 20 },
          { text: 'x' },
        ),
      ).rejects.toThrow(/tempo limite/)
    } finally {
      mock.restaurar()
    }
  })
})

// --------------------------------------------------------------------------
// MASTODON_ACCESS_TOKEN NUNCA vaza.
// --------------------------------------------------------------------------

describe('publishMastodon — MASTODON_ACCESS_TOKEN NUNCA vaza', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('status de erro: o token NUNCA aparece na mensagem lançada', async () => {
    const tokenMarcador = 'MARCADOR-MASTODON-TOKEN-NAO-PODE-VAZAR-3f8'
    const mock = instalarMockMastodon(
      () => new Response('corpo de erro qualquer', { status: 500 }),
    )
    try {
      const erro = await publishMastodon(
        { instanceUrl: 'https://x', token: tokenMarcador },
        { text: 'x' },
      ).catch((e: unknown) => e)
      expect(erro).toBeInstanceOf(Error)
      expect((erro as Error).message).not.toContain(tokenMarcador)
    } finally {
      mock.restaurar()
    }
  })

  test('falha de rede: o token NUNCA aparece, mesmo que o erro original cite a URL', async () => {
    const tokenMarcador = 'MARCADOR-MASTODON-TOKEN-REDE-1c7'
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
      const erro = await publishMastodon(
        { instanceUrl: 'https://x', token: tokenMarcador },
        { text: 'x' },
      ).catch((e: unknown) => e)
      expect(erro).toBeInstanceOf(Error)
      expect((erro as Error).message).not.toContain(tokenMarcador)
    } finally {
      globalThis.fetch = fetchOriginal
    }
  })
})
