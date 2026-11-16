/**
 * @jest-environment node
 */
import { PDFDocument } from 'pdf-lib'
import type { PedidoAoWorker, RespostaDoWorker } from './motor'

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
