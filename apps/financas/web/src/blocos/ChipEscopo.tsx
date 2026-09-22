import { cn } from '@piluvitu/ui/cn'
import { ROTULO } from '../lib/tipografia'

export type Escopo = 'PJ' | 'PF'

/**
 * A pílula que marca PJ × PF. Um componente, não uma classe copiada: os
 * dois escopos aparecem em Saldos, Contas e Lançar, e o par de cores é
 * justamente o que não pode divergir entre telas.
 *
 * ⚠️ **`ROTULO` (12px), não os 10px que o resto das pílulas usa.** Aqui o
 * chip não acompanha um número — ele NOMEIA a pilha inteira do sub-cartão,
 * e `BlocoSaldos.test.tsx` afere esse tamanho por isso.
 */
export function ChipEscopo({
  escopo,
  className,
  'data-testid': testId,
  as: Tag = 'span',
}: {
  escopo: Escopo
  className?: string
  'data-testid'?: string
  as?: 'span' | 'h4'
}) {
  return (
    <Tag
      data-testid={testId}
      className={cn(
        ROTULO,
        'inline-flex items-center rounded-full border px-2 py-0.5 leading-none',
        escopo === 'PJ'
          ? 'border-primary/30 bg-primary/10 text-primary'
          : 'bg-secondary text-secondary-foreground border-transparent',
        className,
      )}
    >
      {escopo}
    </Tag>
  )
}
