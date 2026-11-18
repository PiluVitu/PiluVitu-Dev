import type { PaginaDoPlano } from '@piluvitu/tools/pdf-regras'
import type { PaginaParaMontar } from './motor'

export const idDaPagina = (arquivo: number, indice: number): string =>
  `a${arquivo}p${indice}`

/** Sem objetos, a moldura é o giro: é como a página aparece quando o primeiro objeto entrar. */
export function montagemDoPlano(
  plano: readonly PaginaDoPlano[],
): PaginaParaMontar[] {
  return plano.map(({ indice, giro }) => ({
    id: idDaPagina(0, indice),
    origem: { arquivo: 0, indice },
    giro,
    moldura: giro,
  }))
}
