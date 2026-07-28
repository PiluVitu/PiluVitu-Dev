/**
 * Fatia ⑨, Task 5 (`.superpowers/sdd/2026-07-28-financas-ui-insights/task-5-brief.md`):
 * shape de `GET /api/insights/numbers` + `GET /api/insights/latest`
 * (`src/domain/insights.ts`, Worker), mais os helpers de "frescor" que a
 * tela (`pages/insight.tsx`) usa pra decidir se um insight antigo precisa
 * LER como antigo, não só ser mostrado com uma data ao lado que ninguém
 * repara. Mora em `lib/`, não na página — mesmo raciocínio de
 * `lib/reserve.ts`/`lib/commitments.ts`: tipo/formatação fora do
 * componente.
 */

import type { CategoryRowView } from './categories'

/**
 * Espelha `InsightNumbers` de `src/domain/insights.ts` (Worker) — a SPA
 * não importa código do Worker (dois runtimes/bundles diferentes, mesma
 * razão de `lib/dates.ts` duplicar `todayInTeresina`).
 *
 * ⚠️ Isto é o que a tela SEMPRE consegue mostrar, mesmo que o comando do
 * Mac nunca tenha rodado — nasce de uma consulta exata contra o
 * livro-caixa (`byCategory`, chamada duas vezes), nunca da tabela
 * `insights`. Nenhum campo aqui tem origem em texto de modelo.
 */
export type InsightNumbersView = {
  competence: string
  previous_competence: string
  /** Os `TOP_CATEGORIES_LIMIT` (5) primeiros de `byCategory`, sem reordenar. */
  top_categories: CategoryRowView[]
  total_cents: number
  previous_total_cents: number
  /** |atual| - |anterior|. Positivo = gastou mais que no período anterior. */
  variation_cents: number
  /** `null` quando o período anterior não teve gasto nenhum (divisão por zero evitada). */
  variation_pct: number | null
  biggest_increase: {
    category_id: string | null
    category_name: string
    category_slug: string | null
    current_cents: number
    previous_cents: number
    delta_cents: number
  } | null
}

/**
 * Espelha `Insight` de `src/domain/insights.ts` (Worker) — a ÚNICA coisa
 * gerada pelo modelo que esta tela mostra. `generated_at` é sempre o
 * relógio do SERVIDOR (nunca aceito do corpo do POST que o Mac manda) —
 * é o que torna o cálculo de idade abaixo confiável.
 */
export type InsightView = {
  id: string
  texto: string
  modelo: string
  periodo: string
  generated_at: string
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Dias INTEIROS desde `generatedAt` até `now`. `now` é injetado, nunca
 * `Date.now()` direto dentro da função — mesmo padrão de
 * `todayInTeresina(now?)`/`nowIsoUtc(now?)` do Worker: os testes passam o
 * instante; mock de `Date` global é frágil e vaza entre testes do mesmo
 * arquivo.
 */
export function insightAgeDays(
  generatedAt: string,
  now: Date = new Date(),
): number {
  const diffMs = now.getTime() - new Date(generatedAt).getTime()
  return Math.max(0, Math.floor(diffMs / MS_PER_DAY))
}

/**
 * "hoje" / "há 1 dia" / "há N dias" / "há N semanas" / "há N meses" — texto
 * curto de idade, sempre ao lado da data completa (`formatDateTimeTeresina`)
 * quando um insight é mostrado. Existe pra que "frescor" seja lido de
 * relance, sem fazer conta de cabeça a partir de uma data absoluta.
 */
export function formatInsightAge(days: number): string {
  if (days <= 0) return 'hoje'
  if (days === 1) return 'há 1 dia'
  if (days < 7) return `há ${days} dias`
  if (days < 30) {
    const semanas = Math.floor(days / 7)
    return semanas === 1 ? 'há 1 semana' : `há ${semanas} semanas`
  }
  const meses = Math.floor(days / 30)
  return meses === 1 ? 'há 1 mês' : `há ${meses} meses`
}

/**
 * Acima de uma semana, o texto passa a ler como DESATUALIZADO — limiar
 * deliberadamente mais apertado que os "três semanas" citados como
 * exemplo de leitura ruim no spec (§3: "insight de três semanas atrás
 * apresentado como se fosse de hoje é pior que insight nenhum — o dono
 * tomaria decisão sobre um retrato velho sem saber que era velho"). Ficar
 * bem antes desse exemplo, não em cima dele, é o objetivo: o dono nunca
 * deveria chegar perto de três semanas sem já ter visto o aviso pelo
 * menos duas semanas antes.
 */
export const STALE_THRESHOLD_DAYS = 7

export function isStaleInsight(
  generatedAt: string,
  now: Date = new Date(),
): boolean {
  return insightAgeDays(generatedAt, now) > STALE_THRESHOLD_DAYS
}
