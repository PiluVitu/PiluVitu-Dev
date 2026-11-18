import { apagar, type Giro } from '@piluvitu/tools/pdf-regras'
import { idDaPagina } from './montagem'
import type { PaginaParaMontar } from './motor'
import { molduraDa, type Cena } from './objetos'

export type PaginaDaBancada = {
  readonly id: string
  readonly origem: { readonly arquivo: number; readonly indice: number }
  readonly giro: Giro
}

/** A lista na ordem do documento final e a seleção na ordem em que foi marcada (P2/D4 pedem a última marcada). */
export type Paginas = {
  readonly lista: readonly PaginaDaBancada[]
  readonly marcadas: readonly string[]
}

export type PaginasComDesfazer = Paginas & {
  readonly passado: readonly Paginas[]
}

export const LIMITE_DO_DESFAZER_DAS_PAGINAS = 100

export function paginasIniciais(total: number): PaginasComDesfazer {
  return {
    lista: Array.from({ length: total }, (_, indice) => ({
      id: idDaPagina(0, indice),
      origem: { arquivo: 0, indice },
      giro: 0,
    })),
    marcadas: [],
    passado: [],
  }
}

export function mudarPaginas(
  atual: PaginasComDesfazer,
  novo: Paginas,
): PaginasComDesfazer {
  const { lista, marcadas } = atual
  return {
    ...novo,
    passado: [...atual.passado, { lista, marcadas }].slice(
      -LIMITE_DO_DESFAZER_DAS_PAGINAS,
    ),
  }
}

export function desfazerPaginas(atual: PaginasComDesfazer): PaginasComDesfazer {
  const anterior = atual.passado.at(-1)
  if (!anterior) return atual
  return { ...anterior, passado: atual.passado.slice(0, -1) }
}

export function marcar(
  atual: PaginasComDesfazer,
  id: string,
  marcada: boolean,
): PaginasComDesfazer {
  if (atual.marcadas.includes(id) === marcada) return atual
  return {
    ...atual,
    marcadas: marcada
      ? [...atual.marcadas, id]
      : atual.marcadas.filter((outra) => outra !== id),
  }
}

export function marcarTodas(atual: PaginasComDesfazer): PaginasComDesfazer {
  const ja = new Set(atual.marcadas)
  return {
    ...atual,
    marcadas: [
      ...atual.marcadas,
      ...atual.lista.flatMap(({ id }) => (ja.has(id) ? [] : [id])),
    ],
  }
}

export function semMarcadas(atual: PaginasComDesfazer): PaginasComDesfazer {
  return atual.marcadas.length ? { ...atual, marcadas: [] } : atual
}

/** As posições das marcadas, na ordem do documento. */
export function posicoesMarcadas({ lista, marcadas }: Paginas): number[] {
  const marcada = new Set(marcadas)
  return lista.flatMap(({ id }, posicao) => (marcada.has(id) ? [posicao] : []))
}

export function apagarPaginas(
  { lista, marcadas }: Paginas,
  posicoes: readonly number[],
): Paginas {
  const saem = new Set(posicoes.map((posicao) => lista[posicao]?.id))
  return {
    lista: apagar(lista, posicoes),
    marcadas: marcadas.filter((id) => !saem.has(id)),
  }
}

export function mudouDoInicio(
  lista: readonly PaginaDaBancada[],
  total: number,
): boolean {
  return (
    lista.length !== total ||
    lista.some(
      ({ origem, giro }, posicao) =>
        giro !== 0 || origem.arquivo !== 0 || origem.indice !== posicao,
    )
  )
}

export function montagemDaBancada(
  lista: readonly PaginaDaBancada[],
  cena: Cena,
): PaginaParaMontar[] {
  return lista.map(({ id, origem, giro }) => ({
    id,
    origem,
    giro,
    moldura: molduraDa(cena, id, giro),
  }))
}
