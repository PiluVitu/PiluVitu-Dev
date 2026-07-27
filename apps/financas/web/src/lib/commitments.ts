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
export type CommitmentReportView = {
  competences: string[]
  rows: Array<{ account_id: string; account_name: string; cells: number[] }>
  totals: number[]
  fixed_net_cents: number
  pct_of_fixed_net: number[]
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
