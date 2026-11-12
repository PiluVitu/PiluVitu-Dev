import { addMonthsToCompetence } from './dates'

export type Frequencia = 'weekly' | 'biweekly' | 'monthly' | 'annual'

export const FREQUENCIAS: ReadonlyArray<{ valor: Frequencia; rotulo: string }> =
  [
    { valor: 'monthly', rotulo: 'Mensal' },
    { valor: 'weekly', rotulo: 'Semanal' },
    { valor: 'biweekly', rotulo: 'Quinzenal — a cada 14 dias' },
    { valor: 'annual', rotulo: 'Anual' },
  ]

export function ehPorDiaDaSemana(f: Frequencia): boolean {
  return f === 'weekly' || f === 'biweekly'
}

export type RecorrenciaDatas = {
  frequency: Frequencia
  day_of_month: number
  starts_on: string
  ends_on: string | null
  amount_min_cents: number
  amount_max_cents: number
}

const DIA_MS = 86_400_000

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]

const DIAS_DA_SEMANA = [
  { curto: 'dom', plural: 'aos domingos' },
  { curto: 'seg', plural: 'às segundas' },
  { curto: 'ter', plural: 'às terças' },
  { curto: 'qua', plural: 'às quartas' },
  { curto: 'qui', plural: 'às quintas' },
  { curto: 'sex', plural: 'às sextas' },
  { curto: 'sáb', plural: 'aos sábados' },
]

export function nomeDoMes(competencia: string): string {
  return MESES[Number(competencia.slice(5, 7)) - 1]
}

function dd(n: number): string {
  return String(n).padStart(2, '0')
}

function diaAbsoluto(iso: string): number {
  return (
    Date.UTC(
      Number(iso.slice(0, 4)),
      Number(iso.slice(5, 7)) - 1,
      Number(iso.slice(8, 10)),
    ) / DIA_MS
  )
}

function isoDoDia(dia: number): string {
  return new Date(dia * DIA_MS).toISOString().slice(0, 10)
}

function diasNoMes(competencia: string): number {
  return new Date(
    Date.UTC(
      Number(competencia.slice(0, 4)),
      Number(competencia.slice(5, 7)),
      0,
    ),
  ).getUTCDate()
}

function dentroDaVigencia(data: string, r: RecorrenciaDatas): boolean {
  return data >= r.starts_on && (r.ends_on === null || data <= r.ends_on)
}

export function ocorrenciasNoMes(
  r: RecorrenciaDatas,
  competencia: string,
): string[] {
  if (ehPorDiaDaSemana(r.frequency)) {
    const passo = r.frequency === 'weekly' ? 7 : 14
    const inicio = diaAbsoluto(r.starts_on)
    const primeiro = diaAbsoluto(`${competencia}-01`)
    const ultimo = primeiro + diasNoMes(competencia) - 1
    const saltos = Math.max(0, Math.ceil((primeiro - inicio) / passo))
    const datas: string[] = []
    for (let dia = inicio + saltos * passo; dia <= ultimo; dia += passo) {
      const data = isoDoDia(dia)
      if (!dentroDaVigencia(data, r)) break
      datas.push(data)
    }
    return datas
  }

  if (
    r.frequency === 'annual' &&
    competencia.slice(5, 7) !== r.starts_on.slice(5, 7)
  ) {
    return []
  }
  const data = `${competencia}-${dd(Math.min(r.day_of_month, diasNoMes(competencia)))}`
  return dentroDaVigencia(data, r) ? [data] : []
}

export function custoDoMes(
  rs: RecorrenciaDatas[],
  competencia: string,
): { min: number; max: number } {
  return rs.reduce(
    (soma, r) => {
      const n = ocorrenciasNoMes(r, competencia).length
      return {
        min: soma.min + n * r.amount_min_cents,
        max: soma.max + n * r.amount_max_cents,
      }
    },
    { min: 0, max: 0 },
  )
}

const MESES_A_FRENTE = 12

function proximaData(r: RecorrenciaDatas, hoje: string): string | null {
  for (let i = 0; i <= MESES_A_FRENTE; i++) {
    const data = ocorrenciasNoMes(
      r,
      addMonthsToCompetence(hoje.slice(0, 7), i),
    ).find((d) => d >= hoje)
    if (data !== undefined) return data
  }
  return null
}

export function proximoVencimento<
  T extends RecorrenciaDatas & { description: string },
>(rs: T[], hoje: string): { data: string; descricoes: string[] } | null {
  let melhor: { data: string; descricoes: string[] } | null = null
  for (const r of rs) {
    const data = proximaData(r, hoje)
    if (data === null) continue
    if (melhor === null || data < melhor.data) {
      melhor = { data, descricoes: [r.description] }
    } else if (data === melhor.data) {
      melhor.descricoes.push(r.description)
    }
  }
  return melhor
}

export function diaDaSemanaCurto(iso: string): string {
  return DIAS_DA_SEMANA[new Date(diaAbsoluto(iso) * DIA_MS).getUTCDay()].curto
}

function diaDaSemanaPlural(iso: string): string {
  return DIAS_DA_SEMANA[new Date(diaAbsoluto(iso) * DIA_MS).getUTCDay()].plural
}

function diaNoAno(r: RecorrenciaDatas): string {
  const mes = r.starts_on.slice(5, 7)
  const nome = MESES[Number(mes) - 1]
  const menorMes = diasNoMes(`2025-${mes}`)
  return r.day_of_month > menorMes
    ? `último dia de ${nome}`
    : `${r.day_of_month} de ${nome}`
}

export function quandoVence(r: RecorrenciaDatas): string {
  switch (r.frequency) {
    case 'weekly':
      return `semanal, ${diaDaSemanaPlural(r.starts_on)}`
    case 'biweekly':
      return `quinzenal, a cada 14 dias, ${diaDaSemanaPlural(r.starts_on)}`
    case 'annual':
      return `anual, ${diaNoAno(r)}`
    case 'monthly':
      return `mensal, dia ${dd(r.day_of_month)}`
  }
}
