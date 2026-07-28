/**
 * Fatia ⑦ (Task 3, docs/superpowers/specs/2026-07-27-financas-reserva-design.md):
 * shape de `GET /api/reserve` + os dois helpers de exibição que a tela
 * (`pages/reserva.tsx`) precisa. Mora em `lib/`, não na página, mesmo
 * raciocínio de `lib/commitments.ts`/`lib/categories.ts`: tipo/formatação
 * separados do componente, prontos pra um segundo consumidor futuro (ex.:
 * o simulador de compra do §6 do spec, ainda não construído) sem precisar
 * desembaraçar de `pages/reserva.tsx`.
 */

/**
 * Espelha `FixedCostRange` de `src/domain/reserve.ts` (Worker) — a SPA não
 * importa código do Worker (dois runtimes/bundles diferentes, mesma razão
 * de `lib/dates.ts`/`lib/commitments.ts` duplicarem os próprios tipos).
 */
export type FixedCostRangeView = { min: number; max: number }

/**
 * Shape de `GET /api/reserve` — `meses` é `{min,max} | null`, NUNCA
 * `Infinity`/`0`: ausência de custo fixo cadastrado é "não calculável",
 * não "sobrevivência zero" nem "imortal" (CLAUDE.md/apps/financas,
 * domain/reserve.ts). `goal_months` é anexado pela ROTA (não faz parte do
 * `EmergencyStatus` do domínio) — é contra ele que o alerta do piso compara.
 */
export type EmergencyStatusView = {
  saldo_cents: number
  meta_cents: FixedCostRangeView
  meses: FixedCostRangeView | null
  contas: string[]
  goal_months: number
}

function formatNumeroMeses(n: number): string {
  return n.toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
}

/**
 * "entre 2,1 e 4,8 meses" (faixa de verdade) — o exemplo LITERAL do §3 do
 * spec: "A tela diz 'entre 2,1 e 4,8 meses', não uma média." Degenerada
 * (`min === max`, ex.: nenhuma recorrente em faixa cadastrada) mostra UM
 * número: "3,0 meses", sem o "entre" (senão viraria "entre 3,0 e 3,0
 * meses" — ruído repetindo a mesma informação, mesmo princípio de
 * `formatRange`/`formatPctRange` em `lib/commitments.ts`).
 */
export function formatMeses(range: FixedCostRangeView): string {
  const min = formatNumeroMeses(range.min)
  const max = formatNumeroMeses(range.max)
  return range.min === range.max
    ? `${min} meses`
    : `entre ${min} e ${max} meses`
}

/**
 * O alerta olha o PISO (`meses.min`), NUNCA o teto — a inversão central
 * desta fatia (CLAUDE.md/apps/financas, domain/reserve.ts): no Comprometido
 * o TETO é o perigo (gasto máximo, `pct.max > LIMIAR`); aqui o PISO é o
 * perigo (sobrevivência mínima). Comparação estrita (`<`, não `<=`) — mesmo
 * "não-inclusivo no limiar" do `>` de `LIMIAR_ALERTA_PCT`
 * (`lib/commitments.ts`): bater EXATAMENTE a meta não é motivo de alerta.
 * `meses: null` nunca dispara — não há risco CONFIRMADO pra alertar sobre,
 * só ausência de dado (a tela já explica isso separadamente).
 */
export function abaixoDaMeta(
  meses: FixedCostRangeView | null,
  goalMonths: number,
): boolean {
  return meses !== null && meses.min < goalMonths
}
