/**
 * O sorteio — porte 1:1 de `apps/api/internal/votacao/sortear.go`
 * (`SortOnePerCategory`/`filterMovies`/`stringSet`). Função PURA: sem D1,
 * sem HTTP, sem `Math.random` direto — o `rng` é injetado (mesma forma de
 * `Math.random`, `() => number` em `[0, 1)`), o que é o que torna o teste de
 * determinismo possível. Usada por `POST /votacao/sessions` (fatia ③, task
 * futura) pra escolher 1 filme por categoria a partir do catálogo lido do
 * Sheets (`lib/gsheets.ts`).
 *
 * `SheetMovie` é o tipo da T2 desta fatia (`lib/gsheets.ts`) — não redefinido
 * aqui.
 */
import type { SheetMovie } from '../lib/gsheets'

/**
 * Porte de `SortOptions` (`sortear.go:19-23`). Todos os campos são
 * OPCIONAIS, espelhando o zero-value do Go (slice `nil`/`false` quando o
 * struct literal omite o campo): `types`/`categories` ausentes ou `[]` ⇒
 * sem filtro (todos passam); `includeWatched` ausente ⇒ `false` (só
 * não-assistidos).
 */
export type SortOnePerCategoryOptions = {
  /** Vazio/ausente = todos os tipos (`'filme'` e `'serie'`). */
  types?: string[]
  /** `false` (default) = exclui filmes já assistidos. */
  includeWatched?: boolean
  /** Vazio/ausente = todas as categorias presentes no catálogo. */
  categories?: string[]
}

/**
 * Gerador de número aleatório injetado — mesma forma de `Math.random`
 * (devolve um `number` em `[0, 1)`). Corresponde ao `*rand.Rand` do Go:
 * lá a semente é injetada via `rand.New(rand.NewSource(seed))`; aqui é o
 * PRÓPRIO gerador (uma função) que o chamador injeta, permitindo um teste
 * determinístico sem depender de `Math.random` de verdade.
 */
export type Rng = () => number

/**
 * Espelha `votacao.ErrNoCandidates` do Go — mesmo padrão de
 * `MovieNotInSessionError` (`domain/votes.ts`): um erro de domínio
 * nomeado, checado com `instanceof` por quem chama (a rota), pra decidir o
 * código HTTP (`422 no_candidates`, ver `handlers/votacao/sessions.go:64-
 * 67` do Go).
 */
export class NoCandidatesError extends Error {
  constructor() {
    super('votacao: no movie candidates after filter')
    this.name = 'NoCandidatesError'
  }
}

/**
 * Porte de `filterMovies` (`sortear.go:54-71`). `stringSet` do Go vira um
 * `Set` só quando a lista de filtro não é vazia — lista vazia (ou ausente)
 * é "sem filtro", não "filtra tudo fora" (mesma semântica do `len(...) > 0`
 * do Go antes de checar o set).
 */
function filterMovies(
  movies: SheetMovie[],
  opts: SortOnePerCategoryOptions,
): SheetMovie[] {
  const includeWatched = opts.includeWatched ?? false
  const allowedTypes =
    opts.types && opts.types.length > 0 ? new Set(opts.types) : null
  const allowedCategories =
    opts.categories && opts.categories.length > 0
      ? new Set(opts.categories)
      : null

  return movies.filter((movie) => {
    if (!includeWatched && movie.watched) return false
    if (allowedTypes !== null && !allowedTypes.has(movie.type)) return false
    if (allowedCategories !== null && !allowedCategories.has(movie.category))
      return false
    return true
  })
}

/**
 * Porte de `SortOnePerCategory` (`sortear.go:31-52`). Filtra (`opts`),
 * agrupa por categoria, sorteia exatamente 1 filme por grupo.
 *
 * ⚠️ **As categorias são iteradas em ordem alfabética** — `Array#sort()`
 * sem comparador, mesma justificativa já documentada em
 * `lib/gsheets.ts#getCategories`: pra toda categoria real deste catálogo
 * (acentuadas incluídas, nenhuma astral/suplementar), a ordenação por
 * unidade de código UTF-16 produz a MESMA ordem relativa que `slices.Sort`
 * do Go (ordem de byte UTF-8) — é o que torna a saída ESTÁVEL e o teste de
 * determinismo possível. Nunca trocar por
 * `.sort((a,b) => a.localeCompare(b))`.
 *
 * Lança `NoCandidatesError` quando nenhum filme sobrevive ao filtro — nunca
 * quando o filtro passa mas alguma categoria fica vazia (isso não acontece:
 * uma categoria só existe no agrupamento se pelo menos 1 filme filtrado a
 * tiver).
 */
export function sortOnePerCategory(
  movies: SheetMovie[],
  opts: SortOnePerCategoryOptions,
  rng: Rng,
): SheetMovie[] {
  const filtered = filterMovies(movies, opts)
  if (filtered.length === 0) {
    throw new NoCandidatesError()
  }

  const byCategory = new Map<string, SheetMovie[]>()
  for (const movie of filtered) {
    const list = byCategory.get(movie.category)
    if (list) {
      list.push(movie)
    } else {
      byCategory.set(movie.category, [movie])
    }
  }

  // Ordena as ENTRADAS (não só as chaves) pra sortear direto sobre a lista
  // já agrupada — evita um segundo `Map#get` por categoria, que devolveria
  // `SheetMovie[] | undefined` mesmo sabendo que a chave sempre existe.
  const sortedEntries = [...byCategory.entries()].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  )

  return sortedEntries.map(([, candidates]) => {
    const index = Math.floor(rng() * candidates.length)
    return candidates[index]
  })
}
