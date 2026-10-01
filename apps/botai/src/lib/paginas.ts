import type { Navegador } from './navegador'

export type SituacaoPagina = 'ok' | 'proibida' | 'arquivo-sem-acesso'

const ESQUEMAS_PROIBIDOS = [
  'chrome:',
  'chrome-extension:',
  'edge:',
  'opera:',
  'about:',
  'view-source:',
  'devtools:',
  'data:',
  'moz-extension:',
  'resource:',
]
const RECUSAS_DO_NAVEGADOR = [
  /^Cannot access /,
  /cannot be scripted/,
  /^Missing host permission for the tab/,
]
// A pref extensions.webextensions.restrictedDomains do Firefox (modules/libpref/init/all.js); ele compara o host exato.
const DOMINIOS_RESTRITOS_DO_FIREFOX = new Set([
  'accounts-static.cdn.mozilla.net',
  'accounts.firefox.com',
  'addons.cdn.mozilla.net',
  'addons.mozilla.org',
  'api.accounts.firefox.com',
  'content.cdn.mozilla.net',
  'discovery.addons.mozilla.org',
  'oauth.accounts.firefox.com',
  'profile.accounts.firefox.com',
  'support.mozilla.org',
  'sync.services.mozilla.com',
])

function lerUrl(url: string): URL | null {
  try {
    return new URL(url)
  } catch {
    return null
  }
}

function lojaDoChrome(url: URL): boolean {
  return (
    url.host === 'chromewebstore.google.com' ||
    (url.host === 'chrome.google.com' && url.pathname.startsWith('/webstore'))
  )
}

const SITE_PROIBIDO: Record<Navegador, (url: URL) => boolean> = {
  chrome: lojaDoChrome,
  edge: (url) =>
    lojaDoChrome(url) || url.hostname === 'microsoftedge.microsoft.com',
  opera: (url) => lojaDoChrome(url) || url.hostname === 'addons.opera.com',
  firefox: (url) => DOMINIOS_RESTRITOS_DO_FIREFOX.has(url.hostname),
}

export function situacaoDaUrl(
  url: string | undefined,
  acessoArquivo: boolean,
  navegador: Navegador,
): SituacaoPagina {
  if (!url) return 'ok'
  if (ESQUEMAS_PROIBIDOS.some((esquema) => url.startsWith(esquema)))
    return 'proibida'
  if (url.startsWith('file:'))
    return acessoArquivo ? 'ok' : 'arquivo-sem-acesso'
  const lida = lerUrl(url)
  return lida && SITE_PROIBIDO[navegador](lida) ? 'proibida' : 'ok'
}

export function erroEhPaginaProibida(mensagem: string): boolean {
  return RECUSAS_DO_NAVEGADOR.some((padrao) => padrao.test(mensagem))
}

export function rotuloDoHost(url: string | undefined): string {
  if (!url) return 'página atual'
  const lida = lerUrl(url)
  if (!lida) return url
  if (lida.protocol === 'http:' || lida.protocol === 'https:') return lida.host
  if (lida.protocol === 'file:') return 'arquivo local'
  if (lida.protocol === 'data:') return 'data:'
  return lida.host
    ? `${lida.protocol}//${lida.host}`
    : `${lida.protocol}${lida.pathname}`
}

export function caminhoDaUrl(url: string | undefined): string {
  return (url && lerUrl(url)?.pathname) || '/'
}
