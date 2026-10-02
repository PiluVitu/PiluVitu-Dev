import type { Fase } from '@piluvitu/tools/pilulabs'
import { cn } from '@/lib/utils'

const ROTULO: Record<Fase, string> = {
  'em-breve': 'Em breve',
  disponivel: 'Disponível',
}

export function StatusProduto({ fase }: { fase: Fase }) {
  const disponivel = fase === 'disponivel'
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-sm',
        disponivel
          ? 'bg-primary text-primary-foreground font-medium'
          : 'border-border text-muted-foreground border',
      )}
    >
      <span
        className={cn(
          'size-1.5 rounded-full',
          disponivel ? 'bg-primary-foreground' : 'bg-warn',
        )}
        aria-hidden
      />
      {ROTULO[fase]}
    </span>
  )
}
