import { faCheck, faCopy } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { cn } from '@piluvitu/ui/cn'

export function LinhaCopiavel({
  rotulo,
  valor,
  copiado,
  onCopiar,
}: {
  rotulo: string
  valor: string
  copiado: boolean
  onCopiar: () => void
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-[92px_minmax(0,1fr)_28px] items-center gap-2.5 rounded-[10px] py-[5px] pr-1 pl-2 transition-colors duration-200',
        copiado && 'bg-ok/10',
      )}
    >
      <span className="text-muted-foreground text-xs" aria-live="polite">
        {copiado ? (
          <span className="text-ok font-mono text-[11px] font-semibold">
            copiado
          </span>
        ) : (
          rotulo
        )}
      </span>
      <span className="font-mono text-[12.5px] leading-[1.4] font-medium [overflow-wrap:anywhere]">
        {valor}
      </span>
      <button
        type="button"
        aria-label={`Copiar ${rotulo}`}
        title="Copiar"
        onClick={onCopiar}
        className={cn(
          'hover:bg-accent focus-visible:ring-ring flex size-7 cursor-pointer items-center justify-center rounded-[8px] transition-colors duration-200 focus-visible:ring-1 focus-visible:outline-none',
          copiado ? 'text-ok' : 'text-muted-foreground',
        )}
      >
        <FontAwesomeIcon
          icon={copiado ? faCheck : faCopy}
          className="text-xs"
        />
      </button>
    </div>
  )
}
