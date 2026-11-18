import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  PIXELS_MAXIMOS_DO_CANVAS,
  pixelsDoFundo,
} from '@piluvitu/tools/pdf-regras'
import {
  PaginaSuperada,
  criarRenderizadorComPdfjs,
  pontoNoTexto,
  type RenderizadorDePdf,
} from './renderizador'

// O pdf.js de verdade só roda no E2E (precisa de canvas e Worker de navegador). Aqui ele é um
// dublê, para conferir o que o renderizador pede a ele e como trata o que volta.
jest.mock('./novo-worker-pdfjs', () => ({ novoWorkerDoPdfjs: jest.fn() }))

const mockPdfjs = {
  getDocument: jest.fn(),
  PDFWorker: { create: jest.fn() },
  version: '6.3.289',
}
jest.mock('pdfjs-dist', () => mockPdfjs)

class WorkerFalso extends EventTarget {
  encerrado = false
  terminate() {
    this.encerrado = true
  }
  quebrar() {
    this.dispatchEvent(new Event('error'))
  }
}

type PaginaFalsa = ReturnType<typeof paginaFalsa>

function paginaFalsa({ largura = 600, altura = 800, rotate = 0 } = {}) {
  const canvases: HTMLCanvasElement[] = []
  return {
    rotate,
    canvases,
    // Como o pdf.js: a rotação pedida substitui o /Rotate, e a de um quarto de volta troca os lados.
    getViewport: jest.fn(
      ({ scale, rotation = rotate }: { scale: number; rotation?: number }) => {
        const deitada = (((rotation - rotate) % 180) + 180) % 180 === 90
        return {
          width: (deitada ? altura : largura) * scale,
          height: (deitada ? largura : altura) * scale,
        }
      },
    ),
    render: jest.fn(
      ({ canvas }: { canvas: HTMLCanvasElement; viewport: unknown }) => {
        canvases.push(canvas)
        return { promise: Promise.resolve(), cancel: jest.fn() }
      },
    ),
    cleanup: jest.fn(),
  }
}

let worker: WorkerFalso
let pdfWorker: { destroy: jest.Mock }
let tarefa: { promise: Promise<unknown>; destroy: jest.Mock }
const jpegs: { largura: number; altura: number; tipo?: string; q?: number }[] =
  []

function prepararDocumento(paginas: PaginaFalsa[]) {
  return prepararTarefa(
    Promise.resolve({
      numPages: paginas.length,
      getPage: jest.fn(async (n: number) => {
        if (!paginas[n - 1]) throw new Error('Invalid page request.')
        return paginas[n - 1]
      }),
    }),
  )
}

function prepararTarefa(promise: Promise<unknown>) {
  promise.catch(() => {})
  tarefa = { promise, destroy: jest.fn(async () => {}) }
  mockPdfjs.getDocument.mockReturnValue(tarefa)
}

// O Blob do jsdom não tem arrayBuffer().
function arquivo(conteudo: string): Blob {
  return Object.assign(new Blob([conteudo]), {
    arrayBuffer: async () => new TextEncoder().encode(conteudo).buffer,
  })
}

const umaVolta = () => new Promise((r) => setTimeout(r, 0))

function abrir(conteudo = '%PDF-1.7 bytes') {
  return criarRenderizadorComPdfjs(() => worker as unknown as Worker).abrir(
    arquivo(conteudo),
  )
}

beforeEach(() => {
  worker = new WorkerFalso()
  pdfWorker = { destroy: jest.fn() }
  mockPdfjs.PDFWorker.create.mockReset().mockReturnValue(pdfWorker)
  mockPdfjs.getDocument.mockReset()
  jpegs.length = 0
  HTMLCanvasElement.prototype.toBlob = function (
    aoTerminar: BlobCallback,
    tipo?: string,
    q?: number,
  ) {
    jpegs.push({ largura: this.width, altura: this.height, tipo, q })
    aoTerminar(new Blob(['jpeg'], { type: tipo }))
  }
  Object.defineProperty(window, 'devicePixelRatio', {
    value: 1,
    configurable: true,
  })
})

describe('abrir', () => {
  it('entrega os bytes por data, nunca por URL, com a configuração segura e o Worker próprio', async () => {
    prepararDocumento([paginaFalsa()])

    await abrir('%PDF-1.7 conteudo')

    expect(mockPdfjs.PDFWorker.create).toHaveBeenCalledWith({ port: worker })
    const [opcoes] = mockPdfjs.getDocument.mock.calls[0]
    expect(opcoes).toEqual({
      data: expect.any(Uint8Array),
      worker: pdfWorker,
      enableXfa: false,
      disableAutoFetch: true,
      useSystemFonts: true,
      useWorkerFetch: false,
      BinaryDataFactory: expect.any(Function),
    })
    expect(new TextDecoder().decode(opcoes.data)).toBe('%PDF-1.7 conteudo')
  })

  it('os recursos (decodificadores e fontes) vêm da pasta da versão do pdf.js carregado, na própria origem', async () => {
    prepararDocumento([paginaFalsa()])
    await abrir()

    const [{ BinaryDataFactory }] = mockPdfjs.getDocument.mock.calls[0]
    const buscados: string[] = []
    const fetchOriginal = globalThis.fetch
    globalThis.fetch = jest.fn(async (url: string) => {
      buscados.push(url)
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(3) }
    }) as unknown as typeof fetch
    try {
      const fabrica = new BinaryDataFactory({})
      const bytes = await fabrica.fetch({
        kind: 'wasmUrl',
        filename: 'openjpeg.wasm',
      })
      expect(bytes).toHaveLength(3)
    } finally {
      globalThis.fetch = fetchOriginal
    }
    expect(buscados).toEqual(['/pdfjs/6.3.289/wasm/openjpeg.wasm'])
  })

  it('abre só com a contagem: nenhuma página vai e volta do Worker antes da primeira miniatura', async () => {
    const getPage = jest.fn(async () => paginaFalsa({ rotate: 90 }))
    prepararTarefa(Promise.resolve({ numPages: 3, getPage }))

    const documento = await abrir()

    expect(documento.paginas).toBe(3)
    expect(documento).not.toHaveProperty('rotacoes')
    expect(getPage).not.toHaveBeenCalled()
  })

  it('PDF com senha é recusado como protegido, e o Worker cai', async () => {
    prepararTarefa(
      Promise.reject(
        Object.assign(new Error('No password given'), {
          name: 'PasswordException',
        }),
      ),
    )

    await expect(abrir()).rejects.toEqual({ motivo: 'protegido' })
    await umaVolta()
    expect(worker.encerrado).toBe(true)
    expect(pdfWorker.destroy).toHaveBeenCalled()
  })

  it('estrutura inválida é recusada como corrompida', async () => {
    prepararTarefa(
      Promise.reject(
        Object.assign(new Error('Invalid PDF structure.'), {
          name: 'InvalidPDFException',
        }),
      ),
    )

    await expect(abrir()).rejects.toEqual({ motivo: 'corrompido' })
    await umaVolta()
    expect(worker.encerrado).toBe(true)
  })

  it('documento sem página é recusado', async () => {
    prepararDocumento([])

    await expect(abrir()).rejects.toEqual({ motivo: 'sem_paginas' })
    await umaVolta()
    expect(worker.encerrado).toBe(true)
  })

  it('se o Worker do pdf.js cai abrindo, a falha é do navegador, não do arquivo', async () => {
    prepararTarefa(new Promise(() => {}))

    const aberto = abrir()
    await new Promise((r) => setTimeout(r, 0))
    worker.quebrar()

    await expect(aberto).rejects.toEqual({ motivo: 'falha_do_navegador' })
    await umaVolta()
    expect(worker.encerrado).toBe(true)
  })

  it('arquivo que o navegador não consegue ler não acusa o PDF e nem cria Worker', async () => {
    const novoWorker = jest.fn()
    const ilegivel = Object.assign(new Blob(['x']), {
      arrayBuffer: () =>
        Promise.reject(new DOMException('', 'NotReadableError')),
    })

    await expect(
      criarRenderizadorComPdfjs(novoWorker).abrir(ilegivel),
    ).rejects.toEqual({ motivo: 'falha_do_navegador' })
    expect(novoWorker).not.toHaveBeenCalled()
  })
})

describe('miniatura', () => {
  it('desenha num canvas de larguraCss × devicePixelRatio e devolve um JPEG', async () => {
    Object.defineProperty(window, 'devicePixelRatio', {
      value: 2,
      configurable: true,
    })
    prepararDocumento([
      paginaFalsa(),
      paginaFalsa({ largura: 600, altura: 800 }),
    ])
    const documento = await abrir()

    const jpeg = await documento.miniatura(1, 160)

    expect(jpeg.type).toBe('image/jpeg')
    expect(jpegs).toEqual([
      { largura: 320, altura: 427, tipo: 'image/jpeg', q: 0.8 },
    ])
  })

  it('solta o canvas e a página depois do JPEG', async () => {
    const pagina = paginaFalsa()
    prepararDocumento([pagina])
    const documento = await abrir()

    await documento.miniatura(0, 160)

    expect(pagina.canvases).toHaveLength(1)
    expect(pagina.canvases[0].width).toBe(0)
    expect(pagina.canvases[0].height).toBe(0)
    expect(pagina.cleanup).toHaveBeenCalled()
  })

  it('página estreita e comprida não passa de 4 larguras de altura', async () => {
    prepararDocumento([paginaFalsa({ largura: 100, altura: 10_000 })])
    const documento = await abrir()

    await documento.miniatura(0, 160)

    expect(jpegs[0].altura).toBe(640)
    expect(jpegs[0].largura).toBeLessThanOrEqual(160)
  })

  it('desenha uma por vez, mesmo pedidas juntas', async () => {
    const [a, b] = [paginaFalsa(), paginaFalsa()]
    let terminarA!: () => void
    a.render.mockImplementationOnce(({ canvas }) => {
      a.canvases.push(canvas)
      return {
        promise: new Promise<void>((r) => (terminarA = r)),
        cancel: jest.fn(),
      }
    })
    prepararDocumento([a, b])
    const documento = await abrir()

    const primeira = documento.miniatura(0, 160)
    const segunda = documento.miniatura(1, 160)
    await new Promise((r) => setTimeout(r, 0))

    expect(a.render).toHaveBeenCalledTimes(1)
    expect(b.render).not.toHaveBeenCalled()
    terminarA()
    await Promise.all([primeira, segunda])
    expect(b.render).toHaveBeenCalledTimes(1)
  })

  it('uma miniatura que falha não trava a fila', async () => {
    const [a, b] = [paginaFalsa(), paginaFalsa()]
    a.render.mockImplementationOnce(() => ({
      promise: Promise.reject(new Error('Rendering cancelled')),
      cancel: jest.fn(),
    }))
    prepararDocumento([a, b])
    const documento = await abrir()

    await expect(documento.miniatura(0, 160)).rejects.toThrow('cancelled')
    await expect(documento.miniatura(1, 160)).resolves.toBeInstanceOf(Blob)
  })

  it('largura que não é número positivo é recusada', async () => {
    prepararDocumento([paginaFalsa()])
    const documento = await abrir()

    await expect(documento.miniatura(0, 0)).rejects.toThrow(RangeError)
    await expect(documento.miniatura(0, Number.NaN)).rejects.toThrow(RangeError)
  })
})

describe('pagina (a página grande)', () => {
  type Controle = { terminar: () => void; cancel: jest.Mock }

  // Um desenho que só termina quando o teste manda, e que o cancel rejeita como o pdf.js faz.
  function desenhoControlado(pagina: PaginaFalsa): Controle[] {
    const controles: Controle[] = []
    pagina.render.mockImplementation(({ canvas }) => {
      pagina.canvases.push(canvas)
      let terminar!: () => void
      let falhar!: (erro: Error) => void
      const promise = new Promise<void>((r, f) => {
        terminar = r
        falhar = f
      })
      const cancel = jest.fn(() =>
        falhar(
          Object.assign(new Error('Rendering cancelled'), {
            name: 'RenderingCancelledException',
          }),
        ),
      )
      controles.push({ terminar, cancel })
      return { promise, cancel }
    })
    return controles
  }

  it('desenha na largura de exibição vezes o devicePixelRatio e devolve o canvas e o tamanho da página em pontos', async () => {
    Object.defineProperty(window, 'devicePixelRatio', {
      value: 2,
      configurable: true,
    })
    const pagina = paginaFalsa({ largura: 600, altura: 800 })
    prepararDocumento([pagina])
    const documento = await abrir()

    const desenhada = await documento.pagina(0, 450)

    expect(desenhada.tamanho).toEqual({ largura: 600, altura: 800 })
    expect([desenhada.canvas.width, desenhada.canvas.height]).toEqual([
      900, 1200,
    ])
    expect(pagina.render).toHaveBeenCalledWith({
      canvas: desenhada.canvas,
      viewport: { width: 900, height: 1200 },
    })
    expect(pagina.cleanup).toHaveBeenCalled()
  })

  it('com zoom alto numa tela densa, o canvas para no limite de pixels do Safari no iOS', async () => {
    Object.defineProperty(window, 'devicePixelRatio', {
      value: 3,
      configurable: true,
    })
    prepararDocumento([paginaFalsa({ largura: 595, altura: 842 })])
    const documento = await abrir()

    const { canvas } = await documento.pagina(0, 3_200)

    expect(canvas.width * canvas.height).toBeLessThanOrEqual(
      PIXELS_MAXIMOS_DO_CANVAS,
    )
    expect(canvas.width * canvas.height).toBeGreaterThan(
      PIXELS_MAXIMOS_DO_CANVAS * 0.99,
    )
  })

  it('uma página por vez: o canvas da anterior só é esvaziado quando a nova fica pronta', async () => {
    const [a, b] = [paginaFalsa(), paginaFalsa()]
    prepararDocumento([a, b])
    const documento = await abrir()
    const primeira = await documento.pagina(0, 300)
    const controles = desenhoControlado(b)

    const segunda = documento.pagina(1, 300)
    await umaVolta()
    expect(primeira.canvas.width).toBe(300)

    controles[0].terminar()
    const { canvas } = await segunda
    expect(canvas.width).toBe(300)
    expect([primeira.canvas.width, primeira.canvas.height]).toEqual([0, 0])
  })

  it('um pedido novo cancela o desenho em curso e pula o que ainda esperava, que rejeitam como superados', async () => {
    const [a, b, c] = [paginaFalsa(), paginaFalsa(), paginaFalsa()]
    prepararDocumento([a, b, c])
    const documento = await abrir()
    const controles = desenhoControlado(a)

    const primeira = documento.pagina(0, 300)
    await umaVolta()
    const segunda = documento.pagina(1, 300)
    const terceira = documento.pagina(2, 300)

    await expect(primeira).rejects.toBeInstanceOf(PaginaSuperada)
    await expect(segunda).rejects.toBeInstanceOf(PaginaSuperada)
    expect(controles[0].cancel).toHaveBeenCalled()
    expect([a.canvases[0].width, a.canvases[0].height]).toEqual([0, 0])
    expect(b.render).not.toHaveBeenCalled()
    await expect(terceira).resolves.toMatchObject({
      tamanho: { largura: 600, altura: 800 },
    })
  })

  it('divide a fila com as miniaturas: uma coisa desenhada por vez', async () => {
    const [a, b] = [paginaFalsa(), paginaFalsa()]
    prepararDocumento([a, b])
    const documento = await abrir()
    const controles = desenhoControlado(a)

    const miniatura = documento.miniatura(0, 160)
    const grande = documento.pagina(1, 300)
    await umaVolta()

    expect(b.render).not.toHaveBeenCalled()
    controles[0].terminar()
    await miniatura
    await grande
    expect(b.render).toHaveBeenCalledTimes(1)
  })

  it('desenho que falha solta o canvas e rejeita com o erro, sem travar a fila', async () => {
    const pagina = paginaFalsa()
    pagina.render.mockImplementationOnce(({ canvas }) => {
      pagina.canvases.push(canvas)
      return {
        promise: Promise.reject(new Error('sem memória')),
        cancel: jest.fn(),
      }
    })
    prepararDocumento([pagina])
    const documento = await abrir()

    await expect(documento.pagina(0, 300)).rejects.toThrow('sem memória')
    expect(pagina.canvases[0].width).toBe(0)
    await expect(documento.pagina(0, 300)).resolves.toBeDefined()
  })

  it('largura que não é número positivo é recusada', async () => {
    prepararDocumento([paginaFalsa()])
    const documento = await abrir()

    await expect(documento.pagina(0, 0)).rejects.toThrow(RangeError)
    await expect(documento.pagina(0, Number.NaN)).rejects.toThrow(RangeError)
  })

  it('com giro (a moldura), desenha a página girada a mais, por cima do /Rotate dela', async () => {
    const pagina = paginaFalsa({ largura: 600, altura: 800, rotate: 90 })
    prepararDocumento([pagina])
    const documento = await abrir()

    const desenhada = await documento.pagina(0, 400, 90)

    expect(pagina.getViewport).toHaveBeenCalledWith({
      scale: 1,
      rotation: 180,
    })
    expect(desenhada.tamanho).toEqual({ largura: 800, altura: 600 })
    expect([desenhada.canvas.width, desenhada.canvas.height]).toEqual([
      400, 300,
    ])

    const deCabeca = await documento.pagina(0, 400, 180)

    expect(pagina.getViewport).toHaveBeenCalledWith({
      scale: 1,
      rotation: 270,
    })
    expect(deCabeca.tamanho).toEqual({ largura: 600, altura: 800 })
  })

  it('fechar cancela o desenho em curso e esvazia o canvas da página na tela', async () => {
    const [a, b] = [paginaFalsa(), paginaFalsa()]
    prepararDocumento([a, b])
    const documento = await abrir()
    const { canvas } = await documento.pagina(0, 300)
    const controles = desenhoControlado(b)
    const emCurso = documento.pagina(1, 300)
    await umaVolta()

    documento.fechar()

    expect(controles[0].cancel).toHaveBeenCalled()
    expect([canvas.width, canvas.height]).toEqual([0, 0])
    await expect(emCurso).rejects.toThrow()
    await expect(documento.pagina(0, 300)).rejects.toThrow('fechado')
  })
})

describe('fundo (apagar de verdade)', () => {
  let pintados: { x: number; y: number; largura: number; altura: number }[]
  let corDaTinta: string[]

  beforeEach(() => {
    pintados = []
    corDaTinta = []
    HTMLCanvasElement.prototype.getContext = jest.fn(() => {
      const contexto = {
        fillStyle: '',
        fillRect: (x: number, y: number, largura: number, altura: number) => {
          pintados.push({ x, y, largura, altura })
          corDaTinta.push(contexto.fillStyle)
        },
      }
      return contexto
    }) as unknown as HTMLCanvasElement['getContext']
  })

  it('desenha a página a 200 dpi, pinta os cobrir de branco no canvas antes do JPEG e solta tudo', async () => {
    const pagina = paginaFalsa({ largura: 600, altura: 800 })
    prepararDocumento([pagina])
    const documento = await abrir()
    const esperado = pixelsDoFundo({ largura: 600, altura: 800 })

    const jpeg = await documento.fundo(0, [
      { x: 10.2, y: 20.7, largura: 100, altura: 30.1 },
    ])

    expect(jpeg.type).toBe('image/jpeg')
    expect(pagina.render).toHaveBeenCalledWith({
      canvas: pagina.canvases[0],
      viewport: {
        width: 600 * esperado.escala,
        height: 800 * esperado.escala,
      },
    })
    expect(jpegs).toEqual([
      {
        largura: esperado.largura,
        altura: esperado.altura,
        tipo: 'image/jpeg',
        q: 0.9,
      },
    ])
    const e = esperado.escala
    expect(pintados).toEqual([
      {
        x: Math.floor(10.2 * e),
        y: Math.floor(20.7 * e),
        largura: Math.ceil(110.2 * e) - Math.floor(10.2 * e),
        altura: Math.ceil(50.8 * e) - Math.floor(20.7 * e),
      },
    ])
    expect(corDaTinta).toEqual(['#ffffff'])
    expect([pagina.canvases[0].width, pagina.canvases[0].height]).toEqual([
      0, 0,
    ])
    expect(pagina.cleanup).toHaveBeenCalled()
  })

  // Arredondado para dentro, a borda do retângulo ficaria meio pintada, com um resto da letra embaixo.
  it('com giro (a moldura), o fundo sai como a tela mostra a página, onde os cobrir foram postos', async () => {
    const pagina = paginaFalsa({ largura: 600, altura: 800 })
    prepararDocumento([pagina])
    const documento = await abrir()
    const esperado = pixelsDoFundo({ largura: 800, altura: 600 })

    await documento.fundo(0, [], 90)

    expect(pagina.getViewport).toHaveBeenCalledWith({ scale: 1, rotation: 90 })
    expect(jpegs).toEqual([
      expect.objectContaining({
        largura: esperado.largura,
        altura: esperado.altura,
      }),
    ])
  })

  it('os retângulos são arredondados para fora: cobrem pelo menos a caixa inteira', async () => {
    prepararDocumento([paginaFalsa({ largura: 595, altura: 842 })])
    const documento = await abrir()
    const { escala } = pixelsDoFundo({ largura: 595, altura: 842 })
    // Com 200 dpi, 10,3 e 44,5 pontos caem em 28,6 e 123,6 pixels: arredondar ao mais perto cortaria a borda.
    const caixa = { x: 10.3, y: 44.5, largura: 55.5, altura: 6.6 }

    await documento.fundo(0, [caixa])

    const [pintado] = pintados
    expect(pintado.x).toBeLessThanOrEqual(caixa.x * escala)
    expect(pintado.y).toBeLessThanOrEqual(caixa.y * escala)
    expect(pintado.x + pintado.largura).toBeGreaterThanOrEqual(
      (caixa.x + caixa.largura) * escala,
    )
    expect(pintado.y + pintado.altura).toBeGreaterThanOrEqual(
      (caixa.y + caixa.altura) * escala,
    )
  })

  it('não mexe na página grande da tela: ela continua inteira, e nenhum pedido dela é superado', async () => {
    prepararDocumento([paginaFalsa(), paginaFalsa()])
    const documento = await abrir()
    const naTela = await documento.pagina(0, 300)

    await documento.fundo(1, [{ x: 0, y: 0, largura: 1, altura: 1 }])

    expect(naTela.canvas.width).toBe(300)
    await expect(documento.pagina(0, 300)).resolves.toBeDefined()
  })

  it('o desenho que falha solta o canvas e rejeita; depois de fechar, é recusado', async () => {
    const pagina = paginaFalsa()
    pagina.render.mockImplementation(({ canvas }) => {
      pagina.canvases.push(canvas)
      return {
        promise: Promise.reject(new Error('sem memória')),
        cancel: jest.fn(),
      }
    })
    prepararDocumento([pagina])
    const documento = await abrir()

    await expect(documento.fundo(0, [])).rejects.toThrow('sem memória')
    expect(pagina.canvases[0].width).toBe(0)

    documento.fechar()
    await expect(documento.fundo(0, [])).rejects.toThrow('fechado')
  })
})

describe('textoNoPonto (a dica de cobrir e escrever por cima)', () => {
  // Texto de 12 pt em (100, 700) no PDF, com 50 pt de largura: na tela de uma página de 800 pt de altura,
  // a linha de base fica em y = 100.
  const ITEM = {
    str: 'Contrato',
    transform: [12, 0, 0, 12, 100, 700],
    width: 50,
  }
  const RETA = [1, 0, 0, -1, 0, 800]
  const DEITADA = [0, 1, 1, 0, 0, 0]

  it.each([
    [{ x: 120, y: 95 }, true],
    [{ x: 151, y: 92 }, true],
    [{ x: 120, y: 110 }, false],
    [{ x: 160, y: 95 }, false],
    [{ x: 120, y: 80 }, false],
  ])('página sem giro: %o está no texto? %s', (ponto, dentro) => {
    expect(pontoNoTexto(RETA, [ITEM], ponto)).toBe(dentro)
  })

  it('página girada 90°: o texto corre para baixo e as letras sobem para a direita', () => {
    expect(pontoNoTexto(DEITADA, [ITEM], { x: 705, y: 120 })).toBe(true)
    expect(pontoNoTexto(DEITADA, [ITEM], { x: 690, y: 120 })).toBe(false)
    expect(pontoNoTexto(DEITADA, [ITEM], { x: 705, y: 200 })).toBe(false)
  })

  it('trecho só de espaço, marcação de conteúdo e trecho sem largura não contam', () => {
    const ponto = { x: 120, y: 95 }
    expect(pontoNoTexto(RETA, [{ ...ITEM, str: '   ' }], ponto)).toBe(false)
    expect(pontoNoTexto(RETA, [{}], ponto)).toBe(false)
    expect(pontoNoTexto(RETA, [{ ...ITEM, width: 0 }], ponto)).toBe(false)
  })

  it('pergunta ao pdf.js pela camada de texto da página, na vista com escala 1', async () => {
    const pagina = {
      ...paginaFalsa(),
      getViewport: jest.fn(() => ({
        width: 600,
        height: 800,
        transform: RETA,
      })),
      getTextContent: jest.fn(async () => ({ items: [ITEM] })),
    }
    prepararDocumento([pagina as unknown as PaginaFalsa])
    const documento = await abrir()

    await expect(documento.textoNoPonto(0, { x: 120, y: 95 })).resolves.toBe(
      true,
    )
    await expect(documento.textoNoPonto(0, { x: 400, y: 400 })).resolves.toBe(
      false,
    )
    expect(pagina.getViewport).toHaveBeenCalledWith({ scale: 1 })

    documento.fechar()
    await expect(documento.textoNoPonto(0, { x: 120, y: 95 })).resolves.toBe(
      false,
    )
  })

  it('com giro (a moldura), a camada de texto é lida na vista girada que a tela mostra', async () => {
    const pagina = {
      ...paginaFalsa(),
      getViewport: jest.fn(() => ({
        width: 800,
        height: 600,
        transform: DEITADA,
      })),
      getTextContent: jest.fn(async () => ({ items: [ITEM] })),
    }
    prepararDocumento([pagina as unknown as PaginaFalsa])
    const documento = await abrir()

    await expect(
      documento.textoNoPonto(0, { x: 705, y: 120 }, 90),
    ).resolves.toBe(true)
    expect(pagina.getViewport).toHaveBeenCalledWith({ scale: 1, rotation: 90 })
  })
})

describe('fechar', () => {
  it('derruba o Worker do pdf.js e a tarefa, uma vez só', async () => {
    prepararDocumento([paginaFalsa()])
    const documento = await abrir()

    documento.fechar()
    documento.fechar()
    await umaVolta()

    expect(worker.encerrado).toBe(true)
    expect(pdfWorker.destroy).toHaveBeenCalledTimes(1)
    expect(tarefa.destroy).toHaveBeenCalledTimes(1)
  })

  // O destroy da tarefa manda o Terminate ao Worker e só limpa a página (as FontFace em document.fonts,
  // o cache de objetos, os filtros) quando ele responde. Com o Worker já encerrado, a resposta não chega.
  it('espera a tarefa terminar (a limpeza da página) antes de destruir o PDFWorker e encerrar o Worker', async () => {
    prepararDocumento([paginaFalsa()])
    const documento = await abrir()
    let terminar!: () => void
    tarefa.destroy.mockImplementation(
      () => new Promise<void>((r) => (terminar = r)),
    )

    documento.fechar()
    await umaVolta()
    expect(tarefa.destroy).toHaveBeenCalledTimes(1)
    expect(pdfWorker.destroy).not.toHaveBeenCalled()
    expect(worker.encerrado).toBe(false)

    terminar()
    await umaVolta()
    expect(pdfWorker.destroy).toHaveBeenCalledTimes(1)
    expect(worker.encerrado).toBe(true)
  })

  it('com o Worker travado ou caído, a tarefa nunca termina: o Worker é encerrado depois de 2 s', async () => {
    prepararDocumento([paginaFalsa()])
    const documento = await abrir()
    tarefa.destroy.mockImplementation(() => new Promise<void>(() => {}))
    jest.useFakeTimers()
    try {
      documento.fechar()
      await jest.advanceTimersByTimeAsync(1_999)
      expect(worker.encerrado).toBe(false)

      await jest.advanceTimersByTimeAsync(1)
      expect(worker.encerrado).toBe(true)
      expect(pdfWorker.destroy).toHaveBeenCalledTimes(1)
    } finally {
      jest.useRealTimers()
    }
  })

  it('a tarefa que falha ao terminar não impede de encerrar o Worker', async () => {
    prepararDocumento([paginaFalsa()])
    const documento = await abrir()
    tarefa.destroy.mockImplementation(async () => {
      throw new Error('Worker was destroyed')
    })

    documento.fechar()
    await umaVolta()

    expect(worker.encerrado).toBe(true)
    expect(pdfWorker.destroy).toHaveBeenCalledTimes(1)
  })

  it('miniatura pedida depois de fechar é recusada', async () => {
    prepararDocumento([paginaFalsa()])
    const documento = await abrir()

    documento.fechar()

    await expect(documento.miniatura(0, 160)).rejects.toThrow('fechado')
  })
})

// O editor abre vários PDFs (PR 4): um PDFWorker só para todos (M2, 2026-11-18: com 20 arquivos, +200 MB
// contra +450 MB de um Worker por arquivo), com uma fila e uma página grande para a sessão inteira.
describe('a sessão: um Worker do pdf.js para os documentos do mesmo renderizador', () => {
  let workers: WorkerFalso[]
  let pdfWorkers: { destroy: jest.Mock }[]
  let sessao: RenderizadorDePdf

  function proximaTarefa(paginas: PaginaFalsa[]) {
    const documento = {
      numPages: paginas.length,
      getPage: jest.fn(async (n: number) => paginas[n - 1]),
    }
    const daTarefa = {
      promise: Promise.resolve(documento),
      destroy: jest.fn(async () => {}),
    }
    mockPdfjs.getDocument.mockReturnValueOnce(daTarefa)
    return daTarefa
  }

  function desenhoPreso(pagina: PaginaFalsa) {
    let terminar!: () => void
    const cancel = jest.fn()
    pagina.render.mockImplementationOnce(({ canvas }) => {
      pagina.canvases.push(canvas)
      const promise = new Promise<void>((r, f) => {
        terminar = r
        cancel.mockImplementation(() =>
          f(Object.assign(new Error('Rendering cancelled'), {})),
        )
      })
      return { promise, cancel }
    })
    return { terminar: () => terminar(), cancel }
  }

  beforeEach(() => {
    workers = []
    pdfWorkers = []
    mockPdfjs.PDFWorker.create.mockImplementation(() => {
      const novo = { destroy: jest.fn() }
      pdfWorkers.push(novo)
      return novo
    })
    sessao = criarRenderizadorComPdfjs(() => {
      const novo = new WorkerFalso()
      workers.push(novo)
      return novo as unknown as Worker
    })
  })

  it('dois documentos dividem um Worker e um PDFWorker', async () => {
    proximaTarefa([paginaFalsa()])
    proximaTarefa([paginaFalsa(), paginaFalsa()])

    const a = await sessao.abrir(arquivo('a'))
    const b = await sessao.abrir(arquivo('b'))

    expect([a.paginas, b.paginas]).toEqual([1, 2])
    expect(workers).toHaveLength(1)
    expect(pdfWorkers).toHaveLength(1)
    expect(mockPdfjs.PDFWorker.create).toHaveBeenCalledWith({
      port: workers[0],
    })
    expect(
      mockPdfjs.getDocument.mock.calls.map(([opcoes]) => opcoes.worker),
    ).toEqual([pdfWorkers[0], pdfWorkers[0]])
  })

  it('a página grande é uma só: a do arquivo B, quando fica pronta, solta o canvas da do A', async () => {
    const [paginaDoA, paginaDoB] = [paginaFalsa(), paginaFalsa()]
    proximaTarefa([paginaDoA])
    proximaTarefa([paginaDoB])
    const a = await sessao.abrir(arquivo('a'))
    const b = await sessao.abrir(arquivo('b'))
    const doA = await a.pagina(0, 300)
    const preso = desenhoPreso(paginaDoB)

    const doB = b.pagina(0, 300)
    await umaVolta()
    expect(doA.canvas.width).toBe(300)

    preso.terminar()
    expect((await doB).canvas.width).toBe(300)
    expect([doA.canvas.width, doA.canvas.height]).toEqual([0, 0])
  })

  it('pedir a página do B cancela o desenho da do A em curso, que rejeita como superada', async () => {
    const [paginaDoA, paginaDoB] = [paginaFalsa(), paginaFalsa()]
    proximaTarefa([paginaDoA])
    proximaTarefa([paginaDoB])
    const a = await sessao.abrir(arquivo('a'))
    const b = await sessao.abrir(arquivo('b'))
    const preso = desenhoPreso(paginaDoA)

    const doA = a.pagina(0, 300)
    await umaVolta()
    const doB = b.pagina(0, 300)

    await expect(doA).rejects.toBeInstanceOf(PaginaSuperada)
    expect(preso.cancel).toHaveBeenCalled()
    expect([paginaDoA.canvases[0].width, paginaDoA.canvases[0].height]).toEqual(
      [0, 0],
    )
    await expect(doB).resolves.toBeDefined()
  })

  it('a fila é da sessão: a miniatura do B espera o desenho do A', async () => {
    const [paginaDoA, paginaDoB] = [paginaFalsa(), paginaFalsa()]
    proximaTarefa([paginaDoA])
    proximaTarefa([paginaDoB])
    const a = await sessao.abrir(arquivo('a'))
    const b = await sessao.abrir(arquivo('b'))
    const preso = desenhoPreso(paginaDoA)

    const miniaturaDoA = a.miniatura(0, 160)
    const miniaturaDoB = b.miniatura(0, 160)
    await umaVolta()
    expect(paginaDoB.render).not.toHaveBeenCalled()

    preso.terminar()
    await Promise.all([miniaturaDoA, miniaturaDoB])
    expect(paginaDoB.render).toHaveBeenCalledTimes(1)
  })

  it('fechar um documento não derruba o Worker: o outro continua desenhando, e a página grande dele fica', async () => {
    const tarefaDoA = proximaTarefa([paginaFalsa()])
    proximaTarefa([paginaFalsa()])
    const a = await sessao.abrir(arquivo('a'))
    const b = await sessao.abrir(arquivo('b'))
    const doB = await b.pagina(0, 300)

    a.fechar()
    await umaVolta()

    expect(tarefaDoA.destroy).toHaveBeenCalledTimes(1)
    expect(pdfWorkers[0].destroy).not.toHaveBeenCalled()
    expect(workers[0].encerrado).toBe(false)
    expect(doB.canvas.width).toBe(300)
    await expect(b.miniatura(0, 160)).resolves.toBeInstanceOf(Blob)
    await expect(a.miniatura(0, 160)).rejects.toThrow('fechado')
  })

  it('o último documento que fecha derruba o Worker depois do destroy, e o próximo abrir cria outro', async () => {
    const tarefaDoA = proximaTarefa([paginaFalsa()])
    const tarefaDoB = proximaTarefa([paginaFalsa()])
    const a = await sessao.abrir(arquivo('a'))
    const b = await sessao.abrir(arquivo('b'))
    let terminar!: () => void
    tarefaDoB.destroy.mockImplementation(
      () => new Promise<void>((r) => (terminar = r)),
    )

    a.fechar()
    b.fechar()
    await umaVolta()
    expect(tarefaDoA.destroy).toHaveBeenCalledTimes(1)
    expect(workers[0].encerrado).toBe(false)

    terminar()
    await umaVolta()
    expect(pdfWorkers[0].destroy).toHaveBeenCalledTimes(1)
    expect(workers[0].encerrado).toBe(true)

    proximaTarefa([paginaFalsa()])
    await sessao.abrir(arquivo('c'))
    expect(workers).toHaveLength(2)
    expect(mockPdfjs.getDocument.mock.calls[2][0].worker).toBe(pdfWorkers[1])
  })

  it('encerrar fecha os documentos e derruba o Worker só depois dos destroy', async () => {
    const tarefas = [
      proximaTarefa([paginaFalsa()]),
      proximaTarefa([paginaFalsa()]),
    ]
    const a = await sessao.abrir(arquivo('a'))
    await sessao.abrir(arquivo('b'))
    const doA = await a.pagina(0, 300)
    const terminar: (() => void)[] = []
    for (const daTarefa of tarefas) {
      daTarefa.destroy.mockImplementation(
        () => new Promise<void>((r) => terminar.push(r)),
      )
    }

    sessao.encerrar()
    await umaVolta()
    expect(tarefas.map((t) => t.destroy.mock.calls.length)).toEqual([1, 1])
    expect([doA.canvas.width, doA.canvas.height]).toEqual([0, 0])
    expect(workers[0].encerrado).toBe(false)

    terminar[0]()
    await umaVolta()
    expect(workers[0].encerrado).toBe(false)

    terminar[1]()
    await umaVolta()
    expect(pdfWorkers[0].destroy).toHaveBeenCalledTimes(1)
    expect(workers[0].encerrado).toBe(true)
  })

  it('encerrar com um destroy que nunca termina: o Worker cai em 2 s', async () => {
    const tarefaTravada = proximaTarefa([paginaFalsa()])
    proximaTarefa([paginaFalsa()])
    await sessao.abrir(arquivo('a'))
    await sessao.abrir(arquivo('b'))
    tarefaTravada.destroy.mockImplementation(() => new Promise<void>(() => {}))
    jest.useFakeTimers()
    try {
      sessao.encerrar()
      await jest.advanceTimersByTimeAsync(1_999)
      expect(workers[0].encerrado).toBe(false)

      await jest.advanceTimersByTimeAsync(1)
      expect(workers[0].encerrado).toBe(true)
      expect(pdfWorkers[0].destroy).toHaveBeenCalledTimes(1)
    } finally {
      jest.useRealTimers()
    }
  })

  it('encerrar sem documento aberto não cria nem derruba nada, e a sessão continua abrindo', async () => {
    sessao.encerrar()
    expect(workers).toHaveLength(0)

    proximaTarefa([paginaFalsa()])
    await expect(sessao.abrir(arquivo('a'))).resolves.toBeDefined()
    expect(workers).toHaveLength(1)
  })

  it('encerrar enquanto um documento abre: ele não chega aberto, e o Worker cai', async () => {
    let entregar!: (documento: unknown) => void
    const daTarefa = {
      promise: new Promise((r) => (entregar = r)),
      destroy: jest.fn(async () => {}),
    }
    mockPdfjs.getDocument.mockReturnValueOnce(daTarefa)

    const abrindo = sessao.abrir(arquivo('a'))
    await umaVolta()
    sessao.encerrar()
    entregar({ numPages: 1, getPage: jest.fn() })

    await expect(abrindo).rejects.toEqual({ motivo: 'falha_do_navegador' })
    await umaVolta()
    expect(daTarefa.destroy).toHaveBeenCalledTimes(1)
    expect(workers[0].encerrado).toBe(true)
  })

  it('o Worker que cai derruba os documentos dele, e o próximo abrir nasce num Worker novo', async () => {
    const pagina = paginaFalsa()
    proximaTarefa([pagina])
    const a = await sessao.abrir(arquivo('a'))
    pagina.render.mockImplementationOnce(({ canvas }) => {
      pagina.canvases.push(canvas)
      return { promise: new Promise<void>(() => {}), cancel: jest.fn() }
    })

    const miniatura = a.miniatura(0, 160)
    await umaVolta()
    workers[0].quebrar()

    await expect(miniatura).rejects.toEqual({ motivo: 'falha_do_navegador' })
    proximaTarefa([paginaFalsa()])
    const b = await sessao.abrir(arquivo('b'))
    expect(workers).toHaveLength(2)
    await expect(b.miniatura(0, 160)).resolves.toBeInstanceOf(Blob)
  })
})

// O pdf.js (458 KB) e o Worker dele (1,2 MB) não podem entrar no bundle de quem não mostra página.
it('o pdf.js só chega por import() dinâmico, e o Worker dele só nasce em novo-worker-pdfjs.ts', () => {
  const pasta = __dirname
  const fontes = readdirSync(pasta).filter(
    (f) => /\.tsx?$/.test(f) && !/\.test\.|\.stories\./.test(f),
  )
  expect(fontes).toContain('renderizador.ts')
  for (const fonte of fontes) {
    const codigo = readFileSync(join(pasta, fonte), 'utf8')
    expect([
      fonte,
      /^import (?!type )[^;]*from 'pdfjs-dist/m.test(codigo),
      fonte !== 'novo-worker-pdfjs.ts' && /pdf\.worker\.min\.mjs/.test(codigo),
    ]).toEqual([fonte, false, false])
  }
})
