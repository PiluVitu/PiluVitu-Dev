'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { DocumentoAberto } from './renderizador'

export const LARGURA_DA_MINIATURA = 160

const ANTECIPACAO = '400px 0px'

type Miniaturas = {
  documento: DocumentoAberto | null
  urls: ReadonlyMap<number, string>
  falhas: ReadonlySet<number>
}

const NENHUMA: Miniaturas = {
  documento: null,
  urls: new Map(),
  falhas: new Set(),
}

// Entre uma miniatura e outra o navegador atende o toque e a rolagem: o desenho no canvas é na thread da página.
const folga = () => new Promise((resolver) => setTimeout(resolver, 0))

export function useMiniaturas(documento: DocumentoAberto | null) {
  const elementos = useRef(new Map<Element, number>())
  const observador = useRef<IntersectionObserver | null>(null)
  const [estado, setEstado] = useState<Miniaturas>(NENHUMA)

  useEffect(() => {
    if (!documento) return
    let ativo = true
    let rodando = false
    const visiveis = new Set<number>()
    const tentadas = new Set<number>()
    const urls = new Map<number, string>()
    const falhas = new Set<number>()

    const proxima = () => [...visiveis].find((i) => !tentadas.has(i))

    async function rodar() {
      if (rodando) return
      rodando = true
      try {
        for (let i = proxima(); i !== undefined; i = proxima()) {
          tentadas.add(i)
          try {
            const jpeg = await documento!.miniatura(i, LARGURA_DA_MINIATURA)
            if (!ativo) return
            urls.set(i, URL.createObjectURL(jpeg))
          } catch {
            if (!ativo) return
            falhas.add(i)
          }
          setEstado({ documento, urls: new Map(urls), falhas: new Set(falhas) })
          await folga()
          if (!ativo) return
        }
      } finally {
        rodando = false
      }
    }

    const io = new IntersectionObserver(
      (entradas) => {
        for (const { target, isIntersecting } of entradas) {
          const indice = elementos.current.get(target)
          if (indice === undefined) continue
          if (isIntersecting) visiveis.add(indice)
          else visiveis.delete(indice)
        }
        void rodar()
      },
      { rootMargin: ANTECIPACAO },
    )
    for (const elemento of elementos.current.keys()) io.observe(elemento)
    observador.current = io

    return () => {
      ativo = false
      io.disconnect()
      observador.current = null
      for (const url of urls.values()) URL.revokeObjectURL(url)
    }
  }, [documento])

  const observar = useCallback((elemento: Element, indice: number) => {
    elementos.current.set(elemento, indice)
    observador.current?.observe(elemento)
    return () => {
      elementos.current.delete(elemento)
      observador.current?.unobserve(elemento)
    }
  }, [])

  const atual = documento && estado.documento === documento ? estado : NENHUMA
  return { urls: atual.urls, falhas: atual.falhas, observar }
}
