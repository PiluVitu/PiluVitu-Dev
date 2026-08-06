/**
 * Domínio de ESCRITA da votação — porta `Store.ReplaceUserVotes`
 * (`apps/api/internal/votacao/votes.go:26-67`). Voto de aprovação: o
 * conjunto de `movie_ids` enviado SUBSTITUI inteiro o que o usuário já tinha
 * votado naquela sessão (delete + insert, nunca um merge). Conjunto vazio
 * limpa os votos — operação válida, não erro.
 *
 * Duas diferenças deliberadas do Go, ambas exigidas pelo brief da Task 3
 * (fatia2 T3) e nenhuma delas é "reimplementação limpa por acidente":
 *
 *  1. **Validação de pertencimento em UMA query**, não uma por filme. O Go
 *     faz `SELECT EXISTS(...)` dentro do loop (uma query por movie_id,
 *     dentro da tx). Aqui é um único `SELECT id FROM session_movies WHERE
 *     session_id = ?` e a checagem de pertencimento vira lookup num Set em
 *     memória — mesmo resultado observável (`movie_not_in_session` no
 *     primeiro id que não pertence), menos round-trips ao D1.
 *  2. **Dedupe antes de gravar.** `votes` tem `UNIQUE (session_id, user_id,
 *     movie_id)` — um corpo com id repetido faria o segundo INSERT daquele
 *     id violar a constraint. O Go, com um INSERT por linha dentro da tx,
 *     na prática QUEBRA nesse cenário (o statement duplicado aborta a tx e
 *     vira 500 internal_error — não há dedupe lá). O brief desta task pede
 *     explicitamente pra NÃO herdar esse defeito: dedupar aqui é a
 *     divergência intencional, preservando ORDEM de primeira ocorrência.
 *
 * Task 4 (fatia2 T4) estende este arquivo com a APURAÇÃO: `listVoteMovieIds`
 * + `countVoters` (leitura, usados por `GET /results`) e
 * `closeVotingSession` + `setSessionWinner` (escrita em `voting_sessions`,
 * usados por `POST /close`). Ficam aqui, não em `domain/sessions.ts` (que é
 * SÓ leitura de propósito — ver o topo daquele arquivo), porque
 * `closeVotingSession`/`setSessionWinner` são ESCRITAS, e porque o brief
 * desta task (`task-4-brief.md`) nomeia explicitamente só `tally.ts` (novo,
 * puro) e este arquivo pra estender — nenhum novo arquivo de domínio.
 */
import type { TalliableVote } from './tally'

/** Espelha `votacao.ErrMovieNotInSession` do Go. */
export class MovieNotInSessionError extends Error {
  constructor() {
    super('votacao: movie not in session')
    this.name = 'MovieNotInSessionError'
  }
}

// ---------------------------------------------------------------------------
// ORÇAMENTO DE BOUND PARAMS — mesmo teto de 100/statement medido e
// documentado em domain/installments.ts e domain/import.ts (finanças).
//
//   votes: 3 colunas (session_id, user_id, movie_id; created_at sai do
//          DEFAULT CURRENT_TIMESTAMP da migration, nunca bound) ->
//          floor(100/3) = 33 linhas/statement (99 params).
//
// Uma sessão real tem ~uma dezena de filmes — isto NUNCA chunka na prática.
// Escrito e testado mesmo assim: o custo de descobrir o teto em produção é
// uma sessão de votação perdida (aviso explícito do brief).
// ---------------------------------------------------------------------------
const MAX_BOUND_PARAMS = 100
const VOTE_COLUMNS = ['session_id', 'user_id', 'movie_id'] as const
const VOTE_ROWS_PER_STATEMENT = Math.floor(
  MAX_BOUND_PARAMS / VOTE_COLUMNS.length,
) // 33
const VOTE_TUPLE = `(${VOTE_COLUMNS.map(() => '?').join(', ')})`

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size))
  return out
}

function voteInsertStatements(
  db: D1Database,
  sessionId: number,
  userId: number,
  movieIds: number[],
): D1PreparedStatement[] {
  const head = `INSERT INTO votes (${VOTE_COLUMNS.join(', ')}) VALUES `
  return chunk(movieIds, VOTE_ROWS_PER_STATEMENT).map((group) =>
    db
      .prepare(head + group.map(() => VOTE_TUPLE).join(', '))
      .bind(...group.flatMap((movieId) => [sessionId, userId, movieId])),
  )
}

/**
 * Substitui o conjunto de aprovações do usuário na sessão por exatamente
 * `movieIds` (deduplicado, ordem de primeira ocorrência preservada).
 * Atômico via `db.batch()` (DELETE + INSERTs num único batch — o D1 faz
 * rollback real da sequência inteira se qualquer statement abortar; NUNCA
 * duas chamadas soltas, que deixariam a rejeição de um filme fora da sessão
 * já ter apagado os votos antigos).
 *
 * Lança `MovieNotInSessionError` se algum id não pertencer à sessão —
 * validado ANTES de tocar em `votes`, então uma rejeição não mexe nos votos
 * existentes (mesma garantia provada em
 * `TestReplaceUserVotesRejectionIsNonDestructive` no Go).
 *
 * Devolve o array deduplicado que foi de fato gravado — é o que a rota usa
 * pra montar `voted_movie_ids` na resposta (paridade de CONTEÚDO com o Go,
 * que ecoa `body.MovieIDs`; a única divergência possível é exatamente o
 * caso de ids repetidos, onde o Go quebraria e nós deduplicamos).
 */
export async function replaceUserVotes(
  db: D1Database,
  sessionId: number,
  userId: number,
  movieIds: number[],
): Promise<number[]> {
  const deduped = [...new Set(movieIds)]

  if (deduped.length > 0) {
    const { results } = await db
      .prepare(`SELECT id FROM session_movies WHERE session_id = ?`)
      .bind(sessionId)
      .all<{ id: number }>()
    const validIds = new Set(results.map((row) => row.id))
    for (const movieId of deduped) {
      if (!validIds.has(movieId)) {
        throw new MovieNotInSessionError()
      }
    }
  }

  const deleteStmt = db
    .prepare(`DELETE FROM votes WHERE session_id = ? AND user_id = ?`)
    .bind(sessionId, userId)

  await db.batch([
    deleteStmt,
    ...voteInsertStatements(db, sessionId, userId, deduped),
  ])

  return deduped
}

// ---------------------------------------------------------------------------
// Apuração (Task 4, fatia2 T4) — leitura pra `GET /results`, escrita pra
// `POST /close`. `tallyVotes`/`computeTopMovies` (a lógica pura) moram em
// `domain/tally.ts`; aqui só o I/O contra o D1.
// ---------------------------------------------------------------------------

/**
 * Ids de filme de todo voto da sessão, na forma que `tallyVotes`/
 * `computeTopMovies` (`domain/tally.ts`) esperam — porte de
 * `Store.ListVotesBySession` (`apps/api/internal/votacao/votes.go:61-85`),
 * só que já projetado pra `{movieId}` em vez do `Vote` inteiro: nem
 * `GetResults` nem `CloseSession` usam `ID`/`UserID`/`CreatedAt` do Go, só
 * `MovieID` — carregar as demais colunas seria trabalho sem uso.
 *
 * O NÚMERO DE LINHAS devolvido por esta função É `total_votes` na resposta
 * de `/results` (`results.length`, não `countVoters`) — `total_votes` conta
 * LINHAS de `votes`, não eleitores; ver `countVoters` logo abaixo pro
 * porquê os dois números divergem sob voto de aprovação.
 *
 * `ORDER BY created_at ASC` espelha a query do Go por completude, mas não
 * afeta a apuração — `tallyVotes`/`computeTopMovies` não são sensíveis à
 * ordem de entrada, só à contagem por `movieId`.
 */
export async function listVoteMovieIds(
  db: D1Database,
  sessionId: number,
): Promise<TalliableVote[]> {
  const { results } = await db
    .prepare(
      `SELECT movie_id FROM votes WHERE session_id = ? ORDER BY created_at ASC`,
    )
    .bind(sessionId)
    .all<{ movie_id: number }>()
  return results.map((row) => ({ movieId: row.movie_id }))
}

/**
 * Número de USUÁRIOS DISTINTOS que votaram na sessão — porte de
 * `Store.CountVoters` (`votes.go:152-158`). ⚠️ Diferente de
 * `listVoteMovieIds(...).length` (`total_votes`, número de LINHAS): o voto
 * de aprovação deixa uma pessoa aprovar vários filmes, então 1 pessoa
 * votando em 3 filmes é `total_votes: 3` mas `total_voters: 1` — os dois
 * números medem coisas diferentes de propósito, não é um bug se divergirem.
 */
export async function countVoters(
  db: D1Database,
  sessionId: number,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(DISTINCT user_id) AS n FROM votes WHERE session_id = ?`,
    )
    .bind(sessionId)
    .first<{ n: number }>()
  return row?.n ?? 0
}

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
 * o SQL mais enxuto). `method` só chega `'votes'` nesta task — `'roulette'`
 * é a T5 (`POST /tiebreak`).
 *
 * Não recebe `sessionId` como garantia de que a sessão está fechada — quem
 * chama (`POST /close`) só invoca isto DEPOIS de `closeVotingSession`
 * devolver `true`, mesma ordem do Go.
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
// Desempate provably-fair (Task 5, fatia2 T5) — `createTiebreak` grava a
// linha de AUDITORIA do sorteio (`tiebreaks`, porte de `Store.CreateTiebreak`,
// `apps/api/internal/votacao/tiebreaks.go:21-34`). O cálculo puro
// (`tiebreakSeed`/`pickTiebreakIndex`) fica isolado em `domain/tiebreak.ts`
// (sem I/O), mesma separação que `tally.ts` (puro) × este arquivo (I/O) já
// estabelece pra apuração. `setSessionWinner` acima é reusado com
// `method='roulette'` — nenhuma escrita nova pro vencedor em si, só a linha
// de auditoria é inédita desta task.
// ---------------------------------------------------------------------------

/** Uma linha de `tiebreaks` a gravar — espelha `votacao.TiebreakRecord` do Go. */
export type TiebreakAuditRow = {
  sessionId: number
  triggeredBy: number
  tiedIdsJson: string
  /** Hex — o mesmo valor bruto que veio no corpo da requisição. */
  clientEntropy: string
  /** Hex — o nonce gerado pelo servidor, o MESMO que a resposta devolve. */
  serverNonce: string
  winnerMovieId: number
}

/**
 * Persiste uma linha de auditoria do sorteio — porte de
 * `Store.CreateTiebreak` (`tiebreaks.go:21-34`). `created_at` sai do
 * `DEFAULT CURRENT_TIMESTAMP` da migration, nunca bound aqui (mesmo padrão
 * de `votes` em `voteInsertStatements` acima).
 *
 * ⚠️ Grava `serverNonce` em HEX — o mesmo valor que a rota devolve no corpo
 * da resposta. Se os dois divergissem (ex.: gerar o nonce duas vezes, ou
 * grafar bytes crus em vez do hex), a auditoria pararia de fechar: quem
 * tentasse recomputar o sorteio a partir do que a API devolveu chegaria
 * num seed diferente do que gerou o vencedor de fato gravado.
 */
export async function createTiebreak(
  db: D1Database,
  row: TiebreakAuditRow,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO tiebreaks
         (session_id, triggered_by, tied_ids_json, client_entropy, server_nonce, winner_movie_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.sessionId,
      row.triggeredBy,
      row.tiedIdsJson,
      row.clientEntropy,
      row.serverNonce,
      row.winnerMovieId,
    )
    .run()
}
