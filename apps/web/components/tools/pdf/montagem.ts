export const idDaPagina = (arquivo: number, indice: number): string =>
  `a${arquivo}p${indice}`

/** O inverso do `idDaPagina`; a página em branco (`b<n>`) não tem arquivo. */
export function origemDoId(
  id: string,
): { arquivo: number; indice: number } | null {
  const achado = /^a(\d+)p(\d+)$/.exec(id)
  return achado
    ? { arquivo: Number(achado[1]), indice: Number(achado[2]) }
    : null
}
