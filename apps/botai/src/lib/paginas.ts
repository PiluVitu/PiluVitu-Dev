export type SituacaoPagina = 'ok' | 'proibida' | 'arquivo-sem-acesso'

const ESQUEMAS_PROIBIDOS = [
  'chrome:',
  'chrome-extension:',
  'edge:',
  'about:',
  'view-source:',
  'devtools:',
  'data:',
]
const RECUSAS_DO_CHROME = [/^Cannot access /, /cannot be scripted/]

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

export function situacaoDaUrl(
  url: string | undefined,
  acessoArquivo: boolean,
): SituacaoPagina {
  if (!url) return 'ok'
  if (ESQUEMAS_PROIBIDOS.some((esquema) => url.startsWith(esquema)))
    return 'proibida'
  if (url.startsWith('file:'))
    return acessoArquivo ? 'ok' : 'arquivo-sem-acesso'
  const lida = lerUrl(url)
  return lida && lojaDoChrome(lida) ? 'proibida' : 'ok'
}

export function erroEhPaginaProibida(mensagem: string): boolean {
  return RECUSAS_DO_CHROME.some((padrao) => padrao.test(mensagem))
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
