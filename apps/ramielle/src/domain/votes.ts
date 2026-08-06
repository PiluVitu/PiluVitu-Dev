/**
 * Domínio de `votes` + `tiebreaks` — porta as funções do Store Go que leem/
 * escrevem essas duas tabelas (`apps/api/internal/votacao/votes.go` +
 * `tiebreaks.go`), incluindo `Store.ReplaceUserVotes`
 * (`apps/api/internal/votacao/votes.go:26-67`). Voto de aprovação: o
 * conjunto de `movie_ids` enviado SUBSTITUI inteiro o que o usuário já tinha
 * votado naquela sessão (delete + insert, nunca um merge). Conjunto vazio
 * limpa os votos — operação válida, não erro.
 *
 * ⚠️ **I3 (revisão final da fatia): o corte entre este arquivo e
 * `domain/sessions.ts` é por TABELA/AGREGADO, não por leitura/escrita** —
 * ver o cabeçalho de `domain/sessions.ts` pro raciocínio completo (a fatia
 * ③, que escreve em `voting_sessions`, é o motivo concreto). Este arquivo é
 * dono de `votes`/`tiebreaks`, leitura E escrita: `getUserVotedMovieIds`
 * (lê `votes`) veio de `domain/sessions.ts` nesta revisão;
 * `closeVotingSession`/`setSessionWinner` (escrevem `voting_sessions`)
 * saíram daqui pra lá. Movimentação PURA — nenhuma assinatura ou corpo de
 * função mudou.
 *
 * Duas diferenças deliberadas do Go em `replaceUserVotes`, ambas exigidas
 * pelo brief da Task 3 (fatia2 T3) e nenhuma delas é "reimplementação
 * limpa por acidente":
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
 * Task 4 (fatia2 T4) estendeu este arquivo com a APURAÇÃO: `listVoteMovieIds`
 * + `countVoters` (leitura, usados por `GET /results`).
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

/**
 * Ids dos filmes que o usuário aprovou nesta sessão, ordenados asc — mesma
 * query de `Store.GetUserVotes` (`votes.go:129-149`). Devolve `[]` (nunca
 * `null`) quando o usuário não votou.
 *
 * A rota (`GET /sessions/{id}`) engole qualquer erro desta leitura — mesma
 * semântica do `if ids, err := ...; err == nil { votedMovieIDs = ids }` do
 * Go (`handlers/votacao/sessions.go:184-189`): a sessão é devolvida mesmo
 * que este SELECT falhe, com `voted_movie_ids` ficando `[]`.
 *
 * ⚠️ **I3 (revisão final): movida de `domain/sessions.ts` para cá** — lê
 * `votes`, tabela da qual este arquivo é dono (ver o cabeçalho). Mesmo
 * corpo, mesma assinatura; só o arquivo mudou.
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

// ---------------------------------------------------------------------------
// Apuração (Task 4, fatia2 T4) — leitura pra `GET /results`.
// `tallyVotes`/`computeTopMovies` (a lógica pura) moram em `domain/tally.ts`;
// aqui só o I/O contra o D1. A escrita de `POST /close`
// (`closeVotingSession`/`setSessionWinner`) mora em `domain/sessions.ts`
// desde a I3 (revisão final) — escreve `voting_sessions`, não `votes`.
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

// ---------------------------------------------------------------------------
// Desempate auditável/recomputável (Task 5, fatia2 T5; terminologia
// corrigida na revisão final — M8, ver `apps/ramielle/CLAUDE.md`):
// `createTiebreak` grava a linha de AUDITORIA do sorteio (`tiebreaks`,
// porte de `Store.CreateTiebreak`, `apps/api/internal/votacao/
// tiebreaks.go:21-34`). O cálculo puro (`tiebreakSeed`/`pickTiebreakIndex`)
// fica isolado em `domain/tiebreak.ts` (sem I/O), mesma separação que
// `tally.ts` (puro) × este arquivo (I/O) já
// estabelece pra apuração. `setSessionWinner` (`domain/sessions.ts` desde a
// I3 — escreve `voting_sessions`) é reusado com `method='roulette'` —
// nenhuma escrita nova pro vencedor em si, só a linha de auditoria é
// inédita desta task.
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

// ---------------------------------------------------------------------------
// `GET /sessions/{id}/votes` — admin, Task 6 (fatia2 T6). Porte de
// `Store.ListSessionVotesWithUsers` (`apps/api/internal/votacao/votes.go:99-
// 127`) + do handler `ListSessionVotes` (`handlers/votacao/votes.go:272-
// 293`), que monta a resposta com `map[string]any` de chaves explícitas — por
// isso o SELECT abaixo já sai em snake_case, com apelidos (`AS`) casando 1:1
// com o JSON de fio, sem passar por `lib/wire.ts` (aquele arquivo é só pras
// duas structs PascalCase, `sessionToWire`/`movieToWire` — ver o cabeçalho
// dele). `created_at` continua no formato cru do D1 aqui (I/O puro, sem
// side-effect de formatação); a ROTA aplica `toIsoUtc` na montagem final,
// mesmo padrão de responsabilidade que `sessionToWire`/`movieToWire` seguem
// para as outras duas leituras.
//
// ⚠️ **Esta é a ÚNICA query da API inteira que liga e-mail de pessoa a voto**
// — o JOIN com `users` expõe `email`/`name`, que nenhuma outra rota de
// votação devolve (nem `GET /sessions/{id}`, nem `/results`). O admin-only
// (`requireAdmin`) é aplicado na ROTA (`routes/votacao.ts`), não aqui: esta
// função não sabe nada sobre quem está chamando, só executa o JOIN — a
// mesma separação já usada em toda leitura deste arquivo (quem decide 404/
// 403 é sempre a rota, nunca o domínio).
// ---------------------------------------------------------------------------

/**
 * Uma linha de `GET /sessions/{id}/votes`, já no formato snake_case de fio —
 * espelha o `map[string]any` que `ListSessionVotes` monta a partir de cada
 * `votacao.VoteDetail` do Go. `created_at` ainda cru (formato D1); a rota
 * normaliza via `toIsoUtc`.
 */
export type VoteDetailRow = {
  user_id: number
  user_name: string
  user_email: string
  movie_id: number
  movie_title: string
  category: string
  created_at: string
}

/**
 * `JOIN votes ⋈ users ⋈ session_movies` — porte 1:1 do SELECT de
 * `ListSessionVotesWithUsers` (`votes.go:102-109`), mesmas três colunas de
 * junção (`u.id = v.user_id`, `m.id = v.movie_id`), mesmo `WHERE
 * v.session_id = ?`, mesma ordenação (`ORDER BY v.created_at ASC`, oldest
 * first). Não checa se a sessão existe — igual a `listVoteMovieIds`
 * (`/results`): um id inexistente (ou sem voto nenhum) simplesmente não bate
 * nenhuma linha no JOIN, devolvendo `[]`, nunca lança. Quem decide 400
 * `invalid_id` pra um id malformado é a ROTA (`parseIdDaRota`), não este
 * SELECT.
 */
export async function listSessionVotesWithUsers(
  db: D1Database,
  sessionId: number,
): Promise<VoteDetailRow[]> {
  const { results } = await db
    .prepare(
      `SELECT u.id AS user_id, u.name AS user_name, u.email AS user_email,
              m.id AS movie_id, m.title AS movie_title, m.category AS category,
              v.created_at AS created_at
         FROM votes v
         JOIN users u ON u.id = v.user_id
         JOIN session_movies m ON m.id = v.movie_id
        WHERE v.session_id = ?
        ORDER BY v.created_at ASC`,
    )
    .bind(sessionId)
    .all<VoteDetailRow>()
  return results
}
