export type Loja = 'chrome' | 'firefox' | 'edge' | 'opera'
export type TipoItem = 'extensao' | 'mobile' | 'web' | 'cli'

export const LOJAS: readonly Loja[] = ['chrome', 'firefox', 'edge', 'opera']
export const TIPOS = [
  'extensao',
  'mobile',
  'web',
  'cli',
] as const satisfies readonly TipoItem[]
export const TIPO_PADRAO: TipoItem = 'web'

const HOST_DA_LOJA: Record<Loja, string> = {
  chrome: 'chromewebstore.google.com',
  firefox: 'addons.mozilla.org',
  edge: 'microsoftedge.microsoft.com',
  opera: 'addons.opera.com',
}

const DATA = /^\d{4}-\d{2}-\d{2}$/

function urlOuNulo(valor: string): URL | null {
  try {
    return new URL(valor)
  } catch {
    return null
  }
}

export function ehHttps(valor: string): boolean {
  return urlOuNulo(valor.trim())?.protocol === 'https:'
}

export function ehUrlDaLoja(loja: Loja, valor: string): boolean {
  const url = urlOuNulo(valor.trim())
  return url?.protocol === 'https:' && url.hostname === HOST_DA_LOJA[loja]
}

export function ehDataValida(valor: string): boolean {
  if (!DATA.test(valor)) return false
  const data = new Date(`${valor}T00:00:00Z`)
  return (
    !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === valor
  )
}
