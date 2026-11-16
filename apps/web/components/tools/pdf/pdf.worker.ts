import {
  ErroDePdf,
  contarPaginas,
  mesclarPdfs,
  organizarPaginas,
  type PaginaDoPlano,
} from '@piluvitu/tools/pdf'
import { fracaoDaMesclagem } from '@piluvitu/tools/pdf-regras'
import type { PedidoAoWorker, RespostaDoWorker } from './motor'

const escopo = self as unknown as {
  onmessage: ((evento: MessageEvent<PedidoAoWorker>) => void) | null
  postMessage(resposta: RespostaDoWorker, transferir?: Transferable[]): void
}

async function bytesDe(arquivo: Blob): Promise<Uint8Array> {
  return new Uint8Array(await arquivo.arrayBuffer())
}

function entregar(id: number, pdf: Uint8Array) {
  const bytes =
    pdf.byteOffset === 0 && pdf.byteLength === pdf.buffer.byteLength
      ? (pdf.buffer as ArrayBuffer)
      : pdf.slice().buffer
  escopo.postMessage({ tipo: 'pronto', id, bytes }, [bytes])
}

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
      paginas: await contarPaginas(await bytesDe(arquivo)),
    })
  } catch (erro) {
    escopo.postMessage({
      tipo: 'recusado',
      id,
      motivo: erro instanceof ErroDePdf ? erro.motivo : 'corrompido',
    })
  }
}

async function mesclar(id: number, arquivos: Blob[]) {
  const tamanhos = arquivos.map((a) => a.size)
  try {
    const pdf = await mesclarPdfs(
      arquivos.map((arquivo) => () => bytesDe(arquivo)),
      (etapa) =>
        escopo.postMessage({
          tipo: 'andamento',
          id,
          ...('salvando' in etapa
            ? { fracao: fracaoDaMesclagem(tamanhos, 0, true), arquivo: null }
            : {
                fracao: fracaoDaMesclagem(tamanhos, etapa.arquivo),
                arquivo: etapa.arquivo,
              }),
        }),
    )
    entregar(id, pdf)
  } catch (erro) {
    falhar(id, erro)
  }
}

async function organizar(
  id: number,
  arquivo: Blob,
  plano: readonly PaginaDoPlano[],
) {
  try {
    entregar(id, await organizarPaginas(await bytesDe(arquivo), plano))
  } catch (erro) {
    falhar(id, erro)
  }
}

function atender(pedido: PedidoAoWorker): Promise<void> {
  switch (pedido.tipo) {
    case 'analisar':
      return analisar(pedido.id, pedido.arquivo)
    case 'mesclar':
      return mesclar(pedido.id, pedido.arquivos)
    case 'organizar':
      return organizar(pedido.id, pedido.arquivo, pedido.plano)
  }
}

// Um pedido por vez: duas leituras de 100 MB em paralelo dobrariam o pico de memória.
let fila = Promise.resolve()

escopo.onmessage = ({ data }) => {
  fila = fila.then(() => atender(data))
}
