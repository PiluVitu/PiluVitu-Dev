import type { Giro, Tamanho } from '@piluvitu/tools/pdf-regras'
import { cn } from '@piluvitu/ui/cn'

export function tamanhoGirado({ largura, altura }: Tamanho, giro: Giro) {
  return giro === 90 || giro === 270
    ? { largura: altura, altura: largura }
    : { largura, altura }
}

/** A miniatura da página em branco: uma folha na proporção dela, com o giro, sem passar pelo pdf.js. */
export function FolhaEmBranco({
  tamanho,
  giro,
  className,
}: {
  /** Como a página nasceu (de pé, sem o giro). */
  tamanho: Tamanho
  giro: Giro
  className?: string
}) {
  const { largura, altura } = tamanhoGirado(tamanho, giro)
  return (
    <svg
      viewBox={`0 0 ${largura} ${altura}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
      className={cn('text-muted-foreground block overflow-visible', className)}
      data-testid="editar-pdf-folha-branca"
      data-deitada={largura > altura || undefined}
    >
      <rect
        width={largura}
        height={altura}
        fill="#ffffff"
        stroke="currentColor"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
