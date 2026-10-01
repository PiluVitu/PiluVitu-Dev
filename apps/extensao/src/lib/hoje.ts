import { calcularIdade, lerDataISO } from '@piluvitu/tools/nascimento'

const DIA_EM_SAO_PAULO = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function hojeISO(agora: Date = new Date()): string {
  const partes = Object.fromEntries(
    DIA_EM_SAO_PAULO.formatToParts(agora).map((parte) => [
      parte.type,
      parte.value,
    ]),
  )
  return `${partes.year}-${partes.month}-${partes.day}`
}

export function idadeEm(nascimentoISO: string, hoje: string): number {
  return calcularIdade(lerDataISO(nascimentoISO), lerDataISO(hoje))
}
