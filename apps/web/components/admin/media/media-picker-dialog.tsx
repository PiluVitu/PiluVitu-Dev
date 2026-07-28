'use client'

import { useRef } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@piluvitu/ui/dialog'
import { Button } from '@piluvitu/ui/button'
import { Skeleton } from '@piluvitu/ui/skeleton'
import { MediaGrid } from './media-grid'
import { useMediaList } from '@/hooks/admin/media/use-media-list'
import {
  useMediaMutations,
  fileToUpload,
} from '@/hooks/admin/media/use-media-mutations'
import type { MediaItem } from '@/lib/admin/media-io'

export function MediaPickerDialog(props: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onPick: (path: string) => void
}) {
  const list = useMediaList()
  const { upload } = useMediaMutations()
  const fileRef = useRef<HTMLInputElement>(null)

  const onFile = async (file: File) => {
    try {
      const res = await upload.mutateAsync(await fileToUpload(file))
      toast.success('Imagem enviada')
      props.onPick(res.path)
      props.onOpenChange(false)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Biblioteca de mídia</DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-sm">
            Escolha uma imagem ou envie uma nova.
          </p>
          <Button
            size="sm"
            disabled={upload.isPending}
            onClick={() => fileRef.current?.click()}
          >
            {upload.isPending ? 'Enviando…' : 'Enviar arquivo'}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void onFile(f)
              e.target.value = ''
            }}
          />
        </div>
        {list.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <div className="max-h-[60vh] overflow-y-auto">
            <MediaGrid
              items={list.data ?? []}
              onSelect={(m: MediaItem) => {
                props.onPick(m.path)
                props.onOpenChange(false)
              }}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
