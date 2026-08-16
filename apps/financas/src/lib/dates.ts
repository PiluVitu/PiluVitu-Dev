/**
 * Datas do módulo de finanças.
 *
 * Convenções do schema (§5.2 do spec):
 *  - data       : TEXT 'YYYY-MM-DD' LOCAL (ordenação lexicográfica == cronológica)
 *  - competência: TEXT 'YYYY-MM'
 *  - timestamp  : TEXT UTC 'YYYY-MM-DDTHH:MM:SSZ'
 *
 * Teresina é UTC-3 FIXO — o Piauí não adota horário de verão desde 2019. O
 * offset é constante de propósito: Intl/timeZone dentro do Worker custaria CPU
 * (teto de 10 ms por invocação) para resolver um fuso que nunca muda.
 */
const TERESINA_OFFSET_MS = 3 * 60 * 60 * 1000

function assertDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new RangeError(`data inválida (esperado YYYY-MM-DD): ${value}`)
  }
}

function assertCompetence(value: string): void {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    throw new RangeError(`competência inválida (esperado YYYY-MM): ${value}`)
  }
}

function assertDayOfMonth(value: number, campo: string): void {
  if (!Number.isInteger(value) || value < 1 || value > 31) {
    throw new RangeError(`${campo} inválido (esperado 1..31): ${value}`)
  }
}

/** month é 1-based. Date.UTC(y, m, 0) devolve o último dia do mês m. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Data que existe no CALENDÁRIO, não só no formato — `assertDate` acima
 * (regex puro) aceita '2026-02-30'. Mesma técnica de `daysInMonth`: Date.UTC
 * com y/m/d EXPLÍCITOS não tem fuso a resolver (ao contrário de parsear uma
 * string ISO completa), então o round-trip rejeita o dia inexistente.
 *
 * Mora aqui, e não em quem usa, porque já são DOIS consumidores em domínios
 * diferentes (`domain/import.ts`, onde nasceu, e `domain/transactions.ts#
 * settleTransaction`) — uma segunda cópia da regra é exatamente o que este
 * módulo evita em toda parte (a data de liquidação e a data importada têm
 * que concordar sobre o que é uma data real).
 */
export function isRealCalendarDate(value: string): boolean {
  const match = DATE_RE.exec(value)
  if (match === null) return false
  const [, y, m, d] = match
  const year = Number(y)
  const month = Number(m)
  const day = Number(d)
  if (month < 1 || month > 12 || day < 1 || day > 31) return false
  const dt = new Date(Date.UTC(year, month - 1, day))
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  )
}

export function todayInTeresina(now: Date = new Date()): string {
  return new Date(now.getTime() - TERESINA_OFFSET_MS).toISOString().slice(0, 10)
}

export function nowIsoUtc(now: Date = new Date()): string {
  return `${now.toISOString().slice(0, 19)}Z`
}

/**
 * Em qual fatura a compra cai. Competência é o mês em que a fatura FECHA:
 * compra em 28/07 num cartão que fecha dia 25 => '2026-08'. Dia de fechamento
 * maior que o tamanho do mês é aparado (cartão que fecha 31 fecha 28 em
 * fevereiro).
 */
export function billCompetence(
  purchaseDate: string,
  closingDay: number,
): string {
  assertDate(purchaseDate)
  assertDayOfMonth(closingDay, 'dia de fechamento')

  const year = Number(purchaseDate.slice(0, 4))
  const month = Number(purchaseDate.slice(5, 7))
  const day = Number(purchaseDate.slice(8, 10))
  const fechamentoEfetivo = Math.min(closingDay, daysInMonth(year, month))
  const competencia = `${year}-${pad2(month)}`

  return day <= fechamentoEfetivo
    ? competencia
    : addMonthsToCompetence(competencia, 1)
}

/** Aritmética de competência em inteiros — sem Date, sem risco de fuso. */
export function addMonthsToCompetence(competence: string, n: number): string {
  assertCompetence(competence)
  if (!Number.isInteger(n)) {
    throw new RangeError(`n inválido (esperado inteiro): ${n}`)
  }

  const year = Number(competence.slice(0, 4))
  const month = Number(competence.slice(5, 7))
  const total = year * 12 + (month - 1) + n

  return `${String(Math.floor(total / 12)).padStart(4, '0')}-${pad2((total % 12) + 1)}`
}

/** Dia de vencimento dentro da competência, aparado ao tamanho do mês. */
export function competenceDueDate(competence: string, dueDay: number): string {
  assertCompetence(competence)
  assertDayOfMonth(dueDay, 'dia de vencimento')

  const year = Number(competence.slice(0, 4))
  const month = Number(competence.slice(5, 7))

  return `${competence}-${pad2(Math.min(dueDay, daysInMonth(year, month)))}`
}
