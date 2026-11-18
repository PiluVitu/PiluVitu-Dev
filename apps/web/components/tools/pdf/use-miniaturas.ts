'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

export const LARGURA_DA_MINIATURA = 160

const ANTECIPACAO = '400px 0px'

type Miniaturas<Chave> = {
  sessao: object | null
  urls: ReadonlyMap<Chave, string>
  falhas: ReadonlySet<Chave>
}

const NENHUMA_URL: ReadonlyMap<unknown, string> = new Map()
const NENHUMA_FALHA: ReadonlySet<unknown> = new Set()

// Entre uma miniatura e outra o navegador atende o toque e a rolagem: o desenho no canvas é na thread da página.
const folga = () => new Promise((resolver) => setTimeout(resolver, 0))

/**
 * As miniaturas de uma sessão, pela chave que a tela escolhe (a página do arquivo ou o id da página do
 * editor). Só a troca de sessão recomeça: o `desenhar` pode mudar entre renderizações sem jogar fora o
 * que já foi desenhado.
 */
export function useMiniaturasDaSessao<Chave>(
  sessao: object | null,
  desenhar: (chave: Chave, larguraCss: number) => Promise<Blob>,
  larguraCss = LARGURA_DA_MINIATURA,
) {
  const elementos = useRef(new Map<Element, Chave>())
  const observador = useRef<IntersectionObserver | null>(null)
  const sairDaFila = useRef<((chave: Chave) => void) | null>(null)
  const desenharRef = useRef(desenhar)
  useLayoutEffect(() => {
    desenharRef.current = desenhar
  })
  const [estado, setEstado] = useState<Miniaturas<Chave>>({
    sessao: null,
    urls: new Map(),
    falhas: new Set(),
  })

  useEffect(() => {
    if (!sessao) return
    let ativo = true
    let rodando = false
    const visiveis = new Set<Chave>()
    const tentadas = new Set<Chave>()
    const urls = new Map<Chave, string>()
    const falhas = new Set<Chave>()

    const proxima = () => [...visiveis].find((i) => !tentadas.has(i))

    async function rodar() {
      if (rodando) return
      rodando = true
      try {
        for (let i = proxima(); i !== undefined; i = proxima()) {
          tentadas.add(i)
          try {
            const jpeg = await desenharRef.current(i, larguraCss)
            if (!ativo) return
            urls.set(i, URL.createObjectURL(jpeg))
          } catch {
            if (!ativo) return
            falhas.add(i)
          }
          setEstado({ sessao, urls: new Map(urls), falhas: new Set(falhas) })
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
          if (!elementos.current.has(target)) continue
          const chave = elementos.current.get(target)!
          if (isIntersecting) visiveis.add(chave)
          else visiveis.delete(chave)
        }
        void rodar()
      },
      { rootMargin: ANTECIPACAO },
    )
    for (const elemento of elementos.current.keys()) io.observe(elemento)
    observador.current = io
    sairDaFila.current = (chave) => visiveis.delete(chave)

    return () => {
      ativo = false
      io.disconnect()
      observador.current = null
      sairDaFila.current = null
      for (const url of urls.values()) URL.revokeObjectURL(url)
    }
  }, [sessao, larguraCss])

  const observar = useCallback((elemento: Element, chave: Chave) => {
    elementos.current.set(elemento, chave)
    observador.current?.observe(elemento)
    // O unobserve não chama o callback do observador: sem isto, a página que saiu da tela seguiria na fila.
    return () => {
      elementos.current.delete(elemento)
      observador.current?.unobserve(elemento)
      sairDaFila.current?.(chave)
    }
  }, [])

  const atual =
    sessao && estado.sessao === sessao
      ? estado
      : {
          urls: NENHUMA_URL as ReadonlyMap<Chave, string>,
          falhas: NENHUMA_FALHA as ReadonlySet<Chave>,
        }
  return { urls: atual.urls, falhas: atual.falhas, observar }
}
