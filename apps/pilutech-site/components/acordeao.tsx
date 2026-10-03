'use client'

import { useState } from 'react'
import type { Duvida } from '@/lib/conteudo'

type AcordeaoProps = { itens: readonly Duvida[]; prefixo?: string }

export function Acordeao({ itens, prefixo = 'duvida' }: AcordeaoProps) {
  const [aberto, setAberto] = useState(0)
  return (
    <div className="border-border flex flex-col border-t">
      {itens.map((item, indice) => {
        const estaAberto = aberto === indice
        const id = `${prefixo}-${indice + 1}`
        return (
          <div key={item.pergunta} className="border-border border-b">
            <h3>
              <button
                type="button"
                id={`${id}-pergunta`}
                aria-expanded={estaAberto}
                aria-controls={`${id}-resposta`}
                onClick={() => setAberto(estaAberto ? -1 : indice)}
                className="text-foreground focus-visible:outline-ring flex w-full cursor-pointer items-center justify-between gap-5 py-[22px] text-left text-[18px] font-bold tracking-[-0.01em] focus-visible:outline-2 focus-visible:outline-offset-4"
              >
                {item.pergunta}
                <span
                  aria-hidden
                  className="border-border text-primary flex size-8 flex-none items-center justify-center rounded-[10px] border font-mono text-[20px]"
                >
                  {estaAberto ? '−' : '+'}
                </span>
              </button>
            </h3>
            <div id={`${id}-resposta`} hidden={!estaAberto}>
              <p className="text-muted-foreground pr-[52px] pb-6 text-base leading-[1.65] text-pretty">
                {item.resposta}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
