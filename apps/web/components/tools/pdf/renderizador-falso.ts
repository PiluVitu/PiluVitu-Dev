import {
  limitarAoCanvas,
  type Caixa,
  type Giro,
  type Ponto,
} from '@piluvitu/tools/pdf-regras'
import { analiseDeExemplo } from './motor-falso'
import {
  PaginaSuperada,
  type DocumentoAberto,
  type FalhaDaAbertura,
  type RenderizadorDePdf,
} from './renderizador'

type Opcoes = {
  /** Milissegundos de cada abertura e de cada miniatura. */
  atraso?: number
  /** Índices (a partir de 0) cuja miniatura falha. */
  miniaturasQueFalham?: readonly number[]
  /** Índices (a partir de 0) cuja página grande falha, uma vez cada. */
  paginasQueFalham?: readonly number[]
  /** Quantas páginas o pdf.js conta, quando ele discorda do pdf-lib (árvore de páginas com `/Count` errado). */
  paginas?: number
  /** Índices (a partir de 0) cujo fundo do apagar de verdade falha. */
  fundosQueFalham?: readonly number[]
}

// As linhas cinzas e o número da folha falsa: onde a página "tem texto" para a dica do editar.
const temTextoNaFolhaFalsa = ({ y }: Ponto) => (y >= 60 && y <= 340) || y >= 680

// Os bytes iniciais de um JPEG, que é o que o motor confere no fundo.
const JPEG_FALSO = Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 0, 0x10)

// Folha A4 com o número da página. SVG, não JPEG: o jsdom não tem canvas, e a story só precisa da imagem.
function folha(numero: number, deitada: boolean): Blob {
  const [largura, altura] = deitada ? [297, 210] : [210, 297]
  const linhas = Array.from(
    { length: 6 },
    (_, i) =>
      `<rect x="24" y="${28 + i * 16}" width="${largura - (i % 3 === 2 ? 110 : 48)}" height="6" rx="3"/>`,
  ).join('')
  return new Blob(
    [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${largura} ${altura}" width="${largura}" height="${altura}">`,
      `<rect width="100%" height="100%" fill="#ffffff"/>`,
      `<g fill="#d4d4d8">${linhas}</g>`,
      `<text x="50%" y="${altura - 40}" text-anchor="middle" font-family="sans-serif" font-size="56" fill="#18181b">${numero}</text>`,
      `</svg>`,
    ],
    { type: 'image/svg+xml' },
  )
}

const A4 = { largura: 595, altura: 842 }

// O jsdom não desenha em canvas (e reclama no console se pedirem); a story, no navegador, desenha.
const desenhaEmCanvas = () =>
  typeof navigator !== 'undefined' && !/jsdom/i.test(navigator.userAgent)

function pintar(canvas: HTMLCanvasElement, numero: number) {
  const contexto = desenhaEmCanvas() ? canvas.getContext('2d') : null
  if (!contexto) return
  const { width: l, height: a } = canvas
  contexto.fillStyle = '#ffffff'
  contexto.fillRect(0, 0, l, a)
  contexto.fillStyle = '#d4d4d8'
  for (let i = 0; i < 6; i++) {
    const largura = l * (i % 3 === 2 ? 0.5 : 0.78)
    contexto.fillRect(l * 0.11, a * (0.09 + i * 0.054), largura, a * 0.02)
  }
  contexto.fillStyle = '#18181b'
  contexto.font = `${Math.round(l * 0.27)}px sans-serif`
  contexto.textAlign = 'center'
  contexto.fillText(String(numero), l / 2, a * 0.86)
}

// Para stories e testes: o nome do arquivo decide, como no motor falso. "-12p" dá 12 páginas,
// "senha" vem protegido, "quebrado" vem corrompido e "girado" deita a miniatura das páginas pares, como um /Rotate 90.
export function criarRenderizadorFalso({
  atraso = 0,
  miniaturasQueFalham = [],
  paginasQueFalham = [],
  paginas,
  fundosQueFalham = [],
}: Opcoes = {}) {
  const espera = () => new Promise((r) => setTimeout(r, atraso))
  const renderizador = {
    abertos: [] as string[],
    miniaturas: [] as { indice: number; larguraCss: number }[],
    /** Cada página grande pedida, com o canvas entregue (vazio quando a página foi superada ou soltou). */
    paginasPedidas: [] as {
      indice: number
      larguraCss: number
      giro: Giro
      canvas?: HTMLCanvasElement
    }[],
    fundos: [] as { indice: number; cobrir: readonly Caixa[]; giro: Giro }[],
    fechados: 0,
    async abrir(arquivo: Blob): Promise<DocumentoAberto> {
      const nome = (arquivo as File).name
      renderizador.abertos.push(nome)
      await espera()
      const analise = analiseDeExemplo(arquivo as File)
      if (!analise.ok) {
        throw { motivo: analise.motivo } satisfies FalhaDaAbertura
      }
      const total = paginas ?? analise.paginas
      const deitadas = Array.from(
        { length: total },
        (_, i) => /girado/i.test(nome) && i % 2 === 1,
      )
      let fechado = false
      let vez = 0
      let atual: HTMLCanvasElement | null = null
      const falharam = new Set<number>()
      return {
        paginas: total,
        async pagina(indice, larguraCss, giro = 0) {
          const pedido = { indice, larguraCss, giro } as {
            indice: number
            larguraCss: number
            giro: Giro
            canvas?: HTMLCanvasElement
          }
          renderizador.paginasPedidas.push(pedido)
          const minha = ++vez
          await espera()
          if (fechado) throw new Error('o documento já foi fechado')
          if (minha !== vez) throw new PaginaSuperada()
          if (paginasQueFalham.includes(indice) && !falharam.has(indice)) {
            falharam.add(indice)
            throw new Error('falta de memória')
          }
          const tamanho =
            deitadas[indice] !== (giro === 90 || giro === 270)
              ? { largura: A4.altura, altura: A4.largura }
              : A4
          const densidade = Math.max(1, globalThis.devicePixelRatio || 1)
          const { largura, altura } = limitarAoCanvas(
            tamanho,
            (larguraCss * densidade) / tamanho.largura,
          )
          const canvas = document.createElement('canvas')
          canvas.width = largura
          canvas.height = altura
          pintar(canvas, indice + 1)
          if (atual) {
            atual.width = 0
            atual.height = 0
          }
          atual = canvas
          pedido.canvas = canvas
          return { canvas, tamanho }
        },
        async fundo(indice, cobrir, giro = 0) {
          renderizador.fundos.push({ indice, cobrir, giro })
          await espera()
          if (fechado) throw new Error('o documento já foi fechado')
          if (fundosQueFalham.includes(indice)) {
            throw new Error('falta de memória')
          }
          return new Blob([JPEG_FALSO], { type: 'image/jpeg' })
        },
        async textoNoPonto(_indice, ponto) {
          return !fechado && temTextoNaFolhaFalsa(ponto)
        },
        async miniatura(indice, larguraCss) {
          renderizador.miniaturas.push({ indice, larguraCss })
          await espera()
          if (fechado) throw new Error('o documento já foi fechado')
          if (miniaturasQueFalham.includes(indice)) {
            throw new Error('Rendering cancelled')
          }
          return folha(indice + 1, deitadas[indice])
        },
        fechar() {
          if (fechado) return
          fechado = true
          if (atual) {
            atual.width = 0
            atual.height = 0
          }
          renderizador.fechados += 1
        },
      }
    },
  } satisfies RenderizadorDePdf & Record<string, unknown>
  return renderizador
}
