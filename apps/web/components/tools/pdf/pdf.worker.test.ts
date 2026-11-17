/**
 * @jest-environment node
 */
import { PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib'
import type {
  ObjetoNaTela,
  PedidoAoWorker,
  PedidoDeEdicao,
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

it('organizar devolve o PDF na ordem do plano, com o giro de cada página', async () => {
  const arquivo = await pdf([100, 200, 300])

  const [resposta] = await pedir((id) => ({
    tipo: 'organizar',
    id,
    arquivo,
    plano: [
      { indice: 2, giro: 90 },
      { indice: 0, giro: 0 },
    ],
  }))

  expect(await paginasDe(resposta)).toEqual([
    { lado: 300, rotacao: 90 },
    { lado: 100, rotacao: 0 },
  ])
})

it('organizar de um PDF protegido falha com o motivo, sem índice', async () => {
  const arquivo = await protegido()

  const [resposta] = await pedir((id) => ({
    tipo: 'organizar',
    id,
    arquivo,
    plano: [{ indice: 0, giro: 0 }],
  }))

  expect(resposta).toEqual({
    tipo: 'falhou',
    id: resposta.id,
    motivo: 'protegido',
  })
})

// O plano chega por postMessage: um plano errado é erro do código da tela, não do arquivo.
it('organizar com plano errado falha como inesperado, sem acusar o arquivo', async () => {
  const arquivo = await pdf([100, 200])

  const respostasDoPedido = await pedir((id) => ({
    tipo: 'organizar',
    id,
    arquivo,
    plano: [{ indice: 5, giro: 0 }],
  }))

  expect(respostasDoPedido).toEqual([
    { tipo: 'falhou', id: respostasDoPedido[0].id, motivo: 'inesperado' },
  ])
})

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

describe('editar', () => {
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

  function editar(arquivo: Blob, pedido: Partial<PedidoDeEdicao>) {
    return pedir((id) => ({
      tipo: 'editar',
      id,
      arquivo,
      objetosPorPagina: new Map(),
      imagens: new Map(),
      paginasRasterizadas: new Map(),
      ...pedido,
    }))
  }

  async function conteudoDe(resposta: RespostaDoWorker) {
    if (resposta.tipo !== 'pronto') throw new Error(`veio ${resposta.tipo}`)
    const documento = await PDFDocument.load(resposta.bytes)
    const streams = documento.context
      .enumerateIndirectObjects()
      .map(([, objeto]) => objeto)
      .filter((objeto) => objeto instanceof PDFRawStream)
    const imagens = streams.filter(
      (stream) =>
        stream.dict.get(PDFName.of('Subtype')) === PDFName.of('Image'),
    )
    const texto = streams
      .filter((stream) => !imagens.includes(stream))
      .map((stream) =>
        new TextDecoder('latin1').decode(decodePDFRawStream(stream).decode()),
      )
      .join('\n')
    return { paginas: documento.getPageCount(), imagens, texto }
  }

  const emHexa = (s: string) =>
    Array.from(s, (c) => c.charCodeAt(0).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()

  it('desenha os objetos de cada página, e a imagem repetida é lida e embutida uma vez', async () => {
    const [resposta] = await editar(await pdf([300, 400]), {
      objetosPorPagina: new Map([
        [
          1,
          [
            texto('t1', 'OLA'),
            imagem('i1', 'logo'),
            imagem('i2', 'logo'),
            imagem('i3', 'foto'),
          ],
        ],
      ]),
      imagens: new Map([
        ['logo', new Blob([PNG], { type: 'image/png' })],
        ['foto', new Blob([JPEG], { type: 'image/jpeg' })],
      ]),
    })

    const { paginas, imagens, texto: conteudo } = await conteudoDe(resposta)
    expect(paginas).toBe(2)
    // O PNG com transparência vira a imagem e a máscara dela; o JPEG, uma imagem só.
    expect(
      imagens.map((i) => i.dict.get(PDFName.of('Width'))!.toString()).sort(),
    ).toEqual(['2', '2', '8'])
    expect(conteudo.toUpperCase()).toContain(emHexa('OLA'))
  })

  it('texto fora do WinAnsi: falha com a página, o id do objeto e os caracteres', async () => {
    const respostasDoPedido = await editar(await pdf([300]), {
      objetosPorPagina: new Map([
        [0, [texto('t1', 'ok'), texto('t2', 'oi 😀')]],
      ]),
    })

    expect(respostasDoPedido).toEqual([
      {
        tipo: 'falhou',
        id: respostasDoPedido[0].id,
        motivo: 'texto_fora_do_winansi',
        pagina: 0,
        objeto: 't2',
        caracteres: ['😀'],
      },
    ])
  })

  it('com o apagar de verdade, o objeto culpado é o da tela, contando os cobrir que não são desenhados', async () => {
    const [resposta] = await editar(await pdf([300]), {
      objetosPorPagina: new Map([
        [0, [cobrir('c1'), imagem('i1', 'quebrada')]],
      ]),
      imagens: new Map([['quebrada', new Blob([PNG_QUEBRADO])]]),
      paginasRasterizadas: new Map([[0, new Blob([JPEG])]]),
    })

    expect(resposta).toMatchObject({
      tipo: 'falhou',
      motivo: 'imagem_corrompida',
      pagina: 0,
      objeto: 'i1',
    })
  })

  it('só o fundo, sem objetos, também apaga de verdade a página', async () => {
    const [resposta] = await editar(await pdf([300]), {
      paginasRasterizadas: new Map([[0, new Blob([JPEG])]]),
    })

    const { imagens } = await conteudoDe(resposta)
    expect(
      imagens.map((i) => i.dict.get(PDFName.of('Width'))!.toString()),
    ).toEqual(['8'])
  })

  // Uma imagem que não chegou e um fundo que não é JPEG são erros do código da tela, não da pessoa.
  it.each([
    [
      'imagem que não veio',
      {
        objetosPorPagina: new Map([[0, [imagem('i1', 'sumiu')]]]),
      },
    ],
    [
      'fundo que não é JPEG',
      { paginasRasterizadas: new Map([[0, new Blob([PNG])]]) },
    ],
  ])('%s: inesperado', async (_, pedido) => {
    const respostasDoPedido = await editar(await pdf([300]), pedido)

    expect(respostasDoPedido).toEqual([
      { tipo: 'falhou', id: respostasDoPedido[0].id, motivo: 'inesperado' },
    ])
  })

  it('PDF protegido: o motivo do arquivo', async () => {
    const [resposta] = await editar(await protegido(), {
      objetosPorPagina: new Map([[0, [texto('t1', 'oi')]]]),
    })

    expect(resposta).toMatchObject({ tipo: 'falhou', motivo: 'protegido' })
  })
})
