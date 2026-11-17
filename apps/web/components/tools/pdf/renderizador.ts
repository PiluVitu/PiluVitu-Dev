import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import {
  limitarAoCanvas,
  pixelsDoFundo,
  type Caixa,
  type Ponto,
  type Tamanho,
} from '@piluvitu/tools/pdf-regras'
import type { MotivoDaRecusa } from './motor'
import { novoWorkerDoPdfjs } from './novo-worker-pdfjs'
import { criarFabricaDeRecursos } from './recursos-pdfjs'

export type FalhaDaAbertura = { motivo: MotivoDaRecusa }

export type PaginaDesenhada = {
  /** Em `larguraCss × devicePixelRatio`, até o limite de canvas; o próximo `pagina()` o esvazia. */
  canvas: HTMLCanvasElement
  /** A página como a tela a mostra com escala 1 (já girada e recortada), em pontos. */
  tamanho: Tamanho
}

export type DocumentoAberto = {
  paginas: number
  /** Desenha uma página por vez (a fila é daqui, não de quem chama) e solta o canvas depois do JPEG. */
  miniatura(indice: number, larguraCss: number): Promise<Blob>
  /**
   * A página grande, uma por vez. Um pedido novo cancela o anterior (o que ainda espera nem desenha), e
   * o canvas da página anterior só é esvaziado quando o novo fica pronto, para a tela não piscar.
   */
  pagina(indice: number, larguraCss: number): Promise<PaginaDesenhada>
  /**
   * Apagar de verdade: a página a 200 dpi (`pixelsDoFundo`) num canvas, com os retângulos de cobrir (em
   * pontos da tela) pintados de branco nele antes do JPEG. Na mesma fila, sem mexer na página grande.
   */
  fundo(indice: number, cobrir: readonly Caixa[]): Promise<Blob>
  /** Se há texto do próprio PDF no ponto (em pontos da tela), pela camada de texto do pdf.js. */
  textoNoPonto(indice: number, ponto: Ponto): Promise<boolean>
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

export class PaginaSuperada extends Error {
  constructor() {
    super('outra página foi pedida depois desta')
    this.name = 'PaginaSuperada'
  }
}

const QUALIDADE_DO_JPEG = 0.8
// O fundo vira a página no PDF final: com menos que isso, letra pequena borra.
const QUALIDADE_DO_FUNDO = 0.9
const ALTURA_MAXIMA_EM_LARGURAS = 4
const PRAZO_PARA_FECHAR_MS = 2_000

function motivoDoErro(erro: unknown): MotivoDaRecusa {
  if (ehFalhaDaAbertura(erro)) return erro.motivo
  const nome = (erro as { name?: unknown } | null)?.name
  return nome === 'PasswordException' ? 'protegido' : 'corrompido'
}

function soltar(canvas: HTMLCanvasElement) {
  canvas.width = 0
  canvas.height = 0
}

const densidade = () => Math.max(1, globalThis.devicePixelRatio || 1)

function conferirLargura(larguraCss: number) {
  if (!(Number.isFinite(larguraCss) && larguraCss > 0)) {
    throw new RangeError(`largura inválida: ${larguraCss}`)
  }
}

function jpegDo(
  canvas: HTMLCanvasElement,
  qualidade = QUALIDADE_DO_JPEG,
): Promise<Blob> {
  return new Promise((resolver, rejeitar) =>
    canvas.toBlob(
      (jpeg) =>
        jpeg
          ? resolver(jpeg)
          : rejeitar(new Error('o navegador não gerou o JPEG')),
      'image/jpeg',
      qualidade,
    ),
  )
}

type ItemDeTexto = {
  str?: string
  transform?: readonly number[]
  width?: number
}

const FOLGA_DO_TEXTO = 2

// A caixa de cada trecho como a camada de texto do pdf.js a monta: da linha de base para cima, na direção
// do texto, com a altura da fonte (mais um quarto para baixo, das letras que descem).
export function pontoNoTexto(
  vista: readonly number[],
  itens: readonly ItemDeTexto[],
  { x, y }: Ponto,
): boolean {
  const [a, b, c, d, e, f] = vista
  return itens.some((item) => {
    if (!item.str?.trim() || !item.transform || !item.width) return false
    const [ia, ib, ic, id, ie, iff] = item.transform
    const tx = [
      a * ia + c * ib,
      b * ia + d * ib,
      a * ic + c * id,
      b * ic + d * id,
      a * ie + c * iff + e,
      b * ie + d * iff + f,
    ]
    const angulo = Math.atan2(tx[1], tx[0])
    const altura = Math.hypot(tx[2], tx[3])
    const largura = item.width * Math.hypot(a, b)
    const dx = x - tx[4]
    const dy = y - tx[5]
    const aoLongo = dx * Math.cos(angulo) + dy * Math.sin(angulo)
    const acima = dx * Math.sin(angulo) - dy * Math.cos(angulo)
    return (
      aoLongo >= -FOLGA_DO_TEXTO &&
      aoLongo <= largura + FOLGA_DO_TEXTO &&
      acima >= -altura / 4 - FOLGA_DO_TEXTO &&
      acima <= altura + FOLGA_DO_TEXTO
    )
  })
}

// Arredondado para fora: a borda do retângulo não fica meio pintada, com um resto da letra embaixo.
function pintarCobrir(
  canvas: HTMLCanvasElement,
  cobrir: readonly Caixa[],
  escala: number,
) {
  if (!cobrir.length) return
  const contexto = canvas.getContext('2d')
  if (!contexto) throw new Error('o navegador não deu o canvas para pintar')
  contexto.fillStyle = '#ffffff'
  for (const { x, y, largura, altura } of cobrir) {
    const esquerda = Math.floor(x * escala)
    const topo = Math.floor(y * escala)
    contexto.fillRect(
      esquerda,
      topo,
      Math.ceil((x + largura) * escala) - esquerda,
      Math.ceil((y + altura) * escala) - topo,
    )
  }
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
      // useWorkerFetch false: quem busca os recursos é a página, pela fábrica, e só os da lista.
      const tarefa = pdfjs.getDocument({
        data,
        worker: pdfWorker,
        enableXfa: false,
        disableAutoFetch: true,
        useSystemFonts: true,
        useWorkerFetch: false,
        BinaryDataFactory: criarFabricaDeRecursos(pdfjs.version),
      })
      let fechado = false
      let pedidoDaPagina = 0
      let desenhoDaPagina: RenderTask | null = null
      let canvasDaPagina: HTMLCanvasElement | null = null

      // O destroy da tarefa só limpa a página (as FontFace em document.fonts) quando o Worker responde ao
      // Terminate; encerrado antes, a resposta não vem. O prazo cobre o Worker que caiu ou travou.
      function fechar() {
        if (fechado) return
        fechado = true
        desenhoDaPagina?.cancel()
        if (canvasDaPagina) soltar(canvasDaPagina)
        canvasDaPagina = null
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
        conferirLargura(larguraCss)
        const pagina = await Promise.race([
          documento.getPage(indice + 1),
          quebrou,
        ])
        const natural = pagina.getViewport({ scale: 1 })
        const largura = larguraCss * densidade()
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
          soltar(canvas)
          pagina.cleanup()
        }
      }

      async function desenharPagina(
        documento: PDFDocumentProxy,
        indice: number,
        larguraCss: number,
        vez: number,
      ): Promise<PaginaDesenhada> {
        if (fechado) throw new Error('o documento já foi fechado')
        if (vez !== pedidoDaPagina) throw new PaginaSuperada()
        const pagina = await Promise.race([
          documento.getPage(indice + 1),
          quebrou,
        ])
        if (vez !== pedidoDaPagina) throw new PaginaSuperada()
        const natural = pagina.getViewport({ scale: 1 })
        const tamanho = { largura: natural.width, altura: natural.height }
        const { largura, altura, escala } = limitarAoCanvas(
          tamanho,
          (larguraCss * densidade()) / natural.width,
        )
        const canvas = document.createElement('canvas')
        canvas.width = largura
        canvas.height = altura
        const desenho = pagina.render({
          canvas,
          viewport: pagina.getViewport({ scale: escala }),
        })
        desenhoDaPagina = desenho
        try {
          await Promise.race([desenho.promise, quebrou])
        } catch (erro) {
          soltar(canvas)
          throw vez === pedidoDaPagina ? erro : new PaginaSuperada()
        } finally {
          if (desenhoDaPagina === desenho) desenhoDaPagina = null
          pagina.cleanup()
        }
        if (fechado || vez !== pedidoDaPagina) {
          soltar(canvas)
          throw fechado
            ? new Error('o documento já foi fechado')
            : new PaginaSuperada()
        }
        const anterior = canvasDaPagina
        canvasDaPagina = canvas
        if (anterior) soltar(anterior)
        return { canvas, tamanho }
      }

      async function desenharFundo(
        documento: PDFDocumentProxy,
        indice: number,
        cobrir: readonly Caixa[],
      ): Promise<Blob> {
        if (fechado) throw new Error('o documento já foi fechado')
        const pagina = await Promise.race([
          documento.getPage(indice + 1),
          quebrou,
        ])
        const natural = pagina.getViewport({ scale: 1 })
        const { largura, altura, escala } = pixelsDoFundo({
          largura: natural.width,
          altura: natural.height,
        })
        const canvas = document.createElement('canvas')
        canvas.width = largura
        canvas.height = altura
        try {
          await Promise.race([
            pagina.render({
              canvas,
              viewport: pagina.getViewport({ scale: escala }),
            }).promise,
            quebrou,
          ])
          pintarCobrir(canvas, cobrir, escala)
          return await jpegDo(canvas, QUALIDADE_DO_FUNDO)
        } finally {
          soltar(canvas)
          pagina.cleanup()
        }
      }

      async function textoEm(
        documento: PDFDocumentProxy,
        indice: number,
        ponto: Ponto,
      ): Promise<boolean> {
        if (fechado) return false
        const pagina = await Promise.race([
          documento.getPage(indice + 1),
          quebrou,
        ])
        const { items } = await Promise.race([pagina.getTextContent(), quebrou])
        return pontoNoTexto(
          pagina.getViewport({ scale: 1 }).transform,
          items as ItemDeTexto[],
          ponto,
        )
      }

      try {
        const documento = await Promise.race([tarefa.promise, quebrou])
        if (documento.numPages === 0) {
          throw { motivo: 'sem_paginas' } satisfies FalhaDaAbertura
        }
        let fila: Promise<unknown> = Promise.resolve()
        const naFila = <T>(desenho: () => Promise<T>): Promise<T> => {
          const vez = fila.then(desenho)
          fila = vez.catch(() => {})
          return vez
        }
        return {
          paginas: documento.numPages,
          miniatura(indice, larguraCss) {
            return naFila(() => desenhar(documento, indice, larguraCss))
          },
          pagina(indice, larguraCss) {
            try {
              conferirLargura(larguraCss)
            } catch (erro) {
              return Promise.reject(erro)
            }
            const vez = ++pedidoDaPagina
            desenhoDaPagina?.cancel()
            return naFila(() =>
              desenharPagina(documento, indice, larguraCss, vez),
            )
          },
          fundo(indice, cobrir) {
            return naFila(() => desenharFundo(documento, indice, cobrir))
          },
          textoNoPonto(indice, ponto) {
            return textoEm(documento, indice, ponto)
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
