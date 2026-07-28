'use client'

import * as PopoverPrimitive from '@radix-ui/react-popover'
import * as React from 'react'

import { cn } from './cn'

// Popover, não Tooltip: `hover` não existe em toque (Android). Um tooltip
// clássico (`@radix-ui/react-tooltip`, ou o atributo nativo `title=`) fica
// mudo pro dono, que registra despesas do celular. `Popover` abre no
// clique/tap e se comporta igual em Android e macOS. Não trocar por
// tooltip — ver packages/ui/CLAUDE.md.
export interface AjudaProps {
  /** Rótulo do campo/seção explicado — vira o aria-label do gatilho. */
  rotulo: string
  children: React.ReactNode
  className?: string
}

function Ajuda({ rotulo, children, className }: AjudaProps) {
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger
        type="button"
        aria-label={`Ajuda sobre ${rotulo}`}
        className={cn(
          'border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring inline-flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full border text-xs leading-none font-medium transition-colors focus-visible:ring-1 focus-visible:outline-hidden',
          className,
        )}
      >
        <span aria-hidden="true">?</span>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          sideOffset={4}
          className="bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 z-50 w-72 rounded-md border p-3 text-sm shadow-md outline-hidden"
        >
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

export { Ajuda }
