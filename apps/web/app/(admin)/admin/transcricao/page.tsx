'use client'

import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { SectionHeader } from '@/components/section-header'
import { TranscricaoForm } from '@/components/admin/transcricao/transcricao-form'
import { atelierApi } from '@/lib/admin/atelier/api'
import type { ModoTranscricao } from '@/lib/admin/atelier/types'

export default function TranscricaoPage() {
  const transcrever = useMutation({
    mutationFn: (v: {
      audios: File[]
      opts: { termos: string; modo: ModoTranscricao }
    }) => atelierApi.transcrever(v.audios, v.opts),
    onError: (e) => toast.error((e as Error).message),
  })

  return (
    <div className="space-y-6">
      <SectionHeader label="Transcrição" />
      <TranscricaoForm
        pendente={transcrever.isPending}
        resultado={transcrever.data}
        onTranscrever={(audios, opts) => transcrever.mutate({ audios, opts })}
        onCopiar={async (texto) => {
          try {
            await navigator.clipboard.writeText(texto)
            toast.success('Transcrição copiada')
          } catch {
            toast.error('Não consegui copiar — selecione o texto à mão.')
          }
        }}
      />
    </div>
  )
}
