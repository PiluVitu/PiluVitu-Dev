'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { mediaRawUrl } from '@/lib/admin/media-url'
import {
  useMediaMutations,
  fileToUpload,
} from '@/hooks/admin/media/use-media-mutations'
import { MediaPickerDialog } from '@/components/admin/media/media-picker-dialog'
import { SidebarCard } from './sidebar-card'

export function CoverImageCard(props: {
  value: string
  onChange: (v: string) => void
}) {
  const { upload } = useMediaMutations()
  const fileRef = useRef<HTMLInputElement>(null)
  const [picker, setPicker] = useState(false)

  const onFile = async (file: File) => {
    try {
      const res = await upload.mutateAsync(await fileToUpload(file))
      props.onChange(res.path)
      toast.success('Capa enviada')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <SidebarCard title="Imagem de capa">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const f = e.dataTransfer.files?.[0]
          if (f) void onFile(f)
        }}
        onClick={() => fileRef.current?.click()}
        className="border-border bg-muted/20 grid min-h-28 cursor-pointer place-items-center overflow-hidden rounded-lg border border-dashed p-3 text-center"
      >
        {props.value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mediaRawUrl(props.value)}
            alt=""
            className="max-h-32 max-w-full object-contain"
          />
        ) : (
          <p className="text-muted-foreground text-xs">
            {upload.isPending
              ? 'Enviando…'
              : 'Arraste a capa ou clique para enviar'}
          </p>
        )}
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
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setPicker(true)}
        >
          Biblioteca
        </Button>
        {props.value ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => props.onChange('')}
          >
            Remover
          </Button>
        ) : null}
      </div>
      <input
        className="border-border bg-muted/40 text-foreground placeholder:text-muted-foreground focus:border-primary w-full rounded-lg border px-3 py-2 text-xs outline-none"
        value={props.value}
        placeholder="/media/… ou URL"
        onChange={(e) => props.onChange(e.target.value)}
      />
      <MediaPickerDialog
        open={picker}
        onOpenChange={setPicker}
        onPick={(path) => props.onChange(path)}
      />
    </SidebarCard>
  )
}
