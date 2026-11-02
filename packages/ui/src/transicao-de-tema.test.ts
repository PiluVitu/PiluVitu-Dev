import { trocarTemaComTransicao } from './transicao-de-tema'

function ambiente({
  reduzir = false,
  suporta = true,
}: { reduzir?: boolean; suporta?: boolean } = {}) {
  const chamadas: Array<() => unknown> = []
  let terminar = () => {}
  const finished = new Promise<void>((r) => (terminar = r))
  const documento = {
    documentElement: document.createElement('html'),
    startViewTransition: suporta
      ? jest.fn((cb: () => unknown) => {
          chamadas.push(cb)
          return { finished }
        })
      : undefined,
  } as unknown as Document
  const janela = {
    matchMedia: jest.fn((q: string) => ({
      matches: q === '(prefers-reduced-motion: reduce)' && reduzir,
    })),
    requestAnimationFrame: (cb: FrameRequestCallback) => {
      cb(0)
      return 0
    },
  } as unknown as Window
  return { documento, janela, chamadas, terminar }
}

describe('trocarTemaComTransicao', () => {
  it('troca dentro de uma View Transition quando o navegador suporta', async () => {
    const { documento, janela, chamadas } = ambiente()
    const aplicar = jest.fn()

    trocarTemaComTransicao(aplicar, { documento, janela })

    expect(documento.startViewTransition).toHaveBeenCalledTimes(1)
    expect(aplicar).not.toHaveBeenCalled()
    await chamadas[0]()
    expect(aplicar).toHaveBeenCalledTimes(1)
  })

  // O navegador suspende a renderização durante o callback: esperar um
  // requestAnimationFrame ali travava a troca até o timeout de 4 s.
  it('aplica dentro do callback sem esperar quadro', () => {
    const { documento, janela, chamadas } = ambiente()
    const raf = jest.fn()
    ;(
      janela as unknown as { requestAnimationFrame: unknown }
    ).requestAnimationFrame = raf
    const aplicar = jest.fn()

    trocarTemaComTransicao(aplicar, { documento, janela })
    chamadas[0]()

    expect(aplicar).toHaveBeenCalledTimes(1)
    expect(raf).not.toHaveBeenCalled()
  })

  // As animações infinitas da página (kubectl, cursor, pulso) entrariam na
  // captura; pausadas, o crossfade fica leve.
  it('pausa as animações da página enquanto a transição roda', async () => {
    const { documento, janela, chamadas, terminar } = ambiente()
    const html = documento.documentElement

    trocarTemaComTransicao(() => {}, { documento, janela })
    expect(html.classList.contains('transicao-de-tema')).toBe(true)

    await chamadas[0]()
    terminar()
    await new Promise((r) => setTimeout(r, 0))
    expect(html.classList.contains('transicao-de-tema')).toBe(false)
  })

  it('com prefers-reduced-motion troca na hora, sem transição', () => {
    const { documento, janela } = ambiente({ reduzir: true })
    const aplicar = jest.fn()

    trocarTemaComTransicao(aplicar, { documento, janela })

    expect(aplicar).toHaveBeenCalledTimes(1)
    expect(documento.startViewTransition).not.toHaveBeenCalled()
  })

  it('sem suporte à View Transitions API troca na hora', () => {
    const { documento, janela } = ambiente({ suporta: false })
    const aplicar = jest.fn()

    trocarTemaComTransicao(aplicar, { documento, janela })

    expect(aplicar).toHaveBeenCalledTimes(1)
  })
})
