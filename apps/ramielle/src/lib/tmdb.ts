/**
 * Cliente do TMDb (fatia ③, Task 4) — porte de
 * `apps/api/internal/tmdb/search.go#SearchPoster`. Usado por `POST
 * /votacao/sessions` (`routes/votacao.ts`) pra enriquecer cada filme
 * sorteado com pôster + id do TMDb.
 *
 * ⚠️ **Fail-soft é o ponto inteiro deste arquivo.** `404` OU `results` vazio
 * devolve `{posterUrl:'', tmdbId:0}` — NÃO é erro, mesmo que a busca não
 * tenha achado nada. Só `5xx`, `4xx` (≠404), falha de rede, ou JSON quebrado
 * lançam. Um porte que trate "não achei pôster" como falha derruba a
 * criação da sessão inteira por causa de um filme obscuro que o TMDb não
 * cataloga.
 *
 * ⚠️ **`TMDB_API_KEY` NUNCA aparece numa mensagem de erro.** A chave vai na
 * query string da busca (`api_key=...`) — um erro que ecoasse a URL, ou o
 * erro cru do `fetch`/`res.json()` (que pode citar a URL), vazaria a chave.
 * Toda mensagem lançada aqui é um texto FIXO, nunca construído a partir da
 * URL ou do erro original (`tmdb.test.ts`, describe "TMDB_API_KEY NUNCA
 * vaza", prova isto com uma chave-marcador).
 */

const POSTER_CDN_BASE = 'https://image.tmdb.org/t/p/w500'
const DEFAULT_BASE_URL = 'https://api.themoviedb.org'

export type TmdbConfig = {
  apiKey: string
  /**
   * Parametrizável só pra teste — mesmo papel do `NewClientWithBase` do Go
   * (`tmdb/client.go`). Produção nunca passa isto; cai no default real.
   */
  baseUrl?: string
}

export type TmdbSearchResult = {
  /** URL completa do pôster, ou `''` quando não há (fail-soft). */
  posterUrl: string
  /** Id do TMDb, ou `0` quando não há (fail-soft) — espelha `m.tmdbID > 0` no Go, nunca negativo/decimal. */
  tmdbId: number
}

export type SearchPosterOptions = {
  /**
   * `AbortSignal` externo — usado pela rota pra aplicar um timeout por
   * busca (paridade com `context.WithTimeout(gctx, 3*time.Second)` no Go,
   * `handlers/votacao/sessions.go:136`). Uma busca abortada lança (fetch
   * rejeita com `AbortError`), e fica sujeita ao MESMO fail-soft de
   * qualquer outra falha — quem decide isso é o CHAMADOR (`routes/
   * votacao.ts`), não esta função.
   */
  signal?: AbortSignal
}

type TmdbApiResult = {
  id: number
  poster_path: string | null
}

type TmdbApiResponse = {
  results?: TmdbApiResult[]
}

/**
 * Porte de `SearchPoster` (`tmdb/search.go:24-68`). `GET /search/movie` ou
 * `/search/tv` (`mediaType 'serie'` ⇒ `tv`, qualquer outra coisa ⇒ `movie`,
 * mesmo default do Go). Pôster final = `https://image.tmdb.org/t/p/w500` +
 * `poster_path`.
 *
 * Ordem das checagens de status — MEDIDA linha a linha em `search.go:46-54`:
 *
 *   1. `404`               -> fail-soft, `{posterUrl:'', tmdbId:0}`
 *   2. `>= 500`             -> lança
 *   3. `>= 400` (sobra: 4xx ≠ 404) -> lança
 *   4. parse do JSON quebra -> lança
 *   5. `results` vazio      -> fail-soft, `{posterUrl:'', tmdbId:0}`
 *   6. `poster_path` nulo/vazio -> fail-soft, mas com o `tmdbId` real (Go:
 *      `r.PosterPath == nil || *r.PosterPath == ""` devolve `("", r.ID, nil)`
 *      — o id NÃO se perde só porque não há pôster)
 */
export async function searchPoster(
  cfg: TmdbConfig,
  title: string,
  mediaType: 'filme' | 'serie',
  opts: SearchPosterOptions = {},
): Promise<TmdbSearchResult> {
  const endpoint = mediaType === 'serie' ? '/3/search/tv' : '/3/search/movie'
  const base = cfg.baseUrl ?? DEFAULT_BASE_URL
  const url = new URL(base + endpoint)
  url.searchParams.set('api_key', cfg.apiKey)
  url.searchParams.set('query', title)
  url.searchParams.set('include_adult', 'false')

  let res: Response
  try {
    res = await fetch(url.toString(), { signal: opts.signal })
  } catch {
    // Nunca inclui a URL (leva `api_key`) nem o erro original do fetch (que
    // em alguns runtimes ecoa a URL na própria mensagem) — texto fixo.
    throw new Error('tmdb: falha ao executar a requisição de busca')
  }

  if (res.status === 404) {
    return { posterUrl: '', tmdbId: 0 }
  }
  if (res.status >= 500) {
    throw new Error(`tmdb: status ${res.status}`)
  }
  if (res.status >= 400) {
    throw new Error(`tmdb: erro do cliente ${res.status}`)
  }

  let body: TmdbApiResponse
  try {
    body = (await res.json()) as TmdbApiResponse
  } catch {
    throw new Error('tmdb: resposta não é um JSON válido')
  }

  const results = body.results ?? []
  const first = results[0]
  // ⚠️ M4 (fix round 1, achado da revisão): `!first` cobre `undefined`
  // (results vazio) E `null` (`{"results":[null]}` — o Go decodifica pra um
  // `searchResult` zero-value e fail-softa igual; `first === undefined`
  // sozinho deixava `null` passar batido, e `first.poster_path` lançava
  // `TypeError` — divergência de contrato unitário que o fail-soft da ROTA
  // escondia (o erro virava fail-soft de qualquer jeito, só que pelo motivo
  // errado), mas quebrava a garantia desta função isolada.
  if (!first) {
    return { posterUrl: '', tmdbId: 0 }
  }
  if (first.poster_path === null || first.poster_path === '') {
    return { posterUrl: '', tmdbId: first.id }
  }
  return { posterUrl: POSTER_CDN_BASE + first.poster_path, tmdbId: first.id }
}
