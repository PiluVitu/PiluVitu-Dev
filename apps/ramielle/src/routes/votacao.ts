/**
 * As rotas de LEITURA da votação — `GET /sessions` e `GET /sessions/{id}`,
 * porte de `apps/api/internal/handlers/votacao/sessions.go#ListSessions`
 * (linha ~154) e `#GetSession` (linha ~166). Mesma convenção do resto do
 * monorepo (`routes/auth.ts`): `Env` local, nunca importa `Bindings` de
 * `../index` (evitaria import circular valor↔tipo).
 *
 * `session`/`movies` saem em PascalCase via `sessionToWire`/`movieToWire`
 * (`lib/wire.ts`) — NUNCA montados à mão. `has_voted`/`voted_movie_ids`
 * saem em snake_case, porque o handler Go monta esse corpo com
 * `map[string]any` (chaves explícitas), igual ao resto da API que não é
 * struct. A mistura É o contrato — ver `lib/wire.ts` pro raciocínio
 * completo.
 */
import { Hono } from 'hono'
import type { AuthBindings } from '../lib/auth'
import { requireAuth, type SessionVariables } from '../lib/session'
import { errJson, okJson } from '../lib/envelope'
import { movieToWire, sessionToWire } from '../lib/wire'
import {
  getSessionMovies,
  getUserVotedMovieIds,
  getVotingSession,
  listVotingSessions,
} from '../domain/sessions'

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

export default votacaoRoutes
