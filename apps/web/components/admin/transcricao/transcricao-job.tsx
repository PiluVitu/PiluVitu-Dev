'use client'

import { Button } from '@piluvitu/ui/button'
import { Textarea } from '@piluvitu/ui/textarea'
import { progressoDoJob } from '@/lib/admin/transcricao/acompanhamento'
import type { JobTranscricao } from '@/lib/admin/atelier/types'

export interface TranscricaoJobProps {
  job: JobTranscricao | null
  /** Job perdido sem estado para mostrar (ex.: 404 job_not_found). */
  erro?: string | null
  aviso?: string | null
  onCopiar?: (texto: string) => void
  onNova: () => void
}

export function TranscricaoJob({
  job,
  erro = null,
  aviso = null,
  onCopiar,
  onNova,
}: TranscricaoJobProps) {
  const mensagemDeErro =
    job?.status === 'falhou'
      ? (job.erro?.message ?? 'A transcrição falhou.')
      : erro

  return (
    <section className="space-y-4" aria-live="polite">
      {job && (job.status === 'na_fila' || job.status === 'transcrevendo') ? (
        <Andamento job={job} />
      ) : null}

      {!job && !erro ? (
        <p className="text-muted-foreground text-sm">
          Consultando a transcrição…
        </p>
      ) : null}

      {mensagemDeErro ? (
        <div
          role="alert"
          className="border-destructive/40 text-destructive rounded-[var(--radius)] border px-4 py-3 text-sm"
        >
          {mensagemDeErro}
        </div>
      ) : null}

      {aviso ? <p className="text-warn text-xs">{aviso}</p> : null}

      {job?.status === 'pronto' && job.resultado ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground font-mono text-xs">
              {job.resultado.modelo}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onCopiar?.(job.resultado!.texto)}
            >
              Copiar texto
            </Button>
          </div>
          <Textarea
            readOnly
            aria-label="Transcrição"
            value={job.resultado.texto}
            className="min-h-80 font-mono text-sm"
          />
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button variant="outline" onClick={onNova}>
          Nova transcrição
        </Button>
      </div>
    </section>
  )
}

function Andamento({ job }: { job: JobTranscricao }) {
  const { percentual, rotulo } = progressoDoJob(job)
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4 text-sm">
        <span className="min-w-0 truncate">{rotulo}</span>
        <span className="text-muted-foreground font-mono text-xs">
          {job.parte_atual}/{job.total_partes}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="Progresso da transcrição"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percentual}
        className="bg-muted h-2 overflow-hidden rounded-full"
      >
        <div
          className="bg-primary h-full transition-[width] duration-500"
          style={{ width: `${percentual}%` }}
        />
      </div>
      <p className="text-muted-foreground text-xs">
        Pode sair desta tela: a transcrição continua no Mac e volta a aparecer
        aqui.
      </p>
    </div>
  )
}
