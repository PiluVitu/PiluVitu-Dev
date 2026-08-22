import { formatBRL, formatBRLSemCentavos } from '@piluvitu/tools/money'

/**
 * Shape de `GET /api/reports/commitments` + o rótulo de competência
 * ('2026-08' -> 'ago/26') que tanto a tela antiga (`pages/commitments.tsx`,
 * `#/comprometido`) quanto o bloco novo da home (`blocos/BlocoComprometido.tsx`
 * + `blocos/GraficoComprometido.tsx`, `#/`, Task 6) precisam.
 *
 * Mora em `lib/`, não em `pages/commitments.tsx`, de propósito (achado da
 * revisão da Task 6, fix round 1): `pages/commitments.tsx` é a tela que a
 * Task 9 apaga na migração das 5 telas antigas pros componentes de
 * `@piluvitu/ui` — se `blocos/` importasse o tipo/helper de lá, a Task 9
 * teria que descobrir e desembaraçar esse acoplamento no meio de outra
 * mudança. Mesmo raciocínio de `competenciaAtual` ter saído de `App.tsx`
 * pra `lib/dates.ts` nesta mesma task: lugar único, sem depender de um
 * arquivo que tem prazo de validade.
 */

/**
 * Faixa mínimo/máximo (Task 6, fatia ⑥ — §2/§5 do spec de recorrentes).
 * Espelha `CommitmentRange` de `src/domain/reports.ts` (Worker) — a SPA não
 * importa código do Worker (dois runtimes/bundles diferentes, mesma razão
 * de `lib/dates.ts` duplicar `todayInTeresina`), então o tipo é redeclarado
 * aqui. `totals`/`pct_of_fixed_net` deixaram de ser número por competência
 * (Task 3, commit 9b3d9a5): o Simples varia de R$ 12 a R$ 600 conforme o
 * faturamento, e uma média (R$ 306) seria o número que NUNCA acontece.
 */
export type CommitmentRange = { min: number; max: number }

export type CommitmentReportView = {
  competences: string[]
  rows: Array<{ account_id: string; account_name: string; cells: number[] }>
  totals: CommitmentRange[]
  fixed_net_cents: number
  pct_of_fixed_net: CommitmentRange[]
}

/**
 * Acima disso, metade da renda fixa já está comprometida antes de qualquer
 * compra nova — limiar do aviso `.alerta` (`pages/commitments.tsx`) E da cor
 * vermelha das barras (`blocos/GraficoComprometido.tsx`).
 *
 * ⚠️ Fix round 1 (Task 9): morava DUPLICADO, um `const` local em cada
 * arquivo, mesmo valor (50) nos dois. Um `const` só — os dois consumidores
 * importam daqui — é o que impede alguém de ajustar um sem o outro e fazer
 * a mesma célula virar barra azul + porcentagem vermelha no mesmo card,
 * contradizendo o sinal de risco mais consequente do app.
 */
export const LIMIAR_ALERTA_PCT = 50

const MESES = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
]

/** '2026-08' -> 'ago/26' */
export function rotuloCompetencia(competence: string): string {
  const [ano, mes] = competence.split('-')
  return `${MESES[Number(mes) - 1]}/${ano.slice(2)}`
}

/**
 * '2026-08' -> 'ago' — o MESMO nome de mês de `rotuloCompetencia`, sem o
 * ano. Existe por causa do eixo X de `blocos/GraficoComprometido.tsx`:
 * MEDIDO (390px E 1280px) que o recharts rotulava só 3 das 6 competências
 * — e o mês CORRENTE, o que a tela existe pra responder, era um dos
 * omitidos. Com `interval={0}` (rotula todas) `ago/26` × 6 não cabe nos
 * ~190px de área de plotagem do card; `ago` × 6 cabe.
 *
 * ⚠️ Seguro contra ambiguidade porque a janela do Comprometido é de 6
 * meses: num intervalo menor que 12 meses nenhum nome de mês se repete,
 * então 'ago…jan' identifica cada barra sem o ano. O ano NÃO some da tela
 * — o tooltip continua usando `rotuloCompetencia` ('ago/26'), que é onde a
 * virada de ano fica disponível sob demanda. NÃO reusar isto num gráfico
 * de janela ≥ 12 meses (ex.: `GraficoFluxo`, que vai até 24 meses): lá o
 * nome do mês repete e a abreviação passa a mentir.
 */
export function rotuloMesCurto(competence: string): string {
  const mes = competence.split('-')[1]
  return MESES[Number(mes) - 1]
}

/**
 * Formata uma faixa em reais. Degenerada (`min === max` — ex.: Starlink
 * fixo, ou qualquer competência sem recorrente em faixa cadastrada) mostra
 * UM número só ("R$ 189,00"); faixa de verdade (ex.: DAS R$ 12–600) mostra
 * "R$ 12,00 a R$ 600,00". Sem esta distinção, todo total viraria
 * "R$ 189,00 a R$ 189,00" — a mesma informação repetida, ruído visual puro
 * pro caso mais comum (a maioria das competências não tem nenhuma
 * recorrente em faixa, então `min === max` é a regra, não a exceção).
 */
export function formatRange(range: CommitmentRange): string {
  return range.min === range.max
    ? formatBRL(range.min)
    : `${formatBRL(range.min)} a ${formatBRL(range.max)}`
}

/**
 * Mesma regra de `formatRange`, SEM centavos — pra manchete em grid de 2
 * colunas.
 *
 * ⚠️ Existe porque a regra "sem centavos em 2 colunas" foi violada
 * exatamente no único lugar onde ela importava. MEDIDO em Chrome real com o
 * dado REAL do dono (DAS em faixa de R$ 12 a R$ 600, que empurra o
 * comprometido pra uma faixa): `R$ 21.122,50 a R$ 21.722,50` a 24px mede
 * **209,6 px**, e a caixa do valor no grid de 2 é 324 px a 390 mas **174 px
 * a 768** — quebra em duas linhas nas duas pontas.
 *
 * Sem centavos a mesma faixa cabe: os centavos custam ~4 caracteres × 2
 * (são dois números na faixa), e é a faixa que estoura, não o número
 * sozinho.
 *
 * ⚠️ A precisão NÃO se perde: o valor exato continua em `#/comprometido`,
 * que é a tela dedicada e tem uma coluna inteira por competência. A
 * manchete responde "quanto, mais ou menos"; a tabela responde "quanto".
 */
export function formatRangeSemCentavos(range: CommitmentRange): string {
  return range.min === range.max
    ? formatBRLSemCentavos(range.min)
    : `${formatBRLSemCentavos(range.min)} a ${formatBRLSemCentavos(range.max)}`
}

/** Mesma regra de `formatRange`, pra porcentagem: "60%" ou "36% a 44%". */
export function formatPctRange(range: CommitmentRange): string {
  return range.min === range.max
    ? `${range.min}%`
    : `${range.min}% a ${range.max}%`
}
