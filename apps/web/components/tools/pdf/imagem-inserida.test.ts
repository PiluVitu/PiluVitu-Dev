import { LADO_MAXIMO_DA_IMAGEM } from '@piluvitu/tools/pdf-regras'
import { orientacaoDoJpeg, prepararImagem } from './imagem-inserida'

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

// Um JPEG só com o começo: SOI, o APP1 do EXIF com a orientação e o começo dos dados.
function jpegComOrientacao(orientacao: number, ordem: 'II' | 'MM' = 'II') {
  const pequeno = ordem === 'II'
  const tiff = new DataView(new ArrayBuffer(26))
  tiff.setUint16(0, pequeno ? 0x4949 : 0x4d4d)
  tiff.setUint16(2, 42, pequeno)
  tiff.setUint32(4, 8, pequeno)
  tiff.setUint16(8, 1, pequeno)
  tiff.setUint16(10, 0x0112, pequeno)
  tiff.setUint16(12, 3, pequeno)
  tiff.setUint32(14, 1, pequeno)
  tiff.setUint16(18, orientacao, pequeno)
  const exif = [0x45, 0x78, 0x69, 0x66, 0, 0, ...new Uint8Array(tiff.buffer)]
  const tamanho = exif.length + 2
  return Uint8Array.from([
    0xff,
    0xd8,
    0xff,
    0xe1,
    tamanho >> 8,
    tamanho & 0xff,
    ...exif,
    0xff,
    0xda,
    0,
    2,
  ])
}

const JPEG_SEM_EXIF = Uint8Array.from([
  0xff, 0xd8, 0xff, 0xe0, 0, 4, 0x4a, 0x46, 0xff, 0xda,
])

// O Blob do jsdom não tem arrayBuffer().
beforeAll(() => {
  if (!Blob.prototype.arrayBuffer) {
    Blob.prototype.arrayBuffer = function (this: Blob) {
      return new Promise<ArrayBuffer>((resolver) => {
        const leitor = new FileReader()
        leitor.onload = () => resolver(leitor.result as ArrayBuffer)
        leitor.readAsArrayBuffer(this)
      })
    }
  }
})

describe('orientacaoDoJpeg', () => {
  it.each([
    [6, 'II'],
    [8, 'MM'],
    [3, 'II'],
    [1, 'MM'],
  ] as const)('lê a orientação %d do EXIF (ordem %s)', (orientacao, ordem) => {
    expect(orientacaoDoJpeg(jpegComOrientacao(orientacao, ordem))).toBe(
      orientacao,
    )
  })

  it('sem EXIF, cortado, com valor fora de 1 a 8 ou que não é JPEG: em pé (1)', () => {
    expect(orientacaoDoJpeg(JPEG_SEM_EXIF)).toBe(1)
    expect(orientacaoDoJpeg(jpegComOrientacao(6).slice(0, 20))).toBe(1)
    expect(orientacaoDoJpeg(jpegComOrientacao(9))).toBe(1)
    expect(orientacaoDoJpeg(Uint8Array.from(PNG))).toBe(1)
    expect(orientacaoDoJpeg(new Uint8Array())).toBe(1)
  })
})

describe('prepararImagem', () => {
  let bitmap: { width: number; height: number; close: jest.Mock }
  let desenhos: { largura: number; altura: number }[]
  let blobs: { tipo?: string; qualidade?: number; largura: number }[]
  let geraBlob: boolean

  beforeEach(() => {
    bitmap = { width: 800, height: 600, close: jest.fn() }
    desenhos = []
    blobs = []
    geraBlob = true
    globalThis.createImageBitmap = jest.fn(
      async () => bitmap,
    ) as unknown as typeof createImageBitmap
    HTMLCanvasElement.prototype.getContext = jest.fn(function (
      this: HTMLCanvasElement,
    ) {
      return {
        drawImage: (
          _: unknown,
          __: number,
          ___: number,
          l: number,
          a: number,
        ) => desenhos.push({ largura: l, altura: a }),
      }
    }) as unknown as HTMLCanvasElement['getContext']
    HTMLCanvasElement.prototype.toBlob = function (
      this: HTMLCanvasElement,
      aoTerminar: BlobCallback,
      tipo?: string,
      qualidade?: number,
    ) {
      blobs.push({ tipo, qualidade, largura: this.width })
      aoTerminar(geraBlob ? new Blob(['nova'], { type: tipo }) : null)
    }
  })

  const arquivo = (bytes: Uint8Array | number[], tipo = '') =>
    new Blob([Uint8Array.from(bytes)], { type: tipo })

  it('PNG pequeno entra como veio, sem desenhar de novo, e o bitmap é solto', async () => {
    const png = arquivo([...PNG, 1, 2, 3], 'image/png')
    const pronta = await prepararImagem(png)
    expect(pronta).toEqual({
      blob: png,
      largura: 800,
      altura: 600,
      reduzida: false,
    })
    expect(desenhos).toEqual([])
    expect(bitmap.close).toHaveBeenCalled()
    expect(globalThis.createImageBitmap).toHaveBeenCalledWith(png, {
      imageOrientation: 'from-image',
    })
  })

  it('o tipo vem dos bytes, não da extensão nem do type: GIF com nome de PNG é recusado sem decodificar', async () => {
    const gif = arquivo([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 'image/png')
    await expect(prepararImagem(gif)).rejects.toEqual({ motivo: 'nao_aceita' })
    expect(globalThis.createImageBitmap).not.toHaveBeenCalled()
    const svg = arquivo(
      [
        ...new TextEncoder().encode(
          '<svg xmlns="http://www.w3.org/2000/svg"/>',
        ),
      ],
      'image/svg+xml',
    )
    await expect(prepararImagem(svg)).rejects.toEqual({ motivo: 'nao_aceita' })
  })

  it('imagem que o navegador não decodifica é corrompida', async () => {
    globalThis.createImageBitmap = jest.fn(async () => {
      throw new DOMException('The source image could not be decoded.')
    }) as unknown as typeof createImageBitmap
    await expect(prepararImagem(arquivo(JPEG_SEM_EXIF))).rejects.toEqual({
      motivo: 'corrompida',
    })
  })

  it(`JPEG maior que ${LADO_MAXIMO_DA_IMAGEM} px no lado maior é reduzido, em JPEG a 0,85`, async () => {
    bitmap = { width: 4800, height: 3000, close: jest.fn() }
    const pronta = await prepararImagem(arquivo(JPEG_SEM_EXIF, 'image/jpeg'))
    expect(desenhos).toEqual([{ largura: 2400, altura: 1500 }])
    expect(blobs).toEqual([
      { tipo: 'image/jpeg', qualidade: 0.85, largura: 2400 },
    ])
    expect(pronta).toMatchObject({
      largura: 2400,
      altura: 1500,
      reduzida: true,
    })
    expect(bitmap.close).toHaveBeenCalled()
  })

  it('PNG grande continua PNG (guarda a transparência)', async () => {
    bitmap = { width: 1000, height: 6000, close: jest.fn() }
    const pronta = await prepararImagem(arquivo(PNG))
    expect(blobs).toEqual([
      { tipo: 'image/png', qualidade: undefined, largura: 400 },
    ])
    expect(pronta).toMatchObject({ largura: 400, altura: 2400, reduzida: true })
  })

  it('foto de celular com o EXIF girando é desenhada de novo em pé, mesmo pequena', async () => {
    bitmap = { width: 600, height: 800, close: jest.fn() }
    const pronta = await prepararImagem(arquivo(jpegComOrientacao(6)))
    expect(desenhos).toEqual([{ largura: 600, altura: 800 }])
    expect(pronta).toMatchObject({ largura: 600, altura: 800, reduzida: false })
    expect(pronta.blob.type).toBe('image/jpeg')
  })

  describe('com "Tirar o fundo branco" (a imagem da assinatura)', () => {
    let pixelsLidos: Uint8ClampedArray
    let pixelsPostos: Uint8ClampedArray[]

    beforeEach(() => {
      // Dois pixels: um branco (vira transparente) e um de tinta (fica).
      pixelsLidos = Uint8ClampedArray.from([
        250, 250, 250, 255, 20, 30, 120, 255,
      ])
      pixelsPostos = []
      HTMLCanvasElement.prototype.getContext = jest.fn(function (
        this: HTMLCanvasElement,
      ) {
        return {
          drawImage: (
            _: unknown,
            __: number,
            ___: number,
            l: number,
            a: number,
          ) => desenhos.push({ largura: l, altura: a }),
          getImageData: (x: number, y: number, l: number, a: number) => ({
            data: pixelsLidos,
            width: l,
            height: a,
            x,
            y,
          }),
          putImageData: (dados: { data: Uint8ClampedArray }) =>
            pixelsPostos.push(Uint8ClampedArray.from(dados.data)),
        }
      }) as unknown as HTMLCanvasElement['getContext']
    })

    it('desenha de novo mesmo pequena, e o putImageData leva o alfa novo', async () => {
      const pronta = await prepararImagem(arquivo(PNG), {
        tirarFundoBranco: true,
      })
      expect(desenhos).toEqual([{ largura: 800, altura: 600 }])
      expect(pixelsPostos).toEqual([
        Uint8ClampedArray.from([250, 250, 250, 0, 20, 30, 120, 255]),
      ])
      expect(blobs).toEqual([
        { tipo: 'image/png', qualidade: undefined, largura: 800 },
      ])
      expect(pronta).toMatchObject({
        largura: 800,
        altura: 600,
        reduzida: false,
      })
    })

    it('o JPEG sai PNG, porque o JPEG não tem transparência', async () => {
      const pronta = await prepararImagem(arquivo(JPEG_SEM_EXIF), {
        tirarFundoBranco: true,
      })
      expect(blobs).toEqual([
        { tipo: 'image/png', qualidade: undefined, largura: 800 },
      ])
      expect(pronta.blob.type).toBe('image/png')
    })

    it('a grande é reduzida e tem o fundo tirado no mesmo canvas', async () => {
      bitmap = { width: 4800, height: 1200, close: jest.fn() }
      const pronta = await prepararImagem(arquivo(JPEG_SEM_EXIF), {
        tirarFundoBranco: true,
      })
      expect(desenhos).toEqual([{ largura: 2400, altura: 600 }])
      expect(pixelsPostos).toHaveLength(1)
      expect(pronta).toMatchObject({ largura: 2400, reduzida: true })
    })

    it('sem a opção, nada muda: a pequena entra como veio', async () => {
      const png = arquivo(PNG)
      const pronta = await prepararImagem(png, { tirarFundoBranco: false })
      expect(pronta.blob).toBe(png)
      expect(pixelsPostos).toEqual([])
    })
  })

  it('se o navegador não gera a imagem nova, a falha é dele, e o bitmap é solto', async () => {
    bitmap = { width: 5000, height: 5000, close: jest.fn() }
    geraBlob = false
    await expect(prepararImagem(arquivo(PNG))).rejects.toEqual({
      motivo: 'falha_do_navegador',
    })
    expect(bitmap.close).toHaveBeenCalled()
  })
})
