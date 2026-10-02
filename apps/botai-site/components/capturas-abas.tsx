'use client'

import { cn } from '@piluvitu/ui/cn'
import { useRef, useState, type KeyboardEvent } from 'react'
import type { CapturaDaGaleria } from '@/lib/capturas'
import { ImagemPorTema } from './imagem-por-tema'

type CapturasAbasProps = {
  capturas: CapturaDaGaleria[]
  rotuladoPor: string
}

const PROXIMA: Record<string, (atual: number, total: number) => number> = {
  ArrowRight: (atual, total) => (atual + 1) % total,
  ArrowLeft: (atual, total) => (atual - 1 + total) % total,
  Home: () => 0,
  End: (_atual, total) => total - 1,
}

const idDaAba = (captura: CapturaDaGaleria) => `aba-captura-${captura.numero}`
const idDoPainel = (captura: CapturaDaGaleria) =>
  `painel-captura-${captura.numero}`

export function CapturasAbas({ capturas, rotuladoPor }: CapturasAbasProps) {
  const [ativa, setAtiva] = useState(0)
  const abas = useRef<(HTMLButtonElement | null)[]>([])
  const total = String(capturas.length).padStart(2, '0')

  function aoTeclar(evento: KeyboardEvent<HTMLButtonElement>) {
    const proxima = PROXIMA[evento.key]?.(ativa, capturas.length)
    if (proxima === undefined) return
    evento.preventDefault()
    setAtiva(proxima)
    abas.current[proxima]?.focus()
  }

  return (
    <div className="flex flex-col gap-6">
      <div
        role="tablist"
        aria-labelledby={rotuladoPor}
        className="flex flex-wrap gap-2"
      >
        {capturas.map((item, indice) => {
          const selecionada = indice === ativa
          return (
            <button
              key={item.numero}
              ref={(elemento) => {
                abas.current[indice] = elemento
              }}
              type="button"
              role="tab"
              id={idDaAba(item)}
              aria-selected={selecionada}
              aria-controls={idDoPainel(item)}
              tabIndex={selecionada ? 0 : -1}
              onClick={() => setAtiva(indice)}
              onKeyDown={aoTeclar}
              className={cn(
                'focus-visible:ring-ring cursor-pointer rounded-full border px-3.5 py-2 font-mono text-[13px] transition-colors outline-none focus-visible:ring-2',
                selecionada
                  ? 'bg-accent-soft border-accent-line text-primary'
                  : 'border-border text-muted-foreground',
              )}
            >
              {item.numero} · {item.titulo}
            </button>
          )
        })}
      </div>
      {capturas.map((captura, indice) => (
        <div
          key={captura.numero}
          role="tabpanel"
          id={idDoPainel(captura)}
          aria-labelledby={idDaAba(captura)}
          hidden={indice !== ativa}
          tabIndex={0}
          className="focus-visible:ring-ring flex flex-wrap items-center gap-6 rounded-lg outline-none focus-visible:ring-2"
        >
          <div className="bg-card border-border min-w-0 flex-[2_1_480px] overflow-hidden rounded-lg border">
            <ImagemPorTema
              variantes={captura.variantes}
              sizes="(min-width: 1080px) 640px, calc(100vw - 48px)"
            />
          </div>
          <div className="flex flex-[1_1_240px] flex-col gap-2.5">
            <p className="text-primary font-mono text-xs">
              {captura.numero} / {total}
            </p>
            <h3 className="text-2xl leading-[1.2] font-bold tracking-[-0.02em] text-balance">
              {captura.titulo}
            </h3>
            <p className="text-muted-foreground text-base leading-[1.55] text-pretty">
              {captura.texto}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
