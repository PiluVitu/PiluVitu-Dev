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
  /** Quantos filmes distintos sortear por categoria. Ausente = 1 (paridade com o Go). */
  perCategory?: number
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
 * ⚠️ **As categorias são iteradas em ordem alfabética** — comparador
 * explícito (`<`/`>`, porque o que se ordena são as tuplas `[chave, valor]`
 * do `Map`, não strings soltas), equivalente ao sort padrão de string:
 * mesma justificativa já documentada em
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

  const perCategory = opts.perCategory ?? 1
  return sortedEntries.flatMap(([, candidates]) =>
    pickDistinct(candidates, perCategory, rng),
  )
}

// Fisher-Yates parcial: o 1º sorteio é exatamente `floor(rng() * length)`,
// o mesmo do Go, então `perCategory = 1` consome o `rng` igual ao porte 1:1.
function pickDistinct(
  candidates: SheetMovie[],
  count: number,
  rng: Rng,
): SheetMovie[] {
  const pool = [...candidates]
  const take = Math.min(count, pool.length)
  for (let i = 0; i < take; i++) {
    const j = i + Math.floor(rng() * (pool.length - i))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, take)
}

/**
 * Teto de filmes na roleta de Halloween: cada um é uma busca de pôster no
 * TMDb, e o Worker grátis tem 50 subrequests por invocação (o Sheets gasta
 * 2–3).
 */
export const MAX_CANDIDATOS_ROLETA = 40

/**
 * Candidatos da roleta de Halloween: os filmes com a coluna "Halloween"
 * marcada, com os mesmos filtros de tipo e de assistido do sorteio comum
 * (categoria não entra). Acima de `MAX_CANDIDATOS_ROLETA`, sorteia esse
 * tanto com o `rng`; a ordem da planilha é mantida.
 */
export function sortearCandidatosRoleta(
  movies: SheetMovie[],
  opts: Pick<SortOnePerCategoryOptions, 'types' | 'includeWatched'>,
  rng: Rng,
): SheetMovie[] {
  const candidatos = filterMovies(movies, opts).filter((m) => m.halloween)
  if (candidatos.length === 0) {
    throw new NoCandidatesError()
  }
  if (candidatos.length <= MAX_CANDIDATOS_ROLETA) return candidatos

  const escolhidos = new Set(
    pickDistinct(candidatos, MAX_CANDIDATOS_ROLETA, rng),
  )
  return candidatos.filter((m) => escolhidos.has(m))
}
