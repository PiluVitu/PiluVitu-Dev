'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { SectionHeader } from '@/components/section-header'
import { MediaGrid } from '@/components/admin/media/media-grid'
import { DeleteConfirmDialog } from '@/components/admin/content/delete-confirm-dialog'
import { useMediaList } from '@/hooks/admin/media/use-media-list'
import {
  useMediaMutations,
  fileToUpload,
} from '@/hooks/admin/media/use-media-mutations'
import type { MediaItem } from '@/lib/admin/media-io'

export default function MidiaPage() {
  const list = useMediaList()
  const { upload, remove } = useMediaMutations()
  const fileRef = useRef<HTMLInputElement>(null)
  const [deleting, setDeleting] = useState<MediaItem | null>(null)

  const onFile = async (file: File) => {
    try {
      await upload.mutateAsync(await fileToUpload(file))
      toast.success('Imagem enviada')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <SectionHeader label="Mídia" count={list.data?.length} />
        <Button
          disabled={upload.isPending}
          onClick={() => fileRef.current?.click()}
        >
          {upload.isPending ? 'Enviando…' : '+ Enviar arquivo'}
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
        <Skeleton className="h-64 w-full rounded-[var(--radius)]" />
      ) : list.isError ? (
        <p className="text-warn text-sm">{(list.error as Error).message}</p>
      ) : (
        <MediaGrid items={list.data ?? []} onDelete={(m) => setDeleting(m)} />
      )}

      <DeleteConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => {
          if (!o) setDeleting(null)
        }}
        itemLabel={`${deleting?.filename ?? ''} (pode estar em uso)`}
        pending={remove.isPending}
        onConfirm={() => {
          if (!deleting) return
          remove.mutate(deleting.filename, {
            onSuccess: () => {
              toast.success('Removida')
              setDeleting(null)
            },
            onError: (e) => toast.error((e as Error).message),
          })
        }}
      />
    </div>
  )
}
