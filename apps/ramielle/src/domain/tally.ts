/**
 * Apuração pura da votação de aprovação — porte 1:1 de
 * `apps/api/internal/votacao/results.go` (`TallyVotes`, `ComputeTopMovies`).
 * Sem I/O: recebe os votos já lidos do D1 (só o `movieId` importa aqui — quem
 * lê a tabela `votes` inteira é `domain/votes.ts`), devolve estruturas puras.
 * Isolado por ser exatamente o tipo de lógica que `Skill(tdd-workflow)`/o
 * brief desta task pedem coberta por Jest/Vitest direto, sem D1 no meio.
 */

/** O suficiente do voto pra apurar — mesma forma usada pelas duas funções. */
export type TalliableVote = { movieId: number }

/**
 * Conta votos por `movieId` — porte de `TallyVotes` (`results.go:6-12`).
 * `Map` preserva a ordem de PRIMEIRA aparição de cada `movieId` (mesma
 * semântica seed-a-seed de iteração de `map[int64]int` do Go não é garantida
 * — mas nem lá nem aqui a ORDEM do mapa importa: quem ordena é
 * `computeTopMovies`/a rota).
 */
export function tallyVotes(votes: TalliableVote[]): Map<number, number> {
  const out = new Map<number, number>()
  for (const vote of votes) {
    out.set(vote.movieId, (out.get(vote.movieId) ?? 0) + 1)
  }
  return out
}

export type TopMovies = {
  /** Ids empatados no topo, ordenados ASC. `[]` quando não há voto nenhum. */
  ids: number[]
  /** A contagem do topo. `0` quando `ids` é `[]`. */
  max: number
}

/**
 * Porte de `ComputeTopMovies` (`results.go:14-36`). `ids.length >= 2` é
 * empate; `=== 1` é vencedor claro; `[]` quando não há voto algum (`max: 0`
 * junto, espelhando o `nil, 0` do Go — aqui `[]` no lugar de `nil`, já que
 * TS/JSON não distinguem os dois de um jeito que importe pro `okJson`).
 */
export function computeTopMovies(votes: TalliableVote[]): TopMovies {
  const tally = tallyVotes(votes)
  if (tally.size === 0) return { ids: [], max: 0 }

  let max = 0
  for (const count of tally.values()) {
    if (count > max) max = count
  }

  const ids: number[] = []
  for (const [movieId, count] of tally) {
    if (count === max) ids.push(movieId)
  }
  ids.sort((a, b) => a - b)

  return { ids, max }
}
