import { formatBRL } from '@piluvitu/tools/money'
import { rotuloCompetencia } from './commitments'

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

export function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`
}

/** Sem prazo não há ritmo para estar em dia: a meta só está em andamento. */
export function rotuloDoStatus(meta: MetaView): string {
  if (meta.status === 'concluida') return 'Concluída'
  if (meta.status === 'atrasada') return 'Atrasada'
  return meta.target_date === null ? 'Em andamento' : 'No ritmo'
}

export function ritmoDaMeta(meta: MetaView): string {
  if (meta.status === 'concluida') return 'concluída'
  if (meta.status === 'atrasada')
    return `prazo passou · ${formatBRL(meta.missing_cents)} em aberto`
  if (meta.monthly_needed_cents === null || meta.months_left === null)
    return 'sem prazo'
  return `${formatBRL(meta.monthly_needed_cents)} por mês · ${plural(meta.months_left, 'mês', 'meses')}`
}

/** 'AAAA-MM-DD' vira 'jun/27'. */
export function prazoCurto(date: string): string {
  return rotuloCompetencia(date.slice(0, 7))
}

/** A linha de ritmo de uma meta em aberto, curta, para o bloco do Início. */
export function notaNoInicio(meta: MetaView): string {
  if (meta.status === 'atrasada' && meta.target_date)
    return `Atrasada · prazo era ${prazoCurto(meta.target_date)}`
  if (meta.monthly_needed_cents !== null && meta.target_date)
    return `${formatBRL(meta.monthly_needed_cents)} por mês até ${prazoCurto(meta.target_date)}`
  return 'sem prazo'
}

export function faltaDaMeta(meta: MetaView): string {
  return meta.status === 'concluida'
    ? 'nada, meta batida'
    : formatBRL(meta.missing_cents)
}

export type ResumoDasMetas = {
  total: number
  concluidas: number
  abertas: number
  guardado_cents: number
  falta_cents: number
  /** Soma do que cada meta com prazo em andamento pede por mês. */
  ritmo_cents: number
  com_prazo_count: number
}

export function resumoDasMetas(metas: MetaView[]): ResumoDasMetas {
  const r: ResumoDasMetas = {
    total: metas.length,
    concluidas: 0,
    abertas: 0,
    guardado_cents: 0,
    falta_cents: 0,
    ritmo_cents: 0,
    com_prazo_count: 0,
  }
  for (const m of metas) {
    r.guardado_cents += Math.max(0, m.balance_cents)
    if (m.status === 'concluida') {
      r.concluidas += 1
      continue
    }
    r.abertas += 1
    r.falta_cents += m.missing_cents
    if (m.monthly_needed_cents !== null) {
      r.ritmo_cents += m.monthly_needed_cents
      r.com_prazo_count += 1
    }
  }
  return r
}

/**
 * A conta que a pessoa faria de cabeça, antes de salvar. Espelha o
 * `goalProgress` do Worker (mesmos meses de calendário, o atual e o do prazo
 * inclusos, teto em inteiro) para a prévia e o cartão salvo nunca divergirem.
 */
export function previaDoRitmo(input: {
  saldo_cents: number | null
  alvo_cents: number | null
  prazo: string | null
  hoje: string
}): string | null {
  const { saldo_cents, alvo_cents, prazo, hoje } = input
  if (saldo_cents === null || alvo_cents === null || alvo_cents <= 0)
    return null

  const guardado = Math.max(0, saldo_cents)
  const batida = guardado >= alvo_cents
  const pct = batida
    ? Math.round((guardado / alvo_cents) * 100)
    : Math.floor((guardado * 100) / alvo_cents)
  const tem = `Já tem ${formatBRL(guardado)} (${pct}%)`
  if (batida) return `${tem}: a meta já nasce concluída.`

  const falta = alvo_cents - guardado
  if (prazo === null || prazo === '')
    return `${tem}. Defina um prazo para ver quanto guardar por mês.`
  if (prazo < hoje)
    return `${tem}. O prazo já passou: a meta nasce atrasada, faltam ${formatBRL(falta)}.`

  const ym = (d: string) => Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7))
  const meses = ym(prazo) - ym(hoje) + 1
  return `${tem}. Para chegar em ${formatPrazo(prazo)}, guarde ${formatBRL(Math.ceil(falta / meses))} por mês durante ${plural(meses, 'mês', 'meses')}.`
}
