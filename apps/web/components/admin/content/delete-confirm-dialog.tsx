'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export function DeleteConfirmDialog(props: {
  open: boolean
  onOpenChange: (o: boolean) => void
  itemLabel: string
  onConfirm: () => void
  pending?: boolean
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remover &quot;{props.itemLabel}&quot;?</DialogTitle>
          <DialogDescription>
            Isso comita a remoção na main e dispara um deploy. Não dá pra
            desfazer pelo admin.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={props.pending}
            onClick={props.onConfirm}
          >
            {props.pending ? 'Removendo…' : 'Remover'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
