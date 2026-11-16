import { PDFDocument, PDFName } from 'pdf-lib'
import { ErroDePdf, contarPaginas, mesclarPdfs, temCabecalhoDePdf } from './pdf'

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
    const origem = await documento.save()

    const final = await mesclarPdfs([origem, await gerarPdf(1, 100)])

    expect(final.length).toBeLessThan(origem.length * 1.5)
  })
})
