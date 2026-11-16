'use client'

import { useEffect, useRef, useState, type DragEvent, type Ref } from 'react'
import {
  faFileArrowUp,
  faShieldHalved,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button } from '@piluvitu/ui/button'
import { cn } from '@piluvitu/ui/cn'
import { TEXTOS } from './textos'

function temArquivos(evento: DragEvent) {
  return Array.from(evento.dataTransfer.types).includes('Files')
}

export function AvisoDePrivacidade() {
  return (
    <div className="bg-card border-border flex gap-3 rounded-lg border p-4">
      <FontAwesomeIcon
        icon={faShieldHalved}
        className="text-primary mt-0.5 size-4 shrink-0"
        aria-hidden
      />
      <div className="space-y-1 text-sm">
        <p className="font-semibold">{TEXTOS.privacidade.titulo}</p>
        <p className="text-muted-foreground">{TEXTOS.privacidade.texto}</p>
      </div>
    </div>
  )
}

type Props = {
  aoEscolher: (arquivos: FileList) => void
  multiplos?: boolean
  desabilitada?: boolean
  botaoRef?: Ref<HTMLButtonElement>
}

export function ZonaDeArquivos({
  aoEscolher,
  multiplos = true,
  desabilitada = false,
  botaoRef,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const profundidade = useRef(0)
  const [sobre, setSobre] = useState(false)

  // Sem isto, soltar um PDF fora da zona faz o navegador abrir o arquivo e o trabalho se perde.
  useEffect(() => {
    const ignorar = (evento: globalThis.DragEvent) => {
      if (evento.dataTransfer?.types.includes('Files')) evento.preventDefault()
    }
    window.addEventListener('dragover', ignorar)
    window.addEventListener('drop', ignorar)
    return () => {
      window.removeEventListener('dragover', ignorar)
      window.removeEventListener('drop', ignorar)
    }
  }, [])

  return (
    <div
      data-testid="pdf-zona"
      data-sobre={sobre || undefined}
      onDragEnter={(evento) => {
        if (!temArquivos(evento) || desabilitada) return
        evento.preventDefault()
        profundidade.current += 1
        setSobre(true)
      }}
      onDragOver={(evento) => {
        if (!temArquivos(evento) || desabilitada) return
        evento.preventDefault()
        evento.dataTransfer.dropEffect = 'copy'
      }}
      onDragLeave={() => {
        profundidade.current = Math.max(0, profundidade.current - 1)
        if (profundidade.current === 0) setSobre(false)
      }}
      onDrop={(evento) => {
        evento.preventDefault()
        profundidade.current = 0
        setSobre(false)
        if (!desabilitada && evento.dataTransfer.files.length) {
          aoEscolher(evento.dataTransfer.files)
        }
      }}
      className={cn(
        'flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-8 text-center motion-safe:transition-colors',
        sobre ? 'border-primary bg-accent-soft border-solid' : 'border-border',
      )}
    >
      <FontAwesomeIcon
        icon={faFileArrowUp}
        className="text-primary size-6"
        aria-hidden
      />
      <p className="font-medium">
        {sobre ? TEXTOS.zona.soltar : TEXTOS.zona.titulo(multiplos)}
      </p>
      <p className="text-muted-foreground text-sm">{TEXTOS.zona.ou}</p>
      <Button
        ref={botaoRef}
        type="button"
        className="h-11 px-5"
        disabled={desabilitada}
        onClick={() => inputRef.current?.click()}
        data-testid="pdf-escolher"
      >
        {TEXTOS.zona.escolher(multiplos)}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple={multiplos}
        hidden
        tabIndex={-1}
        onChange={(evento) => {
          if (evento.target.files?.length) aoEscolher(evento.target.files)
          evento.target.value = ''
        }}
        data-testid="pdf-input"
      />
    </div>
  )
}
