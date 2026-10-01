import { cn } from '@piluvitu/ui/cn'
import type { ReactNode } from 'react'

export function IconeTile({
  tom = 'neutro',
  children,
}: {
  tom?: 'neutro' | 'ok'
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'flex size-10 flex-none items-center justify-center rounded-[14px] border',
        tom === 'ok'
          ? 'border-ok/40 bg-ok/12 text-ok'
          : 'bg-card text-muted-foreground',
      )}
    >
      {children}
    </div>
  )
}
