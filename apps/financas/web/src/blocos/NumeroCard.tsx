import type { ReactNode } from 'react'
import { Card } from '@piluvitu/ui/card'
import { cn } from '@piluvitu/ui/cn'
import { formatBRL, formatBRLSemCentavos } from '@piluvitu/tools/money'
import { NUMERO_GRID, NUMERO_HEROI, ROTULO } from '../lib/tipografia'

/**
 * Onde este card vai viver — e, junto, quantos dígitos cabem nele.
 *
 * ⚠️ **`escala` decide o tamanho da fonte E a presença dos centavos, de
 * propósito.** Se fossem dois props, existiria a combinação
 * `{escala:'grid', centavos:true}` — que é exatamente a que estoura: medido,
 * `R$ 21.122,50` a 24px pede **155,5px** e a caixa útil de uma coluna a 390px
 * é **137px** — a linha QUEBRA EM DUAS (confirmado com `Range.getClientRects()`
 * no Chrome, não estimado). Um prop só torna essa combinação inexprimível.
 */
export type EscalaNumero =
  /** Card de largura total (caixa útil MEDIDA: 324px a 390). 30px, COM centavos. */
  | 'heroi'
  /** Card num grid de 2 colunas (caixa útil MEDIDA: 137px a 390). 24px, SEM centavos. */
  | 'grid'

export type NumeroCardProps = {
  /** O que o número é. Sai em versalete mono — a assinatura do admin. */
  rotulo: string
  /** ⚠️ SEMPRE centavos inteiros. Nada de float, nada de string já formatada. */
  valorCents: number
  escala: EscalaNumero
  /**
   * Variação contra o período anterior, ou qualquer contexto que dê régua ao
   * número. Opcional — o `hint` do `StatCard` do admin.
   *
   * ⚠️ Um número absoluto sem referência não responde nada: é aqui que entra
   * "+R$ 120 a mais que julho" ou "≈ 4 meses de custo fixo".
   */
  contexto?: ReactNode
  className?: string
  'data-testid'?: string
}

/**
 * A anatomia do `StatCard` do admin (`apps/web/components/admin/stat-card.tsx`):
 * **rótulo** em versalete mono + **valor** grande + **contexto** opcional.
 *
 * Três divergências do original, cada uma medida:
 *
 * ⚠️ **1. O `text-4xl` (36px) do admin NÃO vem junto.** Lá os valores são
 * contagens (`6`, `1`, `5`); aqui é `R$ 21.122,50`, que a 36px pede **233,1px**
 * (medido). A escala daqui é 30px (herói, o valor cabe em 195,3px dos 324
 * úteis) / 24px (grid) — ver `lib/tipografia.ts`.
 *
 * ⚠️ **2. `shadow-ds` NÃO vem junto.** É `0 18px 40px rgb(0 0 0 / 0.45)`,
 * desenhada pro tema escuro do site; no claro do finanças 45% de preto a 40px
 * de blur vira borrão em volta de todo card. Fica o `shadow-sm` do `Card` do
 * design system.
 *
 * ⚠️ **3. `p-4 sm:p-6`, não `p-6`.** MEDIDO num card de largura total a 390:
 * `p-6` deixa **308px** de caixa útil, `p-4` deixa **324px** — **+16px por
 * card**, exatamente onde o número está apertado. De `sm` pra cima volta a
 * 24px, que é o respiro certo quando há espaço.
 *
 * ⚠️ **`tabular-nums` sempre** — são dezenas de ocorrências no app, é lei:
 * sem ela os dígitos têm larguras diferentes e uma coluna de valores lida de
 * cima a baixo deixa de alinhar.
 */
export function NumeroCard({
  rotulo,
  valorCents,
  escala,
  contexto,
  className,
  'data-testid': testId,
}: NumeroCardProps) {
  const valor =
    escala === 'heroi'
      ? formatBRL(valorCents)
      : formatBRLSemCentavos(valorCents)

  return (
    <Card className={cn('p-4 sm:p-6', className)} data-testid={testId}>
      <p className={ROTULO}>{rotulo}</p>
      <p
        className={cn('mt-2', escala === 'heroi' ? NUMERO_HEROI : NUMERO_GRID)}
        data-testid={testId ? `${testId}-valor` : undefined}
      >
        {valor}
      </p>
      {contexto ? (
        <p className="text-muted-foreground mt-2 text-sm">{contexto}</p>
      ) : null}
    </Card>
  )
}
