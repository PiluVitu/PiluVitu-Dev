import { Button } from '@piluvitu/ui/button'

export function LinhaCopiavel({
  rotulo,
  valor,
  copiado,
}: {
  rotulo: string
  valor: string
  copiado: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
      <span className="text-muted-foreground font-mono text-xs uppercase">
        {rotulo}
      </span>
      <span className="font-mono">{valor}</span>
      <Button size="sm" variant="ghost">
        {copiado ? 'copiado' : 'copiar'}
      </Button>
    </div>
  )
}
