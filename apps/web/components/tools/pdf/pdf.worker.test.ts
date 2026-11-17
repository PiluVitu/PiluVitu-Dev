/**
 * @jest-environment node
 */
import {
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFString,
  decodePDFRawStream,
} from 'pdf-lib'
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

// Um campo de texto (com /TU e tamanho máximo) e uma caixa de marcar, na página 2 de duas.
async function comFormulario({ xfa = false } = {}): Promise<Blob> {
  const documento = await PDFDocument.create({ updateMetadata: false })
  const form = documento.getForm()
  documento.addPage([300, 300])
  const pagina = documento.addPage([300, 300])
  const nome = form.createTextField('pessoa.nome')
  nome.setMaxLength(10)
  nome.acroField.dict.set(PDFName.of('TU'), PDFString.of('Nome completo'))
  nome.addToPage(pagina, {
    x: 20,
    y: 250,
    width: 200,
    height: 20,
    borderWidth: 0,
  })
  form
    .createCheckBox('aceito')
    .addToPage(pagina, { x: 20, y: 200, width: 15, height: 15 })
  let bytes = await documento.save()
  if (xfa) {
    // Num segundo save, sem as aparências: o save padrão passa pelo getForm(), que tira o XFA.
    const hibrido = await PDFDocument.load(bytes, { updateMetadata: false })
    hibrido.catalog
      .lookup(PDFName.of('AcroForm'), PDFDict)
      .set(PDFName.of('XFA'), PDFString.of('<xdp:xdp/>'))
    bytes = await hibrido.save({ updateFieldAppearances: false })
  }
  return new Blob([new Uint8Array(bytes)], { type: 'application/pdf' })
}

describe('analisar com a marca do formulário', () => {
  it('lê as páginas e os campos de uma vez, com o rótulo do /TU e a caixa na tela', async () => {
    const formulario = await comFormulario()
    const [resposta] = await pedir((id) => ({
      tipo: 'analisar',
      id,
      arquivo: formulario,
      formulario: true,
    }))

    expect(resposta).toMatchObject({
      tipo: 'analisado',
      paginas: 2,
      formulario: {
        tipo: 'acroform',
        hibrido: false,
        assinadoDigitalmente: false,
        campos: [
          {
            id: 0,
            nome: 'pessoa.nome',
            rotulo: 'Nome completo',
            tipo: 'texto',
            valor: '',
            tamanhoMaximo: 10,
            widgets: [
              {
                pagina: 1,
                caixa: { x: 20, y: 30, largura: 200, altura: 20 },
              },
            ],
          },
          { id: 1, nome: 'aceito', rotulo: 'aceito', tipo: 'caixa' },
        ],
      },
    })
  })

  it('PDF sem formulário: nenhum; e sem a marca, só as páginas', async () => {
    const [vazio, formulario] = [await pdf([100, 200]), await comFormulario()]
    const [semCampos] = await pedir((id) => ({
      tipo: 'analisar',
      id,
      arquivo: vazio,
      formulario: true,
    }))
    const [semMarca] = await pedir((id) => ({
      tipo: 'analisar',
      id,
      arquivo: formulario,
    }))

    expect(semCampos).toEqual({
      tipo: 'analisado',
      id: semCampos.id,
      paginas: 2,
      formulario: { tipo: 'nenhum' },
    })
    expect(semMarca).toEqual({ tipo: 'analisado', id: semMarca.id, paginas: 2 })
  })

  it('com a marca, o PDF protegido é recusado como sem ela', async () => {
    const arquivo = await protegido()
    const [resposta] = await pedir((id) => ({
      tipo: 'analisar',
      id,
      arquivo,
      formulario: true,
    }))

    expect(resposta).toMatchObject({ tipo: 'recusado', motivo: 'protegido' })
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

  describe('com o formulário', () => {
    const nome = (valor: string) =>
      ({ id: 0, nome: 'pessoa.nome', tipo: 'texto', valor }) as const

    it('preenche e desenha no mesmo pedido, e os valores se leem de volta no PDF', async () => {
      const [resposta] = await editar(await comFormulario(), {
        objetosPorPagina: new Map([[1, [texto('t1', 'OLA')]]]),
        formulario: {
          valores: [
            nome('Ana Lúcia'),
            { id: 1, nome: 'aceito', tipo: 'caixa', marcada: true },
          ],
          achatar: false,
        },
      })

      if (resposta.tipo !== 'pronto') throw new Error(`veio ${resposta.tipo}`)
      const form = (await PDFDocument.load(resposta.bytes)).getForm()
      expect(form.getTextField('pessoa.nome').getText()).toBe('Ana Lúcia')
      expect(form.getCheckBox('aceito').isChecked()).toBe(true)
      expect((await conteudoDe(resposta)).texto.toUpperCase()).toContain(
        emHexa('OLA'),
      )
    })

    it('achatar: o PDF sai sem campo nenhum', async () => {
      const [resposta] = await editar(await comFormulario(), {
        formulario: { valores: [nome('Ana')], achatar: true },
      })

      if (resposta.tipo !== 'pronto') throw new Error(`veio ${resposta.tipo}`)
      const documento = await PDFDocument.load(resposta.bytes)
      expect(documento.catalog.has(PDFName.of('AcroForm'))).toBe(false)
      expect(documento.getPage(1).node.Annots()?.size() ?? 0).toBe(0)
    })

    it('o XFA do formulário híbrido sai ao preencher', async () => {
      const [resposta] = await editar(await comFormulario({ xfa: true }), {
        formulario: { valores: [nome('Ana')], achatar: false },
      })

      if (resposta.tipo !== 'pronto') throw new Error(`veio ${resposta.tipo}`)
      const documento = await PDFDocument.load(resposta.bytes)
      expect(
        documento.catalog
          .lookup(PDFName.of('AcroForm'), PDFDict)
          .has(PDFName.of('XFA')),
      ).toBe(false)
    })

    it.each([
      [
        'texto fora do WinAnsi',
        nome('Ana 😀'),
        { motivo: 'texto_fora_do_winansi', campo: 0, caracteres: ['😀'] },
      ],
      [
        'acima do tamanho máximo',
        nome('Ana Lúcia Souza'),
        { motivo: 'acima_do_tamanho_maximo', campo: 0, caracteres: [] },
      ],
    ])('%s: falha com o motivo e o id do campo', async (_, valor, esperado) => {
      const respostasDoPedido = await editar(await comFormulario(), {
        formulario: { valores: [valor], achatar: false },
      })

      expect(respostasDoPedido).toEqual([
        { tipo: 'falhou', id: respostasDoPedido[0].id, ...esperado },
      ])
    })

    // A tela nunca manda os dois: o assinar não tem Cobrir, e o editar não preenche.
    it('formulário junto com o apagar de verdade: inesperado', async () => {
      const respostasDoPedido = await editar(await comFormulario(), {
        paginasRasterizadas: new Map([[1, new Blob([JPEG])]]),
        formulario: { valores: [nome('Ana')], achatar: false },
      })

      expect(respostasDoPedido).toEqual([
        { tipo: 'falhou', id: respostasDoPedido[0].id, motivo: 'inesperado' },
      ])
    })
  })

  it('PDF protegido: o motivo do arquivo', async () => {
    const [resposta] = await editar(await protegido(), {
      objetosPorPagina: new Map([[0, [texto('t1', 'oi')]]]),
    })

    expect(resposta).toMatchObject({ tipo: 'falhou', motivo: 'protegido' })
  })
})
