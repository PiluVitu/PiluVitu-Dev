/**
 * Domínio de `voting_sessions` + `session_movies` — porta as funções do
 * Store Go que leem/escrevem essas duas tabelas (`apps/api/internal/
 * votacao/sessions.go` + `movies.go`). Devolve as ROWS como o D1 as devolve
 * (snake_case, `VotingSessionRow`/`SessionMovieRow` de `lib/wire.ts`) — a
 * conversão pra `WireSession`/`WireMovie` (PascalCase) é responsabilidade
 * das rotas (`sessionToWire`/`movieToWire`), não deste arquivo.
 *
 * ⚠️ **I3 (revisão final da fatia): o corte entre este arquivo e
 * `domain/votes.ts` é por TABELA/AGREGADO, não por leitura/escrita.** A
 * regra antiga ("sessions.ts é só leitura, votes.ts é escrita") foi
 * documentada aqui numa versão anterior e já estava quebrada nas duas
 * pontas antes desta revisão: `getUserVotedMovieIds` LIA `votes` mas
 * morava aqui (moveu pra `domain/votes.ts`); `closeVotingSession`/
 * `setSessionWinner` ESCREVEM `voting_sessions` mas moravam em
 * `domain/votes.ts` (vieram pra cá). Sob a regra antiga, a fatia ③ (`POST
 * /votacao/sessions` — escrita em `voting_sessions` + `session_movies`,
 * ver `apps/ramielle/CLAUDE.md`) não teria lugar certo: por
 * leitura/escrita cairia em `votes.ts` (absurdo, não toca a tabela
 * `votes`); pela documentação "só-leitura" deste arquivo, também não
 * caberia aqui. Cortando por TABELA, a resposta é óbvia: `POST /sessions`
 * escreve `voting_sessions`/`session_movies`, logo é deste arquivo — dono
 * das DUAS tabelas, leitura E escrita. `domain/votes.ts` é o espelho: dono
 * de `votes`/`tiebreaks`, leitura E escrita. Movimentação PURA — nenhuma
 * assinatura ou corpo de função mudou, só o arquivo; os testes só trocaram
 * de `import` (ver `sessions.test.ts`/`votes.test.ts`).
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
 * pro default inteiro, então `?limit=100000` também vira 20, não 100);
 * `offset` negativo cai pra 0. Estas duas guardas moram no DOMÍNIO — igual
 * ao Go, onde elas vivem no Store, não no handler — porque valem
 * independentemente de quem chame esta função, não só da rota HTTP. A
 * validação de query MALFORMADA (`?limit=abc` → default 20, "não é número")
 * é uma camada ANTERIOR e separada, da ROTA (`atoiOr`, em
 * `routes/votacao.ts`) — esta função já recebe números, só clampa faixa.
 *
 * ⚠️ **Ordena por `id DESC` — NUNCA `created_at`.** Medido contra
 * `sessions.go:52`: `ORDER BY id DESC LIMIT ? OFFSET ?`, sem nenhum
 * critério por `created_at` e sem tiebreaker (o Go não usa o índice
 * `idx_voting_sessions_created` pra esta query — ele existe no schema, mas
 * fica sem uso aqui). Nas condições normais (linhas inseridas em ordem,
 * `id` autoincrement e `created_at` crescendo junto) as duas ordenações
 * produzem o MESMO resultado — mas divergem de verdade quando `created_at`
 * é gravado EXPLÍCITO fora da ordem de inserção, como a fatia ④ vai fazer
 * ao importar o histórico do SQLite da Go. Fix round 1 (Task 2): a
 * primeira versão desta função ordenava por `created_at DESC, id DESC`,
 * seguindo uma instrução do brief que citava o índice acima como
 * justificativa — a citação estava errada nos dois sentidos (o Go não usa
 * esse índice, e paridade é o critério, não a existência de um índice).
 * `listVotingSessions` ordena por `id DESC` para valer também depois da
 * importação, não só hoje.
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
        ORDER BY id DESC
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

// ---------------------------------------------------------------------------
// Escrita em `voting_sessions` — `closeVotingSession`/`setSessionWinner`.
// Movidas de `domain/votes.ts` na I3 (revisão final): cortar por
// leitura/escrita as classificava erradamente lá (elas ESCREVEM
// `voting_sessions`, a tabela que este arquivo é dono); cortando por
// TABELA/AGREGADO — a regra vigente agora, ver o cabeçalho do arquivo —
// pertencem aqui. Nenhuma mudança de assinatura ou corpo, só de arquivo.
// ---------------------------------------------------------------------------

/**
 * Fecha a sessão — porte de `Store.CloseVotingSession`
 * (`apps/api/internal/votacao/sessions.go:74-103`). `WHERE id = ? AND
 * status = 'open'` é a MESMA guarda do Go: devolve `false` (nenhuma linha
 * afetada) tanto pra id INEXISTENTE quanto pra sessão JÁ FECHADA — a rota
 * (`POST /close`) não distingue os dois casos, os dois viram 404
 * `session_not_open`. Ambiguidade INTENCIONAL herdada do Go, não
 * "melhorada" aqui com uma query extra de existência antes do UPDATE.
 *
 * `winnerMovieId === null` faz o UPDATE OMITIR a coluna `winner_movie_id`
 * inteira (fica com o valor que já tinha — NULL numa sessão aberta) — a
 * mesma bifurcação de dois SQLs do Go (`if winnerMovieID != nil {...} else
 * {...}`), não um `SET winner_movie_id = NULL` explícito (mesmo efeito,
 * texto de SQL diferente do que o Go de fato roda).
 *
 * `closedAtIso` é o relógio INJETADO pela rota (`nowIsoUtc()` de
 * `lib/dates.ts`) — nunca `new Date()` chamado aqui dentro, pra manter este
 * domínio testável sem mockar relógio global. Grava já em ISO (o Go usa
 * `CURRENT_TIMESTAMP`; a leitura de qualquer linha do D1 passa por
 * `toIsoUtc` de qualquer forma, mas gravar normalizado evita depender
 * dessa conversão neste valor específico).
 */
export async function closeVotingSession(
  db: D1Database,
  sessionId: number,
  winnerMovieId: number | null,
  closedAtIso: string,
): Promise<boolean> {
  const stmt =
    winnerMovieId !== null
      ? db
          .prepare(
            `UPDATE voting_sessions
                SET status = 'closed', closed_at = ?, winner_movie_id = ?
              WHERE id = ? AND status = 'open'`,
          )
          .bind(closedAtIso, winnerMovieId, sessionId)
      : db
          .prepare(
            `UPDATE voting_sessions
                SET status = 'closed', closed_at = ?
              WHERE id = ? AND status = 'open'`,
          )
          .bind(closedAtIso, sessionId)

  const result = await stmt.run()
  return (result.meta.changes ?? 0) > 0
}

/**
 * Grava o vencedor + o método de desempate — porte de
 * `Store.SetSessionWinner` (`apps/api/internal/votacao/tiebreaks.go:47-57`).
 * Chamada num PASSO SEPARADO de `closeVotingSession`, espelhando o Go
 * (`CloseSession` primeiro fecha com `winner_movie_id` já embutido no mesmo
 * UPDATE, DEPOIS chama `SetSessionWinner` de novo só pra gravar
 * `winner_method` — redundante pro `winner_movie_id`, que já foi gravado,
 * mas é o que o Go faz, e paridade OBSERVÁVEL é o critério desta fatia, não
 * o SQL mais enxuto). `method` só chega `'votes'` na T4 — `'roulette'` é a
 * T5 (`POST /tiebreak`).
 *
 * Não recebe `sessionId` como garantia de que a sessão está fechada — quem
 * chama (`POST /close`) só invoca isto DEPOIS de `closeVotingSession`
 * devolver `true`, mesma ordem do Go.
 *
 * ⚠️ **I1 (revisão final): o CALLER (`routes/votacao.ts`) engole qualquer
 * erro desta chamada** — mesma paridade do Go (`votes.go:99-103`, só
 * loga). Esta função em si continua propagando (não tem `try/catch`
 * próprio); é responsabilidade de quem chama decidir engolir ou não —
 * mesma divisão já usada no resto do domínio (quem decide 404/403/500 é
 * sempre a rota).
 */
export async function setSessionWinner(
  db: D1Database,
  sessionId: number,
  winnerMovieId: number,
  method: 'votes' | 'roulette',
): Promise<void> {
  await db
    .prepare(
      `UPDATE voting_sessions SET winner_movie_id = ?, winner_method = ? WHERE id = ?`,
    )
    .bind(winnerMovieId, method, sessionId)
    .run()
}

// ---------------------------------------------------------------------------
// Criação de sessão (fatia ③, Task 4) — `createVotingSession` +
// `insertSessionMovies`, portes de `Store.CreateVotingSession`
// (`apps/api/internal/votacao/sessions.go:23-39`) e
// `Store.InsertSessionMovies` (`apps/api/internal/votacao/movies.go:21-60`).
// Continuam neste arquivo pela mesma regra da I3 (corte por TABELA): as duas
// escrevem `voting_sessions`/`session_movies`, tabelas das quais este
// arquivo já é dono.
// ---------------------------------------------------------------------------

export type CreateVotingSessionInput = {
  title: string
  createdBy: number
  /**
   * Serializado pela ROTA (`JSON.stringify` do corpo validado de `POST
   * /votacao/sessions`) — string vazia cai pro default `'{}'`, mesma
   * paridade do Go (`if sortOptionsJSON == "" { sortOptionsJSON = "{}" }`,
   * `sessions.go:24-26`).
   */
  sortOptionsJson: string
}

/**
 * Insere a sessão (`status='open'` sempre) — porte de
 * `Store.CreateVotingSession`. INSERT simples com `RETURNING id` (mesmo
 * mecanismo MEDIDO funcional no D1 em `schema.test.ts`, Step 5 da T2) e,
 * como o Go, um segundo passo — aqui reusando `getVotingSession` já
 * existente acima — pra devolver a linha completa (com `status`,
 * `created_at` etc. já aplicados pelos defaults da migration), em vez de
 * montar a row à mão em JS.
 */
export async function createVotingSession(
  db: D1Database,
  input: CreateVotingSessionInput,
): Promise<VotingSessionRow> {
  const sortOptionsJson =
    input.sortOptionsJson === '' ? '{}' : input.sortOptionsJson

  const inserted = await db
    .prepare(
      `INSERT INTO voting_sessions (title, status, created_by, sort_options_json)
       VALUES (?, 'open', ?, ?)
       RETURNING id`,
    )
    .bind(input.title, input.createdBy, sortOptionsJson)
    .first<{ id: number }>()

  if (inserted === null) {
    throw new Error(
      'createVotingSession: INSERT ... RETURNING id não devolveu linha',
    )
  }

  const row = await getVotingSession(db, inserted.id)
  if (row === null) {
    throw new Error(
      'createVotingSession: linha não encontrada logo após o insert',
    )
  }
  return row
}

/** Um filme a gravar em `session_movies` — espelha `votacao.SessionMovie` do Go (sem `ID`/`SessionID`, que esta função já sabe). */
export type SessionMovieInsert = {
  category: string
  title: string
  type: 'filme' | 'serie'
  /** `''` quando não há pôster (fail-soft do TMDb) — vira `NULL` na coluna, mesma regra de `nullableStr` (`votacao/users.go:113-118`, reusada por `InsertSessionMovies`). */
  posterUrl: string
  /** `0` quando não há id do TMDb — vira `NULL`, mesma regra de `m.tmdbID > 0` no Go (`handlers/votacao/sessions.go:91-94`). */
  tmdbId: number
  wasWatched: boolean
  /** `0` quando o número da planilha é desconhecido/ausente — vira `NULL`, mesma regra de `m.movie.Number > 0` no Go (`handlers/votacao/sessions.go:95-98`). */
  sheetNumber: number
}

// Teto de 100 bound params por statement no D1 — mesmo orçamento já medido e
// documentado em `voteInsertStatements` (`domain/votes.ts`).
//
//   session_movies: 8 colunas bound (session_id, category, title, type,
//                   poster_url, tmdb_id, was_watched, sheet_number; `id` é
//                   AUTOINCREMENT, nunca bound) -> floor(100/8) = 12
//                   linhas/statement (96 params).
//
// Com as ~11 categorias medidas na planilha real, isto NUNCA chunka na
// prática (sortOnePerCategory devolve no máximo 1 filme por categoria).
// Escrito e testado mesmo assim — mesmo aviso do brief já seguido em
// `voteInsertStatements`: o custo de descobrir o teto em produção é uma
// sessão de votação perdida.
const MAX_BOUND_PARAMS = 100
const SESSION_MOVIE_COLUMNS_INSERT = [
  'session_id',
  'category',
  'title',
  'type',
  'poster_url',
  'tmdb_id',
  'was_watched',
  'sheet_number',
] as const
const SESSION_MOVIE_ROWS_PER_STATEMENT = Math.floor(
  MAX_BOUND_PARAMS / SESSION_MOVIE_COLUMNS_INSERT.length,
) // 12
const SESSION_MOVIE_TUPLE = `(${SESSION_MOVIE_COLUMNS_INSERT.map(() => '?').join(', ')})`

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size))
  return out
}

function sessionMovieInsertStatements(
  db: D1Database,
  sessionId: number,
  movies: SessionMovieInsert[],
): D1PreparedStatement[] {
  const head = `INSERT INTO session_movies (${SESSION_MOVIE_COLUMNS_INSERT.join(', ')}) VALUES `
  return chunk(movies, SESSION_MOVIE_ROWS_PER_STATEMENT).map((group) =>
    db
      .prepare(head + group.map(() => SESSION_MOVIE_TUPLE).join(', '))
      .bind(
        ...group.flatMap((m) => [
          sessionId,
          m.category,
          m.title,
          m.type,
          m.posterUrl === '' ? null : m.posterUrl,
          m.tmdbId > 0 ? m.tmdbId : null,
          m.wasWatched ? 1 : 0,
          m.sheetNumber > 0 ? m.sheetNumber : null,
        ]),
      ),
  )
}

/**
 * Grava os filmes da sessão — porte de `Store.InsertSessionMovies`
 * (`movies.go:21-60`). `db.batch()` dá rollback real pro CONJUNTO de
 * statements gerados (um por chunk de até 12 filmes) — mesma garantia do
 * `tx.BeginTx()/.../tx.Commit()` do Go: todos os filmes desta chamada, ou
 * nenhum.
 *
 * ⚠️ **NÃO inclui o INSERT da sessão em si no mesmo `db.batch()`** — mesma
 * separação do Go, onde `CreateVotingSession` (um INSERT isolado) e
 * `InsertSessionMovies` (a transação acima) são DUAS operações
 * independentes, não uma só. A rota (`routes/votacao.ts`) chama
 * `createVotingSession` primeiro (precisa do `id` gerado pra montar as
 * linhas de `session_movies`) e só ENTÃO chama esta função — se esta
 * lançar, a sessão já existe no banco sem filme nenhum (órfã), mesmo
 * comportamento observável do Go nesse cenário de falha.
 *
 * Array vazio é um no-op — mesmo guard `if len(movies) == 0 { return nil }`
 * do Go, evita um `db.batch([])` sem necessidade.
 */
export async function insertSessionMovies(
  db: D1Database,
  sessionId: number,
  movies: SessionMovieInsert[],
): Promise<void> {
  if (movies.length === 0) return
  await db.batch(sessionMovieInsertStatements(db, sessionId, movies))
}
