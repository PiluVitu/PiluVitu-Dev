export type StatusDaMeta = 'concluida' | 'em_andamento' | 'atrasada'

/** Espelha uma linha de `GET /api/goals` (`domain/goals.ts`, Worker). */
export type MetaView = {
  id: string
  name: string
  target_cents: number
  target_date: string | null
  account_id: string
  account_name: string
  balance_cents: number
  pct: number
  status: StatusDaMeta
  missing_cents: number
  months_left: number | null
  monthly_needed_cents: number | null
  editable: boolean
  reserve_overlap: boolean
}

export function larguraDaBarra(pct: number): number {
  return Math.min(100, Math.max(0, pct))
}

/** 'AAAA-MM-DD' vira 'DD/MM/AAAA'. */
export function formatPrazo(date: string): string {
  const [ano, mes, dia] = date.split('-')
  return `${dia}/${mes}/${ano}`
}

export function rotuloDoStatus(status: StatusDaMeta): string | null {
  if (status === 'concluida') return 'Concluída'
  if (status === 'atrasada') return 'Atrasada'
  return null
}

export function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`
}
