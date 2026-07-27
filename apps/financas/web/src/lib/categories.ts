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
