import { cn } from '@piluvitu/ui/cn'

const LINK =
  'text-primary cursor-pointer underline-offset-[3px] hover:underline focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-1'

export function Rodape({
  atalho,
  texto,
  comAlterar = false,
  onAlterarAtalho,
}: {
  atalho: string
  texto: string
  comAlterar?: boolean
  onAlterarAtalho: () => void
}) {
  return (
    <footer className="text-muted-foreground flex flex-none items-center gap-2 border-t px-4 py-2.5 font-mono text-[11px] leading-[normal] font-medium">
      {atalho === '' ? (
        <button type="button" onClick={onAlterarAtalho} className={LINK}>
          definir atalho
        </button>
      ) : (
        <>
          <kbd className="text-foreground rounded-[6px] border px-1.5 py-0.5 font-mono">
            {atalho}
          </kbd>
          <span>{texto}</span>
          {comAlterar && (
            <button
              type="button"
              onClick={onAlterarAtalho}
              className={cn(LINK, 'ml-auto')}
            >
              alterar
            </button>
          )}
        </>
      )}
    </footer>
  )
}
