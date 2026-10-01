import { faLock } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { cn } from '@piluvitu/ui/cn'

export type StatusHost = 'ok' | 'warn' | 'lock'

export function PilulaHost({
  host,
  status,
}: {
  host: string
  status: StatusHost
}) {
  return (
    <div
      title={host}
      className="text-muted-foreground ml-auto flex min-w-0 items-center gap-[5px] rounded-full border px-2 py-[3px] font-mono text-[10.5px] font-medium whitespace-nowrap"
    >
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
  )
}
