'use client'

import { useRef, useState, type KeyboardEvent as EventoDeTeclado } from 'react'
import {
  faArrowPointer,
  faArrowRightLong,
  faCircle,
  faDrawPolygon,
  faFont,
  faHighlighter,
  faImage,
  faMinus,
  faPenNib,
  faSquareFull,
  type IconDefinition,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { cn } from '@piluvitu/ui/cn'
import { FERRAMENTAS, type Ferramenta } from './objetos'
import { TEXTOS } from './textos'

const T = TEXTOS.editar.ferramentas

const ICONES: Record<Ferramenta, IconDefinition> = {
  selecionar: faArrowPointer,
  texto: faFont,
  imagem: faImage,
  desenho: faPenNib,
  retangulo: faDrawPolygon,
  elipse: faCircle,
  linha: faMinus,
  seta: faArrowRightLong,
  'marca-texto': faHighlighter,
  cobrir: faSquareFull,
}

type Props = {
  ativa: Ferramenta
  aoEscolher: (ferramenta: Ferramenta) => void
  desabilitada?: boolean
}

/** As ferramentas, uma ligada por vez (`aria-pressed`), com um ponto só no Tab e setas entre os botões. */
export function BarraDeFerramentas({ ativa, aoEscolher, desabilitada }: Props) {
  const botoes = useRef(new Map<Ferramenta, HTMLButtonElement>())
  const [focada, setFocada] = useState<Ferramenta | null>(null)
  const noTab = focada ?? ativa

  function aoTeclar(evento: EventoDeTeclado<HTMLDivElement>) {
    const agora = FERRAMENTAS.indexOf(noTab)
    const total = FERRAMENTAS.length
    const destinos: Record<string, number> = {
      ArrowRight: (agora + 1) % total,
      ArrowDown: (agora + 1) % total,
      ArrowLeft: (agora - 1 + total) % total,
      ArrowUp: (agora - 1 + total) % total,
      Home: 0,
      End: total - 1,
    }
    const destino = destinos[evento.key]
    if (destino === undefined) return
    evento.preventDefault()
    botoes.current.get(FERRAMENTAS[destino])?.focus()
  }

  return (
    <div
      role="toolbar"
      aria-label={T.rotulo}
      onKeyDown={aoTeclar}
      onBlur={(evento) => {
        if (!evento.currentTarget.contains(evento.relatedTarget as Node)) {
          setFocada(null)
        }
      }}
      className="flex flex-wrap gap-1.5"
      data-testid="editar-pdf-ferramentas"
    >
      {FERRAMENTAS.map((ferramenta) => {
        const ligada = ferramenta === ativa
        return (
          <button
            key={ferramenta}
            ref={(no) => {
              if (no) botoes.current.set(ferramenta, no)
              else botoes.current.delete(ferramenta)
            }}
            type="button"
            tabIndex={ferramenta === noTab ? 0 : -1}
            aria-pressed={ligada}
            disabled={desabilitada}
            onFocus={() => setFocada(ferramenta)}
            onClick={() => aoEscolher(ferramenta)}
            data-testid={`editar-pdf-ferramenta-${ferramenta}`}
            className={cn(
              'focus-visible:ring-ring focus-visible:ring-offset-background inline-flex h-11 items-center gap-2 rounded-md border px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 motion-safe:transition-colors',
              ligada
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background border-input hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <FontAwesomeIcon
              icon={ICONES[ferramenta]}
              className="size-4"
              aria-hidden
            />
            {T.nomes[ferramenta]}
          </button>
        )
      })}
    </div>
  )
}
