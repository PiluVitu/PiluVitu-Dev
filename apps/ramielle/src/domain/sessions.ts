/**
 * Domínio de LEITURA da votação — porta as funções só-SELECT do Store Go
 * (`apps/api/internal/votacao/sessions.go` + `movies.go` + o SELECT de
 * `votes.go#GetUserVotes`). Devolve as ROWS como o D1 as devolve
 * (snake_case, `VotingSessionRow`/`SessionMovieRow` de `lib/wire.ts`) — a
 * conversão pra `WireSession`/`WireMovie` (PascalCase) é responsabilidade
 * das rotas (`sessionToWire`/`movieToWire`), não deste arquivo.
 *
 * `getUserVotedMovieIds` pertence conceitualmente ao domínio de votos
 * (`domain/votes.ts`, que a Task 3 desta fatia cria pro lado de ESCRITA —
 * `replaceUserVotes` etc.), mas `GET /sessions/{id}` já precisa da LEITURA
 * pra montar `has_voted`/`voted_movie_ids`. Fica aqui por enquanto; quem
 * mexer na Task 3 decide se consolida em `domain/votes.ts`.
 */
import type { SessionMovieRow, VotingSessionRow } from '../lib/wire'

const VOTING_SESSION_COLUMNS = `
  id, title, status, created_by, created_at, closed_at,
  winner_movie_id, winner_method, sort_options_json
`

const SESSION_MOVIE_COLUMNS = `
  id, session_id, category, title, type, poster_url, tmdb_id, was_watched, sheet_number
`

/**
 * `null` quando a sessão não existe — nunca lança. Paridade com o
 * `sql.ErrNoRows` → `ErrNotFound` do Go (`sessions.go:41-43,114-123`): lá
 * quem traduz "não encontrado" pro 404 é a ROTA, não o Store; aqui é igual —
 * quem decide o 404 é `routes/votacao.ts`.
 */
export async function getVotingSession(
  db: D1Database,
  id: number,
): Promise<VotingSessionRow | null> {
  return db
    .prepare(
      `SELECT ${VOTING_SESSION_COLUMNS} FROM voting_sessions WHERE id = ?`,
    )
    .bind(id)
    .first<VotingSessionRow>()
}

export type ListVotingSessionsOptions = {
  limit: number
  offset: number
}

/**
 * Mesmo clamp do `Store.ListVotingSessions` do Go (`sessions.go:45-51`):
 * `limit` fora de `(0, 100]` cai pro default 20 (não é TETO em 100 — reseta
 * pro default inteiro); `offset` negativo cai pra 0. A validação de query
 * MALFORMADA (`?limit=abc` → default 20) é da ROTA (`atoiOr`, em
 * `routes/votacao.ts`) — esta função já recebe números, só clampa faixa.
 *
 * `LIMIT`/`OFFSET` sempre presentes na query: no D1 "rows read" conta linha
 * ESCANEADA, e uma listagem sem teto queima cota.
 */
export async function listVotingSessions(
  db: D1Database,
  { limit, offset }: ListVotingSessionsOptions,
): Promise<VotingSessionRow[]> {
  const clampedLimit = limit <= 0 || limit > 100 ? 20 : limit
  const clampedOffset = offset < 0 ? 0 : offset

  const { results } = await db
    .prepare(
      `SELECT ${VOTING_SESSION_COLUMNS}
         FROM voting_sessions
        ORDER BY created_at DESC, id DESC
        LIMIT ? OFFSET ?`,
    )
    .bind(clampedLimit, clampedOffset)
    .all<VotingSessionRow>()
  return results
}

/**
 * Ordem estável (`id ASC`) — mesma de `Store.GetSessionMovies`
 * (`movies.go:62-68`). Array vazio (nunca `null`) quando a sessão não tem
 * filme nenhum.
 */
export async function getSessionMovies(
  db: D1Database,
  sessionId: number,
): Promise<SessionMovieRow[]> {
  const { results } = await db
    .prepare(
      `SELECT ${SESSION_MOVIE_COLUMNS}
         FROM session_movies
        WHERE session_id = ?
        ORDER BY id ASC`,
    )
    .bind(sessionId)
    .all<SessionMovieRow>()
  return results
}

/**
 * Ids dos filmes que o usuário aprovou nesta sessão, ordenados asc — mesma
 * query de `Store.GetUserVotes` (`votes.go:129-149`). Devolve `[]` (nunca
 * `null`) quando o usuário não votou.
 *
 * A rota (`GET /sessions/{id}`) engole qualquer erro desta leitura — mesma
 * semântica do `if ids, err := ...; err == nil { votedMovieIDs = ids }` do
 * Go (`handlers/votacao/sessions.go:184-189`): a sessão é devolvida mesmo
 * que este SELECT falhe, com `voted_movie_ids` ficando `[]`.
 */
export async function getUserVotedMovieIds(
  db: D1Database,
  sessionId: number,
  userId: number,
): Promise<number[]> {
  const { results } = await db
    .prepare(
      `SELECT movie_id FROM votes WHERE session_id = ? AND user_id = ? ORDER BY movie_id ASC`,
    )
    .bind(sessionId, userId)
    .all<{ movie_id: number }>()
  return results.map((row) => row.movie_id)
}
