import type { ReactNode } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faLock } from '@fortawesome/free-solid-svg-icons'
import { cn } from '@piluvitu/ui/cn'
import { Marca } from './Marca'

export type StatusHost = 'ok' | 'warn' | 'lock'

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
        <div className="text-muted-foreground ml-auto flex min-w-0 items-center gap-[5px] rounded-full border px-2 py-[3px] font-mono text-[10.5px] font-medium whitespace-nowrap">
          {status === 'lock' ? (
            <FontAwesomeIcon icon={faLock} className="text-[9px]" />
          ) : (
            <span
              className={cn(
                'size-1.5 flex-none rounded-full',
                status === 'ok' ? 'bg-ok' : 'bg-warn',
              )}
            />
          )}
          <span className="truncate">{host}</span>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {children}
      </main>
      {rodape}
    </div>
  )
}

export function Rodape({
  atalho,
  texto,
  onAlterar,
}: {
  atalho: string
  texto: string
  onAlterar?: () => void
}) {
  return (
    <footer className="text-muted-foreground flex flex-none items-center gap-2 border-t px-4 py-2.5 font-mono text-[11px] leading-[normal] font-medium">
      <kbd className="text-foreground rounded-[6px] border px-1.5 py-0.5 font-mono">
        {atalho}
      </kbd>
      <span>{texto}</span>
      {onAlterar && (
        <button
          type="button"
          onClick={onAlterar}
          className="text-primary ml-auto cursor-pointer underline-offset-[3px] hover:underline"
        >
          alterar
        </button>
      )}
    </footer>
  )
}
