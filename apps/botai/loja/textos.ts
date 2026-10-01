const PREFIXO_DA_JUSTIFICATIVA = 'Justificativa: '

export function lerSecoes(markdown: string): Map<string, string> {
  const partes = markdown.split(/^## (.+)$/m)
  const secoes = new Map<string, string>()
  for (let i = 1; i < partes.length; i += 2)
    secoes.set(partes[i].trim(), partes[i + 1].trim())
  return secoes
}

export function permissoesJustificadas(secoes: Map<string, string>): string[] {
  return [...secoes.keys()]
    .filter((titulo) => titulo.startsWith(PREFIXO_DA_JUSTIFICATIVA))
    .map((titulo) => titulo.slice(PREFIXO_DA_JUSTIFICATIVA.length))
}
