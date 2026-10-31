'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { SectionHeader } from '@/components/section-header'
import { TranscricaoForm } from '@/components/admin/transcricao/transcricao-form'
import { TranscricaoJob } from '@/components/admin/transcricao/transcricao-job'
import { atelierApi } from '@/lib/admin/atelier/api'
import {
  acompanharJob,
  assinarJobGuardado,
  guardarJob,
  lerJobGuardado,
  limparJob,
  respostaDoPost,
} from '@/lib/admin/transcricao/acompanhamento'
import type { JobTranscricao, ModoTranscricao } from '@/lib/admin/atelier/types'

export default function TranscricaoPage() {
  // `undefined` = ainda no servidor/hidratação, antes de ler o localStorage.
  const jobId = useSyncExternalStore<string | null | undefined>(
    assinarJobGuardado,
    () => lerJobGuardado(localStorage),
    () => undefined,
  )
  const [job, setJob] = useState<JobTranscricao | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  useEffect(() => {
    if (!jobId) return
    return acompanharJob({
      id: jobId,
      buscar: atelierApi.statusTranscricao,
      aoAtualizar: setJob,
      aoAvisar: setAviso,
      aoPerder: (perda) => {
        if (perda.code === 'job_not_found') limparJob(localStorage)
        setJob(null)
        setAviso(null)
        setErro(perda.message)
      },
    })
  }, [jobId])

  const transcrever = useMutation({
    mutationFn: (v: {
      audios: File[]
      opts: { termos: string; modo: ModoTranscricao }
    }) => atelierApi.transcrever(v.audios, v.opts),
    onSuccess: (resposta) => {
      const r = respostaDoPost(resposta)
      setAviso(null)
      if ('erro' in r) {
        setJob(null)
        setErro(r.erro)
        return
      }
      guardarJob(localStorage, r.job.id)
      setErro(null)
      setJob(r.job)
    },
    onError: (e) => toast.error((e as Error).message),
  })

  function novaTranscricao() {
    limparJob(localStorage)
    setJob(null)
    setErro(null)
    setAviso(null)
  }

  return (
    <div className="space-y-6">
      <SectionHeader label="Transcrição" />
      {jobId === undefined ? null : jobId || erro || job ? (
        <TranscricaoJob
          job={job}
          erro={erro}
          aviso={aviso}
          onNova={novaTranscricao}
          onCopiar={async (texto) => {
            try {
              await navigator.clipboard.writeText(texto)
              toast.success('Transcrição copiada')
            } catch {
              toast.error('Não consegui copiar — selecione o texto à mão.')
            }
          }}
        />
      ) : (
        <TranscricaoForm
          pendente={transcrever.isPending}
          onTranscrever={(audios, opts) => transcrever.mutate({ audios, opts })}
        />
      )}
    </div>
  )
}
