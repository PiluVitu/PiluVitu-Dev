// Tipos compartilhados dos parsers de import (fatia ②, docs/superpowers/specs/
// 2026-07-27-financas-import-design.md §4). `ofx.ts` produz `LinhaImportada`;
// `csv.ts`/`id.ts` (tasks seguintes) reusam o mesmo tipo.

export type LinhaImportada = {
  // FITID (OFX) ou hash estável da linha (CSV, task futura) — é o que o
  // índice único `uq_tx_imported ON transactions(account_id, imported_id)`
  // usa pra dedupe. Único POR CONTA, não globalmente.
  imported_id: string
  // 'YYYY-MM-DD', a data local como veio da fonte — nunca convertida por
  // fuso horário.
  purchase_date: string
  // Centavos, INTEGER. Negativo = despesa, positivo = crédito/estorno.
  amount_cents: number
  description: string
}
