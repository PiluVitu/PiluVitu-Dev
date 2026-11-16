export const TETO_TOTAL_EM_BYTES = 100_000_000

export const NOME_PADRAO_DO_PDF_FINAL = 'mesclado.pdf'

export type MotivoDoErroDePdf =
  | 'nao_e_pdf'
  | 'protegido'
  | 'corrompido'
  | 'sem_paginas'

const PESO_DA_LEITURA = 0.9

export function fracaoDaMesclagem(
  tamanhos: readonly number[],
  concluidos: number,
  salvando = false,
): number {
  if (salvando) return PESO_DA_LEITURA
  const total = tamanhos.reduce((soma, t) => soma + t, 0)
  if (total === 0) return 0
  const feito = tamanhos
    .slice(0, Math.max(0, concluidos))
    .reduce((soma, t) => soma + t, 0)
  return (PESO_DA_LEITURA * feito) / total
}

export function cabemNoTeto(
  jaUsados: number,
  novos: readonly number[],
  teto = TETO_TOTAL_EM_BYTES,
): boolean[] {
  let usados = jaUsados
  return novos.map((tamanho) => {
    if (usados + tamanho > teto) return false
    usados += tamanho
    return true
  })
}

const PROIBIDOS_NO_NOME = /[\u0000-\u001f\u007f<>:"/\\|?*]/g
const LIMITE_DO_NOME = 120

export function nomeDoPdfFinal(entrada: string): string {
  const base = entrada
    .replace(PROIBIDOS_NO_NOME, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.pdf$/i, '')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, LIMITE_DO_NOME)
    .trim()
  return base ? `${base}.pdf` : NOME_PADRAO_DO_PDF_FINAL
}

export const TETO_DE_PAGINAS = 500

export type Giro = 0 | 90 | 180 | 270

export const GIROS: readonly Giro[] = [0, 90, 180, 270]

export type PaginaDoPlano = { readonly indice: number; readonly giro: Giro }

export type SentidoDoGiro = 'esquerda' | 'direita'

export type LadoDoMovimento = 'antes' | 'depois'

export function giroNormalizado(graus: number): Giro {
  return (((graus % 360) + 360) % 360) as Giro
}

export function planoInicial(totalDePaginas: number): PaginaDoPlano[] {
  if (!Number.isInteger(totalDePaginas) || totalDePaginas < 0) {
    throw new RangeError(`total de páginas inválido: ${totalDePaginas}`)
  }
  return Array.from({ length: totalDePaginas }, (_, indice) => ({
    indice,
    giro: 0,
  }))
}

function selecao(
  plano: readonly PaginaDoPlano[],
  posicoes: Iterable<number>,
): Set<number> {
  const escolhidas = new Set(posicoes)
  for (const posicao of escolhidas) {
    if (!Number.isInteger(posicao) || posicao < 0 || posicao >= plano.length) {
      throw new RangeError(`posição fora do plano: ${posicao}`)
    }
  }
  return escolhidas
}

export function girar(
  plano: readonly PaginaDoPlano[],
  posicoesSelecionadas: Iterable<number>,
  sentido: SentidoDoGiro,
): PaginaDoPlano[] {
  const escolhidas = selecao(plano, posicoesSelecionadas)
  const passo = sentido === 'direita' ? 90 : -90
  return plano.map((pagina, posicao) =>
    escolhidas.has(posicao)
      ? { ...pagina, giro: giroNormalizado(pagina.giro + passo) }
      : pagina,
  )
}

export function moverSelecionadas(
  plano: readonly PaginaDoPlano[],
  posicoes: Iterable<number>,
  lado: LadoDoMovimento,
): PaginaDoPlano[] {
  const escolhidas = selecao(plano, posicoes)
  if (lado === 'depois') {
    const ultima = plano.length - 1
    return moverSelecionadas(
      [...plano].reverse(),
      [...escolhidas].map((posicao) => ultima - posicao),
      'antes',
    ).reverse()
  }
  const novo = [...plano]
  let primeiraLivre = 0
  for (const posicao of [...escolhidas].sort((a, b) => a - b)) {
    if (posicao > primeiraLivre) {
      ;[novo[posicao - 1], novo[posicao]] = [novo[posicao], novo[posicao - 1]]
      primeiraLivre = posicao
    } else {
      primeiraLivre = posicao + 1
    }
  }
  return novo
}

export function apagar(
  plano: readonly PaginaDoPlano[],
  posicoes: Iterable<number>,
): PaginaDoPlano[] {
  const escolhidas = selecao(plano, posicoes)
  return plano.filter((_, posicao) => !escolhidas.has(posicao))
}

export function extrair(
  plano: readonly PaginaDoPlano[],
  posicoes: Iterable<number>,
): PaginaDoPlano[] {
  const escolhidas = selecao(plano, posicoes)
  return plano.filter((_, posicao) => escolhidas.has(posicao))
}
