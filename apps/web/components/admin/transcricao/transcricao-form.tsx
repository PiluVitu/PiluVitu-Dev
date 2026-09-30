'use client'

import { useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faArrowDown,
  faArrowUp,
  faXmark,
} from '@fortawesome/free-solid-svg-icons'
import { Button } from '@piluvitu/ui/button'
import { Input } from '@piluvitu/ui/input'
import { Label } from '@piluvitu/ui/label'
import { Textarea } from '@piluvitu/ui/textarea'
import { cn } from '@/lib/utils'
import { mover, problemaDaFila, remover } from '@/lib/admin/transcricao/fila'
import { formatBackupSize } from '@/lib/votacao/format-bytes'
import type { ModoTranscricao, Transcricao } from '@/lib/admin/atelier/types'

const MODOS: { valor: ModoTranscricao; titulo: string; detalhe: string }[] = [
  { valor: 'preciso', titulo: 'Preciso', detalhe: 'large-v3 · até ~7 min' },
  { valor: 'rapido', titulo: 'Rápido', detalhe: 'turbo · até ~20 min' },
]

export interface TranscricaoFormProps {
  pendente?: boolean
  resultado?: Transcricao | null
  audiosIniciais?: File[]
  onTranscrever: (
    audios: File[],
    opts: { termos: string; modo: ModoTranscricao },
  ) => void
  onCopiar?: (texto: string) => void
}

export function TranscricaoForm({
  pendente = false,
  resultado = null,
  audiosIniciais = [],
  onTranscrever,
  onCopiar,
}: TranscricaoFormProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [audios, setAudios] = useState<File[]>(audiosIniciais)
  const [termos, setTermos] = useState('')
  const [modo, setModo] = useState<ModoTranscricao>('preciso')

  const problema = problemaDaFila(audios)

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <p className="text-muted-foreground text-sm">
            A ordem importa: o fim de cada áudio vira contexto do seguinte.
          </p>
          <Button
            variant="outline"
            disabled={pendente}
            onClick={() => fileRef.current?.click()}
          >
            + Adicionar áudios
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            multiple
            className="hidden"
            data-testid="transcricao-input"
            onChange={(e) => {
              const novos = Array.from(e.target.files ?? [])
              setAudios((atual) => [...atual, ...novos])
              e.target.value = ''
            }}
          />
        </div>

        {audios.length > 0 ? (
          <ol className="border-border divide-border divide-y rounded-[var(--radius)] border">
            {audios.map((audio, i) => (
              <li
                key={`${audio.name}-${i}`}
                className="flex items-center gap-3 px-3 py-2 text-sm"
              >
                <span className="text-muted-foreground w-6 font-mono text-xs">
                  {i + 1}.
                </span>
                <span className="min-w-0 flex-1 truncate">{audio.name}</span>
                <span className="text-muted-foreground font-mono text-xs">
                  {formatBackupSize(audio.size)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Subir ${audio.name}`}
                  disabled={pendente || i === 0}
                  onClick={() => setAudios((l) => mover(l, i, -1))}
                >
                  <FontAwesomeIcon icon={faArrowUp} className="size-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Descer ${audio.name}`}
                  disabled={pendente || i === audios.length - 1}
                  onClick={() => setAudios((l) => mover(l, i, 1))}
                >
                  <FontAwesomeIcon icon={faArrowDown} className="size-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remover ${audio.name}`}
                  disabled={pendente}
                  onClick={() => setAudios((l) => remover(l, i))}
                >
                  <FontAwesomeIcon icon={faXmark} className="size-3" />
                </Button>
              </li>
            ))}
          </ol>
        ) : null}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="transcricao-termos">Termos que aparecem</Label>
          <Input
            id="transcricao-termos"
            placeholder="ramielle, promeia, Hono"
            value={termos}
            disabled={pendente}
            onChange={(e) => setTermos(e.target.value)}
          />
          <p className="text-muted-foreground text-xs">
            Nomes próprios e siglas, para o Whisper grafá-los certo.
          </p>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Modo</legend>
          <div className="grid grid-cols-2 gap-2">
            {MODOS.map((m) => (
              <label
                key={m.valor}
                className={cn(
                  'border-border flex cursor-pointer flex-col rounded-[var(--radius)] border px-3 py-2 text-sm transition-colors',
                  modo === m.valor
                    ? 'border-primary bg-accent-soft'
                    : 'hover:bg-muted/40',
                )}
              >
                <input
                  type="radio"
                  name="transcricao-modo"
                  value={m.valor}
                  checked={modo === m.valor}
                  disabled={pendente}
                  onChange={() => setModo(m.valor)}
                  className="sr-only"
                />
                <span className="font-medium">{m.titulo}</span>
                <span className="text-muted-foreground text-xs">
                  {m.detalhe}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <div className="flex items-center justify-end gap-4">
        {problema && audios.length > 0 ? (
          <p className="text-warn text-sm">{problema}</p>
        ) : null}
        <Button
          disabled={pendente || problema !== null}
          onClick={() => onTranscrever(audios, { termos, modo })}
        >
          {pendente ? 'Transcrevendo…' : 'Transcrever'}
        </Button>
      </div>

      {resultado ? (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground font-mono text-xs">
              {resultado.modelo}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onCopiar?.(resultado.texto)}
            >
              Copiar texto
            </Button>
          </div>
          <Textarea
            readOnly
            aria-label="Transcrição"
            value={resultado.texto}
            className="min-h-80 font-mono text-sm"
          />
        </section>
      ) : null}
    </div>
  )
}
