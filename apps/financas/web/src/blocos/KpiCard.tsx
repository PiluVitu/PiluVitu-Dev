import type { ReactNode } from 'react'
import { cn } from '@piluvitu/ui/cn'
import { CARTAO_KPI, GRID_KPI } from '../lib/superficie'
import { OVERLINE } from '../lib/tipografia'

export type KpiCardProps = {
  /** O que o número é. Sai em versalete mono, 10px. */
  rotulo: string
  /**
   * O número, JÁ formatado — faixa ("52% a 68%"), percentual, contagem ou
   * dinheiro. Ao contrário de `NumeroCard`, este não formata nada: metade
   * das faixas de KPI do módulo mostra intervalo, não centavos.
   */
  valor: ReactNode
  /** A régua do número: variação, meta, denominador. */
  contexto?: ReactNode
  /**
   * Cartão em alerta: borda e número em `--destructive`.
   *
   * ⚠️ Cor não é o único canal — quem passa isto também escreve o porquê em
   * `contexto`, que é o que um leitor de tela e um daltônico recebem.
   */
  alerta?: boolean
  className?: string
  'data-testid'?: string
}

/**
 * Um cartão da faixa de KPIs — a régua que abre cada tela antes do detalhe.
 *
 * ⚠️ **Não é o `NumeroCard`, e os dois continuam existindo.** `NumeroCard`
 * recebe `valorCents` e decide escala/centavos por conta própria (a regra
 * medida de quantos dígitos cabem num grid de 2 colunas); este recebe o
 * valor já pronto porque a faixa de KPI quase nunca mostra um único valor em
 * centavos — mostra faixa, percentual ou contagem.
 */
export function KpiCard({
  rotulo,
  valor,
  contexto,
  alerta = false,
  className,
  'data-testid': testId,
}: KpiCardProps) {
  return (
    <div
      data-testid={testId}
      className={cn(
        CARTAO_KPI,
        alerta && 'border-destructive/40 bg-destructive/[0.08]',
        className,
      )}
    >
      <p className={OVERLINE}>{rotulo}</p>
      <p
        data-testid={testId ? `${testId}-valor` : undefined}
        className={cn(
          'mt-1.5 text-[28px] leading-none font-bold tracking-[-0.02em] tabular-nums',
          alerta && 'text-destructive',
        )}
      >
        {valor}
      </p>
      {contexto ? (
        <p
          className={cn(
            'mt-2 text-xs leading-snug',
            alerta ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {contexto}
        </p>
      ) : null}
    </div>
  )
}

/** A faixa: 2–4 `KpiCard` que se acomodam sozinhos em 1–4 colunas. */
export function FaixaKpi({
  children,
  className,
  'data-testid': testId,
}: {
  children: ReactNode
  className?: string
  'data-testid'?: string
}) {
  return (
    <div data-testid={testId} className={cn(GRID_KPI, className)}>
      {children}
    </div>
  )
}
