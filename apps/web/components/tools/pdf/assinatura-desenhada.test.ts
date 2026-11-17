import {
  LARGURA_MAXIMA_DA_ASSINATURA,
  type PontoDoTraco,
} from '@piluvitu/tools/pdf-regras'
import { caixaDosTracos } from '@piluvitu/tools/pdf-traco'
import { desenharAssinatura } from './assinatura-desenhada'

// O jsdom não tem canvas nem Path2D: o contexto falso guarda o que a assinatura pediu para pintar.
class CaminhoFalso {
  constructor(readonly d: string) {}
}

type Pintura = {
  transformacao?: number[]
  cor?: string
  caminhos: string[]
}

let pintura: Pintura
let blobs: { tipo?: string; largura: number; altura: number }[]
let canvases: HTMLCanvasElement[]
let semContexto: boolean

beforeEach(() => {
  pintura = { caminhos: [] }
  blobs = []
  canvases = []
  semContexto = false
  globalThis.Path2D = CaminhoFalso as unknown as typeof Path2D
  const criar = document.createElement.bind(document)
  jest
    .spyOn(document, 'createElement')
    .mockImplementation((tag: string, opcoes?: ElementCreationOptions) => {
      const elemento = criar(tag, opcoes)
      if (tag === 'canvas') canvases.push(elemento as HTMLCanvasElement)
      return elemento
    })
  HTMLCanvasElement.prototype.getContext = jest.fn(() =>
    semContexto
      ? null
      : {
          setTransform: (...valores: number[]) => {
            pintura.transformacao = valores
          },
          set fillStyle(cor: string) {
            pintura.cor = cor
          },
          fill: (caminho: CaminhoFalso) => pintura.caminhos.push(caminho.d),
        },
  ) as unknown as HTMLCanvasElement['getContext']
  HTMLCanvasElement.prototype.toBlob = function (
    this: HTMLCanvasElement,
    aoTerminar: BlobCallback,
    tipo?: string,
  ) {
    blobs.push({ tipo, largura: this.width, altura: this.height })
    aoTerminar(new Blob(['png'], { type: tipo }))
  }
})

afterEach(() => jest.restoreAllMocks())

const ESTILO = { cor: '#1d4ed8', espessura: 4 }

const curto: PontoDoTraco[] = [
  [100, 120],
  [130, 100],
  [160, 130],
]
const outro: PontoDoTraco[] = [
  [170, 110],
  [190, 140],
]

it('recorta no traço: o canvas tem o tamanho da caixa dos traços vezes a escala, e o desenho vai para a origem', async () => {
  const recorte = caixaDosTracos([curto, outro], ESTILO.espessura)!
  const pronta = await desenharAssinatura([curto, outro], ESTILO)

  // Até 4 pixels por unidade do quadro.
  expect(pronta.largura).toBe(Math.floor(recorte.largura * 4))
  expect(pronta.altura).toBe(Math.floor(recorte.altura * 4))
  expect(pintura.transformacao).toEqual([
    4,
    0,
    0,
    4,
    -recorte.x * 4,
    -recorte.y * 4,
  ])
  expect(pronta.reduzida).toBe(false)
})

it(`a assinatura larga é reduzida a no máximo ${LARGURA_MAXIMA_DA_ASSINATURA} px de largura`, async () => {
  const pronta = await desenharAssinatura(
    [
      [
        [5, 100],
        [300, 60],
        [595, 140],
      ],
    ],
    ESTILO,
  )
  expect(pronta.largura).toBeLessThanOrEqual(LARGURA_MAXIMA_DA_ASSINATURA)
  expect(pronta.largura).toBeGreaterThan(LARGURA_MAXIMA_DA_ASSINATURA - 5)
})

it('um preenchimento por traço, na cor escolhida, e sai PNG (com o fundo transparente do canvas)', async () => {
  const pronta = await desenharAssinatura([curto, outro], ESTILO)
  expect(pintura.caminhos).toHaveLength(2)
  for (const caminho of pintura.caminhos) expect(caminho).toMatch(/^M .* Z$/)
  expect(pintura.cor).toBe('#1d4ed8')
  expect(blobs).toEqual([
    { tipo: 'image/png', largura: pronta.largura, altura: pronta.altura },
  ])
  expect(pronta.blob.type).toBe('image/png')
})

it('o canvas é solto depois de virar PNG, e também quando falha', async () => {
  await desenharAssinatura([curto], ESTILO)
  expect(canvases).toHaveLength(1)
  expect(canvases[0].width).toBe(0)
  expect(canvases[0].height).toBe(0)

  semContexto = true
  await expect(desenharAssinatura([curto], ESTILO)).rejects.toEqual({
    motivo: 'falha_do_navegador',
  })
  expect(canvases[1].width).toBe(0)
})

it('sem traço não há assinatura', async () => {
  await expect(desenharAssinatura([], ESTILO)).rejects.toThrow(RangeError)
  await expect(desenharAssinatura([[]], ESTILO)).rejects.toThrow(RangeError)
  expect(canvases).toHaveLength(0)
})
