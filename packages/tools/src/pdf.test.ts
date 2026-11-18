import {
  PDFArray,
  PDFBool,
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
  analisarPdf,
  aplicarEdicoes,
  contarPaginas,
  montarDocumento,
  temCabecalhoDePdf,
  type EdicaoDaPagina,
  type EdicaoNaMontagem,
} from './pdf'
import { lerComPdfjs } from './pdf.leitor-pdfjs.cjs'
import {
  FAMILIAS_DE_FONTE,
  METRICAS_DAS_FONTES,
  TETO_DE_PAGINAS,
  apagar,
  extrair,
  geometriaDaVista,
  girar,
  giroNormalizado,
  linhaEntre,
  moverSelecionadas,
  tamanhoNaTela,
  tracoDosPontos,
  type ObjetoDaPagina,
  type ObjetoTexto,
  type PaginaDaMontagem,
  type PaginaDoPlano,
} from './pdf-regras'

// O plano de um arquivo na ordem e sem giro, de onde os testes partem.
const planoInicial = (totalDePaginas: number): PaginaDoPlano[] =>
  Array.from({ length: totalDePaginas }, (_, indice) => ({ indice, giro: 0 }))

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

type Leitura = ReturnType<typeof lerComPdfjs>

// Os cinco formatos, a partir da página `primeira` da leitura: o que a tela pôs cai onde ela mostrou.
function conferirFormatos(leitura: () => Leitura, primeira = 0) {
  describe.each(
    FORMATOS.map((formato, indice) => [formato.nome, formato, indice] as const),
  )('%s', (_, formato, indice) => {
    const pagina = () => leitura().paginas[primeira + indice]

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
}

describe('aplicarEdicoes: posição conferida pelo pdf.js', () => {
  // Uma leitura só pelo pdf.js (um processo do Node) para os cinco formatos.
  let leitura: Leitura

  beforeAll(async () => {
    const pdf = await gerarPdfComFormatos(FORMATOS)
    const editado = await aplicarEdicoes(
      pdf,
      FORMATOS.map((_, indice) => ({ indice, objetos: umDeCada() })),
    )
    leitura = lerComPdfjs(editado)
  })

  conferirFormatos(() => leitura)
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
  // Links da página que fica que chegam à página 1 por nome (da árvore e do /Dests antigo) e um que
  // chega à página 2 por nome.
  const linkPorNome = context.register(
    context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [0, 60, 50, 110],
      Dest: PDFString.of('SEGREDO-NOME-ARVORE'),
    }),
  )
  const linkPorAcao = context.register(
    context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [0, 120, 50, 170],
      A: { S: 'GoTo', D: 'SEGREDO-NOME-ANTIGO' },
    }),
  )
  const linkQueFica = context.register(
    context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [0, 180, 50, 230],
      A: { S: 'GoTo', D: PDFString.of('NOME-QUE-FICA') },
    }),
  )
  pagina1.node.set(PDFName.Annots, context.obj([nota, widget, campoUnico]))
  pagina2.node.set(
    PDFName.Annots,
    context.obj([widgetQueFica, link, linkPorNome, linkPorAcao, linkQueFica]),
  )
  documento.catalog.set(
    PDFName.of('OpenAction'),
    context.obj({ S: 'GoTo', D: PDFString.of('SEGREDO-NOME-ARVORE') }),
  )
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
    A: { S: 'GoTo', D: PDFString.of('SEGREDO-NOME-ARVORE') },
  })
  marcador(m3, {
    Title: PDFString.of('SEGREDO-MARCADOR-PAI'),
    Prev: m2,
    Next: m4,
    Dest: 'SEGREDO-NOME-ANTIGO',
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
      Dests: {
        Names: [
          PDFString.of('NOME-QUE-FICA'),
          [pagina2.ref, 'Fit'],
          PDFString.of('SEGREDO-NOME-ARVORE'),
          [pagina1.ref, 'Fit'],
        ],
      },
    }),
  )
  documento.catalog.set(
    PDFName.of('Dests'),
    context.obj({
      'NOME-ANTIGO-QUE-FICA': [pagina2.ref, 'Fit'],
      'SEGREDO-NOME-ANTIGO': { D: [pagina1.ref, 'Fit'] },
    }),
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
  'SEGREDO-NOME-ARVORE',
  'SEGREDO-NOME-ANTIGO',
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
        'NOME-QUE-FICA',
        'NOME-ANTIGO-QUE-FICA',
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
      expect(anotacoes.size()).toBe(5)
      const link = documento.context.lookup(anotacoes.get(1), PDFDict)
      expect(link.lookup(PDFName.of('Dest'), PDFArray).get(0)).toBe(
        documento.getPage(0).ref,
      )
    })

    // A página apagada continua no arquivo, como imagem: quem chegava a ela por um nome que saiu passa
    // a chegar pelo destino explícito que o nome guardava.
    it('os nomes de destino que levam à página apagada saem, e quem os usava passa ao destino explícito', async () => {
      const documento = await PDFDocument.load(editado, {
        updateMetadata: false,
      })
      const { context } = documento
      const apagada = documento.getPage(0).ref
      const destinoDe = (valor: PDFObject | undefined) =>
        context.lookup(valor, PDFArray).asArray().map(String)
      const explicito = [apagada.toString(), '/Fit']
      const [, , porNome, porAcao, queFica] = documento
        .getPage(1)
        .node.Annots()!
        .asArray()
        .map((anotacao) => context.lookup(anotacao, PDFDict))
      expect(destinoDe(porNome.get(PDFName.of('Dest')))).toEqual(explicito)
      expect(
        destinoDe(
          porAcao.lookup(PDFName.of('A'), PDFDict).get(PDFName.of('D')),
        ),
      ).toEqual(explicito)
      expect(
        queFica.lookup(PDFName.of('A'), PDFDict).get(PDFName.of('D')),
      ).toEqual(PDFString.of('NOME-QUE-FICA'))
      expect(
        destinoDe(
          documento.catalog
            .lookup(PDFName.of('OpenAction'), PDFDict)
            .get(PDFName.of('D')),
        ),
      ).toEqual(explicito)
      const arvore = documento.catalog
        .lookup(PDFName.of('Names'), PDFDict)
        .lookup(PDFName.of('Dests'), PDFDict)
      expect(arvore.lookup(PDFName.of('Names'), PDFArray).size()).toBe(2)
      expect(
        documento.catalog.lookup(PDFName.of('Dests'), PDFDict).keys(),
      ).toEqual([PDFName.of('NOME-ANTIGO-QUE-FICA')])
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

  // O XFA deste arquivo sai mesmo sem apagar de verdade: é um híbrido com a página editada (ver o teste
  // "o híbrido com só um objeto por cima").
  it('sem apagar de verdade, os marcadores, os nomes e os textos da estrutura ficam como estavam', async () => {
    const editado = await aplicarEdicoes(await gerarPdfComSegredos(), [
      { indice: 0, objetos: [cobrir()] },
    ])
    const conteudo = await todoOConteudo(editado)
    for (const fica of [
      'SEGREDO-ALT-PAI',
      'SEGREDO-T-AVO',
      'SEGREDO-MARCADOR-PAI',
      'SEGREDO-NOME-ARVORE',
      'SEGREDO-NOME-ANTIGO',
    ]) {
      expect([fica, contem(conteudo, fica)]).toEqual([fica, true])
    }
    expect(contem(conteudo, 'SEGREDO-XFA')).toBe(false)
    const documento = await PDFDocument.load(editado, {
      updateMetadata: false,
    })
    expect(
      documento.catalog
        .lookup(PDFName.of('OpenAction'), PDFDict)
        .get(PDFName.of('D')),
    ).toEqual(PDFString.of('SEGREDO-NOME-ARVORE'))
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

  describe('árvore de nomes de destino', () => {
    // Os nomes ficam em ordem nas folhas, e cada nó abaixo da raiz diz no /Limits o primeiro e o último.
    async function gerarComArvore(): Promise<Uint8Array> {
      const documento = await PDFDocument.create()
      const { context } = documento
      const [apagada, fica] = [documento.addPage(), documento.addPage()]
      const s = (texto: string) => PDFString.of(texto)
      const no = (campos: object) =>
        context.register(
          context.obj(campos as Parameters<typeof context.obj>[0]),
        )
      const folha1 = no({
        Limits: [s('a-apagada'), s('b-apagada')],
        Names: [
          s('a-apagada'),
          [apagada.ref, 'Fit'],
          s('b-apagada'),
          [apagada.ref, 'Fit'],
        ],
      })
      const folha2 = no({
        Limits: [s('c-fica'), s('e-apagada')],
        Names: [
          s('c-fica'),
          [fica.ref, 'Fit'],
          s('d-fica'),
          { D: [fica.ref, 'Fit'] },
          s('e-apagada'),
          no([apagada.ref, 'Fit']),
        ],
      })
      const folha3 = no({
        Limits: [s('y-fica'), s('z-apagada')],
        Names: [
          s('y-fica'),
          [fica.ref, 'Fit'],
          s('z-apagada'),
          { D: [apagada.ref, 'Fit'] },
        ],
      })
      const meio = no({
        Limits: [s('a-apagada'), s('z-apagada')],
        Kids: [folha1, folha2, folha3],
      })
      documento.catalog.set(
        PDFName.of('Names'),
        context.obj({ Dests: no({ Kids: [meio] }) }),
      )
      documento.catalog.set(
        PDFName.of('Dests'),
        context.obj({ 'antigo-apagada': [apagada.ref, 'Fit'] }),
      )
      return documento.save()
    }

    it('a folha que esvazia sai, e os /Limits são refeitos sem os nomes que saíram', async () => {
      const editado = await aplicarEdicoes(await gerarComArvore(), [
        { indice: 0, objetos: [], fundo: JPEG_8X8 },
      ])
      const documento = await PDFDocument.load(editado, {
        updateMetadata: false,
      })
      const { context } = documento
      const texto = (item: PDFObject) => (item as PDFString).decodeText()
      const raiz = documento.catalog
        .lookup(PDFName.of('Names'), PDFDict)
        .lookup(PDFName.of('Dests'), PDFDict)
      expect(raiz.has(PDFName.of('Limits'))).toBe(false)
      const [meio] = raiz
        .lookup(PDFName.of('Kids'), PDFArray)
        .asArray()
        .map((item) => context.lookup(item, PDFDict))
      const limites = (no: PDFDict) =>
        no.lookup(PDFName.of('Limits'), PDFArray).asArray().map(texto)
      expect(limites(meio)).toEqual(['c-fica', 'y-fica'])
      const folhas = meio
        .lookup(PDFName.of('Kids'), PDFArray)
        .asArray()
        .map((item) => context.lookup(item, PDFDict))
      expect(folhas.map(limites)).toEqual([
        ['c-fica', 'd-fica'],
        ['y-fica', 'y-fica'],
      ])
      expect(
        folhas.map((folha) =>
          folha
            .lookup(PDFName.of('Names'), PDFArray)
            .asArray()
            .filter((_, i) => i % 2 === 0)
            .map(texto),
        ),
      ).toEqual([['c-fica', 'd-fica'], ['y-fica']])
      // O /Dests antigo que esvaziou sai do catálogo.
      expect(documento.catalog.has(PDFName.of('Dests'))).toBe(false)
      expect(contem(await todoOConteudo(editado), 'apagada')).toBe(false)
    })

    it('a raiz que esvazia sai do /Names, e o /Names vazio sai do catálogo', async () => {
      const gerar = async (outros: object) => {
        const documento = await PDFDocument.create()
        const apagada = documento.addPage()
        documento.addPage()
        documento.catalog.set(
          PDFName.of('Names'),
          documento.context.obj({
            Dests: {
              Names: [PDFString.of('so-apagada'), [apagada.ref, 'Fit']],
            },
            ...outros,
          } as Parameters<typeof documento.context.obj>[0]),
        )
        const editado = await aplicarEdicoes(await documento.save(), [
          { indice: 0, objetos: [], fundo: JPEG_8X8 },
        ])
        return PDFDocument.load(editado, { updateMetadata: false })
      }
      expect((await gerar({})).catalog.has(PDFName.of('Names'))).toBe(false)
      const comOutros = await gerar({ JavaScript: { Names: [] } })
      expect(
        comOutros.catalog.lookup(PDFName.of('Names'), PDFDict).keys(),
      ).toEqual([PDFName.of('JavaScript')])
    })

    // O mesmo nome no /Dests antigo (página apagada) e na árvore (página que fica): o link continua
    // achando o nome, então fica com ele.
    it('o nome que sai de um lugar e continua no outro não é trocado pelo destino explícito', async () => {
      const documento = await PDFDocument.create()
      const { context } = documento
      const [apagada, fica] = [documento.addPage(), documento.addPage()]
      documento.catalog.set(
        PDFName.of('Dests'),
        context.obj({ duplo: [apagada.ref, 'Fit'] }),
      )
      documento.catalog.set(
        PDFName.of('Names'),
        context.obj({
          Dests: { Names: [PDFString.of('duplo'), [fica.ref, 'Fit']] },
        }),
      )
      fica.node.set(
        PDFName.Annots,
        context.obj([
          context.obj({
            Type: 'Annot',
            Subtype: 'Link',
            Rect: [0, 0, 50, 50],
            Dest: PDFString.of('duplo'),
          }),
        ]),
      )
      const editado = await PDFDocument.load(
        await aplicarEdicoes(await documento.save(), [
          { indice: 0, objetos: [], fundo: JPEG_8X8 },
        ]),
        { updateMetadata: false },
      )
      expect(editado.catalog.has(PDFName.of('Dests'))).toBe(false)
      const [link] = editado.getPage(1).node.Annots()!.asArray()
      expect(
        editado.context.lookup(link, PDFDict).get(PDFName.of('Dest')),
      ).toEqual(PDFString.of('duplo'))
    })
  })

  // O marcador cuja ação não leva a uma página do documento não é o marcador da página apagada. O /D
  // do GoToR é um nome do outro arquivo: o mesmo texto de um nome que sai daqui não vira destino daqui.
  it('o marcador com URI, Launch, JavaScript ou GoToR fica, ao lado do que sai', async () => {
    const documento = await PDFDocument.create()
    const { context } = documento
    const [apagada] = [documento.addPage(), documento.addPage()]
    documento.catalog.set(
      PDFName.of('Dests'),
      context.obj({ 'SEGREDO-NOME': [apagada.ref, 'Fit'] }),
    )
    const raiz = context.nextRef()
    const acoes: [string, object][] = [
      ['URI', { S: 'URI', URI: PDFString.of('https://exemplo.com.br') }],
      ['Launch', { S: 'Launch', F: PDFString.of('programa.exe') }],
      ['JavaScript', { S: 'JavaScript', JS: PDFString.of('app.alert(1)') }],
      [
        'GoToR',
        {
          S: 'GoToR',
          F: PDFString.of('outro.pdf'),
          D: PDFString.of('SEGREDO-NOME'),
        },
      ],
    ]
    const refs = [...acoes.map(() => context.nextRef()), context.nextRef()]
    acoes.forEach(([titulo, acao], i) =>
      context.assign(
        refs[i],
        context.obj({
          Title: PDFString.of(titulo),
          Parent: raiz,
          A: acao,
          ...(i > 0 ? { Prev: refs[i - 1] } : {}),
          Next: refs[i + 1],
        } as Parameters<typeof context.obj>[0]),
      ),
    )
    context.assign(
      refs[acoes.length],
      context.obj({
        Title: PDFString.of('SAI'),
        Parent: raiz,
        Prev: refs[acoes.length - 1],
        Dest: [apagada.ref, 'Fit'],
      }),
    )
    context.assign(
      raiz,
      context.obj({
        Type: 'Outlines',
        First: refs[0],
        Last: refs[acoes.length],
        Count: refs.length,
      }),
    )
    documento.catalog.set(PDFName.of('Outlines'), raiz)
    const editado = await aplicarEdicoes(await documento.save(), [
      { indice: 0, objetos: [], fundo: JPEG_8X8 },
    ])
    const lido = await PDFDocument.load(editado, { updateMetadata: false })
    expect(lerMarcadores(lido)).toEqual({
      lidos: acoes.map(([titulo]) => ({ titulo, pai: 'raiz' })),
      count: 4,
    })
    expect(lido.catalog.has(PDFName.of('Dests'))).toBe(false)
    const goToR = lido.context
      .enumerateIndirectObjects()
      .map(([, objeto]) => objeto)
      .filter((objeto): objeto is PDFDict => objeto instanceof PDFDict)
      .map((item) => item.lookupMaybe(PDFName.of('A'), PDFDict))
      .find((acao) => acao?.get(PDFName.of('S')) === PDFName.of('GoToR'))
    expect(goToR?.get(PDFName.of('D'))).toEqual(PDFString.of('SEGREDO-NOME'))
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

const XFA = (documento: PDFDocument) => {
  const { context } = documento
  const xml = (conteudo: string) => context.register(context.stream(conteudo))
  return context.obj([
    PDFString.of('template'),
    xml('<template><field name="nome"/></template>'),
    PDFString.of('datasets'),
    xml('<xfa:datasets><nome>Paulo</nome></xfa:datasets>'),
  ])
}

describe('aplicarEdicoes: XFA híbrido e recursos estendidos', () => {
  // Um campo no AcroForm e o XFA ao lado dele (o híbrido do LiveCycle).
  async function gerarHibrido(): Promise<Uint8Array> {
    const documento = await PDFDocument.create({ updateMetadata: false })
    const pagina = documento.addPage([600, 800])
    const nome = documento.getForm().createTextField('pessoa.nome')
    nome.setText('Paulo')
    nome.addToPage(pagina, { x: 50, y: 700, width: 200, height: 20 })
    const pdf = await documento.save()
    // Depois de salvar: o save que gera as aparências passa pelo getForm(), que tira o XFA.
    const hibrido = await PDFDocument.load(pdf, { updateMetadata: false })
    hibrido.catalog
      .lookup(PDFName.of('AcroForm'), PDFDict)
      .set(PDFName.of('XFA'), XFA(hibrido))
    hibrido.catalog.set(PDFName.of('NeedsRendering'), PDFBool.True)
    return hibrido.save({ updateFieldAppearances: false })
  }

  // Achado do Crivo no #121: só um objeto, sem mexer em campo, deixava o XFA. No Reader, a versão XFA
  // aparece no lugar da página (o objeto não), e o XML guarda o que foi digitado.
  it('o híbrido com só um objeto por cima sai sem o XFA e com o AcroForm', async () => {
    const hibrido = await gerarHibrido()
    const semObjeto = await PDFDocument.load(await aplicarEdicoes(hibrido, []))
    expect(
      semObjeto.catalog
        .lookup(PDFName.of('AcroForm'), PDFDict)
        .has(PDFName.of('XFA')),
    ).toBe(true)

    const editado = await aplicarEdicoes(hibrido, [
      { indice: 0, objetos: [objetoTexto({ conteudo: 'Assinado' })] },
    ])
    const documento = await PDFDocument.load(editado)
    expect(
      documento.catalog
        .lookup(PDFName.of('AcroForm'), PDFDict)
        .has(PDFName.of('XFA')),
    ).toBe(false)
    expect(documento.catalog.has(PDFName.of('NeedsRendering'))).toBe(false)
    expect(contem(await todoOConteudo(editado), 'xfa:datasets')).toBe(false)
    expect(documento.getForm().getTextField('pessoa.nome').getText()).toBe(
      'Paulo',
    )
    expect(console.warn).not.toHaveBeenCalled()
  })

  // Sem campo no AcroForm, a página sem o XFA seria só o aviso do LiveCycle: o XFA fica.
  it('só XFA (sem campo no AcroForm): o objeto por cima não tira o XFA', async () => {
    const documento = await PDFDocument.create()
    documento.addPage([600, 800])
    documento.catalog.set(
      PDFName.of('AcroForm'),
      documento.context.obj({ Fields: [], XFA: XFA(documento) }),
    )
    documento.catalog.set(PDFName.of('NeedsRendering'), PDFBool.True)
    const editado = await PDFDocument.load(
      await aplicarEdicoes(await documento.save(), [
        { indice: 0, objetos: [objetoTexto()] },
      ]),
    )
    expect(
      editado.catalog
        .lookup(PDFName.of('AcroForm'), PDFDict)
        .has(PDFName.of('XFA')),
    ).toBe(true)
    expect(editado.catalog.has(PDFName.of('NeedsRendering'))).toBe(true)
  })

  // Achado do Crivo no #126: o organizar que só gira sai no lugar, e o XFA do híbrido ficava. No Reader,
  // a versão XFA aparece no lugar da página, e o giro some para quem abre no Acrobat.
  it('o híbrido só girado, no lugar, sai sem o XFA, com o AcroForm e com o giro', async () => {
    const final = await montarDocumento(
      [await gerarHibrido()],
      [daMontagem(0, 0, { giro: 90 })],
      [],
    )
    const documento = await PDFDocument.load(final)
    expect(
      documento.catalog
        .lookup(PDFName.of('AcroForm'), PDFDict)
        .has(PDFName.of('XFA')),
    ).toBe(false)
    expect(documento.catalog.has(PDFName.of('NeedsRendering'))).toBe(false)
    expect(contem(await todoOConteudo(final), 'xfa:datasets')).toBe(false)
    expect(documento.getForm().getTextField('pessoa.nome').getText()).toBe(
      'Paulo',
    )
    expect(await rotacoesDasPaginas(final)).toEqual([90])
  })

  it('o híbrido sem giro nem objeto, no lugar, continua com o XFA', async () => {
    const final = await montarDocumento(
      [await gerarHibrido()],
      [daMontagem(0, 0)],
      [],
    )
    expect(
      (await PDFDocument.load(final)).catalog
        .lookup(PDFName.of('AcroForm'), PDFDict)
        .has(PDFName.of('XFA')),
    ).toBe(true)
  })

  // Os recursos estendidos do Reader (comuns em formulário de governo) e a certificação (/DocMDP) são
  // assinaturas do arquivo, que deixam de valer quando o pdf-lib o escreve de novo.
  it('o /UR3, o /UR e o /DocMDP saem do /Perms, que sai quando fica vazio', async () => {
    const montar = async (perms: Record<string, boolean>) => {
      const documento = await PDFDocument.create()
      const { context } = documento
      const pagina = documento.addPage([600, 800])
      documento
        .getForm()
        .createTextField('nome')
        .addToPage(pagina, { x: 50, y: 700, width: 200, height: 20 })
      const assinatura = (metodo: string) =>
        context.register(
          context.obj({
            Type: 'Sig',
            Filter: 'Adobe.PPKLite',
            Reference: [{ Type: 'SigRef', TransformMethod: metodo }],
          }),
        )
      documento.catalog.set(
        PDFName.of('Perms'),
        context.obj(
          Object.fromEntries(
            Object.keys(perms).map((chave) => [chave, assinatura(chave)]),
          ),
        ),
      )
      return documento.save()
    }
    const perms = async (bytes: Uint8Array) =>
      (await PDFDocument.load(bytes)).catalog
        .lookupMaybe(PDFName.of('Perms'), PDFDict)
        ?.keys()
        .map(String) ?? null
    const comObjeto = [{ indice: 0, objetos: [objetoTexto()] }]

    const soUr3 = await montar({ UR3: true })
    expect(await perms(soUr3)).toEqual(['/UR3'])
    expect(await perms(await aplicarEdicoes(soUr3, []))).toBeNull()
    expect(await perms(await aplicarEdicoes(soUr3, comObjeto))).toBeNull()
    const comDocMdp = await montar({ UR: true, DocMDP: true })
    expect(await perms(comDocMdp)).toEqual(['/UR', '/DocMDP'])
    expect(await perms(await aplicarEdicoes(comDocMdp, []))).toBeNull()
    expect(await perms(await aplicarEdicoes(comDocMdp, comObjeto))).toBeNull()
    const soDocMdp = await montar({ DocMDP: true })
    expect(await perms(await aplicarEdicoes(soDocMdp, []))).toBeNull()
  })
})

describe('analisarPdf: os avisos do editar', () => {
  // O /AcroForm e o /Perms vão montados à mão, e o save não gera aparências: o getForm() do pdf-lib
  // 1.17.1 (que o save com aparências chama) tiraria o /XFA.
  async function montarPdf(
    montar: (documento: PDFDocument) => void,
  ): Promise<Uint8Array> {
    const documento = await PDFDocument.create({ updateMetadata: false })
    documento.addPage([300, 300])
    montar(documento)
    return documento.save({ updateFieldAppearances: false })
  }

  type Literal = Parameters<PDFDocument['context']['obj']>[0]

  const registrar = (documento: PDFDocument, dados: Record<string, unknown>) =>
    documento.context.register(documento.context.obj(dados as Literal))

  const valorDaAssinatura = (documento: PDFDocument) =>
    registrar(documento, {
      Type: 'Sig',
      Filter: 'Adobe.PPKLite',
      SubFilter: 'adbe.pkcs7.detached',
    })

  function acroForm(
    documento: PDFDocument,
    dados: Record<string, unknown>,
  ): void {
    documento.catalog.set(
      PDFName.of('AcroForm'),
      documento.context.obj(dados as Literal),
    )
  }

  const XFA_DO_LIVECYCLE = (documento: PDFDocument) =>
    documento.context.obj([
      PDFString.of('datasets'),
      documento.context.register(
        documento.context.stream('<xfa:datasets></xfa:datasets>'),
      ),
    ])

  function permissoes(documento: PDFDocument, chaves: string[]): void {
    documento.catalog.set(
      PDFName.of('Perms'),
      documento.context.obj(
        Object.fromEntries(
          chaves.map((chave) => [
            chave,
            registrar(documento, {
              Type: 'Sig',
              Filter: 'Adobe.PPKLite',
              Reference: [{ Type: 'SigRef', TransformMethod: chave }],
            }),
          ]),
        ) as Literal,
      ),
    )
  }

  it('PDF comum: as páginas, sem aviso', async () => {
    expect(await analisarPdf(await gerarPdf(3, 100))).toEqual({
      paginas: 3,
      avisos: [],
    })
  })

  it('as recusas são as do contarPaginas', async () => {
    expect(await motivo(analisarPdf(new Uint8Array([1, 2, 3])))).toEqual({
      motivo: 'nao_e_pdf',
      indice: undefined,
    })
  })

  it('assinado: um campo /Sig com /V, que é o dicionário da assinatura', async () => {
    const bytes = await montarPdf((documento) =>
      acroForm(documento, {
        Fields: [
          registrar(documento, {
            FT: 'Sig',
            T: PDFString.of('assinatura'),
            V: valorDaAssinatura(documento),
          }),
        ],
      }),
    )

    expect((await analisarPdf(bytes)).avisos).toEqual(['assinatura_digital'])
  })

  it('campo /Sig ainda sem assinatura (sem /V, ou com /V que não é dicionário) não avisa', async () => {
    const semValor = await montarPdf((documento) =>
      acroForm(documento, {
        Fields: [
          registrar(documento, { FT: 'Sig', T: PDFString.of('assinar') }),
        ],
      }),
    )
    const valorTorto = await montarPdf((documento) =>
      acroForm(documento, {
        Fields: [
          registrar(documento, {
            FT: 'Sig',
            T: PDFString.of('assinar'),
            V: PDFString.of('não é assinatura'),
          }),
        ],
      }),
    )

    expect((await analisarPdf(semValor)).avisos).toEqual([])
    expect((await analisarPdf(valorTorto)).avisos).toEqual([])
  })

  it('o /FT vem do pai: o filho em /Kids com /V é assinatura; com /FT próprio de texto, não', async () => {
    const comFilho = (tipoDoFilho?: string) =>
      montarPdf((documento) => {
        const { context } = documento
        const pai = context.nextRef()
        const filho = registrar(documento, {
          Parent: pai,
          T: PDFString.of('a'),
          V: valorDaAssinatura(documento),
          ...(tipoDoFilho ? { FT: tipoDoFilho } : {}),
        })
        context.assign(
          pai,
          context.obj({
            FT: 'Sig',
            T: PDFString.of('assinaturas'),
            Kids: [filho],
          }),
        )
        acroForm(documento, { Fields: [pai] })
      })

    expect((await analisarPdf(await comFilho())).avisos).toEqual([
      'assinatura_digital',
    ])
    expect((await analisarPdf(await comFilho('Tx'))).avisos).toEqual([])
  })

  it('certificado: o /Perms com /DocMDP avisa, mesmo sem campo', async () => {
    const bytes = await montarPdf((documento) =>
      permissoes(documento, ['DocMDP']),
    )

    expect((await analisarPdf(bytes)).avisos).toEqual(['assinatura_digital'])
  })

  // Os recursos estendidos do Reader não são assinatura de ninguém: o arquivo só destrava o Reader.
  it('só o /UR3 no /Perms não avisa', async () => {
    const bytes = await montarPdf((documento) => permissoes(documento, ['UR3']))

    expect((await analisarPdf(bytes)).avisos).toEqual([])
  })

  it('XFA puro: /XFA com /Fields vazio ou sem /Fields', async () => {
    const fieldsVazio = await montarPdf((documento) =>
      acroForm(documento, { Fields: [], XFA: XFA_DO_LIVECYCLE(documento) }),
    )
    const semFields = await montarPdf((documento) =>
      acroForm(documento, { XFA: XFA_DO_LIVECYCLE(documento) }),
    )

    expect((await analisarPdf(fieldsVazio)).avisos).toEqual(['xfa_puro'])
    expect((await analisarPdf(semFields)).avisos).toEqual(['xfa_puro'])
  })

  // O híbrido perde o XFA ao gerar, em silêncio, como no aplicarEdicoes.
  it('o híbrido (campo no AcroForm e /XFA) não é XFA puro, e a leitura não escreve no console', async () => {
    const bytes = await montarPdf((documento) =>
      acroForm(documento, {
        Fields: [
          registrar(documento, { FT: 'Tx', T: PDFString.of('pessoa.nome') }),
        ],
        XFA: XFA_DO_LIVECYCLE(documento),
      }),
    )

    expect((await analisarPdf(bytes)).avisos).toEqual([])
    expect(console.warn).not.toHaveBeenCalled()
  })

  it('certificado e XFA puro: os dois avisos', async () => {
    const bytes = await montarPdf((documento) => {
      acroForm(documento, { Fields: [], XFA: XFA_DO_LIVECYCLE(documento) })
      permissoes(documento, ['DocMDP', 'UR3'])
    })

    expect((await analisarPdf(bytes)).avisos).toEqual([
      'assinatura_digital',
      'xfa_puro',
    ])
  })

  it('árvore de campos com ciclo nos /Kids termina, e acha a assinatura que está nela', async () => {
    const comCiclo = (assinada: boolean) =>
      montarPdf((documento) => {
        const { context } = documento
        const [a, b] = [context.nextRef(), context.nextRef()]
        const c = registrar(documento, {
          Parent: b,
          T: PDFString.of('c'),
          ...(assinada ? { V: valorDaAssinatura(documento) } : {}),
        })
        context.assign(
          a,
          context.obj({ FT: 'Sig', T: PDFString.of('a'), Kids: [b] }),
        )
        context.assign(
          b,
          context.obj({ Parent: a, T: PDFString.of('b'), Kids: [a, c, b] }),
        )
        acroForm(documento, { Fields: [a, a] })
      })

    expect((await analisarPdf(await comCiclo(false))).avisos).toEqual([])
    expect((await analisarPdf(await comCiclo(true))).avisos).toEqual([
      'assinatura_digital',
    ])
  })

  // Um filho de campo de assinatura que também está solto no /Fields (arquivo torto, mas há gerador que faz)
  // é de assinatura pelo pai; a ordem do /Fields não pode decidir se avisa.
  it('o filho de /Sig que também está na raiz do /Fields avisa, em qualquer ordem', async () => {
    const comFilhoNaRaiz = (paiPrimeiro: boolean) =>
      montarPdf((documento) => {
        const { context } = documento
        const pai = context.nextRef()
        const filho = registrar(documento, {
          Parent: pai,
          T: PDFString.of('a'),
          V: valorDaAssinatura(documento),
        })
        context.assign(
          pai,
          context.obj({ FT: 'Sig', T: PDFString.of('p'), Kids: [filho] }),
        )
        acroForm(documento, {
          Fields: paiPrimeiro ? [pai, filho] : [filho, pai],
        })
      })

    expect((await analisarPdf(await comFilhoNaRaiz(true))).avisos).toEqual([
      'assinatura_digital',
    ])
    expect((await analisarPdf(await comFilhoNaRaiz(false))).avisos).toEqual([
      'assinatura_digital',
    ])
  })

  // Cadeia de campos sem tipo, um em cada nível, com a assinatura (/FT /Sig e /V) pendurada no fim.
  function cadeiaComAssinatura(
    documento: PDFDocument,
    nivelDaAssinatura: number,
  ) {
    let no = registrar(documento, {
      FT: 'Sig',
      T: PDFString.of('assinatura'),
      V: valorDaAssinatura(documento),
    })
    const nos = [no]
    for (let nivel = nivelDaAssinatura - 1; nivel >= 0; nivel--) {
      no = registrar(documento, { T: PDFString.of(`n${nivel}`), Kids: [no] })
      nos.unshift(no)
    }
    return nos
  }

  it('a descida para em 64 níveis: a assinatura no nível 64 avisa, a do 65 não', async () => {
    const nivel = (n: number) =>
      montarPdf((documento) => {
        const [raiz] = cadeiaComAssinatura(documento, n)
        acroForm(documento, { Fields: [raiz] })
      })

    expect((await analisarPdf(await nivel(64))).avisos).toEqual([
      'assinatura_digital',
    ])
    expect((await analisarPdf(await nivel(65))).avisos).toEqual([])
  })

  // O mesmo campo pode estar no fim de um caminho comprido e também perto da raiz: o caminho visto
  // primeiro não pode esconder o que está abaixo dele.
  it('o campo que está no nível 64 de um caminho e na raiz de outro tem os filhos lidos, em qualquer ordem', async () => {
    const comAtalho = (atalhoPrimeiro: boolean) =>
      montarPdf((documento) => {
        const nos = cadeiaComAssinatura(documento, 65)
        const [raiz, noDoNivel64] = [nos[0], nos[64]]
        acroForm(documento, {
          Fields: atalhoPrimeiro ? [noDoNivel64, raiz] : [raiz, noDoNivel64],
        })
      })

    expect((await analisarPdf(await comAtalho(true))).avisos).toEqual([
      'assinatura_digital',
    ])
    expect((await analisarPdf(await comAtalho(false))).avisos).toEqual([
      'assinatura_digital',
    ])
  })
})

// Editor único: montarDocumento junta páginas de vários arquivos e páginas em branco, no lugar ou por cópia.

const daMontagem = (
  arquivo: number,
  indice: number,
  extra: Partial<PaginaDaMontagem> = {},
): PaginaDaMontagem => ({
  origem: { arquivo, indice },
  giro: 0,
  moldura: 0,
  ...extra,
})

const branca = (
  largura: number,
  altura: number,
  extra: Partial<PaginaDaMontagem> = {},
): PaginaDaMontagem => ({
  origem: { branca: { largura, altura } },
  giro: 0,
  moldura: 0,
  ...extra,
})

const deUmArquivo = (plano: readonly PaginaDoPlano[]) =>
  plano.map(({ indice, giro }) => daMontagem(0, indice, { giro }))

async function alturasDasPaginas(bytes: Uint8Array): Promise<number[]> {
  const documento = await PDFDocument.load(bytes)
  return documento.getPages().map((p) => p.getHeight())
}

// Conta as leituras, os copyPages e os salvamentos do pdf-lib. Liga depois de gerar os arquivos de entrada.
function contarChamadas() {
  const load = jest.spyOn(PDFDocument, 'load')
  const copyPages = jest.spyOn(PDFDocument.prototype, 'copyPages')
  const save = jest.spyOn(PDFDocument.prototype, 'save')
  return () => ({
    load: load.mock.calls.length,
    copyPages: copyPages.mock.calls.length,
    save: save.mock.calls.length,
  })
}

const ASCENDENTE = METRICAS_DAS_FONTES.helvetica.ascendente

describe('montarDocumento: no lugar (o primeiro arquivo inteiro, na ordem)', () => {
  it('mantém título, formulário e marcadores, agora também com giro, com um carregar e um salvar', async () => {
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
    const pdf = await documento.save()
    const chamadas = contarChamadas()

    const final = await montarDocumento(
      [pdf],
      [daMontagem(0, 0), daMontagem(0, 1, { giro: 90 })],
      [{ posicao: 0, objetos: [objetoTexto({ conteudo: 'Assinado' })] }],
    )

    expect(chamadas()).toEqual({ load: 1, copyPages: 0, save: 1 })
    const lido = await PDFDocument.load(final, { updateMetadata: false })
    expect(lido.getTitle()).toBe('Contrato')
    expect(lido.getProducer()).toBe(undefined)
    expect(lido.getForm().getTextField('nome').getText()).toBe('Paulo')
    expect(lido.catalog.has(PDFName.of('Outlines'))).toBe(true)
    expect(await ladosDasPaginas(final)).toEqual([300, 400])
    expect(await rotacoesDasPaginas(final)).toEqual([0, 90])
    const [{ matriz }] = lerComPdfjs(final).paginas[0].textos
    expect(matriz[4]).toBeCloseTo(40, 2)
    expect(matriz[5]).toBeCloseTo(60 + 20 * ASCENDENTE, 2)
  })

  it('com porCopia (o Extrair), o arquivo inteiro na ordem sai por cópia, sem o que é do documento', async () => {
    const documento = await PDFDocument.create({ updateMetadata: false })
    documento.setTitle('Contrato')
    documento.addPage([300, 300])
    documento.addPage([400, 400])
    documento.catalog.set(
      PDFName.of('Outlines'),
      documento.context.register(
        documento.context.obj({ Type: 'Outlines', Count: 0 }),
      ),
    )
    const pdf = await documento.save()
    const chamadas = contarChamadas()

    const final = await montarDocumento(
      [pdf],
      [daMontagem(0, 0), daMontagem(0, 1, { giro: 90 })],
      [],
      { porCopia: true },
    )

    expect(chamadas()).toEqual({ load: 1, copyPages: 1, save: 1 })
    const lido = await PDFDocument.load(final, { updateMetadata: false })
    expect(lido.getTitle()).toBeUndefined()
    expect(lido.catalog.has(PDFName.of('Outlines'))).toBe(false)
    expect(await ladosDasPaginas(final)).toEqual([300, 400])
    expect(await rotacoesDasPaginas(final)).toEqual([0, 90])
  })

  it('o /UR3 e o /DocMDP saem, como no Editar', async () => {
    const documento = await PDFDocument.create()
    documento.addPage([300, 300])
    documento.catalog.set(
      PDFName.of('Perms'),
      documento.context.obj({ UR3: {}, DocMDP: {} }),
    )
    const final = await montarDocumento(
      [await documento.save()],
      [daMontagem(0, 0)],
      [],
    )
    expect(
      (await PDFDocument.load(final)).catalog.has(PDFName.of('Perms')),
    ).toBe(false)
  })
})

describe('montarDocumento: por cópia', () => {
  it('dois arquivos intercalados e uma página em branco, na ordem do plano', async () => {
    const final = await montarDocumento(
      [await gerarPdf(3, 100), await gerarPdf(2, 200)],
      [
        daMontagem(0, 0),
        daMontagem(1, 1),
        branca(300, 400),
        daMontagem(0, 2),
        daMontagem(1, 0),
      ],
      [],
    )

    expect(await ladosDasPaginas(final)).toEqual([100, 201, 300, 102, 200])
    expect(await alturasDasPaginas(final)).toEqual([100, 201, 400, 102, 200])
  })

  it('lê cada arquivo uma vez, em sequência, só os que o plano usa, com um copyPages por arquivo e um salvar', async () => {
    const lidas: string[] = []
    const fonte = (nome: string, paginas: number, base: number) => {
      const bytes = gerarPdf(paginas, base)
      return async () => {
        lidas.push(nome)
        return bytes
      }
    }
    const fontes = [fonte('a', 3, 100), fonte('b', 1, 200), fonte('c', 2, 300)]
    await Promise.all(fontes.map((f) => f()))
    lidas.length = 0
    const chamadas = contarChamadas()

    const final = await montarDocumento(
      fontes,
      [daMontagem(2, 1), daMontagem(0, 0), daMontagem(2, 0), daMontagem(0, 2)],
      [],
    )

    expect(lidas).toEqual(['a', 'c'])
    expect(chamadas()).toEqual({ load: 2, copyPages: 2, save: 1 })
    expect(await ladosDasPaginas(final)).toEqual([301, 100, 300, 102])
  })

  it('só lê o arquivo seguinte depois de copiar o anterior: um arquivo por vez na memória', async () => {
    let chamadas: () => { copyPages: number } = () => ({ copyPages: -1 })
    const copiadosAoLer: number[] = []
    const fonte = (paginas: number, base: number) => {
      const bytes = gerarPdf(paginas, base)
      return async () => {
        copiadosAoLer.push(chamadas().copyPages)
        return bytes
      }
    }
    const fontes = [fonte(2, 100), fonte(1, 200), fonte(2, 300)]
    await Promise.all(fontes.map((f) => f()))
    copiadosAoLer.length = 0
    chamadas = contarChamadas()

    await montarDocumento(
      fontes,
      [daMontagem(2, 0), daMontagem(0, 1), daMontagem(1, 0), daMontagem(0, 0)],
      [],
    )

    expect(copiadosAoLer).toEqual([0, 1, 2])
  })

  it('um arquivo só, com todas as páginas fora da ordem: carregado uma vez, sem ler de novo para copiar', async () => {
    let lidas = 0
    const bytes = await gerarPdf(3, 100)
    const fonte = async () => {
      lidas += 1
      return bytes
    }
    const chamadas = contarChamadas()

    const final = await montarDocumento(
      [fonte],
      [daMontagem(0, 2), daMontagem(0, 0), daMontagem(0, 1)],
      [],
    )

    expect(lidas).toBe(1)
    expect(chamadas()).toEqual({ load: 1, copyPages: 1, save: 1 })
    expect(await ladosDasPaginas(final)).toEqual([102, 100, 101])
  })

  it('não duplica a imagem que as páginas de um arquivo compartilham, com páginas de outro arquivo no meio', async () => {
    const origem = await gerarPdfComImagemCompartilhada()

    const final = await montarDocumento(
      [await gerarPdf(2, 50), origem],
      [
        daMontagem(1, 9),
        daMontagem(0, 0),
        daMontagem(1, 0),
        daMontagem(1, 3),
        daMontagem(0, 1),
        daMontagem(1, 5),
      ],
      [],
    )

    expect(await contarPaginas(final)).toBe(6)
    expect(final.length).toBeLessThan(origem.length * 1.5)
  })

  it('a mesma imagem inserida em páginas do mesmo arquivo entra uma vez', async () => {
    const imagem = (): ObjetoDaPagina => ({
      id: id(),
      tipo: 'imagem',
      x: 10,
      y: 10,
      largura: 40,
      altura: 30,
      bytes: JPEG_8X8,
    })
    const final = await montarDocumento(
      [await gerarPdf(1, 100), await gerarPdf(2, 600)],
      [daMontagem(1, 1), daMontagem(0, 0), daMontagem(1, 0)],
      [
        { posicao: 0, objetos: [imagem()] },
        { posicao: 2, objetos: [imagem()] },
      ],
    )
    const documento = await PDFDocument.load(final)
    const imagens = documento.context
      .enumerateIndirectObjects()
      .filter(
        ([, objeto]) =>
          objeto instanceof PDFRawStream &&
          objeto.dict.get(PDFName.of('Subtype')) === PDFName.of('Image'),
      )
    expect(imagens).toHaveLength(1)
  })

  it('a mesma imagem inserida em duas páginas em branco entra uma vez', async () => {
    const imagem = (): ObjetoDaPagina => ({
      id: id(),
      tipo: 'imagem',
      x: 10,
      y: 10,
      largura: 40,
      altura: 30,
      bytes: JPEG_8X8,
    })
    const final = await montarDocumento(
      [await gerarPdf(1, 100)],
      [branca(300, 400), daMontagem(0, 0), branca(500, 600)],
      [
        { posicao: 0, objetos: [imagem()] },
        { posicao: 2, objetos: [imagem()] },
      ],
    )
    const documento = await PDFDocument.load(final)
    const imagens = documento.context
      .enumerateIndirectObjects()
      .filter(
        ([, objeto]) =>
          objeto instanceof PDFRawStream &&
          objeto.dict.get(PDFName.of('Subtype')) === PDFName.of('Image'),
      )
    expect(imagens).toHaveLength(1)
  })

  it('o conteúdo de uma página do segundo arquivo que ficou fora não vai junto pelo link que apontava para ela', async () => {
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
    const segundo = await documento.save()
    const primeiro = await gerarPdf(1, 50)

    const semAPagina3 = await montarDocumento(
      [primeiro, segundo],
      [daMontagem(0, 0), daMontagem(1, 0), daMontagem(1, 1)],
      [],
    )
    const comAPagina3 = await montarDocumento(
      [primeiro, segundo],
      [daMontagem(1, 2), daMontagem(0, 0), daMontagem(1, 0)],
      [],
    )

    expect(comoTexto(semAPagina3)).not.toContain('SEGREDO-DA-PAGINA-3')
    expect(await ladosDasPaginas(semAPagina3)).toEqual([50, 100, 101])
    expect(comoTexto(comAPagina3)).toContain('SEGREDO-DA-PAGINA-3')
    expect(await ladosDasPaginas(comAPagina3)).toEqual([102, 50, 100])
  })

  it('a página em branco sai do tamanho pedido, com os objetos onde a tela os pôs e o giro', async () => {
    const final = await montarDocumento(
      [await gerarPdf(1, 100)],
      [
        daMontagem(0, 0),
        branca(600, 800),
        branca(500, 700, { giro: 90, moldura: 90 }),
      ],
      [{ posicao: 1, objetos: [objetoTexto({ conteudo: 'NA-BRANCA' })] }],
    )

    expect(await ladosDasPaginas(final)).toEqual([100, 600, 500])
    expect(await alturasDasPaginas(final)).toEqual([100, 800, 700])
    expect(await rotacoesDasPaginas(final)).toEqual([0, 0, 90])
    const [, pagina] = lerComPdfjs(final).paginas
    expect(pagina.textos.map(({ str }) => str)).toEqual(['NA-BRANCA'])
    expect(pagina.textos[0].matriz[4]).toBeCloseTo(40, 2)
    expect(pagina.textos[0].matriz[5]).toBeCloseTo(60 + 20 * ASCENDENTE, 2)
  })

  it('o PDF novo não ganha os metadados do pdf-lib nem o título do arquivo', async () => {
    const primeiro = await PDFDocument.create({ updateMetadata: false })
    primeiro.setTitle('Título do primeiro')
    primeiro.addPage([100, 100])
    const final = await montarDocumento(
      [await primeiro.save(), await gerarPdf(1, 200)],
      [daMontagem(0, 0), daMontagem(1, 0)],
      [],
    )
    const documento = await PDFDocument.load(final, { updateMetadata: false })

    expect(documento.getTitle()).toBeUndefined()
    expect(documento.getProducer()).toBeUndefined()
    expect(documento.getCreator()).toBeUndefined()
    expect(documento.getCreationDate()).toBeUndefined()
  })

  describe('objetos nas páginas do segundo arquivo, nos cinco formatos', () => {
    let leitura: Leitura

    beforeAll(async () => {
      const final = await montarDocumento(
        [await gerarPdf(1, 100), await gerarPdfComFormatos(FORMATOS)],
        [daMontagem(0, 0), ...FORMATOS.map((_, i) => daMontagem(1, i))],
        FORMATOS.map((_, i) => ({ posicao: i + 1, objetos: umDeCada() })),
      )
      leitura = lerComPdfjs(final)
    })

    conferirFormatos(() => leitura, 1)
  })

  describe('apagar de verdade numa página do segundo arquivo', () => {
    let final: Uint8Array

    beforeAll(async () => {
      final = await montarDocumento(
        [await gerarPdf(1, 100), await gerarPdfComSegredos()],
        [daMontagem(0, 0), daMontagem(1, 0), daMontagem(1, 1)],
        [
          {
            posicao: 1,
            objetos: [
              {
                id: id(),
                tipo: 'cobrir',
                x: 40,
                y: 90,
                largura: 200,
                altura: 30,
              },
              objetoTexto({ conteudo: 'NOVO' }),
            ],
            fundo: JPEG_8X8,
          },
        ],
      )
    })

    it('nenhum segredo da página apagada sobra no arquivo', async () => {
      const conteudo = await todoOConteudo(final)
      expect(SEGREDOS.filter((segredo) => contem(conteudo, segredo))).toEqual(
        [],
      )
    })

    it('a página vira a imagem com o texto novo, e a outra página do arquivo fica', () => {
      const [, apagada, outra] = lerComPdfjs(final).paginas
      expect(apagada.textos.map(({ str }) => str)).toEqual(['NOVO'])
      acharDesenho(apagada.desenhos, [0, 0, 600, 800], 'imagem')
      expect(outra.textos.map(({ str }) => str)).toEqual(['FICA-NA-PAGINA-2'])
    })
  })

  describe('apagar de verdade com recursos herdados e uma página fora do plano que desenha o mesmo formulário', () => {
    // Os /Resources moram só na raiz da árvore. A (a apagada) e C (fora do plano) desenham Fx; B, que
    // fica, herda o mesmo dicionário sem desenhá-lo. Se C contasse como página que usa Fx, o Fx ficaria
    // no dicionário herdado e o copyPages de B o levaria para o arquivo final.
    async function gerar(): Promise<Uint8Array> {
      const documento = await PDFDocument.create({ updateMetadata: false })
      const { context } = documento
      const helvetica = documento.embedStandardFont(StandardFonts.Helvetica)
      const fx = context.register(
        context.stream('BT /F1 12 Tf 50 650 Td (SEGREDO-FX) Tj ET', {
          Type: 'XObject',
          Subtype: 'Form',
          BBox: [0, 0, 600, 800],
          Resources: { Font: { F1: helvetica.ref } },
        }),
      )
      const paginas = [0, 1, 2].map(() => documento.addPage([600, 800]))
      documento.catalog
        .Pages()
        .set(
          PDFName.Resources,
          context.obj({ XObject: { Fx: fx }, Font: { F1: helvetica.ref } }),
        )
      const conteudos = [
        'q /Fx Do Q',
        'BT /F1 12 Tf 50 700 Td (FICA) Tj ET',
        'q /Fx Do Q',
      ]
      paginas.forEach((pagina, i) => {
        pagina.node.delete(PDFName.Resources)
        pagina.node.set(
          PDFName.Contents,
          context.register(context.stream(conteudos[i])),
        )
      })
      return documento.save()
    }

    const apagar = (posicao: number) => [
      { posicao, objetos: [], fundo: JPEG_8X8 },
    ]

    it('no segundo arquivo: o formulário de A não sobra no arquivo', async () => {
      const final = await montarDocumento(
        [await gerarPdf(1, 100), await gerar()],
        [daMontagem(0, 0), daMontagem(1, 0), daMontagem(1, 1)],
        apagar(1),
      )

      expect(contem(await todoOConteudo(final), 'SEGREDO-FX')).toBe(false)
      expect(
        lerComPdfjs(final).paginas[2].textos.map(({ str }) => str),
      ).toEqual(['FICA'])
    })

    it('num arquivo só, reordenado: o formulário de A não sobra no arquivo', async () => {
      const final = await montarDocumento(
        [await gerar()],
        [daMontagem(0, 1), daMontagem(0, 0)],
        apagar(1),
      )

      expect(contem(await todoOConteudo(final), 'SEGREDO-FX')).toBe(false)
      expect(
        lerComPdfjs(final).paginas[0].textos.map(({ str }) => str),
      ).toEqual(['FICA'])
    })

    it('no lugar, com C no documento, o formulário fica: C ainda o mostra', async () => {
      const final = await montarDocumento(
        [await gerar()],
        [daMontagem(0, 0), daMontagem(0, 1), daMontagem(0, 2)],
        apagar(0),
      )

      expect(
        lerComPdfjs(final).paginas[2].textos.map(({ str }) => str),
      ).toEqual(['SEGREDO-FX'])
    })
  })
})

describe('montarDocumento: plano ou edição errados são erro de programação (RangeError)', () => {
  const valido = () => objetoTexto()
  it.each<[string, PaginaDaMontagem[], EdicaoNaMontagem[]]>([
    ['plano vazio', [], []],
    ['página repetida', [daMontagem(0, 0), daMontagem(0, 0)], []],
    ['índice negativo', [daMontagem(0, -1)], []],
    ['índice não inteiro', [daMontagem(0, 1.5)], []],
    ['índice NaN', [daMontagem(0, Number.NaN)], []],
    ['índice depois da última página', [daMontagem(0, 3)], []],
    [
      'índice fora do segundo arquivo',
      [daMontagem(0, 0), daMontagem(1, 2)],
      [],
    ],
    ['arquivo inexistente', [daMontagem(2, 0)], []],
    ['arquivo negativo', [daMontagem(-1, 0)], []],
    ['branca com lado zero', [branca(0, 100)], []],
    ['branca com lado NaN', [branca(100, Number.NaN)], []],
    ['branca com lado negativo', [branca(-100, 100)], []],
    ['branca com lado acima de 14.400 pontos', [branca(14_401, 100)], []],
    [
      'branca sem tamanho',
      [{ origem: { branca: {} }, giro: 0, moldura: 0 } as PaginaDaMontagem],
      [],
    ],
    [
      'origem desconhecida',
      [{ origem: {}, giro: 0, moldura: 0 } as PaginaDaMontagem],
      [],
    ],
    ['giro inválido', [daMontagem(0, 0, { giro: 45 as 0 })], []],
    ['giro 360', [daMontagem(0, 0, { giro: 360 as 0 })], []],
    ['giro -90', [daMontagem(0, 0, { giro: -90 as 0 })], []],
    ['moldura inválida', [daMontagem(0, 0, { moldura: 360 as 0 })], []],
    ['edição fora do plano', [daMontagem(0, 0)], [{ posicao: 1, objetos: [] }]],
    ['edição negativa', [daMontagem(0, 0)], [{ posicao: -1, objetos: [] }]],
    [
      'edição repetida',
      [daMontagem(0, 0)],
      [
        { posicao: 0, objetos: [] },
        { posicao: 0, objetos: [] },
      ],
    ],
    [
      'apagar de verdade numa página em branco',
      [branca(100, 100)],
      [{ posicao: 0, objetos: [], fundo: JPEG_8X8 }],
    ],
    [
      'objeto inválido',
      [daMontagem(0, 0)],
      [{ posicao: 0, objetos: [{ ...valido(), x: Number.NaN }] }],
    ],
  ])('%s', async (_, plano, edicoes) => {
    await expect(
      montarDocumento(
        [await gerarPdf(3, 100), await gerarPdf(2, 200)],
        plano,
        edicoes,
      ),
    ).rejects.toThrow(RangeError)
  })

  it('plano com mais páginas que o teto: RangeError antes de ler qualquer arquivo (defesa do Worker)', async () => {
    const fonte = jest.fn(async () => gerarPdf(1, 100))
    const demais = Array.from({ length: TETO_DE_PAGINAS + 1 }, () =>
      branca(100, 100),
    )
    await expect(montarDocumento([fonte], demais, [])).rejects.toThrow(
      RangeError,
    )
    expect(fonte).not.toHaveBeenCalled()
  })

  it('o plano no teto exato passa', async () => {
    const noTeto = Array.from({ length: TETO_DE_PAGINAS }, () =>
      branca(100, 100),
    )
    const pdf = await montarDocumento([], noTeto, [])
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(TETO_DE_PAGINAS)
  })

  it('o plano é conferido antes de ler qualquer arquivo', async () => {
    const fonte = jest.fn(async () => gerarPdf(1, 100))
    await expect(
      montarDocumento([fonte], [daMontagem(0, 0), daMontagem(1, 0)], []),
    ).rejects.toThrow(RangeError)
    expect(fonte).not.toHaveBeenCalled()
  })
})

describe('montarDocumento: o erro diz o arquivo ou a posição', () => {
  it('ErroDePdf com o índice do arquivo', async () => {
    const valido = await gerarPdf(1, 100)
    const ambos = [daMontagem(0, 0), daMontagem(1, 0)]

    expect(
      await motivo(
        montarDocumento([valido, await gerarPdfProtegido(false)], ambos, []),
      ),
    ).toEqual({ motivo: 'protegido', indice: 1 })
    expect(
      await motivo(montarDocumento([texto('não é PDF'), valido], ambos, [])),
    ).toEqual({ motivo: 'nao_e_pdf', indice: 0 })
    expect(
      await motivo(
        montarDocumento(
          [valido, texto('%PDF-1.7\nlixo lixo\n%%EOF\n')],
          ambos,
          [],
        ),
      ),
    ).toEqual({ motivo: 'corrompido', indice: 1 })
  })

  it('para no primeiro arquivo com erro, sem ler os seguintes nem salvar', async () => {
    const depois = jest.fn(async () => gerarPdf(1, 300))
    const fontes = [await gerarPdf(1, 100), texto('nada'), depois]
    const chamadas = contarChamadas()

    const falha = await motivo(
      montarDocumento(
        fontes,
        [daMontagem(0, 0), daMontagem(1, 0), daMontagem(2, 0)],
        [],
      ),
    )

    expect(falha).toEqual({ motivo: 'nao_e_pdf', indice: 1 })
    expect(depois).not.toHaveBeenCalled()
    expect(chamadas().save).toBe(0)
  })

  it('ErroNaEdicao com a posição no plano, numa página do segundo arquivo e numa branca', async () => {
    const quebrado = new Uint8Array([...PNG_2X2.slice(0, 8), 1, 2, 3, 4, 5])
    const imagemQuebrada = (): ObjetoDaPagina => ({
      id: id(),
      tipo: 'imagem',
      x: 10,
      y: 10,
      largura: 40,
      altura: 30,
      bytes: quebrado,
    })
    const fontes = [await gerarPdf(1, 600), await gerarPdf(2, 600)]
    const plano = [daMontagem(0, 0), branca(600, 600), daMontagem(1, 1)]

    expect(
      await erroNaEdicao(
        montarDocumento(fontes, plano, [
          {
            posicao: 2,
            objetos: [
              objetoTexto({ conteudo: 'ok' }),
              objetoTexto({ conteudo: 'Oi 中' }),
            ],
          },
        ]),
      ),
    ).toMatchObject({ motivo: 'texto_fora_do_winansi', pagina: 2, objeto: 1 })
    expect(
      await erroNaEdicao(
        montarDocumento(fontes, plano, [
          { posicao: 2, objetos: [objetoTexto(), imagemQuebrada()] },
        ]),
      ),
    ).toMatchObject({ motivo: 'imagem_corrompida', pagina: 2, objeto: 1 })
    expect(
      await erroNaEdicao(
        montarDocumento(fontes, plano, [
          { posicao: 1, objetos: [imagemQuebrada()] },
        ]),
      ),
    ).toMatchObject({ motivo: 'imagem_corrompida', pagina: 1, objeto: 0 })
    expect(
      await erroNaEdicao(
        montarDocumento(fontes, plano, [
          { posicao: 2, objetos: [], fundo: PNG_2X2 },
        ]),
      ),
    ).toMatchObject({ motivo: 'imagem_nao_aceita', pagina: 2 })
  })
})

// Os mesmos casos do organizarPaginas, pelo montarDocumento com um arquivo só.
describe('montarDocumento: os casos do organizar (antes no organizarPaginas)', () => {
  const plano = (...itens: [number, PaginaDoPlano['giro']?][]) =>
    deUmArquivo(itens.map(([indice, giro = 0]) => ({ indice, giro })))

  it('monta as páginas na ordem do plano', async () => {
    const final = await montarDocumento(
      [await gerarPdf(4, 100)],
      plano([3], [0], [2], [1]),
      [],
    )

    expect(await ladosDasPaginas(final)).toEqual([103, 100, 102, 101])
    expect(await rotacoesDasPaginas(final)).toEqual([0, 0, 0, 0])
  })

  it('soma o giro à rotação que a página já tinha e dá a volta em 360', async () => {
    const documento = await PDFDocument.load(await gerarPdf(3, 100))
    documento.getPage(0).setRotation(degrees(90))
    documento.getPage(1).setRotation(degrees(270))
    const bytes = await documento.save()

    const noLugar = await montarDocumento(
      [bytes],
      plano([0, 90], [1, 180], [2]),
      [],
    )
    const porCopia = await montarDocumento(
      [bytes],
      plano([2], [0, 90], [1, 180]),
      [],
    )

    expect(await rotacoesDasPaginas(noLugar)).toEqual([180, 90, 0])
    expect(await rotacoesDasPaginas(porCopia)).toEqual([0, 180, 90])
  })

  it('a rotação herdada da árvore de páginas também conta', async () => {
    const documento = await PDFDocument.load(await gerarPdf(2, 100))
    documento.catalog.Pages().set(PDFName.of('Rotate'), PDFNumber.of(90))
    const bytes = await documento.save()

    const porCopia = await montarDocumento([bytes], plano([1, 90], [0]), [])
    const noLugar = await montarDocumento([bytes], plano([0], [1, 90]), [])

    expect(await rotacoesDasPaginas(porCopia)).toEqual([180, 90])
    expect(lerComPdfjs(noLugar).paginas.map(({ rotate }) => rotate)).toEqual([
      90, 180,
    ])
  })

  it('/Rotate fora do padrão: o pdf.js mostra o mesmo que mostrava na miniatura, no lugar e por cópia', async () => {
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
    const rotacoesNoPdfjs = (final: Uint8Array) =>
      lerComPdfjs(final).paginas.map(({ rotate }) => rotate)

    const noLugar = await montarDocumento(
      [bytes],
      plano([0], [1], [2, 90], [3, 90]),
      [],
    )
    const porCopia = await montarDocumento(
      [bytes],
      plano([0], [1], [2, 90], [3, 90]).slice(0, 3),
      [],
    )

    expect(rotacoesNoPdfjs(noLugar)).toEqual([270, 90, 90, 90])
    expect(rotacoesNoPdfjs(porCopia)).toEqual([270, 90, 90])
  })

  it('por cópia, o /Rotate fora do padrão sai normalizado no arquivo, mesmo sem giro', async () => {
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

    const final = await montarDocumento(
      [await documento.save()],
      plano([3], [0], [1], [2]),
      [],
    )

    const lido = await PDFDocument.load(final)
    expect(
      lido.getPages().map(({ node }) => node.get(PDFName.of('Rotate'))),
    ).toEqual([0, 270, 90, 0].map((graus) => PDFNumber.of(graus)))
  })

  it('girar à esquerda a partir de 0 sai com /Rotate 270 no PDF', async () => {
    const final = await montarDocumento(
      [await gerarPdf(2, 100)],
      deUmArquivo(girar(planoInicial(2), [0], 'esquerda')),
      [],
    )

    expect(await rotacoesDasPaginas(final)).toEqual([270, 0])
  })

  it('apagar: a página fora do plano não vai para o arquivo', async () => {
    const final = await montarDocumento(
      [await gerarPdf(3, 100)],
      deUmArquivo(apagar(planoInicial(3), [1])),
      [],
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

    const final = await montarDocumento(
      [await gerarPdf(4, 100)],
      deUmArquivo(extrair(organizado, [0, 2])),
      [],
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

    const semAPagina3 = await montarDocumento([bytes], plano([0], [1]), [])
    const comAPagina3 = await montarDocumento([bytes], plano([2], [0]), [])

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

    const final = await montarDocumento([bytes], plano([0], [1]), [])

    expect(await ladosDasPaginas(final)).toEqual([100, 101])
  })

  describe('PDF que repete a mesma página no /Kids: o giro de uma não gira a outra', () => {
    async function comARepetida() {
      const documento = await PDFDocument.load(await gerarPdf(2, 100))
      const arvore = documento.catalog.Pages()
      arvore.Kids().push(documento.getPage(0).ref)
      arvore.set(PDFName.of('Count'), PDFNumber.of(3))
      return documento.save()
    }

    it('por cópia', async () => {
      const final = await montarDocumento(
        [await comARepetida()],
        plano([2], [0, 90]),
        [],
      )

      expect(await ladosDasPaginas(final)).toEqual([100, 100])
      expect(await rotacoesDasPaginas(final)).toEqual([0, 90])
    })

    it('o arquivo inteiro na ordem, só com giro', async () => {
      const final = await montarDocumento(
        [await comARepetida()],
        plano([0, 90], [1], [2]),
        [],
      )

      expect(await ladosDasPaginas(final)).toEqual([100, 101, 100])
      expect(await rotacoesDasPaginas(final)).toEqual([90, 0, 0])
    })

    it('as duas giradas: cada uma gira uma vez', async () => {
      const final = await montarDocumento(
        [await comARepetida()],
        plano([0, 90], [1], [2, 90]),
        [],
      )

      expect(await rotacoesDasPaginas(final)).toEqual([90, 0, 90])
    })

    // Menor do Crivo no #126: o /Rotate da apagada ia no nó compartilhado e girava a outra posição.
    it('apagar de verdade com giro numa delas: a outra não gira', async () => {
      const final = await montarDocumento(
        [await comARepetida()],
        plano([0, 90], [1], [2]),
        [{ posicao: 0, objetos: [], fundo: JPEG_8X8 }],
      )

      expect(await rotacoesDasPaginas(final)).toEqual([90, 0, 0])
    })

    // A outra posição desconta a moldura em que o JPEG da apagada foi desenhado (revisão do PR 3).
    it('apagar de verdade com a moldura diferente do giro (giro 0): a outra desconta a moldura', async () => {
      const final = await montarDocumento(
        [await comARepetida()],
        [
          daMontagem(0, 0, { giro: 0, moldura: 90 }),
          daMontagem(0, 1),
          daMontagem(0, 2),
        ],
        [{ posicao: 0, objetos: [], fundo: JPEG_8X8 }],
      )

      expect(await rotacoesDasPaginas(final)).toEqual([270, 0, 270])
    })

    // Menor 1 do Crivo no #127: o segundo esvaziar do mesmo nó derrubava o drawImage com
    // UnexpectedObjectTypeError. Cada JPEG tem só os cobrir da sua posição, e juntar os dois não dá sem
    // desenhar de novo (o segundo JPEG por cima do primeiro mostraria o que o primeiro cobriu).
    it.each([
      ['no lugar', plano([0], [1], [2]), 0, 2],
      ['por cópia', plano([2], [0]), 0, 1],
    ] as const)(
      'dois apagar de verdade no mesmo nó (%s) são recusados, apontando a segunda posição',
      async (_, oPlano, primeira, segunda) => {
        const erro = await erroNaEdicao(
          montarDocumento([await comARepetida()], oPlano, [
            { posicao: primeira, objetos: [], fundo: JPEG_8X8 },
            { posicao: segunda, objetos: [], fundo: JPEG_8X8 },
          ]),
        )

        expect(erro.motivo).toBe('apagar_na_pagina_repetida')
        expect(erro.pagina).toBe(segunda)
        expect(erro.objeto).toBeUndefined()
      },
    )

    it('por cópia, só a repetida apagada e girada', async () => {
      const final = await montarDocumento(
        [await comARepetida()],
        plano([2, 90], [0]),
        [{ posicao: 0, objetos: [], fundo: JPEG_8X8 }],
      )

      expect(await rotacoesDasPaginas(final)).toEqual([90, 0])
    })
  })

  // Revisão do PR 3: a apagada é desenhada na moldura, e o nó dela é o da outra posição. Com a moldura
  // diferente de 0, a outra posição precisa descontá-la, ou sai deitada no PDF enquanto a tela a mostra
  // em pé. A página é deitada (200 × 100) para a orientação aparecer no tamanho.
  describe('PDF que repete a mesma página no /Kids: a apagada com moldura não deita a outra', () => {
    async function comARepetidaDeitada() {
      const documento = await PDFDocument.create()
      documento.setTitle('TITULO-DO-ARQUIVO')
      documento.addPage([200, 100])
      documento.addPage([150, 150])
      const arvore = documento.catalog.Pages()
      arvore.Kids().push(documento.getPage(0).ref)
      arvore.set(PDFName.of('Count'), PDFNumber.of(3))
      return documento.save()
    }

    async function comoAparecem(bytes: Uint8Array): Promise<string[]> {
      const documento = await PDFDocument.load(bytes)
      return documento.getPages().map((pagina) => {
        const { width, height } = pagina.getSize()
        return pagina.getRotation().angle % 180 === 0
          ? `${width}x${height}`
          : `${height}x${width}`
      })
    }

    it.each([
      ['giro 0, moldura 90', 0, 90, ['200x100', '150x150', '200x100']],
      [
        'giro 90, moldura 90 (girou antes de cobrir)',
        90,
        90,
        ['100x200', '150x150', '200x100'],
      ],
      ['giro 90, moldura 0', 90, 0, ['100x200', '150x150', '200x100']],
      ['giro 180, moldura 90', 180, 90, ['200x100', '150x150', '200x100']],
    ] as const)(
      'o arquivo inteiro na ordem, %s',
      async (_, giro, moldura, esperado) => {
        const final = await montarDocumento(
          [await comARepetidaDeitada()],
          [
            daMontagem(0, 0, { giro, moldura }),
            daMontagem(0, 1),
            daMontagem(0, 2),
          ],
          [{ posicao: 0, objetos: [], fundo: JPEG_8X8 }],
        )

        expect(await comoAparecem(final)).toEqual(esperado)
      },
    )

    it.each([
      ['giro 90, moldura 90', 90, 90, ['200x100', '100x200']],
      ['giro 0, moldura 90', 0, 90, ['200x100', '200x100']],
      ['giro 270, moldura 90', 270, 90, ['200x100', '100x200']],
    ] as const)(
      'por cópia, só a repetida apagada, %s',
      async (_, giro, moldura, esperado) => {
        const final = await montarDocumento(
          [await comARepetidaDeitada()],
          [daMontagem(0, 2), daMontagem(0, 0, { giro, moldura })],
          [{ posicao: 1, objetos: [], fundo: JPEG_8X8 }],
        )

        expect(await comoAparecem(final)).toEqual(esperado)
      },
    )

    it('a outra posição girada também sai como a tela a mostra', async () => {
      const final = await montarDocumento(
        [await comARepetidaDeitada()],
        [
          daMontagem(0, 0, { giro: 90, moldura: 90 }),
          daMontagem(0, 1),
          daMontagem(0, 2, { giro: 90 }),
        ],
        [{ posicao: 0, objetos: [], fundo: JPEG_8X8 }],
      )

      expect(await comoAparecem(final)).toEqual([
        '100x200',
        '150x150',
        '100x200',
      ])
    })

    // Menor 2 do Crivo no #127: o arquivo inteiro na ordem, sem giro, com a apagada na moldura 90. Sem
    // giro, girar no lugar não mexe na outra posição, então o plano sai no lugar e guarda o título, os
    // marcadores e os links; a tela não mostra o aviso de alcance para ele (saiPorCopia é falso). A
    // cláusula "fundo && moldura !== 0" do giraPaginaRepetida o mandava por cópia e perdia o título.
    it('sem giro, com a apagada na moldura 90: sai no lugar, com o título do arquivo', async () => {
      const final = await montarDocumento(
        [await comARepetidaDeitada()],
        [daMontagem(0, 0, { moldura: 90 }), daMontagem(0, 1), daMontagem(0, 2)],
        [{ posicao: 0, objetos: [], fundo: JPEG_8X8 }],
      )

      const documento = await PDFDocument.load(final, {
        updateMetadata: false,
      })
      expect(documento.getTitle()).toBe('TITULO-DO-ARQUIVO')
      expect(await comoAparecem(final)).toEqual([
        '200x100',
        '150x150',
        '200x100',
      ])
    })

    // O mesmo plano com um texto na outra posição: a tela a mostra como ela é (200 × 100), e o texto vai
    // onde ela o pôs.
    it('sem giro, a outra posição com texto: o texto sai onde a tela o pôs', async () => {
      const final = await montarDocumento(
        [await comARepetidaDeitada()],
        [daMontagem(0, 0, { moldura: 90 }), daMontagem(0, 1), daMontagem(0, 2)],
        [
          { posicao: 0, objetos: [], fundo: JPEG_8X8 },
          { posicao: 2, objetos: [objetoTexto({ conteudo: 'NA-OUTRA' })] },
        ],
      )

      expect(await comoAparecem(final)).toEqual([
        '200x100',
        '150x150',
        '200x100',
      ])
      const outra = lerComPdfjs(final).paginas[2]
      expect(outra.textos.map(({ str }) => str)).toEqual(['NA-OUTRA'])
      expect(outra.textos[0].matriz[4]).toBeCloseTo(40, 2)
      expect(outra.textos[0].matriz[5]).toBeCloseTo(60 + 20 * ASCENDENTE, 2)
    })

    // O mesmo caso por cópia, que é o caminho de todo Gerar com dois arquivos (PR 4) e do Extrair: a
    // apagada sai da origem sem giro, então a outra posição desconta a moldura dela ao desenhar.
    it('por cópia, a outra posição com texto: o texto sai onde a tela o pôs', async () => {
      const final = await montarDocumento(
        [await comARepetidaDeitada()],
        [daMontagem(0, 0, { moldura: 90 }), daMontagem(0, 2)],
        [
          { posicao: 0, objetos: [], fundo: JPEG_8X8 },
          { posicao: 1, objetos: [objetoTexto({ conteudo: 'NA-OUTRA' })] },
        ],
        { porCopia: true },
      )

      expect(await comoAparecem(final)).toEqual(['200x100', '200x100'])
      const outra = lerComPdfjs(final).paginas[1]
      expect(outra.textos.map(({ str }) => str)).toEqual(['NA-OUTRA'])
      expect(outra.textos[0].matriz[4]).toBeCloseTo(40, 2)
      expect(outra.textos[0].matriz[5]).toBeCloseTo(60 + 20 * ASCENDENTE, 2)
    })

    // A apagada esvazia o nó: o texto da posição que vem antes dela no plano não pode ir junto.
    it.each([
      ['no lugar', {}],
      ['por cópia', { porCopia: true }],
    ] as const)(
      'a outra posição vem antes da apagada (%s): o texto dela fica',
      async (_, opcoes) => {
        const final = await montarDocumento(
          [await comARepetidaDeitada()],
          [daMontagem(0, 0), daMontagem(0, 1), daMontagem(0, 2)],
          [
            { posicao: 0, objetos: [objetoTexto({ conteudo: 'ANTES' })] },
            { posicao: 2, objetos: [], fundo: JPEG_8X8 },
          ],
          opcoes,
        )

        const primeira = lerComPdfjs(final).paginas[0]
        expect(primeira.textos.map(({ str }) => str)).toEqual(['ANTES'])
        expect(primeira.textos[0].matriz[4]).toBeCloseTo(40, 2)
      },
    )
  })

  // Achado do Crivo no #128: com o mesmo nó em duas posições do /Kids, os objetos de uma posição eram
  // desenhados no nó compartilhado e apareciam nas duas. A tela mostra cada posição com os seus objetos;
  // cada posição com objeto ganha a sua página (sem apagar de verdade no nó, que segue as regras acima).
  describe('PDF que repete a mesma página no /Kids: os objetos de uma posição não vão para a outra', () => {
    async function comARepetida() {
      const documento = await PDFDocument.load(await gerarPdf(2, 100))
      const arvore = documento.catalog.Pages()
      arvore.Kids().push(documento.getPage(0).ref)
      arvore.set(PDFName.of('Count'), PDFNumber.of(3))
      documento.setTitle('TITULO-DO-ARQUIVO')
      return documento.save()
    }

    const textosDe = (bytes: Uint8Array) =>
      lerComPdfjs(bytes).paginas.map(({ textos }) =>
        textos.map(({ str }) => str),
      )

    it('no lugar: AAA na posição 0 e BBB na 2 saem cada um na sua', async () => {
      const final = await montarDocumento(
        [await comARepetida()],
        plano([0], [1], [2]),
        [
          { posicao: 0, objetos: [objetoTexto({ conteudo: 'AAA' })] },
          { posicao: 2, objetos: [objetoTexto({ conteudo: 'BBB' })] },
        ],
      )

      expect(textosDe(final)).toEqual([['AAA'], [], ['BBB']])
      expect(await ladosDasPaginas(final)).toEqual([100, 101, 100])
      const documento = await PDFDocument.load(final, { updateMetadata: false })
      expect(documento.getTitle()).toBe('TITULO-DO-ARQUIVO')
    })

    it('por cópia: AAA na posição 0 e BBB na 1 (plano [2, 0]) saem cada um na sua', async () => {
      const final = await montarDocumento(
        [await comARepetida()],
        plano([2], [0]),
        [
          { posicao: 0, objetos: [objetoTexto({ conteudo: 'AAA' })] },
          { posicao: 1, objetos: [objetoTexto({ conteudo: 'BBB' })] },
        ],
      )

      expect(textosDe(final)).toEqual([['AAA'], ['BBB']])
      expect(await ladosDasPaginas(final)).toEqual([100, 100])
    })

    it.each([
      ['no lugar', plano([0], [1], [2]), 0, [['AAA'], [], []]],
      [
        'no lugar, na segunda posição',
        plano([0], [1], [2]),
        2,
        [[], [], ['AAA']],
      ],
      ['por cópia', plano([2], [0]), 1, [[], ['AAA']]],
    ] as const)(
      'só uma posição com objeto (%s): a outra fica sem ele',
      async (_, oPlano, posicao, esperado) => {
        const final = await montarDocumento([await comARepetida()], oPlano, [
          { posicao, objetos: [objetoTexto({ conteudo: 'AAA' })] },
        ])

        expect(textosDe(final)).toEqual(esperado)
      },
    )

    it('no aplicarEdicoes (o Editar de um arquivo), também', async () => {
      const final = await aplicarEdicoes(await comARepetida(), [
        { indice: 0, objetos: [objetoTexto({ conteudo: 'AAA' })] },
        { indice: 2, objetos: [objetoTexto({ conteudo: 'BBB' })] },
      ])

      expect(textosDe(final)).toEqual([['AAA'], [], ['BBB']])
    })

    it('com giro numa delas (sai por cópia), cada uma com o seu texto e o seu giro', async () => {
      const final = await montarDocumento(
        [await comARepetida()],
        plano([0, 90], [1], [2]),
        [
          { posicao: 0, objetos: [objetoTexto({ conteudo: 'AAA' })] },
          { posicao: 2, objetos: [objetoTexto({ conteudo: 'BBB' })] },
        ],
      )

      expect(textosDe(final)).toEqual([['AAA'], [], ['BBB']])
      expect(await rotacoesDasPaginas(final)).toEqual([90, 0, 0])
    })

    it('a página da outra posição guarda o link da original', async () => {
      const documento = await PDFDocument.load(await comARepetida())
      const link = documento.context.register(
        documento.context.obj({
          Type: 'Annot',
          Subtype: 'Link',
          Rect: [0, 0, 10, 10],
          A: { S: 'URI', URI: PDFString.of('https://exemplo.com/') },
        }),
      )
      documento
        .getPage(0)
        .node.set(PDFName.Annots, documento.context.obj([link]))
      const bytes = await documento.save()

      const final = await montarDocumento([bytes], plano([0], [1], [2]), [
        { posicao: 2, objetos: [objetoTexto({ conteudo: 'BBB' })] },
      ])

      const anotacoes = (await PDFDocument.load(final))
        .getPages()
        .map(({ node }) => node.Annots()?.size() ?? 0)
      expect(anotacoes).toEqual([1, 0, 1])
      expect(textosDe(final)).toEqual([[], [], ['BBB']])
    })

    // Sem objeto no nó, nada a separar: o arquivo no lugar não muda além do pedido.
    it('sem objeto no nó repetido, ele continua um só', async () => {
      const final = await montarDocumento(
        [await comARepetida()],
        plano([0], [1], [2]),
        [{ posicao: 1, objetos: [objetoTexto({ conteudo: 'AAA' })] }],
      )

      const paginas = (await PDFDocument.load(final)).getPages()
      expect(paginas[2].ref).toBe(paginas[0].ref)
    })

    // Com conteúdo, o /Contents do nó é uma lista; a página própria não pode dividi-la com a original.
    it('a página que já tinha conteúdo: cada posição com o seu texto', async () => {
      const documento = await PDFDocument.load(await gerarPdf(2, 100))
      documento.getPage(0).drawRectangle({ x: 1, y: 1, width: 5, height: 5 })
      const arvore = documento.catalog.Pages()
      arvore.Kids().push(documento.getPage(0).ref)
      arvore.set(PDFName.of('Count'), PDFNumber.of(3))
      const bytes = await documento.save()

      const final = await montarDocumento([bytes], plano([0], [1], [2]), [
        { posicao: 0, objetos: [objetoTexto({ conteudo: 'AAA' })] },
        { posicao: 2, objetos: [objetoTexto({ conteudo: 'BBB' })] },
      ])

      expect(textosDe(final)).toEqual([['AAA'], [], ['BBB']])
    })

    // O nó repetido herda o /Rotate do pai dele; a página própria da outra posição pode entrar sob outro
    // pai, então leva o que herdava.
    it('a outra posição sob outro pai continua com o que herdava', async () => {
      const documento = await PDFDocument.create()
      documento.addPage([100, 100])
      documento.addPage([101, 101])
      const raiz = documento.catalog.Pages()
      const raizRef = documento.catalog.get(PDFName.of('Pages')) as PDFRef
      const [primeira, segunda] = raiz.Kids().asArray() as PDFRef[]
      const meio = documento.context.obj({
        Type: 'Pages',
        Kids: [primeira],
        Count: 1,
        Rotate: 90,
        Parent: raizRef,
      })
      const meioRef = documento.context.register(meio)
      documento.getPage(0).node.set(PDFName.Parent, meioRef)
      raiz.set(
        PDFName.of('Kids'),
        documento.context.obj([meioRef, segunda, primeira]),
      )
      raiz.set(PDFName.of('Count'), PDFNumber.of(3))
      const bytes = await documento.save()

      const final = await montarDocumento([bytes], plano([0], [1], [2]), [
        { posicao: 0, objetos: [objetoTexto({ conteudo: 'AAA' })] },
        { posicao: 2, objetos: [objetoTexto({ conteudo: 'BBB' })] },
      ])

      expect(await rotacoesDasPaginas(final)).toEqual([90, 0, 90])
      expect(textosDe(final)).toEqual([['AAA'], [], ['BBB']])
    })

    // A página só herda o /Resources e o /MediaBox de um /Pages do meio: a da outra posição, sob a raiz,
    // perderia a fonte do conteúdo que já estava nela e o tamanho.
    async function comRecursosNoMeio() {
      const documento = await PDFDocument.create()
      const fonte = await documento.embedFont(StandardFonts.Helvetica)
      documento
        .addPage([300, 300])
        .drawText('ORIGINAL', { x: 20, y: 150, font: fonte, size: 20 })
      documento.addPage([320, 320])
      const raiz = documento.catalog.Pages()
      const raizRef = documento.catalog.get(PDFName.of('Pages')) as PDFRef
      const [primeira, segunda] = raiz.Kids().asArray() as PDFRef[]
      const no = documento.getPage(0).node
      const recursos = no.get(PDFName.of('Resources'))!
      const caixa = no.get(PDFName.of('MediaBox'))!
      no.delete(PDFName.of('Resources'))
      no.delete(PDFName.of('MediaBox'))
      const meio = documento.context.obj({
        Type: 'Pages',
        Kids: [primeira],
        Count: 1,
        Parent: raizRef,
      })
      meio.set(PDFName.of('Resources'), recursos)
      meio.set(PDFName.of('MediaBox'), caixa)
      const meioRef = documento.context.register(meio)
      no.set(PDFName.Parent, meioRef)
      raiz.set(
        PDFName.of('Kids'),
        documento.context.obj([meioRef, segunda, primeira]),
      )
      raiz.set(PDFName.of('Count'), PDFNumber.of(3))
      return documento.save()
    }

    it('a outra posição sob outro pai continua com os recursos e o tamanho que herdava', async () => {
      const final = await montarDocumento(
        [await comRecursosNoMeio()],
        plano([0], [1], [2]),
        [
          { posicao: 0, objetos: [objetoTexto({ conteudo: 'AAA' })] },
          { posicao: 2, objetos: [objetoTexto({ conteudo: 'BBB' })] },
        ],
      )

      expect(await ladosDasPaginas(final)).toEqual([300, 320, 300])
      const documento = await PDFDocument.load(final)
      const fontes = [0, 2].map((posicao) => {
        const recursos = documento.context.lookup(
          documento
            .getPage(posicao)
            .node.getInheritableAttribute(PDFName.of('Resources')),
          PDFDict,
        )
        return recursos
          .lookup(PDFName.of('Font'), PDFDict)
          .keys()
          .map(String)
          .sort()
      })
      expect(fontes[1]).toEqual(fontes[0])
      expect(textosDe(final)).toEqual([
        ['ORIGINAL', 'AAA'],
        [],
        ['ORIGINAL', 'BBB'],
      ])
    })

    // Os marcadores e destinos do arquivo apontam para o nó: ele fica na primeira posição.
    it('o destino do arquivo continua na primeira posição do nó', async () => {
      const documento = await PDFDocument.load(await gerarPdf(2, 100))
      const arvore = documento.catalog.Pages()
      const primeira = documento.getPage(0).ref
      arvore.Kids().push(primeira)
      arvore.set(PDFName.of('Count'), PDFNumber.of(3))
      documento.catalog.set(
        PDFName.of('OpenAction'),
        documento.context.obj([primeira, PDFName.of('Fit')]),
      )

      const final = await montarDocumento(
        [await documento.save()],
        plano([0], [1], [2]),
        [{ posicao: 2, objetos: [objetoTexto({ conteudo: 'BBB' })] }],
      )

      const lido = await PDFDocument.load(final)
      const alvo = lido.catalog
        .lookup(PDFName.of('OpenAction'), PDFArray)
        .get(0) as PDFRef
      expect(lido.getPages().findIndex(({ ref }) => ref === alvo)).toBe(0)
      expect(textosDe(final)).toEqual([[], [], ['BBB']])
    })
  })

  // Menor 1 do Crivo no #129: com apagar de verdade numa posição do nó, os objetos de outra posição iam
  // para o nó apagado e saíam em todas ([AAA, CCC] nas posições 0, 2 e 3). Agora o nó fica com a apagada
  // e cada outra posição ganha a sua página, com o conteúdo de antes do JPEG, como a tela a mostra. Sem
  // objeto fora da apagada, nada muda: o nó continua um só e o segredo coberto some de todas (o #127).
  // Nenhum nó fica repetido na saída: o pdf.js só lê o nó repetido quando a primeira vez dele já está no
  // cache, e [outra, p1, apagada, apagada] reprovava na última página ("circular reference").
  describe('PDF que repete a mesma página no /Kids: apagar de verdade numa posição e objetos em outra', () => {
    // O /Kids repete a página 0 nas posições 0, 2 e 3; ela tem o texto SEGREDO.
    async function comARepetidaTresVezes() {
      const documento = await PDFDocument.create()
      const fonte = await documento.embedFont(StandardFonts.Helvetica)
      documento
        .addPage([300, 300])
        .drawText('SEGREDO', { x: 20, y: 150, font: fonte, size: 20 })
      documento.addPage([301, 301])
      const arvore = documento.catalog.Pages()
      arvore.Kids().push(documento.getPage(0).ref)
      arvore.Kids().push(documento.getPage(0).ref)
      arvore.set(PDFName.of('Count'), PDFNumber.of(4))
      documento.setTitle('TITULO-DO-ARQUIVO')
      return documento.save()
    }

    const textosDe = (bytes: Uint8Array) =>
      lerComPdfjs(bytes).paginas.map(({ textos }) =>
        textos.map(({ str }) => str),
      )

    it('no lugar (a sonda do Crivo): cada posição com o que a tela mostra, e o título fica', async () => {
      const final = await montarDocumento(
        [await comARepetidaTresVezes()],
        plano([0], [1], [2], [3]),
        [
          {
            posicao: 0,
            objetos: [objetoTexto({ conteudo: 'AAA' })],
            fundo: JPEG_8X8,
          },
          { posicao: 2, objetos: [objetoTexto({ conteudo: 'CCC' })] },
        ],
      )

      expect(textosDe(final)).toEqual([
        ['AAA'],
        [],
        ['SEGREDO', 'CCC'],
        ['SEGREDO'],
      ])
      expect(await ladosDasPaginas(final)).toEqual([300, 301, 300, 300])
      const documento = await PDFDocument.load(final, { updateMetadata: false })
      expect(documento.getTitle()).toBe('TITULO-DO-ARQUIVO')
    })

    it('por cópia (plano [0, 2]): cada posição com o seu texto', async () => {
      const final = await montarDocumento(
        [await comARepetidaTresVezes()],
        plano([0], [2]),
        [
          {
            posicao: 0,
            objetos: [objetoTexto({ conteudo: 'AAA' })],
            fundo: JPEG_8X8,
          },
          { posicao: 1, objetos: [objetoTexto({ conteudo: 'BBB' })] },
        ],
      )

      expect(textosDe(final)).toEqual([['AAA'], ['SEGREDO', 'BBB']])
    })

    it('a apagada depois da posição com objetos (no lugar)', async () => {
      const final = await montarDocumento(
        [await comARepetidaTresVezes()],
        plano([0], [1], [2], [3]),
        [
          { posicao: 0, objetos: [objetoTexto({ conteudo: 'CCC' })] },
          {
            posicao: 2,
            objetos: [objetoTexto({ conteudo: 'AAA' })],
            fundo: JPEG_8X8,
          },
        ],
      )

      expect(textosDe(final)).toEqual([
        ['SEGREDO', 'CCC'],
        [],
        ['AAA'],
        ['SEGREDO'],
      ])
    })

    // A página própria tem o conteúdo de antes do JPEG: não desconta a moldura da apagada.
    it.each([
      ['no lugar', plano([0], [1], [2], [3]), 2, [270, 0, 0, 0]],
      ['por cópia', plano([0], [2]), 1, [270, 0]],
    ] as const)(
      'com a apagada na moldura 90 (%s), a posição com objetos não gira',
      async (_, oPlano, comObjeto, rotacoes) => {
        const final = await montarDocumento(
          [await comARepetidaTresVezes()],
          oPlano.map((pagina, posicao) =>
            posicao === 0 ? { ...pagina, moldura: 90 as const } : pagina,
          ),
          [
            { posicao: 0, objetos: [], fundo: JPEG_8X8 },
            {
              posicao: comObjeto,
              objetos: [objetoTexto({ conteudo: 'CCC' })],
            },
          ],
        )

        expect(await rotacoesDasPaginas(final)).toEqual(rotacoes)
        expect(textosDe(final)[comObjeto]).toEqual(['SEGREDO', 'CCC'])
      },
    )

    it('sem objeto fora da apagada, o nó continua um só e o segredo some de todas as posições', async () => {
      const final = await montarDocumento(
        [await comARepetidaTresVezes()],
        plano([0], [1], [2], [3]),
        [
          {
            posicao: 0,
            objetos: [objetoTexto({ conteudo: 'AAA' })],
            fundo: JPEG_8X8,
          },
        ],
      )

      expect(textosDe(final)).toEqual([['AAA'], [], ['AAA'], ['AAA']])
      const paginas = (await PDFDocument.load(final)).getPages()
      expect(paginas[2].ref).toBe(paginas[0].ref)
      expect(paginas[3].ref).toBe(paginas[0].ref)
    })

    // O nó fica com a apagada mesmo quando ela não é a primeira posição: o que apontava para ele (aqui um
    // destino nomeado) descrevia o conteúdo coberto e sai, como saía antes.
    it('o nó fica com a apagada: o destino nomeado que apontava para ele sai', async () => {
      const documento = await PDFDocument.load(await comARepetidaTresVezes())
      documento.catalog.set(
        PDFName.of('Dests'),
        documento.context.obj({
          'SEGREDO-DESTINO': [documento.getPage(0).ref, PDFName.of('Fit')],
        }),
      )

      const final = await montarDocumento(
        [await documento.save()],
        plano([0], [1], [2], [3]),
        [
          { posicao: 0, objetos: [objetoTexto({ conteudo: 'CCC' })] },
          { posicao: 2, objetos: [], fundo: JPEG_8X8 },
        ],
      )

      const lido = await PDFDocument.load(final)
      expect(lido.catalog.get(PDFName.of('Dests'))).toBeUndefined()
      expect(textosDe(final)).toEqual([['SEGREDO', 'CCC'], [], [], ['SEGREDO']])
    })

    it('duas apagadas no mesmo nó continuam recusadas, mesmo com objetos em outra posição', async () => {
      const erro = await erroNaEdicao(
        montarDocumento(
          [await comARepetidaTresVezes()],
          plano([0], [1], [2], [3]),
          [
            { posicao: 0, objetos: [], fundo: JPEG_8X8 },
            { posicao: 2, objetos: [objetoTexto({ conteudo: 'CCC' })] },
            { posicao: 3, objetos: [], fundo: JPEG_8X8 },
          ],
        ),
      )

      expect(erro.motivo).toBe('apagar_na_pagina_repetida')
      expect(erro.pagina).toBe(3)
    })
  })

  // O que se repete no /Kids é um /Pages do meio (a raiz com /Kids [meio, meio]), não a folha.
  describe('PDF que repete um /Pages do meio no /Kids: as páginas e os objetos de cada posição', () => {
    async function comOMeioRepetido() {
      const documento = await PDFDocument.create()
      documento.addPage([100, 100])
      documento.addPage([101, 101])
      const raiz = documento.catalog.Pages()
      const raizRef = documento.catalog.get(PDFName.of('Pages')) as PDFRef
      const folhas = raiz.Kids().asArray() as PDFRef[]
      const meioRef = documento.context.register(
        documento.context.obj({
          Type: 'Pages',
          Kids: folhas,
          Count: 2,
          Parent: raizRef,
        }),
      )
      for (const folha of folhas) {
        documento.context.lookup(folha, PDFDict).set(PDFName.Parent, meioRef)
      }
      raiz.set(PDFName.of('Kids'), documento.context.obj([meioRef, meioRef]))
      raiz.set(PDFName.of('Count'), PDFNumber.of(4))
      return documento.save()
    }

    const textosDe = (bytes: Uint8Array) =>
      lerComPdfjs(bytes).paginas.map(({ textos }) =>
        textos.map(({ str }) => str),
      )

    it.each([
      ['as duas (o Extrair)', [0, 1], [100, 101], [['AAA'], []]],
      ['só a primeira', [0], [100], [['AAA']]],
      ['só a segunda', [1], [101], [['AAA']]],
    ] as const)(
      'por cópia, %s, com AAA na primeira do plano',
      async (_, indices, lados, textos) => {
        const final = await montarDocumento(
          [await comOMeioRepetido()],
          deUmArquivo(indices.map((indice) => ({ indice, giro: 0 }))),
          [{ posicao: 0, objetos: [objetoTexto({ conteudo: 'AAA' })] }],
          { porCopia: true },
        )

        expect(await ladosDasPaginas(final)).toEqual(lados)
        expect(textosDe(final)).toEqual(textos)
      },
    )

    it('no lugar: AAA na posição 0 e BBB na 3 saem cada um na sua', async () => {
      const final = await montarDocumento(
        [await comOMeioRepetido()],
        deUmArquivo([0, 1, 2, 3].map((indice) => ({ indice, giro: 0 }))),
        [
          { posicao: 0, objetos: [objetoTexto({ conteudo: 'AAA' })] },
          { posicao: 3, objetos: [objetoTexto({ conteudo: 'BBB' })] },
        ],
      )

      expect(await ladosDasPaginas(final)).toEqual([100, 101, 100, 101])
      expect(textosDe(final)).toEqual([['AAA'], [], [], ['BBB']])
    })

    it('no aplicarEdicoes, também', async () => {
      const final = await aplicarEdicoes(await comOMeioRepetido(), [
        { indice: 0, objetos: [objetoTexto({ conteudo: 'AAA' })] },
      ])

      expect(await ladosDasPaginas(final)).toEqual([100, 101, 100, 101])
      expect(textosDe(final)).toEqual([['AAA'], [], [], []])
    })
  })

  it('não duplica a imagem que as páginas compartilham, nem reordenadas e com páginas a menos', async () => {
    const origem = await gerarPdfComImagemCompartilhada()
    const organizado = apagar(
      moverSelecionadas(planoInicial(10), [9], 'antes'),
      [0, 5],
    )

    const final = await montarDocumento([origem], deUmArquivo(organizado), [])

    expect(await contarPaginas(final)).toBe(8)
    expect(final.length).toBeLessThan(origem.length * 1.5)
  })

  it('o PDF novo não ganha os metadados do pdf-lib', async () => {
    const final = await montarDocumento(
      [await gerarPdf(2, 100)],
      plano([1]),
      [],
    )
    const documento = await PDFDocument.load(final, { updateMetadata: false })

    expect(documento.getProducer()).toBeUndefined()
    expect(documento.getCreator()).toBeUndefined()
    expect(documento.getCreationDate()).toBeUndefined()
  })

  it.each([
    ['tabela de xref', false],
    ['object streams', true],
  ])(
    'PDF protegido (%s): recusado como protegido, com o arquivo',
    async (_nome, objectStreams) => {
      const bytes = await gerarPdfProtegido(objectStreams)
      expect(await motivo(montarDocumento([bytes], plano([0]), []))).toEqual({
        motivo: 'protegido',
        indice: 0,
      })
    },
  )

  it('arquivo que não é PDF ou corrompido: mesmas regras do contarPaginas', async () => {
    expect(
      (await motivo(montarDocumento([texto('não é PDF')], plano([0]), [])))
        .motivo,
    ).toBe('nao_e_pdf')
    expect(
      (
        await motivo(
          montarDocumento(
            [texto('%PDF-1.7\nlixo lixo\n%%EOF\n')],
            plano([0]),
            [],
          ),
        )
      ).motivo,
    ).toBe('corrompido')
  })
})

// A moldura: os objetos guardam a posição da página como a tela a mostrava (/Rotate + moldura) e giram
// com ela. Lida com o giro desde então desfeito (giro − moldura), a página tem que mostrar o texto de pé,
// onde a tela o pôs.
describe('montarDocumento: giro e moldura (os objetos giram com a página)', () => {
  const CASOS = [0, 90].flatMap((rotacao) =>
    ([0, 90] as const).flatMap((moldura) =>
      ([0, 90, 270] as const).map((giro) => ({ rotacao, moldura, giro })),
    ),
  )
  const giroDesdeOsObjetos = CASOS.map(({ giro, moldura }) =>
    giroNormalizado(giro - moldura),
  )

  async function gerarPdfDosCasos(): Promise<Uint8Array> {
    const documento = await PDFDocument.create()
    const helvetica = documento.embedStandardFont(StandardFonts.Helvetica)
    for (const { rotacao } of CASOS) {
      const pagina = documento.addPage([600, 800])
      pagina.drawText('ORIGINAL', { x: 300, y: 100, font: helvetica, size: 12 })
      pagina.setRotation(degrees(rotacao))
    }
    return documento.save()
  }

  const textoDePe = (pagina: Leitura['paginas'][number]) => {
    const novo = pagina.textos.find(({ str }) => str === 'NOVO')
    expect(novo).toBeDefined()
    const [a, b, c, d, e, f] = novo!.matriz
    expect([a, b, c, d].map((v) => Math.round(v))).toEqual([20, 0, 0, -20])
    expect(e).toBeCloseTo(40, 2)
    expect(f).toBeCloseTo(60 + 20 * ASCENDENTE, 2)
  }

  describe.each([
    ['no lugar', false, false],
    ['no lugar, com apagar de verdade', false, true],
    ['por cópia', true, false],
    ['por cópia, com apagar de verdade', true, true],
  ])('%s', (_, porCopia, apagarDeVerdade) => {
    const antes = porCopia ? 1 : 0
    let leitura: Leitura

    beforeAll(async () => {
      const casos = await gerarPdfDosCasos()
      const arquivo = porCopia ? 1 : 0
      const final = await montarDocumento(
        porCopia ? [await gerarPdf(1, 100), casos] : [casos],
        [
          ...(porCopia ? [daMontagem(0, 0)] : []),
          ...CASOS.map(({ moldura, giro }, i) =>
            daMontagem(arquivo, i, { moldura, giro }),
          ),
        ],
        CASOS.map((_, i) => ({
          posicao: antes + i,
          objetos: [objetoTexto({ conteudo: 'NOVO' })],
          ...(apagarDeVerdade ? { fundo: JPEG_8X8 } : {}),
        })),
      )
      leitura = lerComPdfjs(final, [
        ...(porCopia ? [0] : []),
        ...giroDesdeOsObjetos,
      ])
    })

    it.each(CASOS.map((caso, i) => [caso.rotacao, caso.moldura, caso.giro, i]))(
      '/Rotate %i, moldura %i, giro %i',
      (rotacao, moldura, giro, i) => {
        const pagina = leitura.paginas[antes + i]
        expect(pagina.rotate).toBe(
          apagarDeVerdade
            ? giroNormalizado(giro - moldura)
            : giroNormalizado(rotacao + giro),
        )
        const deitada = (rotacao + moldura) % 180 === 90
        expect([pagina.largura, pagina.altura]).toEqual(
          deitada ? [800, 600] : [600, 800],
        )
        textoDePe(pagina)
        if (apagarDeVerdade) {
          expect(pagina.textos.map(({ str }) => str)).toEqual(['NOVO'])
          acharDesenho(
            pagina.desenhos,
            [0, 0, pagina.largura, pagina.altura],
            'imagem',
          )
        } else {
          expect(pagina.textos.map(({ str }) => str)).toContain('ORIGINAL')
        }
      },
    )
  })

  describe('página em branco', () => {
    const DA_BRANCA = CASOS.filter(({ rotacao }) => rotacao === 0)
    let leitura: Leitura

    beforeAll(async () => {
      const final = await montarDocumento(
        [await gerarPdf(1, 100)],
        [
          daMontagem(0, 0),
          ...DA_BRANCA.map(({ moldura, giro }) =>
            branca(600, 800, { moldura, giro }),
          ),
        ],
        DA_BRANCA.map((_, i) => ({
          posicao: 1 + i,
          objetos: [objetoTexto({ conteudo: 'NOVO' })],
        })),
      )
      leitura = lerComPdfjs(final, [
        0,
        ...DA_BRANCA.map(({ giro, moldura }) =>
          giroNormalizado(giro - moldura),
        ),
      ])
    })

    it.each(DA_BRANCA.map((caso, i) => [caso.moldura, caso.giro, i]))(
      'moldura %i, giro %i',
      (moldura, giro, i) => {
        const pagina = leitura.paginas[1 + i]
        expect(pagina.rotate).toBe(giro)
        expect([pagina.largura, pagina.altura]).toEqual(
          moldura === 90 ? [800, 600] : [600, 800],
        )
        textoDePe(pagina)
      },
    )
  })
})
