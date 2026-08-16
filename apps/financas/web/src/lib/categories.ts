/**
 * Shape de `GET /api/reports/by-category` (Task 5) — consumido por
 * `blocos/BlocoCategorias.tsx` (busca) e `blocos/GraficoComprometido.tsx`
 * (que hospeda `GraficoCategorias`, ver comentário lá pro motivo do mesmo
 * arquivo). Mora em `lib/`, não em `blocos/BlocoCategorias.tsx`, pelo mesmo
 * motivo de `CommitmentReportView` ter saído de `pages/commitments.tsx` pra
 * `lib/commitments.ts` na Task 6 (fix round 1): um import direto
 * Bloco ↔ Grafico nos dois sentidos criaria ciclo.
 *
 * ⚠️ `category_id: null` é o ÚNICO jeito seguro de identificar o bucket
 * "Sem categoria" — NUNCA `category_name`/`category_slug`. `categories.slug`
 * é nullable no schema, então uma categoria REAL do usuário também pode ter
 * slug nulo; usar o slug (ou o nome) pra decidir esconderia essa categoria
 * real dentro do tratamento do bucket agregado. `category_id` é a única
 * coluna que o `GROUP BY` de `byCategory()` (Worker, `src/domain/reports.ts`)
 * garante nula exclusivamente pro bucket "Sem categoria".
 */
export type CategoryRowView = {
  category_id: string | null
  category_name: string
  category_slug: string | null
  total_cents: number
}

export type ByCategoryReportView = {
  competence: string
  rows: CategoryRowView[]
  total_cents: number
}

/**
 * Shape de `GET /api/categories` — espelha `Category` do Worker
 * (`src/domain/categories.ts`). A SPA não importa através da fronteira
 * Worker/bundle (mesma razão de `lib/dates.ts` duplicar `todayInTeresina`),
 * então o tipo é redeclarado aqui.
 *
 * Mora em `lib/` (e não em `pages/categorias.tsx`) porque tem DOIS
 * consumidores desde o primeiro dia — a tela de gestão e o `<select>` da
 * tela Lançar —, mesma disciplina de `CommitmentReportView`.
 */
export type CategoryKindView =
  | 'income'
  | 'expense'
  | 'transfer'
  | 'debt_settlement'

export type CategoryView = {
  id: string
  parent_id: string | null
  name: string
  kind: CategoryKindView
  slug: string | null
  default_scope: 'PJ' | 'PF' | null
  archived_at: string | null
  created_at: string
}

/**
 * `nivel` é 0 (raiz) ou 1 (filha) — a árvore tem no máximo 2 níveis, e isso
 * é invariante garantido pelo servidor (`assertParentUsable` exige que a mãe
 * seja raiz), não um limite escolhido por esta função.
 */
export type NoDeCategoria = { categoria: CategoryView; nivel: 0 | 1 }

function porNome(a: CategoryView, b: CategoryView): number {
  return a.name.localeCompare(b.name, 'pt-BR')
}

/**
 * Achata a hierarquia em uma lista de renderização: cada raiz seguida das
 * próprias filhas, tudo em ordem alfabética.
 *
 * ⚠️ **A hierarquia EXISTE no banco desde a migration `0001` (`Custos da PJ`
 * é mãe de DAS/Contador/INSS, `0001:486-497`) e nenhuma tela jamais a
 * renderizou** — `parent_id` sempre saiu no `GET` e sempre foi ignorado.
 *
 * ⚠️ Filha cuja MÃE não está na lista recebida (pai arquivado, ou a lista
 * chegou filtrada por `kind` — o que a tela Lançar faz no cliente) NUNCA
 * some: entra como raiz, no fim. Descartá-la seria esconder uma categoria
 * real por causa de um filtro sobre OUTRA linha; e `nivel: 1` sem a mãe
 * acima renderizaria uma indentação pendurada em nada.
 */
export function ordenarPorHierarquia(cats: CategoryView[]): NoDeCategoria[] {
  const raizes = cats.filter((c) => c.parent_id === null).sort(porNome)
  const idsRaiz = new Set(raizes.map((r) => r.id))

  const filhasPorMae = new Map<string, CategoryView[]>()
  const orfas: CategoryView[] = []
  for (const c of cats) {
    if (c.parent_id === null) continue
    if (!idsRaiz.has(c.parent_id)) {
      orfas.push(c)
      continue
    }
    const lista = filhasPorMae.get(c.parent_id) ?? []
    lista.push(c)
    filhasPorMae.set(c.parent_id, lista)
  }

  const saida: NoDeCategoria[] = []
  for (const raiz of raizes) {
    saida.push({ categoria: raiz, nivel: 0 })
    for (const filha of (filhasPorMae.get(raiz.id) ?? []).sort(porNome)) {
      saida.push({ categoria: filha, nivel: 1 })
    }
  }
  for (const orfa of orfas.sort(porNome)) {
    saida.push({ categoria: orfa, nivel: 0 })
  }
  return saida
}
