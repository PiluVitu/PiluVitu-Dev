/**
 * Shape de `GET /api/reports/cashflow` (Task 2, fatia ⑧) — espelha
 * `CashflowReport`/`CashflowRow` de `src/domain/cashflow.ts` (Worker). A SPA
 * não importa código do Worker (dois runtimes/bundles diferentes, mesma
 * razão de `lib/dates.ts` duplicar `todayInTeresina`), então o tipo é
 * redeclarado aqui — mesmo padrão de `lib/commitments.ts`/`lib/categories.ts`.
 *
 * Mora em `lib/`, não em `pages/fluxo.tsx`: `blocos/GraficoComprometido.tsx`
 * também precisa dele (exporta `GraficoFluxo`, que consome este tipo) — um
 * import direto Página ↔ Gráfico nos dois sentidos criaria ciclo, mesmo
 * raciocínio de `CommitmentReportView`/`ByCategoryReportView` terem saído
 * das próprias páginas pra `lib/` nas Tasks 6/8.
 */
export type CashflowRowView = {
  competence: string
  entrou_cents: number
  saiu_cents: number
  saldo_cents: number
  acumulado_cents: number
}

export type CashflowReportView = {
  meses: string[]
  linhas: CashflowRowView[]
}
