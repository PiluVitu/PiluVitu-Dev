/**
 * Data local de HOJE em Teresina (UTC−3 fixo, sem horário de verão desde
 * 2019). Espelho do `todayInTeresina` do Worker (`src/lib/dates.ts`) — a
 * SPA não pode importar o pacote do Worker (são dois runtimes/bundles
 * diferentes), então a mesma constante e a mesma conta vivem aqui também.
 *
 * Por que isto existe: `new Date().toISOString().slice(0, 10)` corta em
 * UTC. Às 22h de 31/07 em Teresina já é 01/08 em UTC — todo formulário que
 * usa esse atalho como default grava a data errada quando o usuário lança
 * depois das 21h local. `App.tsx#competenciaAtual` já fazia essa subtração
 * manualmente; este módulo é o lugar único de onde ela devia ter saído.
 */
const TERESINA_OFFSET_MS = 3 * 60 * 60 * 1000

export function todayInTeresina(now: Date = new Date()): string {
  return new Date(now.getTime() - TERESINA_OFFSET_MS).toISOString().slice(0, 10)
}

/**
 * Competência (`YYYY-MM`) do mês corrente em Teresina. Movida de
 * `App.tsx#competenciaAtual` (Task 6) pra cá — `BlocoComprometido` também
 * precisa dela e importar de `App.tsx` criaria ciclo (`App` → `pages/home`
 * → `blocos/BlocoComprometido` → `App`). Mesmo raciocínio de
 * `todayInTeresina`: lugar único, sem duplicar a subtração de fuso.
 */
export function competenciaAtual(now: Date = new Date()): string {
  return todayInTeresina(now).slice(0, 7)
}

/**
 * Soma (ou subtrai, com `n` negativo) meses a uma competência `YYYY-MM`.
 * Espelho do `addMonthsToCompetence` do Worker (`src/lib/dates.ts`) — mesma
 * razão de `todayInTeresina` estar duplicado aqui: dois runtimes/bundles
 * diferentes, a SPA não importa através dessa fronteira. Aritmética em
 * INTEIROS, sem `Date` — não há fuso envolvido aqui (é conta de calendário,
 * não de instante), então não há risco de UTC pra evitar; a forma pura só
 * evita reintroduzir `Date` numa conta que nunca precisou dele.
 *
 * Usado por `pages/fluxo.tsx` (Task 3, fatia ⑧) pra calcular o `from` da
 * janela por trás do seletor: "12 meses até o mês corrente" é
 * `addMonthsToCompetence(competenciaAtual(), -(months - 1))`.
 */
export function addMonthsToCompetence(competence: string, n: number): string {
  const year = Number(competence.slice(0, 4))
  const month = Number(competence.slice(5, 7))
  const total = year * 12 + (month - 1) + n

  return `${String(Math.floor(total / 12)).padStart(4, '0')}-${String((total % 12) + 1).padStart(2, '0')}`
}
