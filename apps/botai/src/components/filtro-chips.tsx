import { cn } from '@piluvitu/ui/cn'

export function FiltroChips<T extends string>({
  opcoes,
  ativo,
  onChange,
}: {
  opcoes: readonly { id: T; rotulo: string }[]
  ativo: T
  onChange: (id: T) => void
}) {
  return (
    <div className="bg-background sticky top-0 z-10 flex flex-wrap gap-1.5 border-t px-4 pt-3 pb-2.5">
      {opcoes.map(({ id, rotulo }) => (
        <button
          key={id}
          type="button"
          aria-pressed={ativo === id}
          onClick={() => onChange(id)}
          className={cn(
            'focus-visible:ring-ring cursor-pointer rounded-full border px-2.5 py-1.5 font-mono text-[11px] leading-none font-medium transition-colors duration-200 focus-visible:ring-1 focus-visible:outline-none',
            ativo === id
              ? 'bg-accent-soft text-primary border-accent-line'
              : 'text-muted-foreground border-border bg-transparent',
          )}
        >
          {rotulo}
        </button>
      ))}
    </div>
  )
}
