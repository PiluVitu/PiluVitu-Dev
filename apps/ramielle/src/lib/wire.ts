/**
 * Camada de fio da votação — converte as linhas do D1 (snake_case, tipos
 * SQLite) para o JSON que a API Go já emite (PascalCase, sem tag `json:` nas
 * structs — ver apps/api/internal/votacao/sessions.go:11-21 e movies.go:9-19).
 *
 * ⚠️ NÃO "padronizar" pra snake_case. `apps/web/lib/votacao/types.ts` já
 * declara `VotingSession.ID`/`.Title`/`.CreatedBy` em PascalCase — o resto da
 * API (has_voted, movie_id, total_votes) é snake_case porque aqueles
 * handlers montam `map[string]any` com chaves explícitas. A mistura É o
 * contrato. Trocar quebra a tela em silêncio: `res.json()` é `any` em TS.
 *
 * A ordem das chaves nos objetos abaixo espelha a ordem dos campos nas
 * structs Go — `JSON.stringify` respeita ordem de inserção, e o teste do
 * vetor dourado (wire.test.ts) fixa essa ordem via `Object.keys`.
 */
import { toIsoUtc } from './dates'

/** Linha de `voting_sessions` como o binding D1 devolve (snake_case). */
export type VotingSessionRow = {
  id: number
  title: string
  status: 'open' | 'closed'
  created_by: number
  created_at: string
  closed_at: string | null
  winner_movie_id: number | null
  winner_method: 'votes' | 'roulette' | null
  sort_options_json: string
}

/** Linha de `session_movies` como o binding D1 devolve (snake_case). */
export type SessionMovieRow = {
  id: number
  session_id: number
  category: string
  title: string
  type: 'filme' | 'serie'
  poster_url: string | null
  tmdb_id: number | null
  was_watched: number // INTEGER 0|1 no D1
  sheet_number: number | null
}

/** Shape de fio de `VotingSession` — espelha apps/web/lib/votacao/types.ts. */
export type WireSession = {
  ID: number
  Title: string
  Status: 'open' | 'closed'
  CreatedBy: number
  CreatedAt: string
  ClosedAt: string | null
  WinnerMovieID: number | null
  WinnerMethod: 'votes' | 'roulette' | null
  SortOptionsJSON: string
}

/** Shape de fio de `SessionMovie` — espelha apps/web/lib/votacao/types.ts. */
export type WireMovie = {
  ID: number
  SessionID: number
  Category: string
  Title: string
  Type: 'filme' | 'serie'
  PosterURL: string
  TMDbID: number | null
  WasWatched: boolean
  SheetNumber: number | null
}

export function sessionToWire(row: VotingSessionRow): WireSession {
  return {
    ID: row.id,
    Title: row.title,
    Status: row.status,
    CreatedBy: row.created_by,
    CreatedAt: toIsoUtc(row.created_at),
    ClosedAt: row.closed_at === null ? null : toIsoUtc(row.closed_at),
    WinnerMovieID: row.winner_movie_id,
    WinnerMethod: row.winner_method,
    SortOptionsJSON: row.sort_options_json,
  }
}

export function movieToWire(row: SessionMovieRow): WireMovie {
  return {
    ID: row.id,
    SessionID: row.session_id,
    Category: row.category,
    Title: row.title,
    Type: row.type,
    // O Go declara `PosterURL string` (nunca ponteiro) — uma coluna NULL vira "".
    PosterURL: row.poster_url ?? '',
    TMDbID: row.tmdb_id,
    WasWatched: row.was_watched === 1,
    SheetNumber: row.sheet_number,
  }
}
