import { analiseDeExemplo } from './motor-falso'
import type {
  DocumentoAberto,
  FalhaDaAbertura,
  RenderizadorDePdf,
} from './renderizador'

type Opcoes = {
  /** Milissegundos de cada abertura e de cada miniatura. */
  atraso?: number
  /** Índices (a partir de 0) cuja miniatura falha. */
  miniaturasQueFalham?: readonly number[]
  /** Quantas páginas o pdf.js conta, quando ele discorda do pdf-lib (árvore de páginas com `/Count` errado). */
  paginas?: number
}

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

// Para stories e testes: o nome do arquivo decide, como no motor falso. "-12p" dá 12 páginas,
// "senha" vem protegido, "quebrado" vem corrompido e "girado" põe /Rotate 90 nas páginas pares.
export function criarRenderizadorFalso({
  atraso = 0,
  miniaturasQueFalham = [],
  paginas,
}: Opcoes = {}) {
  const espera = () => new Promise((r) => setTimeout(r, atraso))
  const renderizador = {
    abertos: [] as string[],
    miniaturas: [] as { indice: number; larguraCss: number }[],
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
      const rotacoes = Array.from({ length: total }, (_, i) =>
        /girado/i.test(nome) && i % 2 === 1 ? 90 : 0,
      )
      let fechado = false
      return {
        paginas: total,
        rotacoes,
        async miniatura(indice, larguraCss) {
          renderizador.miniaturas.push({ indice, larguraCss })
          await espera()
          if (fechado) throw new Error('o documento já foi fechado')
          if (miniaturasQueFalham.includes(indice)) {
            throw new Error('Rendering cancelled')
          }
          return folha(indice + 1, rotacoes[indice] % 180 !== 0)
        },
        fechar() {
          if (fechado) return
          fechado = true
          renderizador.fechados += 1
        },
      }
    },
  } satisfies RenderizadorDePdf & Record<string, unknown>
  return renderizador
}
