import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  type PDFObject,
  PDFRawStream,
  PDFRef,
  PDFString,
  StandardFonts,
  concatTransformationMatrix,
  decodePDFRawStream,
  degrees,
  drawObject,
} from 'pdf-lib'
import {
  ErroDePdf,
  ErroNaEdicao,
  aplicarEdicoes,
  contarPaginas,
  mesclarPdfs,
  organizarPaginas,
  temCabecalhoDePdf,
  type EdicaoDaPagina,
} from './pdf'
import { lerComPdfjs } from './pdf.leitor-pdfjs.cjs'
import {
  FAMILIAS_DE_FONTE,
  METRICAS_DAS_FONTES,
  apagar,
  extrair,
  geometriaDaVista,
  girar,
  linhaEntre,
  moverSelecionadas,
  planoInicial,
  tamanhoNaTela,
  tracoDosPontos,
  type ObjetoDaPagina,
  type ObjetoTexto,
  type PaginaDoPlano,
} from './pdf-regras'

// Cada página sai com um lado diferente (base + índice): é o que permite conferir a ordem no PDF final.
async function gerarPdf(paginas: number, base: number): Promise<Uint8Array> {
  const documento = await PDFDocument.create()
  for (let i = 0; i < paginas; i++) documento.addPage([base + i, base + i])
  return documento.save()
}

async function ladosDasPaginas(bytes: Uint8Array): Promise<number[]> {
  const documento = await PDFDocument.load(bytes)
  return documento.getPages().map((p) => p.getWidth())
}

async function rotacoesDasPaginas(bytes: Uint8Array): Promise<number[]> {
  const documento = await PDFDocument.load(bytes)
  return documento.getPages().map((p) => p.getRotation().angle)
}

// Para achar no arquivo um texto que está num content stream sem compressão.
const comoTexto = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => String.fromCharCode(b)).join('')

// Um PDF com 10 páginas que mostram a mesma imagem de 300 KB (um só objeto).
async function gerarPdfComImagemCompartilhada(): Promise<Uint8Array> {
  const documento = await PDFDocument.create()
  const imagem = documento.context.register(
    documento.context.stream(new Uint8Array(300_000).fill(7), {
      Type: 'XObject',
      Subtype: 'Image',
      Width: 100,
      Height: 1000,
      ColorSpace: 'DeviceRGB',
      BitsPerComponent: 8,
    }),
  )
  for (let i = 0; i < 10; i++) {
    documento.addPage([100, 100]).node.setXObject(PDFName.of('Im0'), imagem)
  }
  return documento.save()
}

// Um PDF que declara criptografia no trailer: é o que o leitor confere para recusar o arquivo.
async function gerarPdfProtegido(objectStreams: boolean): Promise<Uint8Array> {
  const documento = await PDFDocument.load(await gerarPdf(2, 100))
  documento.context.trailerInfo.Encrypt = documento.context.register(
    documento.context.obj({ Filter: 'Standard', V: 1, R: 2, P: -4 }),
  )
  return documento.save({ useObjectStreams: objectStreams })
}

const texto = (s: string) => new TextEncoder().encode(s)

async function motivo(promessa: Promise<unknown>) {
  try {
    await promessa
  } catch (erro) {
    if (erro instanceof ErroDePdf)
      return { motivo: erro.motivo, indice: erro.indice }
    throw erro
  }
  throw new Error('era para ter falhado')
}

beforeEach(() => {
  // O parser do pdf-lib escreve no console a cada objeto inválido que pula.
  jest.spyOn(console, 'log').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => jest.restoreAllMocks())

describe('temCabecalhoDePdf', () => {
  it('acha o %PDF- no começo', () => {
    expect(temCabecalhoDePdf(texto('%PDF-1.7\n'))).toBe(true)
  })

  it('aceita lixo antes do cabeçalho dentro dos primeiros 1024 bytes', () => {
    const bytes = new Uint8Array(1024)
    bytes.set(texto('%PDF-'), 1019)
    expect(temCabecalhoDePdf(bytes)).toBe(true)
  })

  it('recusa o cabeçalho que começa depois do byte 1024', () => {
    const bytes = new Uint8Array(2048)
    bytes.set(texto('%PDF-'), 1020)
    expect(temCabecalhoDePdf(bytes)).toBe(false)
  })

  it('recusa arquivo vazio e arquivo de outro tipo', () => {
    expect(temCabecalhoDePdf(new Uint8Array())).toBe(false)
    expect(
      temCabecalhoDePdf(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])),
    ).toBe(false)
  })
})

describe('contarPaginas', () => {
  it('conta as páginas de um PDF válido', async () => {
    expect(await contarPaginas(await gerarPdf(3, 100))).toBe(3)
  })

  it.each([
    ['texto puro', texto('isso não é um PDF')],
    ['arquivo vazio', new Uint8Array()],
    ['PNG', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
  ])('%s: nao_e_pdf', async (_nome, bytes) => {
    expect(await motivo(contarPaginas(bytes))).toEqual({
      motivo: 'nao_e_pdf',
      indice: undefined,
    })
  })

  it.each([
    ['tabela de xref', false],
    ['object streams', true],
  ])('PDF criptografado (%s): protegido', async (_nome, objectStreams) => {
    const bytes = await gerarPdfProtegido(objectStreams)
    expect((await motivo(contarPaginas(bytes))).motivo).toBe('protegido')
  })

  it('PDF que o parser não lê mas declara /Encrypt: protegido, não corrompido', async () => {
    const bytes = texto(
      '%PDF-1.7\n1 0 obj lixo\ntrailer << /Encrypt 9 0 R >>\n',
    )
    expect((await motivo(contarPaginas(bytes))).motivo).toBe('protegido')
  })

  it('cabeçalho de PDF seguido de lixo: corrompido', async () => {
    const bytes = texto('%PDF-1.7\nlixo lixo lixo\n%%EOF\n')
    expect((await motivo(contarPaginas(bytes))).motivo).toBe('corrompido')
  })

  it('PDF cortado na metade: corrompido', async () => {
    const inteiro = await gerarPdf(3, 100)
    const bytes = inteiro.slice(0, Math.floor(inteiro.length / 2))
    expect((await motivo(contarPaginas(bytes))).motivo).toBe('corrompido')
  })

  it('PDF com o miolo sobrescrito: corrompido', async () => {
    const bytes = (await gerarPdf(3, 100)).slice()
    bytes.fill(0x41, 100, bytes.length - 100)
    expect((await motivo(contarPaginas(bytes))).motivo).toBe('corrompido')
  })

  it('PDF válido sem nenhuma página: sem_paginas', async () => {
    const bytes = await (
      await PDFDocument.create()
    ).save({ addDefaultPage: false })
    expect((await motivo(contarPaginas(bytes))).motivo).toBe('sem_paginas')
  })
})

describe('mesclarPdfs', () => {
  it('junta as páginas na ordem dos arquivos', async () => {
    const a = await gerarPdf(2, 100)
    const b = await gerarPdf(3, 200)
    const c = await gerarPdf(1, 300)

    const final = await mesclarPdfs([a, b, c])

    expect(await contarPaginas(final)).toBe(6)
    expect(await ladosDasPaginas(final)).toEqual([100, 101, 200, 201, 202, 300])
  })

  it('a ordem da lista manda: invertida, as páginas saem invertidas por arquivo', async () => {
    const a = await gerarPdf(2, 100)
    const b = await gerarPdf(2, 200)

    const final = await mesclarPdfs([b, a])

    expect(await ladosDasPaginas(final)).toEqual([200, 201, 100, 101])
  })

  it('o PDF final abre sem senha e não carrega a marca de criptografia', async () => {
    const final = await mesclarPdfs([
      await gerarPdf(1, 100),
      await gerarPdf(1, 200),
    ])
    const documento = await PDFDocument.load(final)
    expect(documento.isEncrypted).toBe(false)
  })

  it('diz qual arquivo falhou e por quê', async () => {
    const valido = await gerarPdf(1, 100)
    const protegido = await gerarPdfProtegido(false)

    expect(await motivo(mesclarPdfs([valido, protegido, valido]))).toEqual({
      motivo: 'protegido',
      indice: 1,
    })
    expect(
      await motivo(mesclarPdfs([valido, valido, texto('não é PDF')])),
    ).toEqual({ motivo: 'nao_e_pdf', indice: 2 })
  })

  it('lê as fontes preguiçosas uma de cada vez, na ordem, e avisa cada etapa', async () => {
    const lidas: string[] = []
    const etapas: unknown[] = []
    const fonte = (nome: string, base: number) => async () => {
      lidas.push(nome)
      return gerarPdf(1, base)
    }

    const final = await mesclarPdfs(
      [fonte('a', 100), fonte('b', 200)],
      (etapa) => etapas.push({ ...etapa, lidasAteAqui: lidas.length }),
    )

    expect(lidas).toEqual(['a', 'b'])
    expect(etapas).toEqual([
      { arquivo: 0, lidasAteAqui: 0 },
      { arquivo: 1, lidasAteAqui: 1 },
      { salvando: true, lidasAteAqui: 2 },
    ])
    expect(await ladosDasPaginas(final)).toEqual([100, 200])
  })

  it('para no primeiro arquivo com erro, sem ler os seguintes nem salvar', async () => {
    const etapas: unknown[] = []
    const depois = jest.fn(async () => gerarPdf(1, 300))

    const falha = await motivo(
      mesclarPdfs([await gerarPdf(1, 100), texto('nada'), depois], (etapa) =>
        etapas.push(etapa),
      ),
    )

    expect(falha).toEqual({ motivo: 'nao_e_pdf', indice: 1 })
    expect(depois).not.toHaveBeenCalled()
    expect(etapas).toEqual([{ arquivo: 0 }, { arquivo: 1 }])
  })

  it('não duplica a imagem que várias páginas do mesmo arquivo compartilham', async () => {
    const origem = await gerarPdfComImagemCompartilhada()

    const final = await mesclarPdfs([origem, await gerarPdf(1, 100)])

    expect(final.length).toBeLessThan(origem.length * 1.5)
  })
})

describe('organizarPaginas', () => {
  const plano = (...itens: [number, PaginaDoPlano['giro']?][]) =>
    itens.map(([indice, giro = 0]) => ({ indice, giro }))

  it('monta as páginas na ordem do plano', async () => {
    const final = await organizarPaginas(
      await gerarPdf(4, 100),
      plano([3], [0], [2], [1]),
    )

    expect(await ladosDasPaginas(final)).toEqual([103, 100, 102, 101])
    expect(await rotacoesDasPaginas(final)).toEqual([0, 0, 0, 0])
  })

  it('soma o giro à rotação que a página já tinha e dá a volta em 360', async () => {
    const documento = await PDFDocument.load(await gerarPdf(3, 100))
    documento.getPage(0).setRotation(degrees(90))
    documento.getPage(1).setRotation(degrees(270))
    const bytes = await documento.save()

    const final = await organizarPaginas(bytes, plano([0, 90], [1, 180], [2]))

    expect(await rotacoesDasPaginas(final)).toEqual([180, 90, 0])
  })

  it('a rotação herdada da árvore de páginas também conta', async () => {
    const documento = await PDFDocument.load(await gerarPdf(2, 100))
    documento.catalog.Pages().set(PDFName.of('Rotate'), PDFNumber.of(90))
    const bytes = await documento.save()

    const final = await organizarPaginas(bytes, plano([1, 90], [0]))

    expect(await rotacoesDasPaginas(final)).toEqual([180, 90])
  })

  it('/Rotate fora do padrão: negativo e acima de 360 normalizam; o que não é múltiplo de 90 vale 0, como no pdf.js', async () => {
    const documento = await PDFDocument.load(await gerarPdf(4, 100))
    const valores = [
      PDFNumber.of(-90),
      PDFNumber.of(450),
      PDFNumber.of(45),
      PDFName.of('Noventa'),
    ]
    valores.forEach((valor, i) =>
      documento.getPage(i).node.set(PDFName.of('Rotate'), valor),
    )
    const bytes = await documento.save()

    const final = await organizarPaginas(
      bytes,
      plano([0], [1], [2, 90], [3, 90]),
    )

    expect(await rotacoesDasPaginas(final)).toEqual([270, 90, 90, 90])
  })

  it('girar à esquerda a partir de 0 sai com /Rotate 270 no PDF', async () => {
    const final = await organizarPaginas(
      await gerarPdf(2, 100),
      girar(planoInicial(2), [0], 'esquerda'),
    )

    expect(await rotacoesDasPaginas(final)).toEqual([270, 0])
  })

  it('apagar: a página fora do plano não vai para o arquivo', async () => {
    const final = await organizarPaginas(
      await gerarPdf(3, 100),
      apagar(planoInicial(3), [1]),
    )

    expect(await contarPaginas(final)).toBe(2)
    expect(await ladosDasPaginas(final)).toEqual([100, 102])
  })

  it('extrair: só as escolhidas, na ordem em que estão no plano e com o giro', async () => {
    const organizado = girar(
      moverSelecionadas(planoInicial(4), [3], 'antes'),
      [2],
      'direita',
    )

    const final = await organizarPaginas(
      await gerarPdf(4, 100),
      extrair(organizado, [0, 2]),
    )

    expect(await ladosDasPaginas(final)).toEqual([100, 103])
    expect(await rotacoesDasPaginas(final)).toEqual([0, 90])
  })

  it('o conteúdo de uma página apagada não vai junto por um link interno que apontava para ela', async () => {
    const documento = await PDFDocument.create()
    const paginas = [0, 1, 2].map((i) => documento.addPage([100 + i, 100 + i]))
    paginas[2].node.set(
      PDFName.of('Contents'),
      documento.context.register(
        documento.context.stream('BT (SEGREDO-DA-PAGINA-3) Tj ET'),
      ),
    )
    const link = documento.context.register(
      documento.context.obj({
        Type: 'Annot',
        Subtype: 'Link',
        Rect: [0, 0, 10, 10],
        Dest: [paginas[2].ref, 'Fit'],
      }),
    )
    paginas[0].node.set(PDFName.of('Annots'), documento.context.obj([link]))
    const bytes = await documento.save()
    expect(comoTexto(bytes)).toContain('SEGREDO-DA-PAGINA-3')

    const semAPagina3 = await organizarPaginas(bytes, plano([0], [1]))
    const comAPagina3 = await organizarPaginas(bytes, plano([2], [0]))

    expect(comoTexto(semAPagina3)).not.toContain('SEGREDO-DA-PAGINA-3')
    expect(await ladosDasPaginas(semAPagina3)).toEqual([100, 101])
    expect(comoTexto(comAPagina3)).toContain('SEGREDO-DA-PAGINA-3')
    expect(await ladosDasPaginas(comAPagina3)).toEqual([102, 100])
  })

  it('PDF que repete a mesma página no /Kids: apagar a repetida não esvazia a que fica', async () => {
    const documento = await PDFDocument.load(await gerarPdf(2, 100))
    const arvore = documento.catalog.Pages()
    arvore.Kids().push(documento.getPage(0).ref)
    arvore.set(PDFName.of('Count'), PDFNumber.of(3))
    const bytes = await documento.save()
    expect(await contarPaginas(bytes)).toBe(3)

    const final = await organizarPaginas(bytes, plano([0], [1]))

    expect(await ladosDasPaginas(final)).toEqual([100, 101])
  })

  it('não duplica a imagem que as páginas compartilham, nem reordenadas e com páginas a menos', async () => {
    const origem = await gerarPdfComImagemCompartilhada()
    const organizado = apagar(
      moverSelecionadas(planoInicial(10), [9], 'antes'),
      [0, 5],
    )

    const final = await organizarPaginas(origem, organizado)

    expect(await contarPaginas(final)).toBe(8)
    expect(final.length).toBeLessThan(origem.length * 1.5)
  })

  it('o PDF novo não ganha os metadados do pdf-lib', async () => {
    const final = await organizarPaginas(await gerarPdf(2, 100), plano([1]))
    const documento = await PDFDocument.load(final, { updateMetadata: false })

    expect(documento.getProducer()).toBeUndefined()
    expect(documento.getCreator()).toBeUndefined()
    expect(documento.getCreationDate()).toBeUndefined()
  })

  it('plano vazio: RangeError', async () => {
    await expect(organizarPaginas(await gerarPdf(2, 100), [])).rejects.toThrow(
      RangeError,
    )
  })

  it.each([
    ['depois da última página', 3],
    ['negativo', -1],
    ['não inteiro', 1.5],
    ['NaN', Number.NaN],
  ])('índice %s: RangeError', async (_nome, indice) => {
    await expect(
      organizarPaginas(await gerarPdf(3, 100), plano([0], [indice])),
    ).rejects.toThrow(RangeError)
  })

  it('índice repetido: RangeError', async () => {
    await expect(
      organizarPaginas(await gerarPdf(3, 100), plano([0], [2], [0])),
    ).rejects.toThrow(RangeError)
  })

  it.each([45, 360, -90])('giro %p: RangeError', async (giro) => {
    const invalido = [{ indice: 0, giro }] as unknown as PaginaDoPlano[]
    await expect(
      organizarPaginas(await gerarPdf(1, 100), invalido),
    ).rejects.toThrow(RangeError)
  })

  it.each([
    ['tabela de xref', false],
    ['object streams', true],
  ])(
    'PDF protegido (%s): recusado como protegido',
    async (_nome, objectStreams) => {
      const bytes = await gerarPdfProtegido(objectStreams)
      expect(await motivo(organizarPaginas(bytes, plano([0])))).toEqual({
        motivo: 'protegido',
        indice: undefined,
      })
    },
  )

  it('arquivo que não é PDF ou corrompido: mesmas regras do contarPaginas', async () => {
    expect(
      (await motivo(organizarPaginas(texto('não é PDF'), plano([0])))).motivo,
    ).toBe('nao_e_pdf')
    expect(
      (
        await motivo(
          organizarPaginas(texto('%PDF-1.7\nlixo lixo\n%%EOF\n'), plano([0])),
        )
      ).motivo,
    ).toBe('corrompido')
  })
})

// Fase 3: desenhar por cima da página (aplicarEdicoes).

const deBase64 = (texto: string) =>
  Uint8Array.from(atob(texto), (caractere) => caractere.charCodeAt(0))

// PNG 2×2 com transparência e JPEG 8×8, gerados para o teste (o PNG à mão com zlib, o JPEG pelo sips
// do macOS, sem os segmentos EXIF e Photoshop).
const PNG_2X2 = deBase64(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR42mP4z8DwHwgbGIA0CDAAAEPTCHl4ziHMAAAAAElFTkSuQmCC',
)
const JPEG_8X8 = deBase64(
  '/9j/4AAQSkZJRgABAQAASABIAAD/wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9sAQwAEBAQEBAQGBAQGCQYGBgkMCQkJCQwPDAwMDAwPEg8PDw8PDxISEhISEhISFRUVFRUVGRkZGRkcHBwcHBwcHBwc/9sAQwEEBQUHBwcMBwcMHRQQFB0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0d/90ABAAB/9oADAMBAAIRAxEAPwC38L9P/wBTx6V73/Z/tXjnwv8A+WP4V73XBnvCeWfXJ/uz7LiWvP8AtCep/9k=',
)

let proximoId = 0
const id = () => `obj-${proximoId++}`

function objetoTexto(extra: Partial<ObjetoTexto> = {}): ObjetoTexto {
  return {
    id: id(),
    tipo: 'texto',
    x: 40,
    y: 60,
    largura: 100,
    altura: 20,
    conteudo: 'Olá, ação',
    fonte: 'helvetica',
    negrito: false,
    italico: false,
    tamanho: 20,
    cor: '#000000',
    ...extra,
  }
}

// Um de cada tipo, em coordenadas da tela, todos dentro de 380×380 para caber em qualquer formato abaixo.
function umDeCada(): ObjetoDaPagina[] {
  return [
    objetoTexto(),
    {
      id: id(),
      tipo: 'retangulo',
      x: 100,
      y: 150,
      largura: 80,
      altura: 40,
      espessura: 2,
      cor: '#ff0000',
    },
    {
      id: id(),
      tipo: 'elipse',
      x: 200,
      y: 150,
      largura: 60,
      altura: 30,
      espessura: 2,
      cor: '#0000ff',
    },
    {
      id: id(),
      tipo: 'linha',
      ...linhaEntre({ x: 30, y: 300 }, { x: 130, y: 260 }),
      espessura: 3,
      cor: '#00ff00',
    },
    {
      id: id(),
      tipo: 'seta',
      ...linhaEntre({ x: 150, y: 300 }, { x: 250, y: 300 }),
      espessura: 2,
      cor: '#000000',
    },
    {
      id: id(),
      tipo: 'imagem',
      x: 260,
      y: 200,
      largura: 50,
      altura: 40,
      bytes: PNG_2X2,
    },
    {
      id: id(),
      tipo: 'marca-texto',
      x: 40,
      y: 90,
      largura: 120,
      altura: 20,
      cor: '#ffff00',
    },
    { id: id(), tipo: 'cobrir', x: 300, y: 300, largura: 50, altura: 30 },
    {
      id: id(),
      tipo: 'traco',
      ...tracoDosPontos([
        [40, 330],
        [55, 350],
        [70, 330],
        [85, 350],
      ]),
      espessura: 4,
      cor: '#123456',
    },
  ]
}

type Formato = {
  nome: string
  rotacao: number
  midia: [number, number, number, number]
  corte?: [number, number, number, number]
  unidade?: number
  vista: number[]
}

const FORMATOS: Formato[] = [
  {
    nome: 'sem rotação',
    rotacao: 0,
    midia: [0, 0, 600, 800],
    vista: [0, 0, 600, 800],
  },
  {
    nome: '/Rotate 90 com CropBox deslocado',
    rotacao: 90,
    midia: [0, 0, 600, 800],
    corte: [50, 100, 400, 600],
    vista: [50, 100, 450, 700],
  },
  {
    nome: '/Rotate 180 com MediaBox fora do zero',
    rotacao: 180,
    midia: [-100, -50, 600, 800],
    vista: [-100, -50, 500, 750],
  },
  {
    nome: '/Rotate 270 com CropBox deslocado',
    rotacao: 270,
    midia: [0, 0, 600, 800],
    corte: [50, 100, 400, 600],
    vista: [50, 100, 450, 700],
  },
  {
    // Passa pelo canto superior esquerdo, que é a origem da tela: sem o recorte, tudo andaria.
    nome: 'CropBox que passa da MediaBox, com /UserUnit 2',
    rotacao: 0,
    midia: [0, 0, 300, 400],
    corte: [-50, 30, 300, 450],
    unidade: 2,
    vista: [0, 30, 250, 400],
  },
]

async function gerarPdfComFormatos(
  formatos: readonly Formato[],
): Promise<Uint8Array> {
  const documento = await PDFDocument.create()
  for (const formato of formatos) {
    const pagina = documento.addPage()
    pagina.setMediaBox(...formato.midia)
    if (formato.corte) pagina.setCropBox(...formato.corte)
    pagina.setRotation(degrees(formato.rotacao))
    if (formato.unidade) {
      pagina.node.set(PDFName.of('UserUnit'), PDFNumber.of(formato.unidade))
    }
  }
  return documento.save()
}

type Desenho = ReturnType<
  typeof lerComPdfjs
>['paginas'][number]['desenhos'][number]
type Caminho = Extract<Desenho, { tipo: 'caminho' }>

const caixaPerto = (
  caixa: readonly number[],
  esperada: readonly number[],
  margem = 0.02,
) => caixa.every((valor, i) => Math.abs(valor - esperada[i]) <= margem)

function acharDesenho(
  desenhos: readonly Desenho[],
  caixa: readonly number[],
  tipo: Desenho['tipo'] = 'caminho',
): Desenho & Partial<Omit<Caminho, 'tipo'>> {
  const achado = desenhos.find(
    (d) => d.tipo === tipo && caixaPerto(d.caixa, caixa),
  )
  if (!achado) {
    throw new Error(
      `nenhum ${tipo} em ${caixa.join(' ')}; desenhos: ${JSON.stringify(desenhos.map((d) => d.caixa))}`,
    )
  }
  return achado
}

// Tudo o que o arquivo guarda, com os streams descomprimidos: é onde o conteúdo antigo apareceria.
async function todoOConteudo(bytes: Uint8Array): Promise<string> {
  const documento = await PDFDocument.load(bytes, { updateMetadata: false })
  const partes = [documento.context.trailerInfo.Info?.toString() ?? '']
  for (const [, objeto] of documento.context.enumerateIndirectObjects()) {
    partes.push(objeto.toString())
    if (objeto instanceof PDFRawStream) {
      let dados: Uint8Array
      try {
        dados = decodePDFRawStream(objeto).decode()
      } catch {
        dados = objeto.contents
      }
      partes.push(comoTexto(dados))
    }
  }
  return partes.join('\n')
}

// O pdf-lib escreve o texto do drawText em hexadecimal (<5345...>); a busca olha os dois jeitos.
const emHexa = (s: string) =>
  Array.from(s, (c) => c.charCodeAt(0).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()

const contem = (conteudo: string, trecho: string) =>
  conteudo.includes(trecho) || conteudo.toUpperCase().includes(emHexa(trecho))

async function erroNaEdicao(promessa: Promise<unknown>): Promise<ErroNaEdicao> {
  try {
    await promessa
  } catch (erro) {
    if (erro instanceof ErroNaEdicao) return erro
    throw erro
  }
  throw new Error('era para ter falhado')
}

describe('aplicarEdicoes: posição conferida pelo pdf.js', () => {
  // Uma leitura só pelo pdf.js (um processo do Node) para os cinco formatos.
  let leitura: ReturnType<typeof lerComPdfjs>

  beforeAll(async () => {
    const pdf = await gerarPdfComFormatos(FORMATOS)
    const editado = await aplicarEdicoes(
      pdf,
      FORMATOS.map((_, indice) => ({ indice, objetos: umDeCada() })),
    )
    leitura = lerComPdfjs(editado)
  })

  describe.each(
    FORMATOS.map((formato, indice) => [formato.nome, formato, indice] as const),
  )('%s', (_, formato, indice) => {
    const pagina = () => leitura.paginas[indice]

    it('a geometria da página bate com a vista do pdf.js', () => {
      const { view, rotate, userUnit, largura, altura } = pagina()
      expect(view).toEqual(formato.vista)
      expect(rotate).toBe(formato.rotacao)
      expect(tamanhoNaTela(geometriaDaVista(view, rotate, userUnit))).toEqual({
        largura: expect.closeTo(largura, 6),
        altura: expect.closeTo(altura, 6),
      })
    })

    it('o texto fica com a linha de base onde a tela pôs, de pé', () => {
      const texto = pagina().textos.find(({ str }) => str === 'Olá, ação')
      expect(texto).toBeDefined()
      const [a, b, c, d, e, f] = texto!.matriz
      expect(a).toBeCloseTo(20, 4)
      expect(b).toBeCloseTo(0, 4)
      expect(c).toBeCloseTo(0, 4)
      expect(d).toBeCloseTo(-20, 4)
      expect(e).toBeCloseTo(40, 2)
      expect(f).toBeCloseTo(
        60 + 20 * METRICAS_DAS_FONTES.helvetica.ascendente,
        2,
      )
    })

    it('retângulo, elipse e linha ficam nas caixas da tela, com contorno', () => {
      const { desenhos } = pagina()
      expect(acharDesenho(desenhos, [100, 150, 180, 190])).toMatchObject({
        operacao: 'stroke',
        contorno: '#ff0000',
      })
      expect(acharDesenho(desenhos, [200, 150, 260, 180])).toMatchObject({
        operacao: 'stroke',
        contorno: '#0000ff',
      })
      expect(acharDesenho(desenhos, [30, 260, 130, 300])).toMatchObject({
        operacao: 'stroke',
        contorno: '#00ff00',
      })
    })

    it('a seta tem a haste até a base da ponta e a ponta preenchida no fim', () => {
      const { desenhos } = pagina()
      expect(acharDesenho(desenhos, [150, 300, 242, 300]).operacao).toBe(
        'stroke',
      )
      expect(acharDesenho(desenhos, [242, 296, 250, 304]).operacao).toBe('fill')
    })

    it('a imagem ocupa a caixa dela', () => {
      acharDesenho(pagina().desenhos, [260, 200, 310, 240], 'imagem')
    })

    it('o marca-texto é um retângulo preenchido, com opacidade 0,35 e multiplicar', () => {
      expect(acharDesenho(pagina().desenhos, [40, 90, 160, 110])).toMatchObject(
        {
          operacao: 'fill',
          preenchimento: '#ffff00',
          opacidade: 0.35,
          mistura: 'multiply',
        },
      )
    })

    it('cobrir é um retângulo branco preenchido', () => {
      expect(
        acharDesenho(pagina().desenhos, [300, 300, 350, 330]),
      ).toMatchObject({
        operacao: 'fill',
        preenchimento: '#ffffff',
        opacidade: 1,
      })
    })

    it('o traço vira um caminho preenchido em volta dos pontos', () => {
      const traco = pagina().desenhos.find(
        (d) => d.tipo === 'caminho' && d.preenchimento === '#123456',
      )
      expect(traco).toMatchObject({ operacao: 'fill' })
      const [x1, y1, x2, y2] = traco!.caixa
      expect(x1).toBeGreaterThanOrEqual(40 - 4)
      expect(x1).toBeLessThan(45)
      expect(x2).toBeGreaterThan(80)
      expect(x2).toBeLessThanOrEqual(85 + 4)
      expect(y1).toBeGreaterThanOrEqual(330 - 4)
      expect(y2).toBeLessThanOrEqual(350 + 4)
    })
  })
})

it('rotação e caixas herdadas da árvore de páginas contam, como no pdf.js', async () => {
  const documento = await PDFDocument.create()
  const pagina = documento.addPage()
  pagina.node.delete(PDFName.MediaBox)
  pagina.node.delete(PDFName.of('Rotate'))
  const arvore = documento.catalog.Pages()
  arvore.set(PDFName.MediaBox, documento.context.obj([0, 0, 600, 800]))
  arvore.set(PDFName.of('CropBox'), documento.context.obj([50, 100, 450, 700]))
  arvore.set(PDFName.of('Rotate'), PDFNumber.of(270))
  const editado = await aplicarEdicoes(await documento.save(), [
    { indice: 0, objetos: [objetoTexto()] },
  ])
  const [lida] = lerComPdfjs(editado).paginas
  expect([lida.rotate, lida.view]).toEqual([270, [50, 100, 450, 700]])
  const [{ matriz }] = lida.textos
  expect(matriz[4]).toBeCloseTo(40, 2)
  expect(matriz[5]).toBeCloseTo(60 + 20 * 0.718, 2)
})

describe('aplicarEdicoes: texto', () => {
  it('escreve nas 12 fontes padrão (3 famílias, negrito e itálico)', async () => {
    const variantes = FAMILIAS_DE_FONTE.flatMap((fonte) =>
      [false, true].flatMap((negrito) =>
        [false, true].map((italico) => ({ fonte, negrito, italico })),
      ),
    )
    const objetos = variantes.map((variante, i) =>
      objetoTexto({ ...variante, y: 20 + i * 25, conteudo: `Fonte ${i}` }),
    )
    const editado = await aplicarEdicoes(await gerarPdf(1, 600), [
      { indice: 0, objetos },
    ])
    const documento = await PDFDocument.load(editado)
    const recursos = documento.getPage(0).node.Resources()!
    const fontes = recursos.lookup(PDFName.of('Font'), PDFDict)
    const nomes = fontes
      .values()
      .map((ref) =>
        documento.context
          .lookup(ref, PDFDict)
          .get(PDFName.of('BaseFont'))!
          .toString(),
      )
    expect(nomes.sort()).toEqual(
      [
        '/Courier',
        '/Courier-Bold',
        '/Courier-BoldOblique',
        '/Courier-Oblique',
        '/Helvetica',
        '/Helvetica-Bold',
        '/Helvetica-BoldOblique',
        '/Helvetica-Oblique',
        '/Times-Bold',
        '/Times-BoldItalic',
        '/Times-Italic',
        '/Times-Roman',
      ].sort(),
    )
    const lidos = lerComPdfjs(editado).paginas[0].textos.map(({ str }) => str)
    expect(lidos).toEqual(objetos.map(({ conteudo }) => conteudo))
  })

  it('as métricas de pdf-regras são as do pdf-lib, nas 12 fontes', async () => {
    const documento = await PDFDocument.create()
    const familias = {
      helvetica: [
        'Helvetica',
        'HelveticaBold',
        'HelveticaOblique',
        'HelveticaBoldOblique',
      ],
      times: [
        'TimesRoman',
        'TimesRomanBold',
        'TimesRomanItalic',
        'TimesRomanBoldItalic',
      ],
      courier: [
        'Courier',
        'CourierBold',
        'CourierOblique',
        'CourierBoldOblique',
      ],
    } as const
    for (const familia of FAMILIAS_DE_FONTE) {
      const { ascendente, descendente } = METRICAS_DAS_FONTES[familia]
      for (const nome of familias[familia]) {
        const fonte = documento.embedStandardFont(StandardFonts[nome])
        expect(fonte.heightAtSize(1000, { descender: false })).toBeCloseTo(
          ascendente * 1000,
        )
        expect(fonte.heightAtSize(1000)).toBeCloseTo(
          (ascendente + descendente) * 1000,
        )
      }
    }
  })

  it('o WinAnsi de pdf-regras aceita exatamente o que as fontes padrão escrevem', async () => {
    const documento = await PDFDocument.create()
    const fonte = documento.embedStandardFont(StandardFonts.Helvetica)
    const separadores = new Set([0x09, 0x0a, 0x0d, 0x85, 0x2028, 0x2029])
    const divergentes: string[] = []
    const { caracteresForaDoWinAnsi } = await import('./pdf-regras')
    for (let codigo = 0; codigo <= 0xffff; codigo++) {
      if (separadores.has(codigo)) continue
      const caractere = String.fromCodePoint(codigo)
      let escreve = true
      try {
        fonte.encodeText(caractere)
      } catch {
        escreve = false
      }
      if (escreve !== (caracteresForaDoWinAnsi(caractere).length === 0)) {
        divergentes.push(codigo.toString(16))
      }
    }
    expect(divergentes).toEqual([])
  })

  it('escreve acentos do português e do espanhol e várias linhas', async () => {
    const conteudo = 'Ação — São Paulo\n¿Qué tal, Ñandú? € 10'
    const editado = await aplicarEdicoes(await gerarPdf(1, 600), [
      { indice: 0, objetos: [objetoTexto({ conteudo, fonte: 'times' })] },
    ])
    const textos = lerComPdfjs(editado).paginas[0].textos
    expect(textos.map(({ str }) => str)).toEqual([
      'Ação — São Paulo',
      '¿Qué tal, Ñandú? € 10',
    ])
    expect(textos[1].matriz[5] - textos[0].matriz[5]).toBeCloseTo(20 * 1.2, 2)
  })

  it('texto fora do WinAnsi é recusado com a página, o objeto e os caracteres', async () => {
    const erro = await erroNaEdicao(
      aplicarEdicoes(await gerarPdf(2, 600), [
        {
          indice: 1,
          objetos: [
            objetoTexto({ conteudo: 'ok' }),
            objetoTexto({ conteudo: 'Oi 😀 中' }),
          ],
        },
      ]),
    )
    expect(erro).toMatchObject({
      motivo: 'texto_fora_do_winansi',
      pagina: 1,
      objeto: 1,
      caracteres: ['😀', '中'],
    })
    expect(erro.message).toContain('😀')
  })

  it('um cm deixado aberto pelo conteúdo da página não muda onde o objeto cai', async () => {
    const documento = await PDFDocument.create()
    const pagina = documento.addPage([600, 800])
    pagina.pushOperators(concatTransformationMatrix(2, 0, 0, 2, 30, 30))
    const editado = await aplicarEdicoes(await documento.save(), [
      { indice: 0, objetos: [objetoTexto()] },
    ])
    const [{ matriz }] = lerComPdfjs(editado).paginas[0].textos
    expect(matriz[4]).toBeCloseTo(40, 2)
    expect(matriz[5]).toBeCloseTo(60 + 20 * 0.718, 2)
  })
})

describe('aplicarEdicoes: imagem', () => {
  async function imagensDoPdf(bytes: Uint8Array) {
    const documento = await PDFDocument.load(bytes)
    return documento.context
      .enumerateIndirectObjects()
      .map(([, objeto]) => objeto)
      .filter(
        (objeto): objeto is PDFRawStream =>
          objeto instanceof PDFRawStream &&
          objeto.dict.get(PDFName.of('Subtype')) === PDFName.of('Image'),
      )
  }

  const imagem = (bytes: Uint8Array): ObjetoDaPagina => ({
    id: id(),
    tipo: 'imagem',
    x: 10,
    y: 10,
    largura: 40,
    altura: 30,
    bytes,
  })

  it('embute PNG (com a transparência numa SMask) e JPEG (DCTDecode)', async () => {
    const editado = await aplicarEdicoes(await gerarPdf(1, 600), [
      { indice: 0, objetos: [imagem(PNG_2X2), imagem(JPEG_8X8)] },
    ])
    const imagens = await imagensDoPdf(editado)
    const filtros = imagens.map((i) =>
      i.dict.get(PDFName.of('Filter'))?.toString(),
    )
    expect(filtros).toContain('/DCTDecode')
    expect(imagens.some((i) => i.dict.has(PDFName.of('SMask')))).toBe(true)
    expect(
      lerComPdfjs(editado).paginas[0].desenhos.filter(
        (d) => d.tipo === 'imagem',
      ),
    ).toHaveLength(2)
  })

  it('a mesma imagem em dois objetos entra uma vez só no arquivo', async () => {
    const editado = await aplicarEdicoes(await gerarPdf(1, 600), [
      { indice: 0, objetos: [imagem(JPEG_8X8), imagem(JPEG_8X8)] },
    ])
    expect(await imagensDoPdf(editado)).toHaveLength(1)
  })

  it.each([
    [
      'SVG',
      new TextEncoder().encode(
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      ),
    ],
    ['GIF', new TextEncoder().encode('GIF89a\u0001\u0000\u0001\u0000')],
  ])('recusa %s pelos bytes, com a página e o objeto', async (_, bytes) => {
    const erro = await erroNaEdicao(
      aplicarEdicoes(await gerarPdf(1, 600), [
        { indice: 0, objetos: [objetoTexto(), imagem(bytes)] },
      ]),
    )
    expect(erro).toMatchObject({
      motivo: 'imagem_nao_aceita',
      pagina: 0,
      objeto: 1,
    })
  })

  it('PNG que não se deixa ler é imagem corrompida', async () => {
    const quebrado = new Uint8Array([...PNG_2X2.slice(0, 8), 1, 2, 3, 4, 5])
    const erro = await erroNaEdicao(
      aplicarEdicoes(await gerarPdf(1, 600), [
        { indice: 0, objetos: [imagem(quebrado)] },
      ]),
    )
    expect(erro).toMatchObject({
      motivo: 'imagem_corrompida',
      pagina: 0,
      objeto: 0,
    })
  })
})

describe('aplicarEdicoes: o documento', () => {
  it('mantém título, formulário, marcadores e páginas sem edição', async () => {
    const documento = await PDFDocument.create({ updateMetadata: false })
    documento.setTitle('Contrato')
    documento.addPage([300, 300])
    documento.addPage([400, 400])
    const campo = documento.getForm().createTextField('nome')
    campo.setText('Paulo')
    campo.addToPage(documento.getPage(1))
    documento.catalog.set(
      PDFName.of('Outlines'),
      documento.context.register(
        documento.context.obj({ Type: 'Outlines', Count: 0 }),
      ),
    )
    const editado = await aplicarEdicoes(await documento.save(), [
      { indice: 0, objetos: [objetoTexto({ conteudo: 'Assinado' })] },
    ])
    const lido = await PDFDocument.load(editado, { updateMetadata: false })
    expect(lido.getTitle()).toBe('Contrato')
    expect(lido.getProducer()).toBe(undefined)
    expect(lido.getForm().getTextField('nome').getText()).toBe('Paulo')
    expect(lido.catalog.has(PDFName.of('Outlines'))).toBe(true)
    expect(lido.getPages().map((p) => p.getWidth())).toEqual([300, 400])
  })

  it('não leva para o arquivo novo objeto que nada usa (sobra de edições anteriores)', async () => {
    const documento = await PDFDocument.create()
    documento.addPage([300, 300])
    documento.context.register(
      documento.context.obj({ Sobra: PDFString.of('SEGREDO-SOLTO') }),
    )
    const pdf = await documento.save()
    expect(contem(await todoOConteudo(pdf), 'SEGREDO-SOLTO')).toBe(true)
    const editado = await aplicarEdicoes(pdf, [])
    expect(contem(await todoOConteudo(editado), 'SEGREDO-SOLTO')).toBe(false)
    expect(await contarPaginas(editado)).toBe(1)
  })

  it('o arquivo segue as regras de leitura do mesclar', async () => {
    expect(await motivo(aplicarEdicoes(texto('não é PDF'), []))).toEqual({
      motivo: 'nao_e_pdf',
      indice: undefined,
    })
    expect(
      await motivo(aplicarEdicoes(await gerarPdfProtegido(false), [])),
    ).toEqual({
      motivo: 'protegido',
      indice: undefined,
    })
  })

  const valido = () => objetoTexto()
  it.each<[string, EdicaoDaPagina[]]>([
    [
      'página repetida',
      [
        { indice: 0, objetos: [] },
        { indice: 0, objetos: [] },
      ],
    ],
    ['índice negativo', [{ indice: -1, objetos: [] }]],
    ['índice não inteiro', [{ indice: 0.5, objetos: [] }]],
    ['página fora do documento', [{ indice: 3, objetos: [] }]],
    ['x NaN', [{ indice: 0, objetos: [{ ...valido(), x: NaN }] }]],
    [
      'tamanho negativo',
      [{ indice: 0, objetos: [{ ...valido(), largura: -1 }] }],
    ],
    [
      'tipo desconhecido',
      [
        {
          indice: 0,
          objetos: [
            { ...valido(), tipo: 'video' } as unknown as ObjetoDaPagina,
          ],
        },
      ],
    ],
    [
      'cor inválida',
      [{ indice: 0, objetos: [{ ...valido(), cor: 'vermelho' }] }],
    ],
    [
      'fonte fora das padrão',
      [
        {
          indice: 0,
          objetos: [
            { ...valido(), fonte: 'arial' } as unknown as ObjetoDaPagina,
          ],
        },
      ],
    ],
    [
      'tamanho de fonte zero',
      [{ indice: 0, objetos: [{ ...valido(), tamanho: 0 }] }],
    ],
    [
      'linha sem canto de início',
      [
        {
          indice: 0,
          objetos: [
            {
              id: 'l',
              tipo: 'linha',
              x: 0,
              y: 0,
              largura: 1,
              altura: 1,
              espessura: 1,
              cor: '#000000',
              inicio: 'meio',
            } as unknown as ObjetoDaPagina,
          ],
        },
      ],
    ],
    [
      'espessura zero',
      [
        {
          indice: 0,
          objetos: [
            {
              id: 'r',
              tipo: 'retangulo',
              x: 0,
              y: 0,
              largura: 1,
              altura: 1,
              espessura: 0,
              cor: '#000000',
            },
          ],
        },
      ],
    ],
    [
      'traço com ponto inválido',
      [
        {
          indice: 0,
          objetos: [
            {
              id: 't',
              tipo: 'traco',
              x: 0,
              y: 0,
              largura: 1,
              altura: 1,
              espessura: 1,
              cor: '#000000',
              pontos: [[0, NaN]],
            },
          ],
        },
      ],
    ],
    [
      'imagem sem bytes',
      [
        {
          indice: 0,
          objetos: [
            {
              id: 'i',
              tipo: 'imagem',
              x: 0,
              y: 0,
              largura: 1,
              altura: 1,
              bytes: 'abc',
            } as unknown as ObjetoDaPagina,
          ],
        },
      ],
    ],
    [
      'fundo que não é bytes',
      [{ indice: 0, objetos: [], fundo: 'abc' as unknown as Uint8Array }],
    ],
  ])(
    'edição errada é erro de programação (RangeError): %s',
    async (_, edicoes) => {
      await expect(
        aplicarEdicoes(await gerarPdf(2, 100), edicoes),
      ).rejects.toThrow(RangeError)
    },
  )
})

// O arquivo de onde a página 1 vai ser apagada de verdade: o mesmo segredo em todo lugar onde um PDF
// pode guardá-lo, e o que é da página 2 (que fica) marcado à parte.
async function gerarPdfComSegredos(rotacao = 0): Promise<Uint8Array> {
  const documento = await PDFDocument.create({ updateMetadata: false })
  documento.setTitle('Título que fica')
  const { context } = documento
  const helvetica = documento.embedStandardFont(StandardFonts.Helvetica)
  const pagina1 = documento.addPage([600, 800])
  pagina1.setRotation(degrees(rotacao))
  pagina1.drawText('SEGREDO-TEXTO', {
    x: 50,
    y: 700,
    font: helvetica,
    size: 12,
  })
  const formulario = context.register(
    context.stream('BT /F1 12 Tf 50 650 Td (SEGREDO-XOBJECT) Tj ET', {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, 600, 800],
      Resources: { Font: { F1: helvetica.ref } },
    }),
  )
  pagina1.node.setXObject(PDFName.of('Fx'), formulario)
  pagina1.pushOperators(drawObject('Fx'))
  pagina1.node.set(
    PDFName.of('Thumb'),
    context.register(
      context.stream('SEGREDO-THUMB', {
        Width: 13,
        Height: 1,
        ColorSpace: 'DeviceGray',
        BitsPerComponent: 8,
      }),
    ),
  )
  pagina1.node.set(PDFName.of('StructParents'), PDFNumber.of(0))

  const pagina2 = documento.addPage([600, 800])
  pagina2.drawText('FICA-NA-PAGINA-2', {
    x: 50,
    y: 700,
    font: helvetica,
    size: 12,
  })

  const nota = context.register(
    context.obj({
      Type: 'Annot',
      Subtype: 'Text',
      Rect: [10, 10, 30, 30],
      Contents: PDFString.of('SEGREDO-NOTA'),
    }),
  )
  const campoRef = context.nextRef()
  const widget = context.register(
    context.obj({
      Type: 'Annot',
      Subtype: 'Widget',
      Rect: [100, 100, 200, 120],
      P: pagina1.ref,
      Parent: campoRef,
    }),
  )
  context.assign(
    campoRef,
    context.obj({
      FT: 'Tx',
      T: PDFString.of('cpf'),
      V: PDFString.of('SEGREDO-CAMPO'),
      Kids: [widget],
    }),
  )
  const campoUnico = context.register(
    context.obj({
      Type: 'Annot',
      Subtype: 'Widget',
      FT: 'Tx',
      T: PDFString.of('nome'),
      V: PDFString.of('SEGREDO-CAMPO-UNICO'),
      Rect: [100, 130, 200, 150],
      P: pagina1.ref,
    }),
  )
  const campoQueFicaRef = context.nextRef()
  const widgetQueFica = context.register(
    context.obj({
      Type: 'Annot',
      Subtype: 'Widget',
      Rect: [100, 100, 200, 120],
      P: pagina2.ref,
      Parent: campoQueFicaRef,
    }),
  )
  context.assign(
    campoQueFicaRef,
    context.obj({
      FT: 'Tx',
      T: PDFString.of('fica'),
      V: PDFString.of('CAMPO-QUE-FICA'),
      Kids: [widgetQueFica],
    }),
  )
  const link = context.register(
    context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [0, 0, 50, 50],
      Dest: [pagina1.ref, 'XYZ', 0, 800, 0],
    }),
  )
  pagina1.node.set(PDFName.Annots, context.obj([nota, widget, campoUnico]))
  pagina2.node.set(PDFName.Annots, context.obj([widgetQueFica, link]))
  // Formulário do LiveCycle (Receita, bancos): o XFA guarda num XML o que a pessoa digitou.
  const xml = (conteudo: string) => context.register(context.stream(conteudo))
  documento.catalog.set(
    PDFName.of('AcroForm'),
    context.obj({
      Fields: [campoRef, campoUnico, campoQueFicaRef],
      CO: [campoRef],
      XFA: [
        PDFString.of('template'),
        xml('<template><field name="cpf"/></template>'),
        PDFString.of('datasets'),
        xml('<xfa:datasets><cpf>SEGREDO-XFA</cpf></xfa:datasets>'),
      ],
    }),
  )
  documento.catalog.set(PDFName.of('NeedsRendering'), context.obj(true))

  const elemento = context.register(
    context.obj({
      Type: 'StructElem',
      S: 'P',
      Pg: pagina1.ref,
      ActualText: PDFString.of('SEGREDO-ACTUALTEXT'),
      T: PDFString.of('SEGREDO-TITULO-ELEM'),
      K: [{ Type: 'OBJR', Obj: widget, Pg: pagina1.ref }],
    }),
  )
  // O pai e o avô não têm /Pg: o que descrevem está todo na página 1, só pelos descendentes.
  const secao = context.register(
    context.obj({
      Type: 'StructElem',
      S: 'Sect',
      Alt: PDFString.of('SEGREDO-ALT-PAI'),
      T: PDFString.of('SEGREDO-T-PAI'),
      ActualText: PDFString.of('SEGREDO-ACTUALTEXT-PAI'),
      E: PDFString.of('SEGREDO-E-PAI'),
      K: [elemento, { Type: 'MCR', Pg: pagina1.ref, MCID: 0 }],
    }),
  )
  const parte = context.register(
    context.obj({
      Type: 'StructElem',
      S: 'Part',
      T: PDFString.of('SEGREDO-T-AVO'),
      K: secao,
    }),
  )
  const elementoQueFica = context.register(
    context.obj({
      Type: 'StructElem',
      S: 'P',
      Pg: pagina2.ref,
      ActualText: PDFString.of('ALT-QUE-FICA'),
    }),
  )
  // Descreve as duas páginas: fica, porque a página 2 continua.
  const misto = context.register(
    context.obj({
      Type: 'StructElem',
      S: 'Div',
      Alt: PDFString.of('ALT-MISTO-FICA'),
      K: [{ Type: 'MCR', Pg: pagina1.ref, MCID: 1 }, elementoQueFica],
    }),
  )
  documento.catalog.set(
    PDFName.of('StructTreeRoot'),
    context.register(
      context.obj({ Type: 'StructTreeRoot', K: [parte, misto] }),
    ),
  )

  // Marcadores: para a página 1 pelo destino direto, por uma ação GoTo com destino nomeado (na árvore
  // de nomes) e por um nome do /Dests antigo, este com um filho que leva à página 2.
  const raizDosMarcadores = context.nextRef()
  const [m1, m2, m3, m4, filho] = Array.from({ length: 5 }, () =>
    context.nextRef(),
  )
  const marcador = (ref: PDFRef, campos: object) =>
    context.assign(
      ref,
      context.obj({
        Parent: raizDosMarcadores,
        ...campos,
      } as Parameters<typeof context.obj>[0]),
    )
  marcador(m1, {
    Title: PDFString.of('SEGREDO-MARCADOR-DIRETO'),
    Next: m2,
    Dest: [pagina1.ref, 'XYZ', 0, 800, 0],
  })
  marcador(m2, {
    Title: PDFString.of('SEGREDO-MARCADOR-ACAO'),
    Prev: m1,
    Next: m3,
    A: { S: 'GoTo', D: PDFString.of('destino-1') },
  })
  marcador(m3, {
    Title: PDFString.of('SEGREDO-MARCADOR-PAI'),
    Prev: m2,
    Next: m4,
    Dest: 'destino-antigo',
    First: filho,
    Last: filho,
    Count: 1,
  })
  context.assign(
    filho,
    context.obj({
      Title: PDFString.of('FILHO-QUE-FICA'),
      Parent: m3,
      Dest: [pagina2.ref, 'Fit'],
    }),
  )
  marcador(m4, {
    Title: PDFString.of('MARCADOR-QUE-FICA'),
    Prev: m3,
    Dest: [pagina2.ref, 'Fit'],
  })
  context.assign(
    raizDosMarcadores,
    context.obj({ Type: 'Outlines', First: m1, Last: m4, Count: 5 }),
  )
  documento.catalog.set(PDFName.of('Outlines'), raizDosMarcadores)
  documento.catalog.set(
    PDFName.of('Names'),
    context.obj({
      Dests: { Names: [PDFString.of('destino-1'), [pagina1.ref, 'Fit']] },
    }),
  )
  documento.catalog.set(
    PDFName.of('Dests'),
    context.obj({ 'destino-antigo': { D: [pagina1.ref, 'Fit'] } }),
  )
  context.register(context.obj({ Sobra: PDFString.of('SEGREDO-SOLTO') }))
  return documento.save()
}

const SEGREDOS = [
  'SEGREDO-TEXTO',
  'SEGREDO-XOBJECT',
  'SEGREDO-THUMB',
  'SEGREDO-NOTA',
  'SEGREDO-CAMPO',
  'SEGREDO-CAMPO-UNICO',
  'SEGREDO-ACTUALTEXT',
  'SEGREDO-TITULO-ELEM',
  'SEGREDO-ALT-PAI',
  'SEGREDO-T-PAI',
  'SEGREDO-ACTUALTEXT-PAI',
  'SEGREDO-E-PAI',
  'SEGREDO-T-AVO',
  'SEGREDO-XFA',
  'SEGREDO-MARCADOR-DIRETO',
  'SEGREDO-MARCADOR-ACAO',
  'SEGREDO-MARCADOR-PAI',
  'SEGREDO-SOLTO',
]

// Os títulos dos marcadores na ordem, com o pai de cada um e o /Count de quem tem filhos.
function lerMarcadores(documento: PDFDocument) {
  const { context } = documento
  const raiz = documento.catalog.lookup(PDFName.of('Outlines'), PDFDict)
  const lidos: { titulo: string; pai: string; count?: number }[] = []
  const nome = (no: PDFDict) =>
    no === raiz
      ? 'raiz'
      : (no.lookup(PDFName.of('Title'), PDFString) as PDFString).decodeText()
  const descer = (pai: PDFDict) => {
    let ref = pai.get(PDFName.of('First'))
    let anterior: PDFObject | undefined
    while (ref) {
      const no = context.lookup(ref, PDFDict)
      expect(no.get(PDFName.of('Prev'))).toBe(anterior)
      expect(context.lookup(no.get(PDFName.of('Parent')))).toBe(pai)
      const count = no.lookupMaybe(PDFName.of('Count'), PDFNumber)?.asNumber()
      lidos.push({
        titulo: nome(no),
        pai: nome(pai),
        ...(count === undefined ? {} : { count }),
      })
      descer(no)
      if (!no.has(PDFName.of('Next'))) {
        expect(pai.get(PDFName.of('Last'))).toBe(ref)
      }
      anterior = ref
      ref = no.get(PDFName.of('Next'))
    }
  }
  descer(raiz)
  return {
    lidos,
    count: raiz.lookupMaybe(PDFName.of('Count'), PDFNumber)?.asNumber(),
  }
}

describe('aplicarEdicoes: apagar de verdade', () => {
  const novoTexto = () => objetoTexto({ conteudo: 'NOVO' })
  const cobrir = (): ObjetoDaPagina => ({
    id: id(),
    tipo: 'cobrir',
    x: 40,
    y: 90,
    largura: 200,
    altura: 30,
  })

  // Com o fundo, os cobrir não são desenhados de novo. O número do objeto culpado tem que continuar o da
  // lista recebida, senão a tela (que traduz o número para o objeto) aponta para outro.
  it('o objeto culpado é contado na lista recebida, com os cobrir', async () => {
    const quebrado = new Uint8Array([...PNG_2X2.slice(0, 8), 1, 2, 3, 4, 5])
    const erro = await erroNaEdicao(
      aplicarEdicoes(await gerarPdf(1, 600), [
        {
          indice: 0,
          objetos: [
            cobrir(),
            {
              id: id(),
              tipo: 'imagem',
              x: 10,
              y: 10,
              largura: 40,
              altura: 30,
              bytes: quebrado,
            },
          ],
          fundo: JPEG_8X8,
        },
      ]),
    )
    expect(erro).toMatchObject({
      motivo: 'imagem_corrompida',
      pagina: 0,
      objeto: 1,
    })
  })

  it('o arquivo de teste tem mesmo os segredos em todo lugar', async () => {
    const conteudo = await todoOConteudo(await gerarPdfComSegredos())
    for (const segredo of SEGREDOS)
      expect([segredo, contem(conteudo, segredo)]).toEqual([segredo, true])
    const [pagina1] = lerComPdfjs(await gerarPdfComSegredos()).paginas
    expect(pagina1.textos.map(({ str }) => str)).toEqual([
      'SEGREDO-TEXTO',
      'SEGREDO-XOBJECT',
    ])
  })

  describe.each([0, 90])('página com /Rotate %i', (rotacao) => {
    let editado: Uint8Array
    let largura: number
    let altura: number

    beforeAll(async () => {
      const pdf = await gerarPdfComSegredos(rotacao)
      ;[largura, altura] = rotacao === 90 ? [800, 600] : [600, 800]
      editado = await aplicarEdicoes(pdf, [
        { indice: 0, objetos: [cobrir(), novoTexto()], fundo: JPEG_8X8 },
      ])
    })

    it('a página vira a imagem no tamanho da tela, só com os objetos novos em vetor', () => {
      const [pagina1, pagina2] = lerComPdfjs(editado).paginas
      expect(pagina1.textos.map(({ str }) => str)).toEqual(['NOVO'])
      const [{ matriz }] = pagina1.textos
      expect(matriz[4]).toBeCloseTo(40, 2)
      expect(matriz[5]).toBeCloseTo(60 + 20 * 0.718, 2)
      expect([pagina1.largura, pagina1.altura]).toEqual([largura, altura])
      acharDesenho(pagina1.desenhos, [0, 0, largura, altura], 'imagem')
      expect(pagina1.desenhos.filter((d) => d.tipo === 'caminho')).toEqual([])
      expect(pagina2.textos.map(({ str }) => str)).toEqual(['FICA-NA-PAGINA-2'])
    })

    it('a página não tem anotações, miniatura, rotação herdada nem marca de estrutura', async () => {
      const documento = await PDFDocument.load(editado, {
        updateMetadata: false,
      })
      const { node } = documento.getPage(0)
      expect(node.has(PDFName.Annots)).toBe(false)
      expect(node.has(PDFName.of('Thumb'))).toBe(false)
      expect(node.has(PDFName.of('StructParents'))).toBe(false)
      expect(documento.getPage(0).getRotation().angle).toBe(0)
      expect(documento.getPage(0).getMediaBox()).toEqual({
        x: 0,
        y: 0,
        width: largura,
        height: altura,
      })
      const xobjetos = node.Resources()!.lookup(PDFName.of('XObject'), PDFDict)
      expect(xobjetos.keys()).toHaveLength(1)
    })

    it('nenhum segredo da página apagada sobra no arquivo', async () => {
      const conteudo = await todoOConteudo(editado)
      const sobraram = SEGREDOS.filter((segredo) => contem(conteudo, segredo))
      expect(sobraram).toEqual([])
    })

    it('o que é da outra página e do documento fica', async () => {
      const conteudo = await todoOConteudo(editado)
      for (const fica of [
        'FICA-NA-PAGINA-2',
        'CAMPO-QUE-FICA',
        'ALT-QUE-FICA',
        'ALT-MISTO-FICA',
        'FILHO-QUE-FICA',
        'MARCADOR-QUE-FICA',
      ]) {
        expect([fica, contem(conteudo, fica)]).toEqual([fica, true])
      }
      const documento = await PDFDocument.load(editado, {
        updateMetadata: false,
      })
      expect(documento.getTitle()).toBe('Título que fica')
      const formulario = documento.catalog.lookup(
        PDFName.of('AcroForm'),
        PDFDict,
      )
      // O XFA sai inteiro; o formulário comum (AcroForm) continua valendo.
      expect(formulario.has(PDFName.of('XFA'))).toBe(false)
      expect(documento.catalog.has(PDFName.of('NeedsRendering'))).toBe(false)
      const campos = formulario.lookup(PDFName.of('Fields'), PDFArray)
      expect(campos.size()).toBe(1)
      expect(
        documento.context
          .lookup(campos.get(0), PDFDict)
          .get(PDFName.of('T'))!
          .toString(),
      ).toBe('(fica)')
      expect(formulario.lookup(PDFName.of('CO'), PDFArray).size()).toBe(0)
      const anotacoes = documento.getPage(1).node.Annots()!
      expect(anotacoes.size()).toBe(2)
      const link = documento.context.lookup(anotacoes.get(1), PDFDict)
      expect(link.lookup(PDFName.of('Dest'), PDFArray).get(0)).toBe(
        documento.getPage(0).ref,
      )
    })

    it('os marcadores que levam à página apagada saem, e o filho que leva à página 2 sobe para o lugar do pai', async () => {
      const documento = await PDFDocument.load(editado, {
        updateMetadata: false,
      })
      expect(lerMarcadores(documento)).toEqual({
        lidos: [
          { titulo: 'FILHO-QUE-FICA', pai: 'raiz' },
          { titulo: 'MARCADOR-QUE-FICA', pai: 'raiz' },
        ],
        count: 2,
      })
    })
  })

  it('sem apagar de verdade, o XFA, os marcadores e os textos da estrutura ficam como estavam', async () => {
    const editado = await aplicarEdicoes(await gerarPdfComSegredos(), [
      { indice: 0, objetos: [cobrir()] },
    ])
    const conteudo = await todoOConteudo(editado)
    for (const fica of [
      'SEGREDO-XFA',
      'SEGREDO-ALT-PAI',
      'SEGREDO-T-AVO',
      'SEGREDO-MARCADOR-PAI',
    ]) {
      expect([fica, contem(conteudo, fica)]).toEqual([fica, true])
    }
    const documento = await PDFDocument.load(editado, {
      updateMetadata: false,
    })
    expect(documento.catalog.has(PDFName.of('NeedsRendering'))).toBe(true)
    expect(lerMarcadores(documento)).toEqual({
      lidos: [
        { titulo: 'SEGREDO-MARCADOR-DIRETO', pai: 'raiz' },
        { titulo: 'SEGREDO-MARCADOR-ACAO', pai: 'raiz' },
        { titulo: 'SEGREDO-MARCADOR-PAI', pai: 'raiz', count: 1 },
        { titulo: 'FILHO-QUE-FICA', pai: 'SEGREDO-MARCADOR-PAI' },
        { titulo: 'MARCADOR-QUE-FICA', pai: 'raiz' },
      ],
      count: 5,
    })
  })

  it('marcador fechado que perde o pai leva o sinal dele; o que perde todos os filhos fica sem /Count', async () => {
    const documento = await PDFDocument.create()
    const { context } = documento
    const [apagada, fica] = [documento.addPage(), documento.addPage()]
    const raiz = context.nextRef()
    const [a, a1, a2, b, b1] = Array.from({ length: 5 }, () =>
      context.nextRef(),
    )
    const item = (titulo: string, pagina: PDFRef, campos: object) =>
      context.obj({
        Title: PDFString.of(titulo),
        Dest: [pagina, 'Fit'],
        ...campos,
      } as Parameters<typeof context.obj>[0])
    // A (página apagada, aberto) > A1 (fica, fechado, com o filho A2); B (fica, aberto) > B1 (apagada).
    context.assign(
      a,
      item('A', apagada.ref, {
        Parent: raiz,
        Next: b,
        First: a1,
        Last: a1,
        Count: 1,
      }),
    )
    context.assign(
      a1,
      item('A1', fica.ref, { Parent: a, First: a2, Last: a2, Count: -1 }),
    )
    context.assign(a2, item('A2', fica.ref, { Parent: a1 }))
    context.assign(
      b,
      item('B', fica.ref, {
        Parent: raiz,
        Prev: a,
        First: b1,
        Last: b1,
        Count: 1,
      }),
    )
    context.assign(b1, item('B1', apagada.ref, { Parent: b }))
    context.assign(
      raiz,
      context.obj({ Type: 'Outlines', First: a, Last: b, Count: 4 }),
    )
    documento.catalog.set(PDFName.of('Outlines'), raiz)
    const editado = await aplicarEdicoes(await documento.save(), [
      { indice: 0, objetos: [], fundo: JPEG_8X8 },
    ])
    expect(
      lerMarcadores(await PDFDocument.load(editado, { updateMetadata: false })),
    ).toEqual({
      lidos: [
        { titulo: 'A1', pai: 'raiz', count: -1 },
        { titulo: 'A2', pai: 'A1' },
        { titulo: 'B', pai: 'raiz' },
      ],
      count: 2,
    })
  })

  it('a página apagada não herda a rotação nem as caixas da árvore de páginas', async () => {
    const documento = await PDFDocument.create()
    const pagina = documento.addPage()
    pagina.node.delete(PDFName.MediaBox)
    pagina.node.delete(PDFName.of('Rotate'))
    const arvore = documento.catalog.Pages()
    arvore.set(PDFName.MediaBox, documento.context.obj([0, 0, 600, 800]))
    arvore.set(
      PDFName.of('CropBox'),
      documento.context.obj([50, 100, 450, 700]),
    )
    arvore.set(PDFName.of('Rotate'), PDFNumber.of(90))
    const editado = await aplicarEdicoes(await documento.save(), [
      { indice: 0, objetos: [objetoTexto()], fundo: JPEG_8X8 },
    ])
    const [lida] = lerComPdfjs(editado).paginas
    expect([lida.rotate, lida.view]).toEqual([0, [0, 0, 600, 400]])
    acharDesenho(lida.desenhos, [0, 0, 600, 400], 'imagem')
    expect(lida.textos[0].matriz[4]).toBeCloseTo(40, 2)
  })

  describe('recursos que outras páginas herdam ou também listam', () => {
    // Página 1 (a apagada) desenha Fx1 e Comum; a página 2 desenha Moldura (um formulário sem recursos
    // próprios, que desenha Fx2 com os recursos de quem o chama) e Comum.
    type Arranjo = 'herdados' | 'listados' | 'herdados só pela apagada'

    async function gerar({
      arranjo,
      conteudoDaPagina2,
    }: {
      arranjo: Arranjo
      conteudoDaPagina2: string[]
    }): Promise<Uint8Array> {
      const documento = await PDFDocument.create()
      const { context } = documento
      const helvetica = documento.embedStandardFont(StandardFonts.Helvetica)
      const formulario = (conteudo: string, comRecursos = true) =>
        context.register(
          context.stream(conteudo, {
            Type: 'XObject',
            Subtype: 'Form',
            BBox: [0, 0, 600, 800],
            ...(comRecursos
              ? { Resources: { Font: { F1: helvetica.ref } } }
              : {}),
          }),
        )
      const texto = (s: string, y: number) =>
        `BT /F1 12 Tf 50 ${y} Td (${s}) Tj ET`
      const xobjetos = {
        Fx1: formulario(texto('SEGREDO-HERDADO', 700)),
        Fx2: formulario(texto('FICA-NO-FORM-2', 700)),
        Comum: formulario(texto('LOGO-COMUM', 650)),
        Moldura: formulario('q /Fx2 Do Q', false),
      }
      const [pagina1, pagina2] = [
        documento.addPage([600, 800]),
        documento.addPage([600, 800]),
      ]
      const conteudo = (partes: string[]) =>
        context.obj(
          partes.map((parte) => context.register(context.stream(parte))),
        )
      pagina1.node.set(
        PDFName.Contents,
        conteudo(['q /Fx1 Do Q q /Comum Do Q']),
      )
      pagina2.node.set(PDFName.Contents, conteudo(conteudoDaPagina2))
      const { Fx1, ...daPagina2 } = xobjetos
      if (arranjo === 'herdados') {
        pagina1.node.delete(PDFName.Resources)
        pagina2.node.delete(PDFName.Resources)
        documento.catalog
          .Pages()
          .set(PDFName.Resources, context.obj({ XObject: xobjetos }))
      } else if (arranjo === 'listados') {
        // Cada página com o próprio dicionário, e a 2 lista também o Fx1, que não desenha.
        pagina1.node.set(PDFName.Resources, context.obj({ XObject: xobjetos }))
        pagina2.node.set(
          PDFName.Resources,
          context.obj({ XObject: { Fx1, ...daPagina2 } }),
        )
      } else {
        // A árvore guarda tudo, mas só a página apagada herda dela.
        pagina1.node.delete(PDFName.Resources)
        pagina2.node.set(PDFName.Resources, context.obj({ XObject: daPagina2 }))
        documento.catalog
          .Pages()
          .set(PDFName.Resources, context.obj({ XObject: xobjetos }))
      }
      return documento.save()
    }

    // O operando de um stream e o Do no seguinte, com um comentário no meio: ainda é desenhar.
    const PAGINA2 = ['q /Moldura', '% comentário\nDo Q q /Comum Do Q']

    it.each<Arranjo>(['herdados', 'listados', 'herdados só pela apagada'])(
      'recursos %s: o que só a página apagada desenhava sai do arquivo',
      async (arranjo) => {
        const pdf = await gerar({ arranjo, conteudoDaPagina2: PAGINA2 })
        expect(
          lerComPdfjs(pdf).paginas[0].textos.map(({ str }) => str),
        ).toContain('SEGREDO-HERDADO')
        const editado = await aplicarEdicoes(pdf, [
          { indice: 0, objetos: [], fundo: JPEG_8X8 },
        ])
        const conteudo = await todoOConteudo(editado)
        expect(contem(conteudo, 'SEGREDO-HERDADO')).toBe(false)
        expect(
          lerComPdfjs(editado).paginas[1].textos.map(({ str }) => str),
        ).toEqual(['FICA-NO-FORM-2', 'LOGO-COMUM'])
      },
    )

    it('na dúvida (imagem embutida na página que fica), não tira nada dos recursos dela', async () => {
      const pdf = await gerar({
        arranjo: 'herdados',
        conteudoDaPagina2: [
          'BI /W 1 /H 1 /CS /G /BPC 8 ID \x80 EI q /Moldura Do Q q /Comum Do Q',
        ],
      })
      const editado = await aplicarEdicoes(pdf, [
        { indice: 0, objetos: [], fundo: JPEG_8X8 },
      ])
      expect(contem(await todoOConteudo(editado), 'SEGREDO-HERDADO')).toBe(true)
      expect(
        lerComPdfjs(editado).paginas[1].textos.map(({ str }) => str),
      ).toEqual(['FICA-NO-FORM-2', 'LOGO-COMUM'])
    })
  })

  it('tira o texto alternativo da estrutura mesmo sem anotação na página', async () => {
    const documento = await PDFDocument.create()
    const pagina = documento.addPage([300, 300])
    const elemento = documento.context.register(
      documento.context.obj({
        Type: 'StructElem',
        S: 'Figure',
        Pg: pagina.ref,
        Alt: PDFString.of('SEGREDO-ALT'),
      }),
    )
    documento.catalog.set(
      PDFName.of('StructTreeRoot'),
      documento.context.register(
        documento.context.obj({ Type: 'StructTreeRoot', K: [elemento] }),
      ),
    )
    const editado = await aplicarEdicoes(await documento.save(), [
      { indice: 0, objetos: [], fundo: JPEG_8X8 },
    ])
    expect(contem(await todoOConteudo(editado), 'SEGREDO-ALT')).toBe(false)
  })

  it('a página editada sem apagar de verdade guarda o texto antigo (cobrir só esconde)', async () => {
    const editado = await aplicarEdicoes(await gerarPdfComSegredos(), [
      { indice: 0, objetos: [cobrir()] },
    ])
    expect(
      lerComPdfjs(editado).paginas[0].textos.map(({ str }) => str),
    ).toContain('SEGREDO-TEXTO')
  })

  it('o fundo tem que ser JPEG', async () => {
    const erro = await erroNaEdicao(
      aplicarEdicoes(await gerarPdf(1, 300), [
        { indice: 0, objetos: [], fundo: PNG_2X2 },
      ]),
    )
    expect(erro).toMatchObject({
      motivo: 'imagem_nao_aceita',
      pagina: 0,
      objeto: undefined,
    })
  })
})
