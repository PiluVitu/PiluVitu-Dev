import type { ReactNode } from 'react'
import { Marca } from './marca'
import { PilulaHost, type StatusHost } from './pilula-host'

export function PopupShell({
  host,
  status,
  rodape,
  children,
}: {
  host: string
  status: StatusHost
  rodape?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex max-h-[600px] flex-col">
      <header className="flex flex-none items-center gap-2 border-b py-3 pr-3 pl-3.5 leading-[normal]">
        <Marca className="text-primary size-[18px] flex-none" />
        <div className="flex flex-none items-baseline gap-2 whitespace-nowrap">
          <span className="text-sm font-bold tracking-[-0.01em]">piluvitu</span>
          <span className="text-muted-foreground font-mono text-[9.5px] font-medium tracking-[0.12em] uppercase">
            dados de teste
          </span>
        </div>
        <PilulaHost host={host} status={status} />
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {children}
      </main>
      {rodape}
    </div>
  )
}
