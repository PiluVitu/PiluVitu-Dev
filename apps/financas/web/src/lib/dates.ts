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
