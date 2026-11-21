import {
  ErroDePdf,
  ErroNaEdicao,
  analisarPdf,
  montarDocumentoDetalhado,
  type ApagadaForaDoPlano,
  type DocumentoMontado,
  type EdicaoNaMontagem,
  type Giro,
  type MotivoDoErroNaEdicao,
  type ObjetoDaPagina,
} from '@piluvitu/tools/pdf'
import type {
  ApagadaForaDoPedido,
  ObjetoNaTela,
  PedidoAoWorker,
  PedidoDeMontagem,
  RespostaDoWorker,
} from './motor'

const escopo = self as unknown as {
  onmessage: ((evento: MessageEvent<PedidoAoWorker>) => void) | null
  postMessage(resposta: RespostaDoWorker, transferir?: Transferable[]): void
}

async function bytesDe(arquivo: Blob): Promise<Uint8Array> {
  return new Uint8Array(await arquivo.arrayBuffer())
}

function entregar(
  id: number,
  { bytes: pdf, repetemApagada }: DocumentoMontado,
  { paginas }: PedidoDeMontagem,
) {
  const bytes =
    pdf.byteOffset === 0 && pdf.byteLength === pdf.buffer.byteLength
      ? (pdf.buffer as ArrayBuffer)
      : pdf.slice().buffer
  escopo.postMessage(
    {
      tipo: 'pronto',
      id,
      bytes,
      repetemApagada: repetemApagada.map((posicao) => paginas[posicao].id),
    },
    [bytes],
  )
}

// A pessoa resolve na tela, tirando um apagar de verdade: a falha diz a página e não é "inesperado".
const RECUSAS_DA_PAGINA_REPETIDA: ReadonlySet<MotivoDoErroNaEdicao> = new Set([
  'apagar_na_pagina_repetida',
  'apagar_na_pagina_repetida_fora_do_pdf',
  'apagar_duas_vezes_fora_do_pdf',
])

function falhar(id: number, erro: unknown) {
  escopo.postMessage(
    erro instanceof ErroDePdf
      ? { tipo: 'falhou', id, motivo: erro.motivo, indice: erro.indice }
      : { tipo: 'falhou', id, motivo: 'inesperado' },
  )
}

async function analisar(id: number, arquivo: Blob) {
  try {
    escopo.postMessage({
      tipo: 'analisado',
      id,
      ...(await analisarPdf(await bytesDe(arquivo))),
    })
  } catch (erro) {
    escopo.postMessage({
      tipo: 'recusado',
      id,
      motivo: erro instanceof ErroDePdf ? erro.motivo : 'corrompido',
    })
  }
}

// A imagem chega como o arquivo que a pessoa escolheu; cada um é lido uma vez, e os objetos que o
// repetem levam os mesmos bytes, que o pdf-lib embute uma vez só em cada arquivo de origem.
function leitorDeImagens(imagens: ReadonlyMap<string, Blob>) {
  const lidas = new Map<string, Promise<Uint8Array>>()
  const bytesDaImagem = (id: string) => {
    const arquivo = imagens.get(id)
    if (!arquivo) throw new RangeError(`imagem que não veio: ${id}`)
    if (!lidas.has(id)) lidas.set(id, bytesDe(arquivo))
    return lidas.get(id)!
  }
  return async (objeto: ObjetoNaTela): Promise<ObjetoDaPagina> => {
    if (objeto.tipo !== 'imagem') return objeto
    const { imagem, ...resto } = objeto
    return { ...resto, bytes: await bytesDaImagem(imagem) }
  }
}

async function edicoesDaMontagem({
  paginas,
  objetosPorPagina,
  imagens,
  paginasRasterizadas,
}: PedidoDeMontagem): Promise<EdicaoNaMontagem[]> {
  const posicoes = new Map(paginas.map(({ id }, posicao) => [id, posicao]))
  if (posicoes.size !== paginas.length) {
    throw new RangeError('id de página repetido')
  }
  const comBytes = leitorDeImagens(imagens)
  const ids = new Set([
    ...objetosPorPagina.keys(),
    ...paginasRasterizadas.keys(),
  ])
  return Promise.all(
    [...ids].map(async (id) => {
      const posicao = posicoes.get(id)
      if (posicao === undefined) {
        throw new RangeError(`página que não está no pedido: ${id}`)
      }
      const fundo = paginasRasterizadas.get(id)
      return {
        posicao,
        objetos: await Promise.all(
          (objetosPorPagina.get(id) ?? []).map(comBytes),
        ),
        ...(fundo ? { fundo: await bytesDe(fundo) } : {}),
      }
    }),
  )
}

// O montarDocumento confere o resto (arquivo, índice, moldura, JPEG): o malformado é erro, nunca ignorado.
async function apagadasForaDoPlano(
  apagadas: PedidoDeMontagem['apagadasForaDoPlano'],
): Promise<ApagadaForaDoPlano[]> {
  if (!Array.isArray(apagadas)) {
    throw new RangeError('apagadas fora do plano inválidas')
  }
  return Promise.all(
    apagadas.map(async (apagada: unknown) => {
      const { origem, moldura, fundo } = (apagada ??
        {}) as Partial<ApagadaForaDoPedido>
      if (
        typeof origem !== 'object' ||
        origem === null ||
        !(fundo instanceof Blob)
      ) {
        throw new RangeError('apagada fora do plano inválida')
      }
      return {
        arquivo: origem.arquivo,
        indice: origem.indice,
        moldura: moldura as Giro,
        fundo: await bytesDe(fundo),
      }
    }),
  )
}

async function montar(
  id: number,
  arquivos: readonly Blob[],
  pedido: PedidoDeMontagem,
) {
  try {
    const edicoes = await edicoesDaMontagem(pedido)
    entregar(
      id,
      await montarDocumentoDetalhado(
        arquivos.map((arquivo) => () => bytesDe(arquivo)),
        pedido.paginas,
        edicoes,
        {
          porCopia: pedido.porCopia,
          apagadasForaDoPlano: await apagadasForaDoPlano(
            pedido.apagadasForaDoPlano,
          ),
        },
      ),
      pedido,
    )
  } catch (erro) {
    if (!(erro instanceof ErroNaEdicao)) return falhar(id, erro)
    const pagina = pedido.paginas[erro.pagina]?.id
    if (RECUSAS_DA_PAGINA_REPETIDA.has(erro.motivo) && pagina !== undefined) {
      return escopo.postMessage({
        tipo: 'falhou',
        id,
        motivo: erro.motivo,
        pagina,
      })
    }
    const objetos =
      (pagina !== undefined && pedido.objetosPorPagina.get(pagina)) || []
    const objeto =
      erro.objeto === undefined ? undefined : objetos[erro.objeto]?.id
    // Sem objeto, o culpado é o fundo do apagar de verdade, que a própria tela gera: não é erro da pessoa.
    escopo.postMessage(
      objeto === undefined
        ? { tipo: 'falhou', id, motivo: 'inesperado' }
        : {
            tipo: 'falhou',
            id,
            motivo: erro.motivo,
            pagina,
            objeto,
            caracteres: [...erro.caracteres],
          },
    )
  }
}

function atender(pedido: PedidoAoWorker): Promise<void> {
  switch (pedido.tipo) {
    case 'analisar':
      return analisar(pedido.id, pedido.arquivo)
    case 'montar':
      return montar(pedido.id, pedido.arquivos, pedido)
  }
}

// Um pedido por vez: duas leituras de PDFs grandes em paralelo dobrariam o pico de memória.
let fila = Promise.resolve()

escopo.onmessage = ({ data }) => {
  fila = fila.then(() => atender(data))
}
