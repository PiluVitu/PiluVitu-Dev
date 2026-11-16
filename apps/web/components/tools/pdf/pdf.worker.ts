import { ErroDePdf, contarPaginas, mesclarPdfs } from '@piluvitu/tools/pdf'
import { fracaoDaMesclagem } from '@piluvitu/tools/pdf-regras'
import type { PedidoAoWorker, RespostaDoWorker } from './motor'

const escopo = self as unknown as {
  onmessage: ((evento: MessageEvent<PedidoAoWorker>) => void) | null
  postMessage(resposta: RespostaDoWorker, transferir?: Transferable[]): void
}

async function bytesDe(arquivo: Blob): Promise<Uint8Array> {
  return new Uint8Array(await arquivo.arrayBuffer())
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

async function mesclar(arquivos: Blob[]) {
  const tamanhos = arquivos.map((a) => a.size)
  try {
    const pdf = await mesclarPdfs(
      arquivos.map((arquivo) => () => bytesDe(arquivo)),
      (etapa) =>
        escopo.postMessage({
          tipo: 'andamento',
          ...('salvando' in etapa
            ? { fracao: fracaoDaMesclagem(tamanhos, 0, true), arquivo: null }
            : {
                fracao: fracaoDaMesclagem(tamanhos, etapa.arquivo),
                arquivo: etapa.arquivo,
              }),
        }),
    )
    const bytes =
      pdf.byteOffset === 0 && pdf.byteLength === pdf.buffer.byteLength
        ? (pdf.buffer as ArrayBuffer)
        : pdf.slice().buffer
    escopo.postMessage({ tipo: 'mesclado', bytes }, [bytes])
  } catch (erro) {
    escopo.postMessage(
      erro instanceof ErroDePdf
        ? { tipo: 'falhou', motivo: erro.motivo, indice: erro.indice }
        : { tipo: 'falhou', motivo: 'inesperado' },
    )
  }
}

// Um pedido por vez: duas leituras de 100 MB em paralelo dobrariam o pico de memória.
let fila = Promise.resolve()

escopo.onmessage = ({ data }) => {
  fila = fila.then(() =>
    data.tipo === 'analisar'
      ? analisar(data.id, data.arquivo)
      : mesclar(data.arquivos),
  )
}
