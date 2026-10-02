import { cn } from '@piluvitu/ui/cn'
import type { ReactNode } from 'react'

type CabecalhoSecaoProps = {
  id: string
  rotulo: string
  contagem: number
  titulo: string
  tom?: 'padrao' | 'petroleo'
  children?: ReactNode
}

export function CabecalhoSecao({
  id,
  rotulo,
  contagem,
  titulo,
  tom = 'padrao',
  children,
}: CabecalhoSecaoProps) {
  const petroleo = tom === 'petroleo'
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3.5">
        <p
          className={cn(
            'font-mono text-[13px] font-semibold tracking-[0.2em] uppercase',
            petroleo ? 'text-primary-foreground' : 'text-primary',
          )}
        >
          {rotulo}
        </p>
        <span
          aria-hidden
          className={cn(
            'font-mono text-[13px]',
            petroleo ? 'text-primary-foreground' : 'text-muted-foreground',
          )}
        >
          {String(contagem).padStart(2, '0')}
        </span>
        <span
          aria-hidden
          className={cn(
            'h-px flex-1',
            petroleo ? 'bg-petroleo-linha' : 'bg-border',
          )}
        />
      </div>
      <h2
        id={id}
        className="max-w-[760px] text-[clamp(30px,3.6vw,44px)] leading-[1.1] font-extrabold tracking-[-0.03em] text-balance wrap-break-word"
      >
        {titulo}
      </h2>
      {children}
    </div>
  )
}
