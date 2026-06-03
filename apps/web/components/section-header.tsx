import { cn } from '@/lib/utils'

type SectionHeaderProps = {
  label: string
  count?: number | string
  id?: string
  className?: string
}

function padCount(count: number | string | undefined) {
  if (count === undefined) return undefined
  const n = typeof count === 'number' ? count : Number(count)
  return Number.isFinite(n) ? String(n).padStart(2, '0') : String(count)
}

export function SectionHeader({
  label,
  count,
  id,
  className,
}: SectionHeaderProps) {
  const padded = padCount(count)
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <h2
        id={id}
        className="text-muted-foreground font-mono text-xs font-semibold tracking-[0.2em] uppercase"
      >
        {label}
      </h2>
      {padded !== undefined ? (
        <span className="text-muted-foreground font-mono text-xs">
          {padded}
        </span>
      ) : null}
      <span className="bg-border h-px flex-1" aria-hidden />
    </div>
  )
}
