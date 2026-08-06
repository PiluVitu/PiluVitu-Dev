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
