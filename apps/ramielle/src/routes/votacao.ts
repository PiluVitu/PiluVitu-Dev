/**
 * As rotas de LEITURA da votação — `GET /sessions` e `GET /sessions/{id}`,
 * porte de `apps/api/internal/handlers/votacao/sessions.go#ListSessions`
 * (linha ~154) e `#GetSession` (linha ~166) — e a de ESCRITA, `POST
 * /sessions/{id}/votes`, porte de `#CreateVote` (`handlers/votacao/
 * votes.go:26-67`). Mesma convenção do resto do monorepo (`routes/auth.ts`):
 * `Env` local, nunca importa `Bindings` de `../index` (evitaria import
 * circular valor↔tipo).
 *
 * `session`/`movies` saem em PascalCase via `sessionToWire`/`movieToWire`
 * (`lib/wire.ts`) — NUNCA montados à mão. `has_voted`/`voted_movie_ids`
 * saem em snake_case, porque o handler Go monta esse corpo com
 * `map[string]any` (chaves explícitas), igual ao resto da API que não é
 * struct. A mistura É o contrato — ver `lib/wire.ts` pro raciocínio
 * completo.
 *
 * ⚠️ **A ordem das checagens do voto importa, e é OBSERVÁVEL via HTTP —
 * mas a fonte de verdade não é só ler `CreateVote` de cima a baixo.** No Go,
 * `POST /votacao/sessions/{id}/votes` é montado em `router.go` atrás de
 * `r.With(auth.RequireAuth(...))`, que é MIDDLEWARE — roda ANTES do corpo
 * de `CreateVote` em qualquer request real. O `user := auth.
 * UserFromContext(...); if user == nil { 401 }` DENTRO de `CreateVote` é
 * defensivo/morto pela rota mounted (só é alcançável se o handler for
 * chamado direto, bypassando o router — e é exatamente assim que
 * `votes_test.go` o exercita, por isso aquele teste não prova a ordem real).
 * Isso significa que a ordem HTTP verdadeira é: 401 (middleware) ANTES de
 * 400 invalid_id — o oposto do que a leitura ingênua do código de
 * `CreateVote` sugeriria. `requireAuth<AuthBindings>()` abaixo é montado do
 * MESMO jeito, como middleware ANTES do handler — mesma topologia do Go,
 * mesma convenção já usada por `GET /sessions/{id}` acima.
 */
import { Hono } from 'hono'
import type { AuthBindings } from '../lib/auth'
import { nowIsoUtc, toIsoUtc } from '../lib/dates'
import {
  requireAdmin,
  requireAuth,
  type SessionVariables,
} from '../lib/session'
import { errJson, okJson } from '../lib/envelope'
import {
  getCategories,
  readMovies,
  type GsheetsConfig,
  type SheetMovie,
} from '../lib/gsheets'
import { parseServiceAccount, type ServiceAccount } from '../lib/google-auth'
import {
  searchPoster,
  type TmdbConfig,
  type TmdbSearchResult,
} from '../lib/tmdb'
import { movieToWire, sessionToWire } from '../lib/wire'
import { computeTopMovies, tallyVotes } from '../domain/tally'
import { NoCandidatesError, sortOnePerCategory } from '../domain/sortear'
import {
  bytesToHex,
  hexToBytes,
  pickTiebreakIndex,
  tiebreakSeed,
} from '../domain/tiebreak'
// I3 (revisão final): o corte entre `domain/sessions.ts` e `domain/votes.ts`
// é por TABELA/AGREGADO, não mais por leitura/escrita — ver o cabeçalho dos
// dois arquivos. `sessions.ts` é dono de `voting_sessions`/`session_movies`
// (leitura E escrita, daí `closeVotingSession`/`setSessionWinner` virem de
// lá agora, e `createVotingSession`/`insertSessionMovies` — Task 4 — também);
// `votes.ts` é dono de `votes`/`tiebreaks` (idem, daí `getUserVotedMovieIds`
// vir de lá).
import {
  closeVotingSession,
  createVotingSession,
  getSessionMovies,
  getVotingSession,
  insertSessionMovies,
  listVotingSessions,
  setSessionWinner,
  type SessionMovieInsert,
} from '../domain/sessions'
import {
  countVoters,
  createTiebreak,
  getUserVotedMovieIds,
  listSessionVotesWithUsers,
  listVoteMovieIds,
  MovieNotInSessionError,
  replaceUserVotes,
} from '../domain/votes'

type Env = {
  Bindings: AuthBindings
  Variables: SessionVariables
}

const votacaoRoutes = new Hono<Env>()

/** Default do Go quando `GSHEETS_MOVIES_RANGE` está ausente/vazia (`cmd/api/main.go:63-65`). */
const DEFAULT_SHEETS_RANGE = 'A2:F'

type SheetsConfigResolution =
  | { ok: true; config: GsheetsConfig }
  | { ok: false; response: Response }

/**
 * Resolve a config do Sheets a partir das bindings — extraído na Task 4
 * (fatia ③) porque `POST /votacao/sessions` (abaixo) precisa EXATAMENTE da
 * mesma checagem que `GET /categorias` já fazia inline: ausência OU
 * malformação de `GOOGLE_SA_JSON`/`GSHEETS_MOVIES_SPREADSHEET_ID` é "sheets
 * desligado" (503), nunca "falha de leitura" (502) — mesma distinção
 * MEDIDA contra `cmd/api/main.go:61-72` já documentada abaixo antes desta
 * task existir como função própria. Puramente uma extração — nenhum
 * comportamento mudou (`GET /categorias` continua idêntico, ver
 * `routes/votacao.test.ts`).
 *
 * ⚠️ **Sheets DESLIGADO ⇒ 503 `sheets_disabled`** — no Go, o cliente só é
 * construído se `GSHEETS_MOVIES_SPREADSHEET_ID` estiver setado
 * (`cmd/api/main.go:61-72`), e os handlers respondem 503 quando ele é
 * `nil`. Aqui: falta `GOOGLE_SA_JSON` OU `GSHEETS_MOVIES_SPREADSHEET_ID` ⇒
 * 503, mesma mensagem do Go.
 *
 * ⚠️ **Achado além do brief (T2), MEDIDO contra `cmd/api/main.go:66-71`**:
 * o Go trata QUALQUER falha de CONSTRUÇÃO do cliente (`gsheets.NewClient`
 * devolvendo erro — o que acontece se a credencial ADC/service account for
 * malformada) como "sheets desligado" — ele só LOGA e segue com
 * `sheetsClient` permanecendo `nil` (`if gerr != nil { fmt.Fprintf(...);
 * } else { sheetsClient = c }`), NUNCA propaga como falha de leitura. Só
 * chamadas que falham DEPOIS do cliente já construído (a troca de token, o
 * fetch do range) viram 502. Um `GOOGLE_SA_JSON` presente mas malformado
 * (JSON inválido ou campo obrigatório faltando) é o equivalente exato de
 * `NewClient` falhar — por isso cai em 503 `sheets_disabled` aqui também,
 * não 502.
 */
function resolverSheetsConfig(env: AuthBindings): SheetsConfigResolution {
  const {
    GOOGLE_SA_JSON,
    GSHEETS_MOVIES_SPREADSHEET_ID,
    GSHEETS_MOVIES_RANGE,
  } = env
  if (!GOOGLE_SA_JSON || !GSHEETS_MOVIES_SPREADSHEET_ID) {
    return {
      ok: false,
      response: errJson(
        503,
        'sheets_disabled',
        'Integração com a planilha está desativada.',
      ),
    }
  }

  let serviceAccount: ServiceAccount
  try {
    serviceAccount = parseServiceAccount(GOOGLE_SA_JSON)
  } catch (err) {
    console.error(
      'resolverSheetsConfig — GOOGLE_SA_JSON malformado, tratando como sheets desligado (paridade com gsheets.NewClient falhando no Go)',
      err,
    )
    return {
      ok: false,
      response: errJson(
        503,
        'sheets_disabled',
        'Integração com a planilha está desativada.',
      ),
    }
  }

  return {
    ok: true,
    config: {
      serviceAccount,
      spreadsheetId: GSHEETS_MOVIES_SPREADSHEET_ID,
      range: GSHEETS_MOVIES_RANGE || DEFAULT_SHEETS_RANGE,
    },
  }
}

/**
 * `GET /votacao/categorias` — porte de `GetCategorias`
 * (`handlers/votacao/categorias.go`). Devolve a lista de categorias
 * presentes na planilha de filmes, deduplicada e ordenada
 * (`lib/gsheets.ts#getCategories`). A checagem de config (503
 * `sheets_disabled`) mora em `resolverSheetsConfig` acima.
 *
 * ⚠️ **Falha do Sheets (depois da configuração validada) ⇒ 502
 * `sheets_read_failed`**, não 500 (o Go usa `StatusBadGateway`) — cobre
 * troca de token, `fetch` do range, resposta não-ok, JSON malformado
 * (tudo dentro de `lib/gsheets.ts#getCategories`/`readMovies`).
 */
votacaoRoutes.get('/categorias', requireAuth<AuthBindings>(), async (c) => {
  const resolucao = resolverSheetsConfig(c.env)
  if (!resolucao.ok) return resolucao.response

  let categories: string[]
  try {
    categories = await getCategories(resolucao.config)
  } catch (err) {
    console.error('GET /votacao/categorias — falha ao ler a planilha', err)
    return errJson(
      502,
      'sheets_read_failed',
      'Falha ao ler a planilha de filmes.',
    )
  }

  return okJson({ categories })
})

// ---------------------------------------------------------------------------
// POST /votacao/sessions (admin) — fatia ③, Task 4. Porte de `CreateSession`
// (`handlers/votacao/sessions.go:30-111`): lê o catálogo do Sheets, sorteia
// 1 filme por categoria (`domain/sortear.ts`, fatia ③ Task 3), busca
// pôsteres no TMDb em paralelo (fail-soft), grava sessão + filmes
// (`domain/sessions.ts`, chunking acima do teto de bound params).
//
// ⚠️ **A ORDEM das checagens abaixo é a MEDIDA no Go, e diverge da leitura
// "óbvia" do corpo do handler — e diverge do que um resumo apressado deste
// brief diria.** `handlers/votacao/sessions.go:30-51`, linha a linha:
//
//   0. (middleware) sem sessão válida        -> 401 not_authenticated
//   0. (middleware) não-admin                -> 403 admin_only
//   1. Sheets desligado/malformado           -> 503 sheets_disabled
//   2. corpo não é JSON válido               -> 400 invalid_json
//   3. `title` vazio (após decode OK)        -> 400 title_required (field: title)
//   4. falha ao ler a planilha               -> 502 sheets_read_failed
//   5. nenhum filme sobrevive aos filtros    -> 422 no_candidates
//   6. (defensivo, inalcançável na prática)  -> 500 internal_error
//
// ⚠️ **Achado próprio desta task: o Sheets é checado ANTES de decodificar o
// corpo — não depois, como um resumo linear sugeriria.** `CreateSession`
// (Go) testa `h.deps.Sheets == nil` como a PRIMEIRA linha da função, antes
// até de checar `user == nil` (código morto — o guard real é o middleware,
// mesma topologia já estabelecida por `POST /close`/`POST /tiebreak`) e
// muito antes de `json.NewDecoder(r.Body).Decode(&body)`. Um `POST
// /votacao/sessions` com `Content-Type` quebrado E sheets desligado responde
// 503, nunca 400 — a ordem é OBSERVÁVEL via HTTP nesse cenário, e só se
// prova lendo o handler, não resumindo-o.
//
// ⚠️ **Achado próprio desta task: `title` vazio NÃO é `invalid_json`.** O Go
// usa `httpx.Errors` (não `httpx.Error`) com um código e campo PRÓPRIOS:
// `Code: "title_required"`, `Field: "title"`, mensagem "Informe um título
// para a sessão." — um código DIFERENTE de `invalid_json` e com o campo
// ofensor marcado. Confundir os dois quebraria o toast do `apps/web` (que
// lê `primary.message` direto) e qualquer destaque de campo no formulário.
// ---------------------------------------------------------------------------

type RawCreateSessionBody = {
  title?: unknown
  types?: unknown
  include_watched?: unknown
  categories?: unknown
}

type ParsedCreateSessionBody = {
  title: string
  types: string[]
  includeWatched: boolean
  categories: string[]
}

function parseStringArray(raw: unknown): string[] | null {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) return null
  const out: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') return null
    out.push(item)
  }
  return out
}

/**
 * Espelha a semântica de `json.NewDecoder(r.Body).Decode(&createSessionBody{})`
 * do Go: campo AUSENTE (ou corpo `null`) decodifica pro zero-value —
 * `title:''`, `types:[]`, `includeWatched:false`, `categories:[]` — nunca
 * erro. Só vira inválido (devolve `null`, a rota decide o 400
 * `invalid_json`) quando o corpo não é um objeto, ou quando um campo
 * PRESENTE tem o tipo errado (`title` não-string, `types`/`categories`
 * não-array-de-strings, `include_watched` não-bool) — mesma rigidez de tipo
 * que o decoder JSON do Go teria nesses casos.
 *
 * ⚠️ **NÃO faz `trim()` no título** — o Go compara `body.Title == ""` cru;
 * um título só de espaços PASSA nesta validação (mesma paridade).
 */
function parseCreateSessionBody(raw: unknown): ParsedCreateSessionBody | null {
  if (raw === null) {
    return { title: '', types: [], includeWatched: false, categories: [] }
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) return null
  const body = raw as RawCreateSessionBody

  let title = ''
  if (body.title !== undefined && body.title !== null) {
    if (typeof body.title !== 'string') return null
    title = body.title
  }

  const types = parseStringArray(body.types)
  if (types === null) return null

  let includeWatched = false
  if (body.include_watched !== undefined && body.include_watched !== null) {
    if (typeof body.include_watched !== 'boolean') return null
    includeWatched = body.include_watched
  }

  const categories = parseStringArray(body.categories)
  if (categories === null) return null

  return { title, types, includeWatched, categories }
}

const TMDB_MAX_CONCURRENCY = 5
const TMDB_TIMEOUT_MS = 3000

/**
 * Semáforo simples de concorrência — código próprio, sem dependência nova
 * (convenção do workspace). `adquirir()` resolve quando uma vaga libera,
 * devolvendo a função de liberação (quem chamou tem que invocá-la, sempre
 * num `finally`, pra devolver a vaga pro próximo da fila).
 */
function criarSemaforo(max: number): { adquirir: () => Promise<() => void> } {
  let emUso = 0
  const fila: (() => void)[] = []

  function liberar(): void {
    emUso -= 1
    const proximo = fila.shift()
    if (proximo) {
      emUso += 1
      proximo()
    }
  }

  function adquirir(): Promise<() => void> {
    return new Promise((resolve) => {
      if (emUso < max) {
        emUso += 1
        resolve(liberar)
      } else {
        fila.push(() => resolve(liberar))
      }
    })
  }

  return { adquirir }
}

/** Opções de `fetchPostersConcorrente` — ver o campo `timeoutMs` pro porquê existe. */
export type FetchPostersConcorrenteOptions = {
  /**
   * ⚠️ **I1 (fix round 1, achado Important da revisão): promovido de
   * constante interna pra opção injetável — SÓ pra teste.** Produção nunca
   * passa isto (cai no default `TMDB_TIMEOUT_MS`, os 3s reais). Sem este
   * seam, não havia como testar "o abort de fato dispara e cai no
   * fail-soft" sem ou (a) esperar 3s de verdade por teste, ou (b) confiar
   * cegamente na leitura do código — a revisão mostrou que a fiação inteira
   * (`AbortController`/`setTimeout`/`clearTimeout`/`signal`) podia ser
   * apagada, reduzindo a chamada a `searchPoster(cfg, movie.title,
   * movie.type)` crua, com `tsc --noEmit` limpo (`TMDB_TIMEOUT_MS` vira
   * variável não usada sem reclamação, `noUnusedLocals` desligado) E a
   * suíte inteira passando — nenhuma rede de regressão. `timeoutMs: 20` no
   * teste (`routes/votacao.test.ts`, describe `fetchPostersConcorrente —
   * timeout de verdade`) prova a fiação sem pagar 3s reais.
   */
  timeoutMs?: number
}

/**
 * Busca pôsteres em PARALELO com teto de concorrência 5 e timeout de 3s
 * cada — porte de `fetchPosters` (`handlers/votacao/sessions.go:119-151`,
 * usa `errgroup.SetLimit(5)` + `context.WithTimeout(gctx, 3*time.Second)`
 * por busca).
 *
 * ⚠️ **Fail-soft é o ponto — uma busca que falha NUNCA derruba a sessão.**
 * O `try/catch` AQUI DENTRO (por filme) é o que garante isso: uma falha
 * (erro do TMDb, timeout por abort) é logada e a entrada correspondente
 * fica com `{posterUrl:'', tmdbId:0}` (default), sem propagar. `Promise.all`
 * (não `allSettled`) é seguro porque NENHUMA das tarefas mapeadas abaixo
 * jamais rejeita — o catch garante isso; é exatamente esse catch que a
 * mutação obrigatória desta task remove, pra provar que sem ele uma falha
 * REALMENTE propagaria (`Promise.all` rejeitando) e derrubaria a sessão
 * inteira com 500.
 *
 * ⚠️ **O `setTimeout` começa DEPOIS de `await semaforo.adquirir()`, nunca
 * antes — detalhe de desenho que NÃO pode se perder numa correção futura**
 * (I1, revisão): um filme parado na FILA do semáforo (mais de 5 buscas em
 * voo) não queima os `timeoutMs` dele esperando vaga — o cronômetro só
 * corre depois que a busca de fato começa. Espelha o Go de propósito: lá
 * `context.WithTimeout` é criado DENTRO da goroutine que `g.Go` inicia,
 * ou seja, depois que `SetLimit` já admitiu a goroutine — nunca antes.
 * "Simplificar" movendo a criação do timeout pra fora do `adquirir()`
 * pareceria inócuo e mudaria esse comportamento.
 *
 * Devolve um array na MESMA ordem/índice de `movies` — cada posição
 * corresponde ao filme de mesmo índice.
 */
export async function fetchPostersConcorrente(
  cfg: TmdbConfig,
  movies: SheetMovie[],
  opts: FetchPostersConcorrenteOptions = {},
): Promise<TmdbSearchResult[]> {
  const timeoutMs = opts.timeoutMs ?? TMDB_TIMEOUT_MS
  const semaforo = criarSemaforo(TMDB_MAX_CONCURRENCY)

  const tarefas = movies.map(async (movie): Promise<TmdbSearchResult> => {
    const liberar = await semaforo.adquirir()
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
      try {
        return await searchPoster(cfg, movie.title, movie.type, {
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timeoutId)
      }
    } catch (err) {
      console.error(
        'POST /votacao/sessions — busca de pôster falhou, seguindo sem pôster (fail-soft)',
        err,
      )
      return { posterUrl: '', tmdbId: 0 }
    } finally {
      liberar()
    }
  })

  return Promise.all(tarefas)
}

/**
 * `POST /votacao/sessions` (admin) — ver a ordem completa das checagens no
 * comentário acima. Resposta: `{session, movies}` via `sessionToWire`/
 * `movieToWire` (PascalCase — contrato), notification de sucesso "Sessão
 * criada." (sem `code`, mesma paridade de `httpx.Success` já estabelecida
 * em `POST /votes`/`POST /tiebreak`).
 */
votacaoRoutes.post('/sessions', requireAdmin<AuthBindings>(), async (c) => {
  const resolucaoSheets = resolverSheetsConfig(c.env)
  if (!resolucaoSheets.ok) return resolucaoSheets.response

  let rawBody: unknown
  try {
    rawBody = await c.req.json()
  } catch {
    return errJson(400, 'invalid_json', 'Corpo da requisição inválido.')
  }
  const parsed = parseCreateSessionBody(rawBody)
  if (parsed === null) {
    return errJson(400, 'invalid_json', 'Corpo da requisição inválido.')
  }
  if (parsed.title === '') {
    return errJson(
      400,
      'title_required',
      'Informe um título para a sessão.',
      'title',
    )
  }

  let movies: SheetMovie[]
  try {
    movies = await readMovies(resolucaoSheets.config)
  } catch (err) {
    console.error('POST /votacao/sessions — falha ao ler a planilha', err)
    return errJson(
      502,
      'sheets_read_failed',
      'Falha ao ler a planilha de filmes.',
    )
  }

  let picked: SheetMovie[]
  try {
    picked = sortOnePerCategory(
      movies,
      {
        types: parsed.types,
        includeWatched: parsed.includeWatched,
        categories: parsed.categories,
      },
      Math.random,
    )
  } catch (err) {
    if (err instanceof NoCandidatesError) {
      return errJson(
        422,
        'no_candidates',
        'Nenhum filme corresponde aos filtros escolhidos.',
      )
    }
    // Defensivo — sortOnePerCategory só lança NoCandidatesError na prática;
    // este ramo espelha o `else` do Go (`sessions.go:68`, `internal_error`
    // pra qualquer OUTRO erro do sorteio) mas é INALCANÇÁVEL hoje.
    console.error('POST /votacao/sessions — falha ao sortear os filmes', err)
    return errJson(500, 'internal_error', 'Falha ao sortear os filmes.')
  }

  // Sem TMDB_API_KEY, a busca é DESLIGADA — a sessão é criada SEM pôsteres,
  // nunca com erro (mesma paridade do Go: `h.deps.Posters == nil` faz
  // `fetchPosters` devolver os filmes sem pôster/tmdbId).
  const tmdbApiKey = c.env.TMDB_API_KEY
  const posters = tmdbApiKey
    ? await fetchPostersConcorrente({ apiKey: tmdbApiKey }, picked)
    : picked.map(() => ({ posterUrl: '', tmdbId: 0 }))

  // `sortJSON, _ := json.Marshal(body)` no Go — o corpo INTEIRO da requisição
  // (já validado), não só os campos de filtro. Vira `sort_options_json`.
  const sortOptionsJson = JSON.stringify({
    title: parsed.title,
    types: parsed.types,
    include_watched: parsed.includeWatched,
    categories: parsed.categories,
  })

  const votacaoUser = c.get('votacaoUser')

  let sessionRow: Awaited<ReturnType<typeof createVotingSession>>
  try {
    sessionRow = await createVotingSession(c.env.DB, {
      title: parsed.title,
      createdBy: votacaoUser.id,
      sortOptionsJson,
    })
  } catch (err) {
    console.error('POST /votacao/sessions — falha ao criar a sessão', err)
    return errJson(500, 'internal_error', 'Falha ao criar a sessão.')
  }

  const movieInserts: SessionMovieInsert[] = picked.map((movie, i) => ({
    category: movie.category,
    title: movie.title,
    type: movie.type,
    posterUrl: posters[i]?.posterUrl ?? '',
    tmdbId: posters[i]?.tmdbId ?? 0,
    wasWatched: movie.watched,
    sheetNumber: movie.number,
  }))

  try {
    await insertSessionMovies(c.env.DB, sessionRow.id, movieInserts)
  } catch (err) {
    console.error(
      'POST /votacao/sessions — falha ao salvar os filmes da sessão',
      err,
    )
    return errJson(
      500,
      'internal_error',
      'Falha ao salvar os filmes da sessão.',
    )
  }

  // Mesmo padrão de `GET /sessions/{id}` (M1): o Go também engole este erro
  // (`stored, _ := h.deps.Store.GetSessionMovies(...)`, sessions.go:106) e
  // devolve `"movies":null` (zero value de slice Go) em vez de 500.
  let movieRows: ReturnType<typeof movieToWire>[] | null
  try {
    const rows = await getSessionMovies(c.env.DB, sessionRow.id)
    movieRows = rows.map(movieToWire)
  } catch (err) {
    console.error(
      'POST /votacao/sessions — getSessionMovies falhou, devolvendo movies:null (paridade com o Go)',
      err,
    )
    movieRows = null
  }

  return okJson(
    { session: sessionToWire(sessionRow), movies: movieRows },
    201,
    [{ type: 'success', message: 'Sessão criada.' }],
  )
})

const INT64_MIN = -9223372036854775808n
const INT64_MAX = 9223372036854775807n

/**
 * Mimica `strconv.ParseInt(s, 10, 64)` do Go: a string tem que ser um
 * inteiro completo E caber em int64 — fora da faixa é `ErrRange`, a MESMA
 * falha de parse que uma string não-numérica, não um número válido só
 * "grande". `BigInt` entra só pra checar a faixa (não dá pra confiar em
 * `Number.parseInt` pra isso — perde precisão silenciosamente acima de
 * 2^53, muito antes do teto do int64); o valor devolvido continua `number`
 * (mesma limitação de representação que o resto do domínio já tem acima de
 * 2^53 — D1/JS não representam int64 fielmente, mas MEDIR a faixa com
 * `BigInt` não exige guardar o valor como `BigInt`).
 *
 * ⚠️ **M3 (revisão final)**: sem este teto de faixa, um id de 20 dígitos
 * (`GET /votacao/sessions/99999999999999999999`) passava no regex `\d+`,
 * virava um `number` JS impreciso, e caía em 404 `session_not_found` (ou no
 * default de `atoiOr`) em vez do 400 `invalid_id` que o Go devolve de
 * verdade (`ParseInt`/`Atoi` retornam `ErrRange` — a MESMA falha de
 * `strconv.Atoi` usada por `atoiOr` no Go, `sessions.go:199-208`, que roda
 * em plataformas 64-bit com o mesmo teto).
 */
function parseInt64(value: string): number | null {
  if (!/^[+-]?\d+$/.test(value)) return null
  const big = BigInt(value)
  if (big < INT64_MIN || big > INT64_MAX) return null
  return Number(big)
}

/**
 * Mesmo `atoiOr` do Go (`sessions.go:199-208`): string vazia/ausente ⇒
 * `fallback`; string que não é um inteiro completo, OU fora da faixa do
 * int64 (M3 — ver `parseInt64`), ⇒ `fallback`, nunca 400. Um
 * `parseInt`/`Number.parseInt` puro seria "mais correto" (aceitaria
 * `"20abc"` como 20 via parsing parcial) e estaria ERRADO como paridade —
 * por isso o regex exige a string inteira.
 */
function atoiOr(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback
  const parsed = parseInt64(value)
  return parsed === null ? fallback : parsed
}

/**
 * `GET /votacao/sessions` — porte de `ListSessions` (`sessions.go:154-163`).
 * `limit`/`offset` com defaults 20/0; query malformada cai no default, não
 * dá 400 (paridade, ver `atoiOr` acima).
 */
votacaoRoutes.get('/sessions', requireAuth<AuthBindings>(), async (c) => {
  const limit = atoiOr(c.req.query('limit'), 20)
  const offset = atoiOr(c.req.query('offset'), 0)

  const rows = await listVotingSessions(c.env.DB, { limit, offset })
  return okJson({ sessions: rows.map(sessionToWire) })
})

/**
 * `GET /votacao/sessions/{id}` — porte de `GetSession` (`sessions.go:166-197`).
 *
 * ⚠️ **NÃO recusa `id <= 0`** — o Go só faz `strconv.ParseInt` aqui (o
 * `parseID` que recusa `id <= 0` é usado pelas OUTRAS rotas, não por esta).
 * `id=0` ou negativo passa pela validação de formato e cai no 404
 * `session_not_found` quando `getVotingSession` não acha a linha — nunca em
 * 400 `invalid_id`. Diferença deliberada da rota de listagem/demais rotas,
 * mantida por ser comportamento OBSERVÁVEL do Go. `id` fora da faixa do
 * int64 (M3) AINDA cai em 400 `invalid_id` — `strconv.ParseInt` falha com
 * `ErrRange` nesse caso, igual a uma string não-numérica; `parseInt64`
 * cobre os dois.
 */
votacaoRoutes.get('/sessions/:id', requireAuth<AuthBindings>(), async (c) => {
  const idParam = c.req.param('id')
  const id = parseInt64(idParam)
  if (id === null) {
    return errJson(400, 'invalid_id', 'Identificador inválido.')
  }

  const session = await getVotingSession(c.env.DB, id)
  if (session === null) {
    return errJson(404, 'session_not_found', 'Sessão não encontrada.')
  }

  // M1 (revisão final): o Go TAMBÉM engole este erro — `movies, _ :=
  // h.deps.Store.GetSessionMovies(...)` (sessions.go:182) ignora o `error`
  // e segue com `movies` no zero value de slice Go (`nil`), que
  // `json.Marshal` serializa como `null`. Sem este catch, uma falha deste
  // SELECT devolveria 500 aqui contra 200 com `"movies":null` no Go —
  // mesma assimetria que o achado original (getUserVotedMovieIds, T2) já
  // tinha corrigido, só que faltando aqui.
  let movies: ReturnType<typeof movieToWire>[] | null
  try {
    const movieRows = await getSessionMovies(c.env.DB, session.id)
    movies = movieRows.map(movieToWire)
  } catch (err) {
    console.error(
      'GET /votacao/sessions/:id — getSessionMovies falhou, devolvendo movies:null (paridade com o Go)',
      err,
    )
    movies = null
  }

  // `votedMovieIds := []int64{}` no Go: inicializado vazio de propósito, e
  // o erro de leitura dos votos é ENGOLIDO (`if ids, err := ...; err ==
  // nil`) — a sessão ainda é devolvida mesmo que este SELECT falhe.
  const votacaoUser = c.get('votacaoUser')
  let votedMovieIds: number[] = []
  try {
    votedMovieIds = await getUserVotedMovieIds(
      c.env.DB,
      session.id,
      votacaoUser.id,
    )
  } catch (err) {
    console.error(
      'GET /votacao/sessions/:id — getUserVotedMovieIds falhou, devolvendo a sessão mesmo assim (paridade com o Go)',
      err,
    )
    votedMovieIds = []
  }

  return okJson({
    session: sessionToWire(session),
    movies,
    has_voted: votedMovieIds.length > 0,
    voted_movie_ids: votedMovieIds,
  })
})

/**
 * `{ movie_ids?: unknown }` — corpo cru de `POST /sessions/{id}/votes`,
 * antes de validado por `parseMovieIds`.
 */
type VoteRequestBody = {
  movie_ids?: unknown
}

/**
 * Espelha a semântica de `json.NewDecoder(r.Body).Decode(&voteBody{})` do
 * Go: `movie_ids` AUSENTE (ou `null`) decodifica com sucesso — o zero value
 * de `[]int64` é `nil`, tratado como conjunto vazio (limpa os votos), não é
 * erro. Só vira inválido quando `movie_ids` existe mas não é array, ou
 * quando algum elemento não é um inteiro — o Go também não distingue "erro
 * de sintaxe" de "erro de tipo" com códigos diferentes, os dois caem em
 * `invalid_json`.
 *
 * Devolve `null` (nunca lança) pra rota decidir o 400 com o envelope certo.
 */
function parseMovieIds(raw: unknown): number[] | null {
  if (raw === null) return []
  if (typeof raw !== 'object' || Array.isArray(raw)) return null

  const body = raw as VoteRequestBody
  if (body.movie_ids === undefined || body.movie_ids === null) return []
  if (!Array.isArray(body.movie_ids)) return null

  const ids: number[] = []
  for (const item of body.movie_ids) {
    if (typeof item !== 'number' || !Number.isInteger(item)) return null
    ids.push(item)
  }
  return ids
}

/**
 * `POST /votacao/sessions/{id}/votes` — porte de `CreateVote`
 * (`handlers/votacao/votes.go:26-67`). Voto de APROVAÇÃO: o corpo
 * `{movie_ids: number[]}` SUBSTITUI o conjunto inteiro do usuário naquela
 * sessão (nunca um merge) — editável até a sessão fechar; conjunto vazio
 * LIMPA os votos, uma operação válida, não um erro.
 *
 * A ORDEM das checagens abaixo é a do Go, MEDIDA via `router.go` (ver o
 * comentário no topo deste arquivo pro porquê `requireAuth` vem como
 * middleware, não como checagem manual dentro do handler):
 *
 *   0. (middleware) sem sessão válida        -> 401 not_authenticated
 *   1. `id` não numérico OU `<= 0`           -> 400 invalid_id
 *   2. sessão inexistente                    -> 404 session_not_found
 *   3. sessão `closed`                       -> 409 session_closed
 *   4. corpo não é JSON válido               -> 400 invalid_json
 *   5. filme fora da sessão                  -> 400 movie_not_in_session
 *
 * ⚠️ **A checagem de sessão fechada (3) vem ANTES de ler o corpo (4) — não
 * o contrário.** O Go carrega a sessão, checa `Status == "closed"`, e só
 * ENTÃO decodifica `r.Body`. Um corpo inválido numa sessão fechada tem que
 * devolver 409, nunca 400 — é o que prova o teste "corpo inválido em sessão
 * fechada" abaixo, e o que a mutação (inverter 3↔4) desta task quebra de
 * propósito pra confirmar que o teste não falharia de qualquer jeito.
 *
 * ⚠️ Diferente de `GET /sessions/{id}` (T2), que usa só `ParseInt` puro: `id
 * <= 0` É recusado aqui, porque o Go usa `parseID` (compartilhado por
 * `CreateVote` e outras rotas de escrita) — não o `ParseInt` isolado de
 * `GetSession`. São handlers diferentes no Go, com validações diferentes;
 * não uniformizar. ⚠️ **M2 (revisão final): a validação em si usa
 * `parseIdDaRota` (abaixo)**, a MESMA função que `GET /results`/`POST
 * /close`/`POST /tiebreak`/`GET /votes` já usam — antes duplicava a
 * checagem inline com o argumento de "handlers distintos no Go", mas essa
 * distinção só é REAL pra `GET /sessions/{id}` (semântica diferente: aceita
 * `id <= 0`). Para `POST /votes` a semântica é IDÊNTICA à das outras rotas
 * de escrita (todas usam `parseID` no Go) — duplicar aqui só arriscava as
 * duas cópias divergirem sem motivo (foi exatamente o que aconteceu com o
 * teto de faixa do int64, M3: só a cópia dentro de `parseIdDaRota` o
 * ganhava até este fix).
 */
votacaoRoutes.post(
  '/sessions/:id/votes',
  requireAuth<AuthBindings>(),
  async (c) => {
    const id = parseIdDaRota(c.req.param('id'))
    if (id === null) {
      return errJson(400, 'invalid_id', 'Identificador inválido.')
    }

    const session = await getVotingSession(c.env.DB, id)
    if (session === null) {
      return errJson(404, 'session_not_found', 'Sessão não encontrada.')
    }
    if (session.status === 'closed') {
      return errJson(
        409,
        'session_closed',
        'Sessão encerrada — votação fechada.',
      )
    }

    let rawBody: unknown
    try {
      rawBody = await c.req.json()
    } catch {
      return errJson(400, 'invalid_json', 'Corpo da requisição inválido.')
    }
    const movieIds = parseMovieIds(rawBody)
    if (movieIds === null) {
      return errJson(400, 'invalid_json', 'Corpo da requisição inválido.')
    }

    const votacaoUser = c.get('votacaoUser')
    let votedMovieIds: number[]
    try {
      votedMovieIds = await replaceUserVotes(
        c.env.DB,
        id,
        votacaoUser.id,
        movieIds,
      )
    } catch (err) {
      if (err instanceof MovieNotInSessionError) {
        return errJson(
          400,
          'movie_not_in_session',
          'Um dos filmes não pertence a esta sessão.',
        )
      }
      throw err
    }

    // `httpx.DataMsg(..., httpx.Success("Voto registrado."))` no Go —
    // paridade de CONTRATO byte a byte agora (I2, revisão final): mensagem
    // idêntica, sem `code` (a tag do Go é `json:"code,omitempty"`, e
    // `httpx.Success` nunca preenche `Code` — um `code:'vote_registered'`
    // inventado saía antes daqui). Não é tela nova: `apps/web`
    // (`call<T>()`) descarta `notifications` inteiro no caminho feliz,
    // então isto nunca vira um toast por conta própria.
    return okJson({ voted_movie_ids: votedMovieIds }, 200, [
      { type: 'success', message: 'Voto registrado.' },
    ])
  },
)

/**
 * Valida o `id` do path do MESMO jeito que `parseID` no Go
 * (`handlers/votacao/votes.go:299-307`, compartilhado por `CreateVote`,
 * `GetResults`, `CloseSession`, `Tiebreak` e `ListSessionVotes`):
 * não-numérico, `<= 0`, OU fora da faixa do int64 (M3, via `parseInt64`) ⇒
 * `null` (a rota devolve 400 `invalid_id`). Diferente do `ParseInt` puro de
 * `GET /sessions/{id}` (T2), que aceita `id <= 0` e cai em 404 — aqui é a
 * validação das rotas de ESCRITA/admin. (Renomeada de `parseParseIDStyle`
 * na T6 — "parse" duplicado no nome original, puramente estético.)
 *
 * ⚠️ **M2 (revisão final): `POST /sessions/{id}/votes` também usa esta
 * função** — antes duplicava a mesma checagem inline com o argumento de
 * "handlers distintos no Go". Essa distinção só é real pra `GET
 * /sessions/{id}` (semântica DIFERENTE: aceita `id <= 0`); pra `CreateVote`
 * a semântica é idêntica à das outras rotas de escrita — não há motivo pra
 * duas cópias divergirem.
 */
function parseIdDaRota(idParam: string): number | null {
  const id = parseInt64(idParam)
  if (id === null || id <= 0) return null
  return id
}

/**
 * `GET /votacao/sessions/{id}/results` — porte de `GetResults`
 * (`handlers/votacao/votes.go:119-162`).
 *
 * ⚠️ **NÃO checa se a sessão existe.** O Go faz só `parseID` (formato do id)
 * e vai direto pro SELECT de votos — um id inexistente (mas positivo)
 * devolve **200** com `results: []`, `total_votes: 0`, `total_voters: 0`,
 * nunca 404. Reproduzido de propósito (paridade OBSERVÁVEL), não uma
 * "correção" da rota.
 *
 * `results` é `{movie_id, count}[]`, ordenado por **count DESC, depois
 * movie_id ASC** — a MESMA chave dupla do bubble sort manual do Go
 * (`votes.go:144-150`), aqui via `Array#sort` com o comparador equivalente.
 * Um teste com contagens todas diferentes não discriminaria a segunda
 * chave — ver `routes/votacao.test.ts` pro caso que só passa com as duas.
 *
 * `total_votes` é o NÚMERO DE LINHAS em `votes` (`listVoteMovieIds(...).
 * length`); `total_voters` é `COUNT(DISTINCT user_id)` (`countVoters`) — os
 * dois divergem sob voto de aprovação (1 pessoa, N filmes ⇒ total_votes:N,
 * total_voters:1). Ver `domain/votes.ts#countVoters` pro porquê.
 */
votacaoRoutes.get(
  '/sessions/:id/results',
  requireAuth<AuthBindings>(),
  async (c) => {
    const id = parseIdDaRota(c.req.param('id'))
    if (id === null) {
      return errJson(400, 'invalid_id', 'Identificador inválido.')
    }

    const votes = await listVoteMovieIds(c.env.DB, id)
    const tally = tallyVotes(votes)

    const rows = [...tally.entries()]
      .map(([movieId, count]) => ({ movie_id: movieId, count }))
      .sort((a, b) =>
        a.count !== b.count ? b.count - a.count : a.movie_id - b.movie_id,
      )

    const totalVoters = await countVoters(c.env.DB, id)

    return okJson({
      results: rows,
      total_votes: votes.length,
      total_voters: totalVoters,
    })
  },
)

/**
 * `POST /votacao/sessions/{id}/close` (admin) — porte de `CloseSession`
 * (`handlers/votacao/votes.go:71-117`).
 *
 * Ordem das checagens (mesma topologia da T3 — o guard é MIDDLEWARE, roda
 * ANTES do handler em qualquer request real):
 *
 *   0. (middleware) sem sessão válida  -> 401 not_authenticated
 *   0. (middleware) não-admin          -> 403 admin_only
 *   1. `id` não numérico OU `<= 0`     -> 400 invalid_id
 *   2. UPDATE não afeta nenhuma linha  -> 404 session_not_open
 *
 * ⚠️ **A checagem 2 NÃO distingue id inexistente de sessão já fechada** —
 * o `UPDATE ... WHERE id=? AND status='open'` do Go (`CloseVotingSession`,
 * `sessions.go:74-103`) devolve "0 linhas afetadas" pros dois casos (e pra
 * um terceiro, "id válido mas sessão nunca existiu"), e a rota SEMPRE
 * responde 404 `session_not_open` pra essa ambiguidade — herdada de
 * propósito, não uma query de existência extra pra "melhorar" o diagnóstico.
 *
 * O vencedor só é gravado quando `computeTopMovies` devolve EXATAMENTE um
 * id no topo do tally — empate deixa `winner_movie_id` NULL (a roleta, T5,
 * decide depois; não inventar critério de desempate aqui). Quando há
 * vencedor, um SEGUNDO UPDATE grava `winner_method='votes'`
 * (`setSessionWinner`) — passo separado, espelhando o Go (`SetSessionWinner`
 * chamado DEPOIS de `CloseVotingSession` ter sucesso, não fundido num único
 * UPDATE).
 *
 * `closedAtIso` vem de `nowIsoUtc()` — relógio INJETADO na chamada ao
 * domínio (`closeVotingSession`), nunca mockado globalmente.
 *
 * ⚠️ **NÃO dispara backup.** O Go roda `Backuper.Run(ctx, "session_close")`
 * numa goroutine (`votes.go:105-111`) — o D1 tem outro mecanismo de backup
 * (`scripts/backup-d1.sh`, export lógico), não um substituto ligado neste
 * caminho. Ver `apps/ramielle/CLAUDE.md`.
 *
 * ⚠️ **I1 (revisão final): o SEGUNDO `UPDATE` (`setSessionWinner`) é
 * engolido — igual ao Go.** `votes.go:99-103` faz `if err :=
 * ...SetSessionWinner(...); err != nil { log }` e SEGUE, respondendo 200
 * com o vencedor mesmo que esta escrita falhe. Sem o `try/catch` abaixo, um
 * `await` cru propagaria pro `onError` global e devolveria 500 DEPOIS que
 * `closeVotingSession` já tinha gravado `status='closed'` — um retry do
 * admin em `POST /close` bateria 404 `session_not_open` (o `UPDATE ...
 * WHERE status='open'` já não acha a sessão), fazendo parecer que o close
 * falhou quando na verdade só `winner_method` ficou sem gravar, e nenhuma
 * rota consegue corrigir isso depois (`/tiebreak` recusa com
 * `winner_already_set` porque `winner_movie_id` já não é `null`).
 */
votacaoRoutes.post(
  '/sessions/:id/close',
  requireAdmin<AuthBindings>(),
  async (c) => {
    const id = parseIdDaRota(c.req.param('id'))
    if (id === null) {
      return errJson(400, 'invalid_id', 'Identificador inválido.')
    }

    const votes = await listVoteMovieIds(c.env.DB, id)
    const top = computeTopMovies(votes)
    const winner = top.ids.length === 1 ? top.ids[0] : null

    const closed = await closeVotingSession(c.env.DB, id, winner, nowIsoUtc())
    if (!closed) {
      return errJson(404, 'session_not_open', 'Sessão não está aberta.')
    }

    if (winner !== null) {
      try {
        await setSessionWinner(c.env.DB, id, winner, 'votes')
      } catch (err) {
        console.error(
          'POST /close — setSessionWinner falhou, respondendo 200 mesmo assim (paridade com o Go)',
          err,
        )
      }
    }

    return okJson({ winner_movie_id: winner })
  },
)

/**
 * `{ entropy?: unknown }` — corpo cru de `POST /sessions/{id}/tiebreak`,
 * antes de validado por `parseEntropy`.
 */
type TiebreakRequestBody = {
  entropy?: unknown
}

/**
 * Espelha a semântica de decodificar `tiebreakBody{Entropy string}` do Go:
 * campo AUSENTE (ou `null`, ou corpo `null`) decodifica pra string vazia —
 * não é `invalid_json`, é `invalid_entropy` mais adiante (0 bytes < 16). Só
 * vira `invalid_json` quando `entropy` existe mas não é string (erro de
 * TIPO, que o `json.Decode` do Go também rejeitaria) ou quando o corpo não
 * é um objeto. Devolve `null` (nunca lança) pra rota decidir o 400.
 */
function parseEntropy(raw: unknown): string | null {
  if (raw === null) return ''
  if (typeof raw !== 'object' || Array.isArray(raw)) return null
  const body = raw as TiebreakRequestBody
  if (body.entropy === undefined || body.entropy === null) return ''
  if (typeof body.entropy !== 'string') return null
  return body.entropy
}

/**
 * `POST /votacao/sessions/{id}/tiebreak` (admin) — porte de `Tiebreak`
 * (`handlers/votacao/votes.go:172-270`). O sorteio é AUDITÁVEL/
 * RECOMPUTÁVEL (M8, revisão final — antes chamado de "provably-fair" aqui,
 * termo herdado do Go mas afirmado como fato medido sem sê-lo; ver
 * `domain/tiebreak.ts` pra explicação completa): mistura a entropia do
 * cliente (o corpo só carrega um hash/hex — a foto/gesto de origem nunca
 * chega aqui) com um nonce de 32 bytes gerado no servidor, escolhe um dos
 * filmes empatados sem viés (`pickTiebreakIndex`, `domain/tiebreak.ts`),
 * grava o vencedor + uma linha de auditoria em `tiebreaks`, e devolve
 * `server_nonce` em hex.
 *
 * ⚠️ **`server_nonce` é público POR DESIGN, não um vazamento a esconder** —
 * é o que torna o sorteio AUDITÁVEL: sem ele, ninguém consegue recomputar
 * `tiebreakSeed(clientEntropy, serverNonce, sessionId, tiedIds)` e conferir
 * que o vencedor batido é mesmo o que o cálculo determinístico produz.
 *
 * Ordem das checagens — mesma topologia de `POST /close` (T4): o guard é
 * MIDDLEWARE, roda ANTES de tudo em qualquer request real (401/403 sempre
 * primeiro, nunca alcançam o corpo do handler abaixo). Dentro do handler, a
 * ordem é a medida linha a linha em `votes.go:172-233`:
 *
 *   0. (middleware) sem sessão válida  -> 401 not_authenticated
 *   0. (middleware) não-admin          -> 403 admin_only
 *   1. `id` não numérico OU `<= 0`     -> 400 invalid_id
 *   2. corpo não é JSON válido         -> 400 invalid_json
 *   3. `entropy` não-hex OU < 16 bytes -> 400 invalid_entropy
 *   4. sessão inexistente              -> 404 session_not_found
 *   5. sessão NÃO fechada              -> 409 session_not_closed
 *   6. menos de 2 empatados no topo    -> 422 no_tie
 *   7. sessão já tem vencedor          -> 409 winner_already_set
 *
 * `tied` vem de `computeTopMovies(...).ids` — MESMA ordenação ascendente
 * que `ComputeTopMovies` do Go (`results.go:14-36`) devolve. Isso importa
 * pra valer, não é só estética: `winner = tied[idx]` só bate com o Go se a
 * lista indexada for a MESMA lista, na MESMA ordem — `tiebreakSeed` reordena
 * os ids só para o HASH, não muda a ordem de `tied` usada aqui pra indexar.
 */
votacaoRoutes.post(
  '/sessions/:id/tiebreak',
  requireAdmin<AuthBindings>(),
  async (c) => {
    const id = parseIdDaRota(c.req.param('id'))
    if (id === null) {
      return errJson(400, 'invalid_id', 'Identificador inválido.')
    }

    let rawBody: unknown
    try {
      rawBody = await c.req.json()
    } catch {
      return errJson(400, 'invalid_json', 'Corpo da requisição inválido.')
    }
    const entropyHex = parseEntropy(rawBody)
    if (entropyHex === null) {
      return errJson(400, 'invalid_json', 'Corpo da requisição inválido.')
    }

    const clientEntropy = hexToBytes(entropyHex)
    if (clientEntropy === null || clientEntropy.length < 16) {
      return errJson(400, 'invalid_entropy', 'Entropia inválida.')
    }

    const session = await getVotingSession(c.env.DB, id)
    if (session === null) {
      return errJson(404, 'session_not_found', 'Sessão não encontrada.')
    }
    if (session.status !== 'closed') {
      return errJson(
        409,
        'session_not_closed',
        'Encerre a sessão antes do desempate.',
      )
    }

    const votes = await listVoteMovieIds(c.env.DB, id)
    const tied = computeTopMovies(votes).ids
    if (tied.length < 2) {
      return errJson(422, 'no_tie', 'Não há empate para desempatar.')
    }
    if (session.winner_movie_id !== null) {
      return errJson(409, 'winner_already_set', 'Esta sessão já tem vencedor.')
    }

    const serverNonce = new Uint8Array(32)
    crypto.getRandomValues(serverNonce)

    const seed = await tiebreakSeed(clientEntropy, serverNonce, id, tied)
    const idx = await pickTiebreakIndex(seed, tied.length)
    const winner = tied[idx]
    // Inalcançável de verdade — pickTiebreakIndex sempre devolve um índice
    // < n (aqui n = tied.length). Só existe pra satisfazer o tipo do TS
    // (acesso por índice em array é number|undefined em modo estrito).
    if (winner === undefined) {
      throw new Error('tiebreak: índice fora do range dos empatados')
    }

    const serverNonceHex = bytesToHex(serverNonce)
    const votacaoUser = c.get('votacaoUser')

    await createTiebreak(c.env.DB, {
      sessionId: id,
      triggeredBy: votacaoUser.id,
      tiedIdsJson: JSON.stringify(tied),
      clientEntropy: entropyHex,
      serverNonce: serverNonceHex,
      winnerMovieId: winner,
    })
    await setSessionWinner(c.env.DB, id, winner, 'roulette')

    // `httpx.DataMsg(..., httpx.Success("Desempate concluído."))` no Go —
    // paridade de CONTRATO byte a byte agora (I2, revisão final): mensagem
    // idêntica, sem `code` (um `code:'tiebreak_done'` inventado saía antes
    // daqui — ver `lib/envelope.ts` pro porquê `httpx.Success` do Go nunca
    // preenche `Code`). Mesmo padrão de `POST /votes` (T3): paridade de
    // CONTRATO, não de tela nova (`call<T>()` do apps/web descarta
    // `notifications` no caminho feliz).
    return okJson(
      {
        winner_movie_id: winner,
        tied_movie_ids: tied,
        server_nonce: serverNonceHex,
      },
      200,
      [{ type: 'success', message: 'Desempate concluído.' }],
    )
  },
)

/**
 * `GET /votacao/sessions/{id}/votes` (admin) — porte de `ListSessionVotes`
 * (`handlers/votacao/votes.go:272-293`), que lê de
 * `Store.ListSessionVotesWithUsers` (`votacao/votes.go:99-127`).
 *
 * ⚠️ **ESTA ROTA QUEBRA O ANONIMATO DO VOTO** — é a ÚNICA da API inteira que
 * liga uma pessoa (`user_id`/`user_name`/`user_email`) ao que ela votou. O
 * `requireAdmin` abaixo não é um detalhe de implementação: é a ÚNICA coisa
 * entre o e-mail de quem votou e qualquer sessão válida (nenhuma outra rota
 * de votação devolve e-mail nenhum — nem `GET /sessions/{id}`, nem
 * `/results`). Mesma topologia de guard das outras rotas admin (T4/T5): o
 * middleware roda ANTES de tudo em qualquer request real — 401/403 SEMPRE
 * primeiro, nunca alcançam o `parseIdDaRota` abaixo.
 *
 * Ordem das checagens:
 *
 *   0. (middleware) sem sessão válida  -> 401 not_authenticated
 *   0. (middleware) não-admin          -> 403 admin_only
 *   1. `id` não numérico OU `<= 0`     -> 400 invalid_id
 *
 * ⚠️ **NÃO checa se a sessão existe** — mesma família de `/results` (T4):
 * `ListSessionVotes` do Go só faz `parseID` e vai direto pro SELECT/JOIN; um
 * id inexistente (mas positivo) não bate nenhuma linha no JOIN e devolve
 * **200** com `votes: []`, `total: 0`, nunca 404.
 *
 * `created_at` sai normalizado por `toIsoUtc` aqui na rota — o domínio
 * (`listSessionVotesWithUsers`) devolve a coluna crua do D1, mesma divisão
 * de responsabilidade que `sessionToWire`/`movieToWire` (`lib/wire.ts`)
 * seguem pras outras duas leituras (ver o cabeçalho de `domain/votes.ts` pro
 * porquê isto NÃO passa por `lib/wire.ts`: aquele arquivo é só pras duas
 * structs PascalCase, e esta resposta é inteiramente snake_case — a MISTURA
 * de convenções É o contrato, não uma inconsistência a "corrigir").
 */
votacaoRoutes.get(
  '/sessions/:id/votes',
  requireAdmin<AuthBindings>(),
  async (c) => {
    const id = parseIdDaRota(c.req.param('id'))
    if (id === null) {
      return errJson(400, 'invalid_id', 'Identificador inválido.')
    }

    const details = await listSessionVotesWithUsers(c.env.DB, id)
    const votes = details.map((d) => ({
      user_id: d.user_id,
      user_name: d.user_name,
      user_email: d.user_email,
      movie_id: d.movie_id,
      movie_title: d.movie_title,
      category: d.category,
      created_at: toIsoUtc(d.created_at),
    }))

    return okJson({ votes, total: votes.length })
  },
)

export default votacaoRoutes
