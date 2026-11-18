/**
 * @jest-environment node
 */
import { PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream } from 'pdf-lib'
import type {
  ObjetoNaTela,
  PaginaParaMontar,
  PedidoAoWorker,
  PedidoDeMontagem,
  RespostaDoWorker,
} from './motor'

// O Worker de verdade, com o pdf-lib de verdade: o `self` do Worker vira o global do Node,
// e cada postMessage dele cai na lista abaixo.
type Escopo = {
  self?: unknown
  onmessage?: (evento: { data: PedidoAoWorker }) => void
  postMessage?: (resposta: RespostaDoWorker) => void
}
const escopo = globalThis as unknown as Escopo
const respostas: RespostaDoWorker[] = []

beforeAll(async () => {
  escopo.self = globalThis
  escopo.postMessage = (resposta) => respostas.push(resposta)
  await import('./pdf.worker')
})

afterAll(() => {
  delete escopo.self
  delete escopo.postMessage
  delete escopo.onmessage
})

let proximoId = 0

async function pedir(
  pedido: (id: number) => PedidoAoWorker,
): Promise<RespostaDoWorker[]> {
  const id = proximoId++
  escopo.onmessage!({ data: pedido(id) })
  const final = (r: RespostaDoWorker) => r.id === id && r.tipo !== 'andamento'
  for (let tentativa = 0; !respostas.some(final); tentativa++) {
    if (tentativa > 400) throw new Error(`sem resposta para o pedido ${id}`)
    await new Promise((r) => setTimeout(r, 5))
  }
  return respostas.filter((r) => r.id === id)
}

// Cada página com um lado diferente: o PDF de saída diz a ordem.
async function pdf(lados: number[]): Promise<Blob> {
  const documento = await PDFDocument.create()
  for (const lado of lados) documento.addPage([lado, lado])
  return new Blob([new Uint8Array(await documento.save())], {
    type: 'application/pdf',
  })
}

async function protegido(): Promise<Blob> {
  const documento = await PDFDocument.load(
    new Uint8Array(await (await pdf([100])).arrayBuffer()),
  )
  documento.context.trailerInfo.Encrypt = documento.context.register(
    documento.context.obj({ Filter: 'Standard', V: 1, R: 2, P: -4 }),
  )
  return new Blob([
    new Uint8Array(await documento.save({ useObjectStreams: false })),
  ])
}

async function paginasDe(resposta: RespostaDoWorker) {
  if (resposta.tipo !== 'pronto') throw new Error(`veio ${resposta.tipo}`)
  const documento = await PDFDocument.load(resposta.bytes)
  return documento.getPages().map((p) => ({
    lado: p.getWidth(),
    rotacao: p.getRotation().angle,
  }))
}

it('mesclar segue mandando o andamento e entrega o PDF como pronto', async () => {
  const arquivos = [await pdf([100]), await pdf([200, 201])]

  const respostasDoPedido = await pedir((id) => ({
    tipo: 'mesclar',
    id,
    arquivos,
  }))

  expect(respostasDoPedido.map((r) => r.tipo)).toEqual([
    'andamento',
    'andamento',
    'andamento',
    'pronto',
  ])
  expect(
    (await paginasDe(respostasDoPedido.at(-1)!)).map((p) => p.lado),
  ).toEqual([100, 200, 201])
})

it('analisar segue contando as páginas e recusando o que não é PDF ou está protegido', async () => {
  const [bom, vazio, comSenha] = [
    await pdf([100, 200, 300]),
    new Blob([]),
    await protegido(),
  ]

  const [contado] = await pedir((id) => ({
    tipo: 'analisar',
    id,
    arquivo: bom,
  }))
  const [naoEPdf] = await pedir((id) => ({
    tipo: 'analisar',
    id,
    arquivo: vazio,
  }))
  const [recusado] = await pedir((id) => ({
    tipo: 'analisar',
    id,
    arquivo: comSenha,
  }))

  expect(contado).toMatchObject({ tipo: 'analisado', paginas: 3 })
  expect(naoEPdf).toMatchObject({ tipo: 'recusado', motivo: 'nao_e_pdf' })
  expect(recusado).toMatchObject({ tipo: 'recusado', motivo: 'protegido' })
})

it('analisar manda os avisos junto das páginas: nenhum no comum, a assinatura no certificado', async () => {
  const documento = await PDFDocument.create()
  documento.addPage([100, 100])
  documento.catalog.set(
    PDFName.of('Perms'),
    documento.context.obj({ DocMDP: documento.context.obj({ Type: 'Sig' }) }),
  )
  const certificado = new Blob([new Uint8Array(await documento.save())])
  const simples = await pdf([100])

  const [comum] = await pedir((id) => ({
    tipo: 'analisar',
    id,
    arquivo: simples,
  }))
  const [assinado] = await pedir((id) => ({
    tipo: 'analisar',
    id,
    arquivo: certificado,
  }))

  expect(comum).toEqual({
    tipo: 'analisado',
    id: comum.id,
    paginas: 1,
    avisos: [],
  })
  expect(assinado).toEqual({
    tipo: 'analisado',
    id: assinado.id,
    paginas: 1,
    avisos: ['assinatura_digital'],
  })
})

describe('montar', () => {
  const deBase64 = (texto: string) =>
    Uint8Array.from(atob(texto), (c) => c.charCodeAt(0))
  // PNG 2×2 com transparência e JPEG 8×8, os mesmos do teste do packages/tools.
  const PNG = deBase64(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR42mP4z8DwHwgbGIA0CDAAAEPTCHl4ziHMAAAAAElFTkSuQmCC',
  )
  const JPEG = deBase64(
    '/9j/4AAQSkZJRgABAQAASABIAAD/wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9sAQwAEBAQEBAQGBAQGCQYGBgkMCQkJCQwPDAwMDAwPEg8PDw8PDxISEhISEhISFRUVFRUVGRkZGRkcHBwcHBwcHBwc/9sAQwEEBQUHBwcMBwcMHRQQFB0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0d/90ABAAB/9oADAMBAAIRAxEAPwC38L9P/wBTx6V73/Z/tXjnwv8A+WP4V73XBnvCeWfXJ/uz7LiWvP8AtCep/9k=',
  )
  const PNG_QUEBRADO = new Uint8Array([...PNG.slice(0, 8), 1, 2, 3, 4, 5])
  const caixa = { x: 20, y: 20, largura: 40, altura: 30 }
  const texto = (id: string, conteudo: string): ObjetoNaTela => ({
    ...caixa,
    id,
    tipo: 'texto',
    conteudo,
    fonte: 'helvetica',
    negrito: false,
    italico: false,
    tamanho: 12,
    cor: '#000000',
  })
  const imagem = (id: string, arquivo: string): ObjetoNaTela => ({
    ...caixa,
    id,
    tipo: 'imagem',
    imagem: arquivo,
  })
  const cobrir = (id: string): ObjetoNaTela => ({
    ...caixa,
    id,
    tipo: 'cobrir',
  })
  const doArquivo = (
    arquivo: number,
    indice: number,
    giro: 0 | 90 = 0,
  ): PaginaParaMontar => ({
    id: `a${arquivo}p${indice}`,
    origem: { arquivo, indice },
    giro,
    moldura: 0,
  })

  function montar(arquivos: Blob[], pedido: Partial<PedidoDeMontagem>) {
    return pedir((id) => ({
      tipo: 'montar',
      id,
      arquivos,
      paginas: [],
      objetosPorPagina: new Map(),
      imagens: new Map(),
      paginasRasterizadas: new Map(),
      ...pedido,
    }))
  }

  async function imagensDe(resposta: RespostaDoWorker) {
    if (resposta.tipo !== 'pronto') throw new Error(`veio ${resposta.tipo}`)
    const documento = await PDFDocument.load(resposta.bytes)
    return documento.context
      .enumerateIndirectObjects()
      .map(([, objeto]) => objeto)
      .filter(
        (objeto) =>
          objeto instanceof PDFRawStream &&
          objeto.dict.get(PDFName.of('Subtype')) === PDFName.of('Image'),
      )
  }

  it('junta as páginas de dois arquivos na ordem pedida, com o giro de cada uma', async () => {
    const [resposta] = await montar([await pdf([100, 200]), await pdf([300])], {
      paginas: [doArquivo(1, 0, 90), doArquivo(0, 1), doArquivo(0, 0)],
    })

    expect(await paginasDe(resposta)).toEqual([
      { lado: 300, rotacao: 90 },
      { lado: 200, rotacao: 0 },
      { lado: 100, rotacao: 0 },
    ])
  })

  it('o arquivo inteiro, na ordem, só com giro: sai no lugar, com o título do arquivo', async () => {
    const documento = await PDFDocument.create()
    documento.setTitle('Contrato')
    documento.addPage([100, 100])
    documento.addPage([200, 200])
    const arquivo = new Blob([new Uint8Array(await documento.save())])

    const [resposta] = await montar([arquivo], {
      paginas: [doArquivo(0, 0, 90), doArquivo(0, 1)],
    })

    if (resposta.tipo !== 'pronto') throw new Error(`veio ${resposta.tipo}`)
    const final = await PDFDocument.load(resposta.bytes)
    expect(final.getTitle()).toBe('Contrato')
    expect(await paginasDe(resposta)).toEqual([
      { lado: 100, rotacao: 90 },
      { lado: 200, rotacao: 0 },
    ])
  })

  it('com porCopia (o Extrair), o arquivo inteiro na ordem sai por cópia, sem o título do arquivo', async () => {
    const documento = await PDFDocument.create()
    documento.setTitle('Contrato')
    documento.addPage([100, 100])
    documento.addPage([200, 200])
    const arquivo = new Blob([new Uint8Array(await documento.save())])

    const [resposta] = await montar([arquivo], {
      paginas: [doArquivo(0, 0, 90), doArquivo(0, 1)],
      porCopia: true,
    })

    if (resposta.tipo !== 'pronto') throw new Error(`veio ${resposta.tipo}`)
    const final = await PDFDocument.load(resposta.bytes)
    expect(final.getTitle()).toBeUndefined()
    expect(await paginasDe(resposta)).toEqual([
      { lado: 100, rotacao: 90 },
      { lado: 200, rotacao: 0 },
    ])
  })

  it('os objetos vão pela página do id, também na do segundo arquivo, e cada imagem é lida uma vez', async () => {
    const logo = new Blob([PNG], { type: 'image/png' })
    const lerLogo = jest.spyOn(logo, 'arrayBuffer')

    const [resposta] = await montar([await pdf([300]), await pdf([400])], {
      paginas: [doArquivo(1, 0), doArquivo(0, 0)],
      objetosPorPagina: new Map([
        ['a1p0', [imagem('i1', 'logo'), texto('t1', 'OLA')]],
        ['a0p0', [imagem('i2', 'logo')]],
      ]),
      imagens: new Map([['logo', logo]]),
    })

    expect(resposta.tipo).toBe('pronto')
    expect(lerLogo).toHaveBeenCalledTimes(1)
    // Uma vez por arquivo de origem (efeito aceito no plano): o PNG com transparência é a imagem e a máscara.
    expect(await imagensDe(resposta)).toHaveLength(4)
  })

  it('a mesma imagem em objetos da mesma página é embutida uma vez; o JPEG, uma imagem só', async () => {
    const [resposta] = await montar([await pdf([300, 400])], {
      paginas: [doArquivo(0, 0), doArquivo(0, 1)],
      objetosPorPagina: new Map([
        [
          'a0p1',
          [imagem('i1', 'logo'), imagem('i2', 'logo'), imagem('i3', 'foto')],
        ],
      ]),
      imagens: new Map([
        ['logo', new Blob([PNG], { type: 'image/png' })],
        ['foto', new Blob([JPEG], { type: 'image/jpeg' })],
      ]),
    })

    expect(
      (await imagensDe(resposta))
        .map((i) =>
          (i as PDFRawStream).dict.get(PDFName.of('Width'))!.toString(),
        )
        .sort(),
    ).toEqual(['2', '2', '8'])
  })

  it('com o apagar de verdade, o objeto culpado é o da tela, contando os cobrir que não são desenhados', async () => {
    const [resposta] = await montar([await pdf([300])], {
      paginas: [doArquivo(0, 0)],
      objetosPorPagina: new Map([
        ['a0p0', [cobrir('c1'), imagem('i1', 'quebrada')]],
      ]),
      imagens: new Map([['quebrada', new Blob([PNG_QUEBRADO])]]),
      paginasRasterizadas: new Map([['a0p0', new Blob([JPEG])]]),
    })

    expect(resposta).toMatchObject({
      tipo: 'falhou',
      motivo: 'imagem_corrompida',
      pagina: 'a0p0',
      objeto: 'i1',
    })
  })

  it('só o fundo, sem objetos, também apaga de verdade a página', async () => {
    const [resposta] = await montar([await pdf([300])], {
      paginas: [doArquivo(0, 0)],
      paginasRasterizadas: new Map([['a0p0', new Blob([JPEG])]]),
    })

    expect(
      (await imagensDe(resposta)).map((i) =>
        (i as PDFRawStream).dict.get(PDFName.of('Width'))!.toString(),
      ),
    ).toEqual(['8'])
  })

  it('texto fora do WinAnsi numa página do segundo arquivo: falha com o id da página e o do objeto', async () => {
    const respostasDoPedido = await montar(
      [await pdf([300]), await pdf([400])],
      {
        paginas: [doArquivo(0, 0), doArquivo(1, 0)],
        objetosPorPagina: new Map([
          ['a1p0', [texto('t1', 'ok'), texto('t2', 'oi 😀')]],
        ]),
      },
    )

    expect(respostasDoPedido).toEqual([
      {
        tipo: 'falhou',
        id: respostasDoPedido[0].id,
        motivo: 'texto_fora_do_winansi',
        pagina: 'a1p0',
        objeto: 't2',
        caracteres: ['😀'],
      },
    ])
  })

  // Menor 1 do Crivo no #127: o mesmo nó em duas posições do /Kids, as duas apagadas de verdade. A
  // pessoa resolve na tela (tira uma), então a falha diz a página e não é "inesperado".
  it('dois apagar de verdade no mesmo nó repetido do /Kids: falha com o id da segunda, sem objeto', async () => {
    const documento = await PDFDocument.load(
      new Uint8Array(await (await pdf([300, 400])).arrayBuffer()),
    )
    const arvore = documento.catalog.Pages()
    arvore.Kids().push(documento.getPage(0).ref)
    arvore.set(PDFName.of('Count'), PDFNumber.of(3))
    const repetida = new Blob([new Uint8Array(await documento.save())])

    const respostasDoPedido = await montar([repetida], {
      paginas: [doArquivo(0, 0), doArquivo(0, 1), doArquivo(0, 2)],
      paginasRasterizadas: new Map([
        ['a0p0', new Blob([JPEG])],
        ['a0p2', new Blob([JPEG])],
      ]),
    })

    expect(respostasDoPedido).toEqual([
      {
        tipo: 'falhou',
        id: respostasDoPedido[0].id,
        motivo: 'apagar_na_pagina_repetida',
        pagina: 'a0p2',
      },
    ])
  })

  it('o arquivo protegido falha com o motivo e o índice do arquivo', async () => {
    const [resposta] = await montar([await pdf([300]), await protegido()], {
      paginas: [doArquivo(0, 0), doArquivo(1, 0)],
    })

    expect(resposta).toEqual({
      tipo: 'falhou',
      id: resposta.id,
      motivo: 'protegido',
      indice: 1,
    })
  })

  // PR 5: a página em branco vai ao Worker como o PR 1 previu, `{ branca: tamanho }` na origem, com o
  // id `b<n>` e os objetos pelo id.
  describe('a página em branco', () => {
    const branca = (
      id: string,
      largura: number,
      altura: number,
      giro: 0 | 90 = 0,
    ): PaginaParaMontar => ({
      id,
      origem: { branca: { largura, altura } },
      giro,
      moldura: giro,
    })

    // Só a página com texto ganha uma fonte nos recursos.
    async function fontesDe(resposta: RespostaDoWorker) {
      if (resposta.tipo !== 'pronto') throw new Error(`veio ${resposta.tipo}`)
      const documento = await PDFDocument.load(resposta.bytes)
      return documento
        .getPages()
        .map(
          ({ node }) =>
            node.Resources()?.lookupMaybe(PDFName.of('Font'), PDFDict)?.keys()
              .length ?? 0,
        )
    }

    it('entra entre as páginas dos arquivos, com o tamanho, o giro e os objetos dela', async () => {
      const [resposta] = await montar([await pdf([300]), await pdf([400])], {
        paginas: [
          doArquivo(1, 0),
          branca('b0', 500, 700),
          doArquivo(0, 0),
          branca('b1', 842, 595, 90),
        ],
        objetosPorPagina: new Map([['b1', [texto('t1', 'NA-BRANCA')]]]),
      })

      expect(resposta.tipo).toBe('pronto')
      if (resposta.tipo !== 'pronto') return
      const documento = await PDFDocument.load(resposta.bytes)
      expect(
        documento.getPages().map((p) => ({
          ...p.getSize(),
          rotacao: p.getRotation().angle,
        })),
      ).toEqual([
        { width: 400, height: 400, rotacao: 0 },
        { width: 500, height: 700, rotacao: 0 },
        { width: 300, height: 300, rotacao: 0 },
        { width: 842, height: 595, rotacao: 90 },
      ])
      expect(await fontesDe(resposta)).toEqual([0, 0, 0, 1])
    })

    it('só brancas, sem arquivo nenhum: o PDF sai com elas', async () => {
      const [resposta] = await montar([], {
        paginas: [branca('b0', 595.28, 841.89), branca('b1', 300, 200)],
      })

      expect(await paginasDe(resposta)).toEqual([
        { lado: 595.28, rotacao: 0 },
        { lado: 300, rotacao: 0 },
      ])
    })

    it('texto fora do WinAnsi numa branca: falha com o id dela e o do objeto', async () => {
      const [resposta] = await montar([], {
        paginas: [branca('b3', 595, 842)],
        objetosPorPagina: new Map([['b3', [texto('t9', 'oi 😀')]]]),
      })

      expect(resposta).toMatchObject({
        tipo: 'falhou',
        motivo: 'texto_fora_do_winansi',
        pagina: 'b3',
        objeto: 't9',
      })
    })

    // Na branca não há o que apagar: a tela não oferece, e o Worker estrito recusa.
    it.each<[string, Partial<PedidoDeMontagem>]>([
      [
        'apagar de verdade numa branca',
        {
          paginas: [branca('b0', 595, 842)],
          paginasRasterizadas: new Map([['b0', new Blob([JPEG])]]),
        },
      ],
      [
        'branca acima do limite dos leitores de PDF',
        { paginas: [branca('b0', 595, 14_401)] },
      ],
      ['branca sem área', { paginas: [branca('b0', 0, 842)] }],
    ])('%s: inesperado', async (_, pedido) => {
      const respostasDoPedido = await montar([], pedido)

      expect(respostasDoPedido).toEqual([
        { tipo: 'falhou', id: respostasDoPedido[0].id, motivo: 'inesperado' },
      ])
    })
  })

  // O pedido chega por postMessage: id que não está nas páginas, id repetido e plano errado são erro do
  // código da tela, não do arquivo nem da pessoa.
  it.each<[string, Partial<PedidoDeMontagem>]>([
    [
      'objetos de uma página que não está no pedido',
      {
        paginas: [doArquivo(0, 0)],
        objetosPorPagina: new Map([['a0p9', [texto('t1', 'oi')]]]),
      },
    ],
    [
      'fundo de uma página que não está no pedido',
      {
        paginas: [doArquivo(0, 0)],
        paginasRasterizadas: new Map([['a0p9', new Blob([PNG])]]),
      },
    ],
    [
      'id de página repetido',
      { paginas: [doArquivo(0, 0), { ...doArquivo(0, 1), id: 'a0p0' }] },
    ],
    ['página fora do arquivo', { paginas: [doArquivo(0, 5)] }],
    [
      'fundo que não é JPEG',
      {
        paginas: [doArquivo(0, 0)],
        paginasRasterizadas: new Map([['a0p0', new Blob([PNG])]]),
      },
    ],
    [
      'imagem que não veio',
      {
        paginas: [doArquivo(0, 0)],
        objetosPorPagina: new Map([['a0p0', [imagem('i1', 'sumiu')]]]),
      },
    ],
  ])('%s: inesperado', async (_, pedido) => {
    const respostasDoPedido = await montar([await pdf([300, 400])], pedido)

    expect(respostasDoPedido).toEqual([
      { tipo: 'falhou', id: respostasDoPedido[0].id, motivo: 'inesperado' },
    ])
  })
})
