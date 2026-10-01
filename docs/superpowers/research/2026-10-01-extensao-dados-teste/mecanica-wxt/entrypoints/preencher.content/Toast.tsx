import { Button } from '@piluvitu/ui/button'

export function Toast({
  preenchidos,
  total,
  onClose,
}: {
  preenchidos: number
  total: number
  onClose: () => void
}) {
  return (
    <div
      data-testid="piluvitu-toast"
      className="border-border bg-card text-card-foreground fixed right-4 bottom-4 z-[2147483647] w-[300px] rounded-[14px] border p-3 shadow-lg"
    >
      <span className="text-[13px] font-semibold">
        {preenchidos} de {total} campos preenchidos
      </span>
      <Button variant="ghost" size="sm" onClick={onClose}>
        fechar
      </Button>
    </div>
  )
}
