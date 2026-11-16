import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { MotivoDaRecusa } from './motor'
import { novoWorkerDoPdfjs } from './novo-worker-pdfjs'

export type FalhaDaAbertura = { motivo: MotivoDaRecusa }

export type DocumentoAberto = {
  paginas: number
  /** O `/Rotate` de cada página como o pdf.js leu: 0, 90, 180 ou 270. */
  rotacoes: readonly number[]
  /** Desenha uma página por vez (a fila é daqui, não de quem chama) e solta o canvas depois do JPEG. */
  miniatura(indice: number, larguraCss: number): Promise<Blob>
  /** Derruba o Worker do pdf.js, que guarda a cópia do arquivo, depois de o pdf.js limpar a página (fontes e cache). */
  fechar(): void
}

export interface RenderizadorDePdf {
  /** Rejeita com {@link FalhaDaAbertura}. */
  abrir(arquivo: Blob): Promise<DocumentoAberto>
}

export function ehFalhaDaAbertura(erro: unknown): erro is FalhaDaAbertura {
  return typeof erro === 'object' && erro !== null && 'motivo' in erro
}

const QUALIDADE_DO_JPEG = 0.8
const ALTURA_MAXIMA_EM_LARGURAS = 4
const PRAZO_PARA_FECHAR_MS = 2_000

function motivoDoErro(erro: unknown): MotivoDaRecusa {
  if (ehFalhaDaAbertura(erro)) return erro.motivo
  const nome = (erro as { name?: unknown } | null)?.name
  return nome === 'PasswordException' ? 'protegido' : 'corrompido'
}

function jpegDo(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolver, rejeitar) =>
    canvas.toBlob(
      (jpeg) =>
        jpeg
          ? resolver(jpeg)
          : rejeitar(new Error('o navegador não gerou a miniatura')),
      'image/jpeg',
      QUALIDADE_DO_JPEG,
    ),
  )
}

// O pdf.js só desce no modo que mostra página: o import() abre um chunk próprio.
export function criarRenderizadorComPdfjs(
  novoWorker: () => Worker = novoWorkerDoPdfjs,
): RenderizadorDePdf {
  return {
    async abrir(arquivo) {
      let pdfjs: typeof import('pdfjs-dist')
      let data: Uint8Array
      try {
        pdfjs = await import('pdfjs-dist')
        data = new Uint8Array(await arquivo.arrayBuffer())
      } catch {
        throw { motivo: 'falha_do_navegador' } satisfies FalhaDaAbertura
      }
      const worker = novoWorker()
      const quebrou = new Promise<never>((_, rejeitar) =>
        worker.addEventListener('error', () =>
          rejeitar({ motivo: 'falha_do_navegador' } satisfies FalhaDaAbertura),
        ),
      )
      quebrou.catch(() => {})
      const pdfWorker = pdfjs.PDFWorker.create({ port: worker })
      const tarefa = pdfjs.getDocument({
        data,
        worker: pdfWorker,
        enableXfa: false,
        disableAutoFetch: true,
        useSystemFonts: true,
      })
      let fechado = false

      // O destroy da tarefa só limpa a página (as FontFace em document.fonts) quando o Worker responde ao
      // Terminate; encerrado antes, a resposta não vem. O prazo cobre o Worker que caiu ou travou.
      function fechar() {
        if (fechado) return
        fechado = true
        let prazo: ReturnType<typeof setTimeout> | undefined
        void Promise.race([
          tarefa.destroy(),
          new Promise<void>((resolver) => {
            prazo = setTimeout(resolver, PRAZO_PARA_FECHAR_MS)
          }),
        ])
          .catch(() => {})
          .finally(() => {
            clearTimeout(prazo)
            pdfWorker.destroy()
            worker.terminate()
          })
      }

      async function desenhar(
        documento: PDFDocumentProxy,
        indice: number,
        larguraCss: number,
      ): Promise<Blob> {
        if (fechado) throw new Error('o documento já foi fechado')
        if (!(Number.isFinite(larguraCss) && larguraCss > 0)) {
          throw new RangeError(`largura inválida: ${larguraCss}`)
        }
        const pagina = await Promise.race([
          documento.getPage(indice + 1),
          quebrou,
        ])
        const natural = pagina.getViewport({ scale: 1 })
        const largura =
          larguraCss * Math.max(1, globalThis.devicePixelRatio || 1)
        const viewport = pagina.getViewport({
          scale: Math.min(
            largura / natural.width,
            (largura * ALTURA_MAXIMA_EM_LARGURAS) / natural.height,
          ),
        })
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(viewport.width))
        canvas.height = Math.max(1, Math.round(viewport.height))
        try {
          await Promise.race([
            pagina.render({ canvas, viewport }).promise,
            quebrou,
          ])
          return await jpegDo(canvas)
        } finally {
          canvas.width = 0
          canvas.height = 0
          pagina.cleanup()
        }
      }

      try {
        const documento = await Promise.race([tarefa.promise, quebrou])
        if (documento.numPages === 0) {
          throw { motivo: 'sem_paginas' } satisfies FalhaDaAbertura
        }
        const rotacoes = await Promise.race([
          Promise.all(
            Array.from({ length: documento.numPages }, (_, i) =>
              documento.getPage(i + 1).then((pagina) => pagina.rotate),
            ),
          ),
          quebrou,
        ])
        let fila: Promise<unknown> = Promise.resolve()
        return {
          paginas: documento.numPages,
          rotacoes,
          miniatura(indice, larguraCss) {
            const vez = fila.then(() => desenhar(documento, indice, larguraCss))
            fila = vez.catch(() => {})
            return vez
          },
          fechar,
        }
      } catch (erro) {
        fechar()
        throw { motivo: motivoDoErro(erro) } satisfies FalhaDaAbertura
      }
    },
  }
}
