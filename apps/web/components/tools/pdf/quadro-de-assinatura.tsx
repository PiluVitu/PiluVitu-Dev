'use client'

import { useRef, useState, type PointerEvent as EventoDePonteiro } from 'react'
import type { Cor, PontoDoTraco } from '@piluvitu/tools/pdf-regras'
import {
  caminhoSvgDoContorno,
  contornoDoTraco,
} from '@piluvitu/tools/pdf-traco'
import { pontoDoEvento } from './objetos'
import { TEXTOS } from './textos'

const T = TEXTOS.assinatura.quadro

/** Em unidades do quadro: o traço não depende da largura em que ele aparece na tela. */
export const TAMANHO_DO_QUADRO = { largura: 600, altura: 200 } as const

type Props = {
  tracos: readonly (readonly PontoDoTraco[])[]
  aoTracar: (traco: PontoDoTraco[]) => void
  cor: Cor
  espessura: number
  idDaDica: string
}

/**
 * O quadro em que se desenha a assinatura. Fica fora do Tab: desenhar é um gesto de caminho, que o WCAG
 * 2.5.1 isenta, e "Digitar o nome" é a alternativa de quem não usa ponteiro.
 */
export function QuadroDeAssinatura({
  tracos,
  aoTracar,
  cor,
  espessura,
  idDaDica,
}: Props) {
  const quadroRef = useRef<HTMLDivElement>(null)
  const emCursoRef = useRef<{
    ponteiro: number
    pontos: PontoDoTraco[]
  } | null>(null)
  const [emCurso, setEmCurso] = useState<PontoDoTraco[] | null>(null)

  function definir(novo: typeof emCursoRef.current) {
    emCursoRef.current = novo
    setEmCurso(novo?.pontos ?? null)
  }

  const pontoDo = (evento: {
    clientX: number
    clientY: number
    pressure?: number
    pointerType?: string
  }) =>
    pontoDoEvento(
      evento,
      quadroRef.current?.getBoundingClientRect() ?? null,
      TAMANHO_DO_QUADRO,
    )

  function aoApertar(evento: EventoDePonteiro<HTMLDivElement>) {
    if (evento.pointerType === 'mouse' && evento.button !== 0) return
    const atual = emCursoRef.current
    if (atual && atual.ponteiro !== evento.pointerId) return
    evento.preventDefault()
    try {
      quadroRef.current?.setPointerCapture?.(evento.pointerId)
    } catch {
      // O ponteiro já saiu (o dedo levantou antes); o traço segue sem captura.
    }
    definir({ ponteiro: evento.pointerId, pontos: [pontoDo(evento)] })
  }

  function aoMover(evento: EventoDePonteiro<HTMLDivElement>) {
    const atual = emCursoRef.current
    if (!atual || atual.ponteiro !== evento.pointerId) return
    const eventos = evento.nativeEvent.getCoalescedEvents?.() ?? []
    definir({
      ...atual,
      pontos: [
        ...atual.pontos,
        ...(eventos.length ? eventos : [evento]).map(pontoDo),
      ],
    })
  }

  function aoSoltar(evento: EventoDePonteiro<HTMLDivElement>) {
    const atual = emCursoRef.current
    if (!atual || atual.ponteiro !== evento.pointerId) return
    definir(null)
    aoTracar(atual.pontos)
  }

  return (
    <div
      ref={quadroRef}
      role="img"
      aria-label={T.rotulo}
      aria-describedby={idDaDica}
      onPointerDown={aoApertar}
      onPointerMove={aoMover}
      onPointerUp={aoSoltar}
      onPointerCancel={() => definir(null)}
      onLostPointerCapture={(evento) => {
        if (emCursoRef.current?.ponteiro === evento.pointerId) definir(null)
      }}
      className="border-input relative aspect-[3/1] w-full max-w-[600px] cursor-crosshair touch-none overflow-hidden rounded-md border bg-white select-none [-webkit-touch-callout:none]"
      data-testid="quadro-assinatura"
    >
      <svg
        aria-hidden
        viewBox={`0 0 ${TAMANHO_DO_QUADRO.largura} ${TAMANHO_DO_QUADRO.altura}`}
        className="pointer-events-none absolute inset-0 size-full"
      >
        <line
          x1={30}
          y1={150}
          x2={570}
          y2={150}
          stroke="#9ca3af"
          strokeWidth={1.5}
          strokeDasharray="8 6"
          data-testid="quadro-assinatura-linha"
        />
        {tracos.map((pontos, indice) => (
          <path
            key={indice}
            d={caminhoSvgDoContorno(contornoDoTraco(pontos, espessura))}
            fill={cor}
            data-testid="quadro-assinatura-traco"
          />
        ))}
        {emCurso && (
          <path
            d={caminhoSvgDoContorno(contornoDoTraco(emCurso, espessura, false))}
            fill={cor}
            data-testid="quadro-assinatura-em-curso"
          />
        )}
      </svg>
    </div>
  )
}
