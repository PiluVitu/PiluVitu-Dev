import { type Rng, rngPadrao } from './aleatorio'

export interface DataCivil {
  ano: number
  mes: number
  dia: number
}

export interface Nascimento {
  iso: string
  br: string
  idade: number
}

const DIA_MS = 86_400_000

function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate()
}

export function lerDataISO(iso: string): DataCivil {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) throw new Error(`lerDataISO: esperado YYYY-MM-DD, recebido "${iso}"`)
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (mes < 1 || mes > 12 || dia < 1 || dia > diasNoMes(ano, mes)) {
    throw new Error(`lerDataISO: data inexistente "${iso}"`)
  }
  return { ano, mes, dia }
}

function paraDias({ ano, mes, dia }: DataCivil): number {
  return Date.UTC(ano, mes - 1, dia) / DIA_MS
}

function deDias(dias: number): DataCivil {
  const d = new Date(dias * DIA_MS)
  return {
    ano: d.getUTCFullYear(),
    mes: d.getUTCMonth() + 1,
    dia: d.getUTCDate(),
  }
}

function menosAnos(d: DataCivil, anos: number): DataCivil {
  const ano = d.ano - anos
  return { ano, mes: d.mes, dia: Math.min(d.dia, diasNoMes(ano, d.mes)) }
}

const p2 = (n: number) => String(n).padStart(2, '0')

export function formatarISO(d: DataCivil): string {
  return `${String(d.ano).padStart(4, '0')}-${p2(d.mes)}-${p2(d.dia)}`
}

export function formatarBR(d: DataCivil): string {
  return `${p2(d.dia)}/${p2(d.mes)}/${String(d.ano).padStart(4, '0')}`
}

export function calcularIdade(nasc: DataCivil, hoje: DataCivil): number {
  const fezAniversario =
    hoje.mes > nasc.mes || (hoje.mes === nasc.mes && hoje.dia >= nasc.dia)
  return hoje.ano - nasc.ano - (fezAniversario ? 0 : 1)
}

export function gerarNascimento(
  rng: Rng = rngPadrao,
  hojeISO: string,
  {
    idadeMin = 18,
    idadeMax = 65,
  }: { idadeMin?: number; idadeMax?: number } = {},
): Nascimento {
  if (idadeMin > idadeMax)
    throw new Error('gerarNascimento: idadeMin > idadeMax')
  const hoje = lerDataISO(hojeISO)
  const ultimo = paraDias(menosAnos(hoje, idadeMin))
  const primeiro = paraDias(menosAnos(hoje, idadeMax + 1)) + 1
  const nasc = deDias(primeiro + rng.int(ultimo - primeiro + 1))
  return {
    iso: formatarISO(nasc),
    br: formatarBR(nasc),
    idade: calcularIdade(nasc, hoje),
  }
}
