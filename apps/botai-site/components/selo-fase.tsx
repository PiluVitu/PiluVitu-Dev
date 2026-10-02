import type { Fase } from '@piluvitu/tools/pilulabs'
import { cn } from '@piluvitu/ui/cn'

const ROTULO: Record<Fase, string> = {
  'em-breve': 'Em breve',
  disponivel: 'Disponível',
}

export function SeloFase({ fase }: { fase: Fase }) {
  const disponivel = fase === 'disponivel'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm',
        disponivel
          ? 'bg-primary text-primary-foreground border-transparent font-medium'
          : 'border-border text-muted-foreground',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'size-1.5 rounded-full',
          disponivel ? 'bg-primary-foreground' : 'bg-warn',
        )}
      />
      {ROTULO[fase]}
    </span>
  )
}
