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
import { movieToWire, sessionToWire } from '../lib/wire'
import { computeTopMovies, tallyVotes } from '../domain/tally'
import {
  bytesToHex,
  hexToBytes,
  pickTiebreakIndex,
  tiebreakSeed,
} from '../domain/tiebreak'
import {
  getSessionMovies,
  getUserVotedMovieIds,
  getVotingSession,
  listVotingSessions,
} from '../domain/sessions'
import {
  closeVotingSession,
  countVoters,
  createTiebreak,
  listSessionVotesWithUsers,
  listVoteMovieIds,
  MovieNotInSessionError,
  replaceUserVotes,
  setSessionWinner,
} from '../domain/votes'

type Env = {
  Bindings: AuthBindings
  Variables: SessionVariables
}

const votacaoRoutes = new Hono<Env>()

/**
 * Mesmo `atoiOr` do Go (`sessions.go:199-208`): string vazia/ausente ⇒
 * `fallback`; string que não é um inteiro completo (`strconv.Atoi` exige a
 * string INTEIRA numérica, não só o prefixo) ⇒ `fallback`, nunca 400. Um
 * `parseInt`/`Number.parseInt` puro seria "mais correto" (aceitaria
 * `"20abc"` como 20 via parsing parcial) e estaria ERRADO como paridade —
 * por isso o regex exige a string inteira.
 */
function atoiOr(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback
  if (!/^[+-]?\d+$/.test(value)) return fallback
  return Number.parseInt(value, 10)
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
 * mantida por ser comportamento OBSERVÁVEL do Go.
 */
votacaoRoutes.get('/sessions/:id', requireAuth<AuthBindings>(), async (c) => {
  const idParam = c.req.param('id')
  if (!/^[+-]?\d+$/.test(idParam)) {
    return errJson(400, 'invalid_id', 'identificador inválido')
  }
  const id = Number.parseInt(idParam, 10)

  const session = await getVotingSession(c.env.DB, id)
  if (session === null) {
    return errJson(404, 'session_not_found', 'sessão não encontrada')
  }

  const movieRows = await getSessionMovies(c.env.DB, session.id)

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
    movies: movieRows.map(movieToWire),
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
 * não uniformizar.
 */
votacaoRoutes.post(
  '/sessions/:id/votes',
  requireAuth<AuthBindings>(),
  async (c) => {
    const idParam = c.req.param('id')
    if (!/^[+-]?\d+$/.test(idParam)) {
      return errJson(400, 'invalid_id', 'identificador inválido')
    }
    const id = Number.parseInt(idParam, 10)
    if (id <= 0) {
      return errJson(400, 'invalid_id', 'identificador inválido')
    }

    const session = await getVotingSession(c.env.DB, id)
    if (session === null) {
      return errJson(404, 'session_not_found', 'sessão não encontrada')
    }
    if (session.status === 'closed') {
      return errJson(
        409,
        'session_closed',
        'sessão encerrada — votação fechada',
      )
    }

    let rawBody: unknown
    try {
      rawBody = await c.req.json()
    } catch {
      return errJson(400, 'invalid_json', 'corpo da requisição inválido')
    }
    const movieIds = parseMovieIds(rawBody)
    if (movieIds === null) {
      return errJson(400, 'invalid_json', 'corpo da requisição inválido')
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
          'um dos filmes não pertence a esta sessão',
        )
      }
      throw err
    }

    // `httpx.DataMsg(..., httpx.Success("Voto registrado."))` no Go —
    // paridade de CONTRATO, não de tela: `apps/web` (`call<T>()`) descarta
    // `notifications` inteiro no caminho feliz, então isto nunca vira um
    // toast por conta própria. Ver `lib/envelope.ts` pro raciocínio de
    // reativar `'success'` em `NotificationKind`.
    return okJson({ voted_movie_ids: votedMovieIds }, 200, [
      { type: 'success', code: 'vote_registered', message: 'voto registrado' },
    ])
  },
)

/**
 * Valida o `id` do path do MESMO jeito que `parseID` no Go
 * (`handlers/votacao/votes.go:299-307`, compartilhado por `GetResults`,
 * `CloseSession`, `Tiebreak` e `ListSessionVotes`): não-numérico OU `<= 0` ⇒
 * `null` (a rota devolve 400 `invalid_id`). Diferente do `ParseInt` puro de
 * `GET /sessions/{id}` (T2), que aceita `id <= 0` e cai em 404 — aqui é a
 * MESMA validação já usada por `POST /sessions/{id}/votes` (T3), replicada
 * em vez de extraída pra não acoplar rotas que o Go também mantém como
 * handlers/checagens distintas. (Renomeada de `parseParseIDStyle` na T6 —
 * "parse" duplicado no nome original, puramente estético.)
 */
function parseIdDaRota(idParam: string): number | null {
  if (!/^[+-]?\d+$/.test(idParam)) return null
  const id = Number.parseInt(idParam, 10)
  if (id <= 0) return null
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
      return errJson(400, 'invalid_id', 'identificador inválido')
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
 */
votacaoRoutes.post(
  '/sessions/:id/close',
  requireAdmin<AuthBindings>(),
  async (c) => {
    const id = parseIdDaRota(c.req.param('id'))
    if (id === null) {
      return errJson(400, 'invalid_id', 'identificador inválido')
    }

    const votes = await listVoteMovieIds(c.env.DB, id)
    const top = computeTopMovies(votes)
    const winner = top.ids.length === 1 ? top.ids[0] : null

    const closed = await closeVotingSession(c.env.DB, id, winner, nowIsoUtc())
    if (!closed) {
      return errJson(404, 'session_not_open', 'sessão não está aberta')
    }

    if (winner !== null) {
      await setSessionWinner(c.env.DB, id, winner, 'votes')
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
 * (`handlers/votacao/votes.go:172-270`). O sorteio é PROVABLY-FAIR: mistura
 * a entropia do cliente (o corpo só carrega um hash/hex — a foto/gesto de
 * origem nunca chega aqui) com um nonce de 32 bytes gerado no servidor,
 * escolhe um dos filmes empatados sem viés (`pickTiebreakIndex`,
 * `domain/tiebreak.ts`), grava o vencedor + uma linha de auditoria em
 * `tiebreaks`, e devolve `server_nonce` em hex.
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
      return errJson(400, 'invalid_id', 'identificador inválido')
    }

    let rawBody: unknown
    try {
      rawBody = await c.req.json()
    } catch {
      return errJson(400, 'invalid_json', 'corpo da requisição inválido')
    }
    const entropyHex = parseEntropy(rawBody)
    if (entropyHex === null) {
      return errJson(400, 'invalid_json', 'corpo da requisição inválido')
    }

    const clientEntropy = hexToBytes(entropyHex)
    if (clientEntropy === null || clientEntropy.length < 16) {
      return errJson(400, 'invalid_entropy', 'entropia inválida')
    }

    const session = await getVotingSession(c.env.DB, id)
    if (session === null) {
      return errJson(404, 'session_not_found', 'sessão não encontrada')
    }
    if (session.status !== 'closed') {
      return errJson(
        409,
        'session_not_closed',
        'encerre a sessão antes do desempate',
      )
    }

    const votes = await listVoteMovieIds(c.env.DB, id)
    const tied = computeTopMovies(votes).ids
    if (tied.length < 2) {
      return errJson(422, 'no_tie', 'não há empate para desempatar')
    }
    if (session.winner_movie_id !== null) {
      return errJson(409, 'winner_already_set', 'esta sessão já tem vencedor')
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
    // mesmo padrão de `POST /votes` (T3): paridade de CONTRATO, não de
    // tela nova (`call<T>()` do apps/web descarta `notifications` no
    // caminho feliz).
    return okJson(
      {
        winner_movie_id: winner,
        tied_movie_ids: tied,
        server_nonce: serverNonceHex,
      },
      200,
      [
        {
          type: 'success',
          code: 'tiebreak_done',
          message: 'desempate concluído',
        },
      ],
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
      return errJson(400, 'invalid_id', 'identificador inválido')
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
