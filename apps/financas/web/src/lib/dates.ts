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

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Data que existe no CALENDÁRIO, não só no formato. Espelho do
 * `isRealCalendarDate` do Worker (`src/lib/dates.ts`) — mesma razão de
 * `todayInTeresina` estar duplicado aqui: dois runtimes/bundles diferentes, a
 * SPA não importa através dessa fronteira. Mesma técnica lá e aqui: `Date.UTC`
 * com ano/mês/dia EXPLÍCITOS (não parse de string ISO, que arrastaria fuso) e
 * round-trip — é o que rejeita `2026-02-30`, que um regex de FORMATO aceita.
 *
 * ⚠️ Um `<input type="date">` não produz data inexistente sozinho — mas
 * produz string VAZIA (campo limpo, ou preenchimento parcial no Android), e
 * é isso que `pages/transferir.tsx` precisa recusar antes de gastar uma
 * requisição. A checagem de calendário vem junto por ser a mesma pergunta, e
 * porque o valor de um input é sempre texto: nada garante que ele veio do
 * seletor nativo.
 */
export function isRealCalendarDate(value: string): boolean {
  const match = DATE_RE.exec(value)
  if (match === null) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return false
  const dt = new Date(Date.UTC(year, month - 1, day))
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  )
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

/**
 * Data e hora LOCAIS (Teresina, UTC−3 fixo) formatadas em pt-BR
 * ('20/07/2026 10:15') a partir de um timestamp UTC completo
 * ('YYYY-MM-DDTHH:MM:SSZ', ex.: `generated_at` de `GET /api/insights/latest`,
 * Task 5 da fatia ⑨ — ver `lib/insight.ts`). Mesma subtração de fuso de
 * `todayInTeresina`, só sem cortar a hora — construída manualmente (sem
 * `Intl`/`toLocaleString`) pra não depender do fuso da máquina que roda o
 * teste, mesmo raciocínio que já levou `todayInTeresina`/
 * `addMonthsToCompetence` a evitar `Date` onde dá.
 */
export function formatDateTimeTeresina(iso: string): string {
  const local = new Date(new Date(iso).getTime() - TERESINA_OFFSET_MS)
  const [datePart, timePart] = local.toISOString().split('T')
  const [year, month, day] = datePart.split('-')
  return `${day}/${month}/${year} ${timePart.slice(0, 5)}`
}
