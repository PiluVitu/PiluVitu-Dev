export type Loja = 'chrome' | 'firefox' | 'edge' | 'opera'
export type TipoItem = 'extensao' | 'mobile' | 'web' | 'cli'
export type Fase = 'em-breve' | 'disponivel'
export type Sistema = 'windows' | 'mac' | 'linux'
export type UrlsDasLojas = {
  chromeUrl: string
  firefoxUrl: string
  edgeUrl: string
  operaUrl: string
}
export type LojaPublicada = { loja: Loja; url: string }
export type TeclasSugeridas = { default: string; mac: string; linux?: string }

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

const CAMPO_DA_LOJA = {
  chrome: 'chromeUrl',
  firefox: 'firefoxUrl',
  edge: 'edgeUrl',
  opera: 'operaUrl',
} as const satisfies Record<Loja, keyof UrlsDasLojas>

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

export function lojasPublicadas(urls: UrlsDasLojas): LojaPublicada[] {
  return LOJAS.flatMap((loja) => {
    const url = urls[CAMPO_DA_LOJA[loja]].trim()
    return ehUrlDaLoja(loja, url) ? [{ loja, url }] : []
  })
}

export function fase(urls: UrlsDasLojas): Fase {
  return lojasPublicadas(urls).length > 0 ? 'disponivel' : 'em-breve'
}

function textoOuVazio(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : ''
}

export function urlsDasLojas(item: unknown): UrlsDasLojas {
  const campos =
    typeof item === 'object' && item !== null
      ? (item as Record<string, unknown>)
      : {}
  return {
    chromeUrl: textoOuVazio(campos.chromeUrl),
    firefoxUrl: textoOuVazio(campos.firefoxUrl),
    edgeUrl: textoOuVazio(campos.edgeUrl),
    operaUrl: textoOuVazio(campos.operaUrl),
  }
}

// No Windows e no Linux o Chrome reserva Alt+Shift+P ("criar novo grupo de abas") e não o cede à extensão.
const TECLAS_CHROMIUM: TeclasSugeridas = {
  default: 'Ctrl+Shift+Y',
  mac: 'Alt+Shift+P',
}
// No Linux o Firefox usa Ctrl+Shift+Y para os Downloads e também não cede a tecla.
const TECLAS_FIREFOX: TeclasSugeridas = {
  ...TECLAS_CHROMIUM,
  linux: 'Alt+Shift+P',
}

export const TECLAS_DO_MANIFESTO = {
  chromium: TECLAS_CHROMIUM,
  firefox: TECLAS_FIREFOX,
} as const

// No Mac o Chrome lê o Ctrl do suggested_key como Command; o Control é MacCtrl.
const SIMBOLO_NO_MAC: ReadonlyMap<string, string> = new Map([
  ['Alt', '⌥'],
  ['Shift', '⇧'],
  ['Ctrl', '⌘'],
  ['Command', '⌘'],
  ['MacCtrl', '⌃'],
])

export function teclaNoMac(tecla: string): string {
  return tecla
    .split('+')
    .map((parte) => SIMBOLO_NO_MAC.get(parte) ?? parte)
    .join('')
}

function porSistema(teclas: TeclasSugeridas): Record<Sistema, string> {
  return {
    windows: teclas.default,
    mac: teclaNoMac(teclas.mac),
    linux: teclas.linux ?? teclas.default,
  }
}

export const ATALHOS: Record<Loja, Record<Sistema, string>> = {
  chrome: porSistema(TECLAS_CHROMIUM),
  edge: porSistema(TECLAS_CHROMIUM),
  opera: porSistema(TECLAS_CHROMIUM),
  firefox: porSistema(TECLAS_FIREFOX),
}
