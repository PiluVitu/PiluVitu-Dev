import { afterEach, describe, expect, test, vi } from 'vitest'
import { searchPoster } from './tmdb'

const BASE_URL_TESTE = 'https://tmdb-teste.invalido'

/**
 * Instala um `globalThis.fetch` que responde só pra requisições cujo `url`
 * COMEÇA com `BASE_URL_TESTE` — delega qualquer outra coisa pro `fetch`
 * original (mesmo padrão de `lib/gsheets.test.ts`/`lib/google-auth.test.ts`:
 * nunca chama o serviço de verdade, sempre restaura no `finally`).
 */
function instalarMockTmdb(
  responder: (url: URL) => Response | Promise<Response>,
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
      return responder(new URL(urlTexto))
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

describe('searchPoster — fail-soft (Step 1, o ponto inteiro deste arquivo)', () => {
  test('404 devolve poster/tmdbId vazios — NÃO lança', async () => {
    const mock = instalarMockTmdb(
      () => new Response('não achei', { status: 404 }),
    )
    try {
      await expect(
        searchPoster(
          { apiKey: 'chave', baseUrl: BASE_URL_TESTE },
          'Filme Obscuro',
          'filme',
        ),
      ).resolves.toEqual({ posterUrl: '', tmdbId: 0 })
    } finally {
      mock.restaurar()
    }
  })

  test('results vazio devolve poster/tmdbId vazios — NÃO lança', async () => {
    const mock = instalarMockTmdb(() => jsonResponse(200, { results: [] }))
    try {
      await expect(
        searchPoster(
          { apiKey: 'chave', baseUrl: BASE_URL_TESTE },
          'Sem Resultado',
          'filme',
        ),
      ).resolves.toEqual({ posterUrl: '', tmdbId: 0 })
    } finally {
      mock.restaurar()
    }
  })

  // ⚠️ M4 (fix round 1, achado da revisão): `{"results":[null]}` é um
  // shape real de resposta que o Go decodifica pra um `searchResult`
  // zero-value e fail-softa igual a `results` vazio — `first === undefined`
  // sozinho (a versão anterior) deixava `null` passar, e `first.poster_path`
  // lançava `TypeError`. `!first` (a correção) cobre os dois.
  test('"results":[null] (elemento nulo, não ausente) também devolve poster/tmdbId vazios — não lança TypeError', async () => {
    const mock = instalarMockTmdb(() => jsonResponse(200, { results: [null] }))
    try {
      await expect(
        searchPoster(
          { apiKey: 'chave', baseUrl: BASE_URL_TESTE },
          'Elemento Nulo',
          'filme',
        ),
      ).resolves.toEqual({ posterUrl: '', tmdbId: 0 })
    } finally {
      mock.restaurar()
    }
  })

  test('"results" ausente do corpo (não só vazio) também devolve poster/tmdbId vazios', async () => {
    const mock = instalarMockTmdb(() => jsonResponse(200, {}))
    try {
      await expect(
        searchPoster(
          { apiKey: 'chave', baseUrl: BASE_URL_TESTE },
          'Sem Campo Results',
          'filme',
        ),
      ).resolves.toEqual({ posterUrl: '', tmdbId: 0 })
    } finally {
      mock.restaurar()
    }
  })

  test('poster_path nulo devolve posterUrl vazio MAS preserva o tmdbId real (Go: r.PosterPath == nil devolve ("", r.ID, nil))', async () => {
    const mock = instalarMockTmdb(() =>
      jsonResponse(200, { results: [{ id: 555, poster_path: null }] }),
    )
    try {
      await expect(
        searchPoster(
          { apiKey: 'chave', baseUrl: BASE_URL_TESTE },
          'Sem Pôster',
          'filme',
        ),
      ).resolves.toEqual({ posterUrl: '', tmdbId: 555 })
    } finally {
      mock.restaurar()
    }
  })

  test('poster_path AUSENTE (chave nem existe) é tratado igual a nulo — não vira ".../w500undefined"', async () => {
    // Achado da revisão final da fatia ③. A checagem estrita anterior
    // (`=== null || === ''`) deixava a chave ausente passar e montava
    // `https://image.tmdb.org/t/p/w500undefined` — que NÃO é string vazia,
    // logo era GRAVADO em `session_movies.poster_url` e devolvido como
    // `PosterURL`. O Go decodifica a chave ausente pro zero-value `""` e
    // fail-softa preservando o id, igual ao caso nulo.
    const mock = instalarMockTmdb(() =>
      jsonResponse(200, { results: [{ id: 557 }] }),
    )
    try {
      const resultado = await searchPoster(
        { apiKey: 'chave', baseUrl: BASE_URL_TESTE },
        'Chave Ausente',
        'filme',
      )
      expect(resultado).toEqual({ posterUrl: '', tmdbId: 557 })
      // Asserção negativa explícita: é ESTA string que vazava pro banco.
      expect(resultado.posterUrl).not.toContain('undefined')
    } finally {
      mock.restaurar()
    }
  })

  test('poster_path string vazia é tratado igual a nulo', async () => {
    const mock = instalarMockTmdb(() =>
      jsonResponse(200, { results: [{ id: 556, poster_path: '' }] }),
    )
    try {
      await expect(
        searchPoster(
          { apiKey: 'chave', baseUrl: BASE_URL_TESTE },
          'Pôster Vazio',
          'filme',
        ),
      ).resolves.toEqual({ posterUrl: '', tmdbId: 556 })
    } finally {
      mock.restaurar()
    }
  })

  test('happy path — devolve a URL completa do pôster (CDN base + poster_path) e o tmdbId', async () => {
    const mock = instalarMockTmdb(() =>
      jsonResponse(200, {
        results: [
          { id: 42, poster_path: '/abc123.jpg' },
          { id: 43, poster_path: '/nao-deveria-usar-este.jpg' },
        ],
      }),
    )
    try {
      const resultado = await searchPoster(
        { apiKey: 'chave', baseUrl: BASE_URL_TESTE },
        'Filme Achado',
        'filme',
      )
      // Só o PRIMEIRO resultado é usado — mesmo comportamento do Go
      // (`body.Results[0]`), nunca o "melhor match" por algum critério.
      expect(resultado).toEqual({
        posterUrl: 'https://image.tmdb.org/t/p/w500/abc123.jpg',
        tmdbId: 42,
      })
    } finally {
      mock.restaurar()
    }
  })
})

describe('searchPoster — só 5xx, 4xx≠404, ou parse quebrado propagam', () => {
  test('5xx lança', async () => {
    const mock = instalarMockTmdb(
      () => new Response('erro do servidor', { status: 503 }),
    )
    try {
      await expect(
        searchPoster(
          { apiKey: 'chave', baseUrl: BASE_URL_TESTE },
          'Falha 5xx',
          'filme',
        ),
      ).rejects.toThrow()
    } finally {
      mock.restaurar()
    }
  })

  test('4xx ≠ 404 (ex.: 401 chave inválida) lança', async () => {
    const mock = instalarMockTmdb(
      () => new Response('não autorizado', { status: 401 }),
    )
    try {
      await expect(
        searchPoster(
          { apiKey: 'chave-invalida', baseUrl: BASE_URL_TESTE },
          'Falha 401',
          'filme',
        ),
      ).rejects.toThrow()
    } finally {
      mock.restaurar()
    }
  })

  test('JSON malformado lança', async () => {
    const mock = instalarMockTmdb(
      () => new Response('isto nao e json', { status: 200 }),
    )
    try {
      await expect(
        searchPoster(
          { apiKey: 'chave', baseUrl: BASE_URL_TESTE },
          'JSON Quebrado',
          'filme',
        ),
      ).rejects.toThrow()
    } finally {
      mock.restaurar()
    }
  })

  test('falha de rede (fetch rejeita) lança', async () => {
    const fetchOriginal = globalThis.fetch
    globalThis.fetch = (async () => {
      throw new TypeError('network error simulado')
    }) as typeof fetch
    try {
      await expect(
        searchPoster(
          { apiKey: 'chave', baseUrl: BASE_URL_TESTE },
          'Falha de Rede',
          'filme',
        ),
      ).rejects.toThrow()
    } finally {
      globalThis.fetch = fetchOriginal
    }
  })

  // `instalarMockTmdb` não serve aqui: o `fetch` de mentira que ele instala
  // não sabe nada sobre `AbortSignal` (é só um `responder(url)` direto), e um
  // `signal` já abortado precisa de um `fetch` que de fato o respeite — o
  // MESMO contrato que o `fetch` real do runtime cumpre (rejeita
  // imediatamente se `init.signal.aborted` já é `true`). Este teste prova só
  // que `searchPoster` REPASSA `opts.signal` pro `fetch` (`{signal:
  // opts.signal}`) — quem decide o timeout de verdade (3s) é a ROTA
  // (`routes/votacao.ts`), não esta função.
  test('signal já abortado (timeout externo) faz a busca rejeitar — o CHAMADOR decide o fail-soft, não searchPoster', async () => {
    const fetchOriginal = globalThis.fetch
    globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        if (init?.signal?.aborted) {
          reject(new DOMException('The operation was aborted.', 'AbortError'))
          return
        }
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'))
        })
      })
    }) as typeof fetch
    try {
      const controller = new AbortController()
      controller.abort()
      await expect(
        searchPoster(
          { apiKey: 'chave', baseUrl: BASE_URL_TESTE },
          'Abortado',
          'filme',
          { signal: controller.signal },
        ),
      ).rejects.toThrow()
    } finally {
      globalThis.fetch = fetchOriginal
    }
  })
})

describe('searchPoster — endpoint por mediaType', () => {
  // `urlsCapturadas` (array, `.push()`) em vez de um `let` reatribuído
  // dentro do closure do mock — TS não consegue provar, através da fronteira
  // de função, que `instalarMockTmdb` invoca o `responder` de forma
  // síncrona, e "esquece" a atribuição feita lá dentro (colapsa o tipo do
  // `let` de volta pro estreitamento anterior à chamada). Um array evita o
  // problema por completo.
  test("mediaType 'serie' bate em /3/search/tv", async () => {
    const urlsCapturadas: URL[] = []
    const mock = instalarMockTmdb((url) => {
      urlsCapturadas.push(url)
      return jsonResponse(200, { results: [] })
    })
    try {
      await searchPoster(
        { apiKey: 'chave', baseUrl: BASE_URL_TESTE },
        'Uma Série',
        'serie',
      )
      expect(urlsCapturadas[0]?.pathname).toBe('/3/search/tv')
    } finally {
      mock.restaurar()
    }
  })

  test("mediaType 'filme' bate em /3/search/movie", async () => {
    const urlsCapturadas: URL[] = []
    const mock = instalarMockTmdb((url) => {
      urlsCapturadas.push(url)
      return jsonResponse(200, { results: [] })
    })
    try {
      await searchPoster(
        { apiKey: 'chave', baseUrl: BASE_URL_TESTE },
        'Um Filme',
        'filme',
      )
      expect(urlsCapturadas[0]?.pathname).toBe('/3/search/movie')
    } finally {
      mock.restaurar()
    }
  })

  test('a query string carrega api_key, query (título) e include_adult=false', async () => {
    const urlsCapturadas: URL[] = []
    const mock = instalarMockTmdb((url) => {
      urlsCapturadas.push(url)
      return jsonResponse(200, { results: [] })
    })
    try {
      await searchPoster(
        { apiKey: 'minha-chave-123', baseUrl: BASE_URL_TESTE },
        'Título Com Espaços',
        'filme',
      )
      const url = urlsCapturadas[0]
      expect(url?.searchParams.get('api_key')).toBe('minha-chave-123')
      expect(url?.searchParams.get('query')).toBe('Título Com Espaços')
      expect(url?.searchParams.get('include_adult')).toBe('false')
    } finally {
      mock.restaurar()
    }
  })
})

// --------------------------------------------------------------------------
// TMDB_API_KEY NUNCA vaza — mesmo padrão de "segredo NUNCA vaza" já usado
// pro GOOGLE_SA_JSON (lib/gsheets.test.ts, routes/votacao.test.ts). A chave
// vai na query string da busca — um erro que ecoasse a URL, ou o erro cru
// do fetch/JSON.parse (que em alguns runtimes cita a URL), vazaria a chave.
// --------------------------------------------------------------------------

describe('searchPoster — TMDB_API_KEY NUNCA vaza', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('5xx com corpo sensível: a chave NUNCA aparece na mensagem de erro lançada', async () => {
    const chaveMarcador = 'MARCADOR-TMDB-API-KEY-NAO-PODE-VAZAR'
    const mock = instalarMockTmdb(
      () => new Response('corpo de erro qualquer', { status: 500 }),
    )
    try {
      let erroCapturado: unknown
      try {
        await searchPoster(
          { apiKey: chaveMarcador, baseUrl: BASE_URL_TESTE },
          'Filme',
          'filme',
        )
      } catch (err) {
        erroCapturado = err
      }
      expect(erroCapturado).toBeInstanceOf(Error)
      const mensagem = (erroCapturado as Error).message
      expect(mensagem).not.toContain(chaveMarcador)
      expect(mensagem).not.toContain(BASE_URL_TESTE)
    } finally {
      mock.restaurar()
    }
  })

  test('JSON malformado: a chave NUNCA aparece na mensagem de erro lançada', async () => {
    const chaveMarcador = 'MARCADOR-TMDB-API-KEY-JSON-QUEBRADO'
    const mock = instalarMockTmdb(
      () => new Response('nao e json', { status: 200 }),
    )
    try {
      let erroCapturado: unknown
      try {
        await searchPoster(
          { apiKey: chaveMarcador, baseUrl: BASE_URL_TESTE },
          'Filme',
          'filme',
        )
      } catch (err) {
        erroCapturado = err
      }
      expect(erroCapturado).toBeInstanceOf(Error)
      const mensagem = (erroCapturado as Error).message
      expect(mensagem).not.toContain(chaveMarcador)
      expect(mensagem).not.toContain(BASE_URL_TESTE)
    } finally {
      mock.restaurar()
    }
  })

  test('falha de rede: a chave NUNCA aparece na mensagem de erro lançada, mesmo que o erro original do fetch cite a URL', async () => {
    const chaveMarcador = 'MARCADOR-TMDB-API-KEY-REDE'
    const fetchOriginal = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const urlTexto =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
      // Simula um runtime cujo erro de rede ecoa a URL completa (com a
      // chave) na própria mensagem — é exatamente esse texto que
      // searchPoster NUNCA pode deixar escapar pra fora.
      throw new TypeError(`fetch failed: ${urlTexto}`)
    }) as typeof fetch
    try {
      let erroCapturado: unknown
      try {
        await searchPoster(
          { apiKey: chaveMarcador, baseUrl: BASE_URL_TESTE },
          'Filme',
          'filme',
        )
      } catch (err) {
        erroCapturado = err
      }
      expect(erroCapturado).toBeInstanceOf(Error)
      const mensagem = (erroCapturado as Error).message
      expect(mensagem).not.toContain(chaveMarcador)
      expect(mensagem).not.toContain(BASE_URL_TESTE)
    } finally {
      globalThis.fetch = fetchOriginal
    }
  })
})
