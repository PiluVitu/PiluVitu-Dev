import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { criarRenderizadorComPdfjs } from './renderizador'

// O pdf.js de verdade só roda no E2E (precisa de canvas e Worker de navegador). Aqui ele é um
// dublê, para conferir o que o renderizador pede a ele e como trata o que volta.
jest.mock('./novo-worker-pdfjs', () => ({ novoWorkerDoPdfjs: jest.fn() }))

const mockPdfjs = {
  getDocument: jest.fn(),
  PDFWorker: { create: jest.fn() },
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
    getViewport: jest.fn(({ scale }: { scale: number }) => ({
      width: largura * scale,
      height: altura * scale,
    })),
    render: jest.fn(({ canvas }: { canvas: HTMLCanvasElement }) => {
      canvases.push(canvas)
      return { promise: Promise.resolve() }
    }),
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
    })
    expect(new TextDecoder().decode(opcoes.data)).toBe('%PDF-1.7 conteudo')
  })

  it('devolve o número de páginas e o /Rotate de cada uma', async () => {
    prepararDocumento([
      paginaFalsa(),
      paginaFalsa({ rotate: 90 }),
      paginaFalsa({ rotate: 270 }),
    ])

    const documento = await abrir()

    expect(documento.paginas).toBe(3)
    expect(documento.rotacoes).toEqual([0, 90, 270])
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
      return { promise: new Promise<void>((r) => (terminarA = r)) }
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
