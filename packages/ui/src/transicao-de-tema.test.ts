import { trocarTemaComTransicao } from './transicao-de-tema'

function ambiente({
  reduzir = false,
  suporta = true,
}: { reduzir?: boolean; suporta?: boolean } = {}) {
  const chamadas: Array<() => unknown> = []
  const documento = {
    startViewTransition: suporta
      ? jest.fn((cb: () => unknown) => {
          chamadas.push(cb)
          return {}
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
  return { documento, janela, chamadas }
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

  // next-themes troca a classe num efeito depois do render: a captura do
  // estado novo precisa esperar o próximo quadro, senão anima o tema velho.
  it('a captura do estado novo espera um quadro depois de aplicar', async () => {
    const { documento, janela, chamadas } = ambiente()
    const ordem: string[] = []
    const raf = jest.fn((cb: FrameRequestCallback) => {
      ordem.push('quadro')
      cb(0)
      return 0
    })
    ;(
      janela as unknown as { requestAnimationFrame: unknown }
    ).requestAnimationFrame = raf

    trocarTemaComTransicao(() => ordem.push('aplicar'), { documento, janela })
    await chamadas[0]()

    expect(ordem[0]).toBe('aplicar')
    expect(ordem.slice(1)).toContain('quadro')
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
