import { formatBRL } from '@piluvitu/tools/money'
import { rotuloCompetencia } from './commitments'
import type { MetaView } from './metas'

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

/** Soma do que já está guardado; saldo negativo não diminui o total. */
export function guardadoEmMetas(metas: MetaView[]): number {
  return metas.reduce((soma, m) => soma + Math.max(0, m.balance_cents), 0)
}
