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
 */

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
