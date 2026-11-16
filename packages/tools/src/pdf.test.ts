import { PDFDocument, PDFName, PDFNumber, degrees } from 'pdf-lib'
import {
  ErroDePdf,
  contarPaginas,
  mesclarPdfs,
  organizarPaginas,
  temCabecalhoDePdf,
} from './pdf'
import {
  apagar,
  extrair,
  girar,
  moverSelecionadas,
  planoInicial,
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
