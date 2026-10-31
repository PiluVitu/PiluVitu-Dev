export type AmbienteVotai = 'producao' | 'preview' | 'dev'

export const VOTAI_ORIGEM = {
  producao: 'https://votai.piluvitu.com.br',
  dev: 'http://votai.localhost:3333',
} as const

export const SITE_ORIGEM = {
  producao: 'https://piluvitu.com.br',
  dev: 'http://localhost:3333',
} as const

export const PREFIXO_INTERNO = '/votacao'

export function ambienteVotai(
  vercelEnv: string | undefined = process.env.VOTAI_AMBIENTE,
): AmbienteVotai {
  if (vercelEnv === 'production') return 'producao'
  if (vercelEnv === 'preview') return 'preview'
  return 'dev'
}

export function origemDoVotai(
  ambiente: AmbienteVotai = ambienteVotai(),
): string | null {
  return ambiente === 'preview' ? null : VOTAI_ORIGEM[ambiente]
}

export function origemDoSite(
  ambiente: AmbienteVotai = ambienteVotai(),
): string | null {
  return ambiente === 'preview' ? null : SITE_ORIGEM[ambiente]
}

export function ehHostDoVotai(
  hostname: string,
  ambiente: AmbienteVotai = ambienteVotai(),
): boolean {
  const origem = origemDoVotai(ambiente)
  return origem !== null && new URL(origem).hostname === hostname.toLowerCase()
}

/** '' no host do Votaí (telas na raiz), '/votacao' no site e no preview. */
export function baseDaVotacao(
  hostname: string,
  ambiente: AmbienteVotai = ambienteVotai(),
): '' | typeof PREFIXO_INTERNO {
  return ehHostDoVotai(hostname, ambiente) ? '' : PREFIXO_INTERNO
}

export function caminhoNaBase(base: string, resto = ''): string {
  return `${base}${resto}` || '/'
}

/** URL pública de um caminho do Votaí ('/', '/12', '/anteriores'…). */
export function urlDoVotai(
  caminho: string,
  ambiente: AmbienteVotai = ambienteVotai(),
): string {
  const origem = origemDoVotai(ambiente)
  if (origem === null)
    return caminho === '/' ? PREFIXO_INTERNO : `${PREFIXO_INTERNO}${caminho}`
  return `${origem}${caminho}`
}

export function urlDaSessao(
  id: number,
  ambiente: AmbienteVotai = ambienteVotai(),
): string {
  return urlDoVotai(`/${id}`, ambiente)
}

export function urlDoSite(
  caminho: string,
  ambiente: AmbienteVotai = ambienteVotai(),
): string {
  const origem = origemDoSite(ambiente)
  return origem === null ? caminho : `${origem}${caminho}`
}

/** Destino absoluto do login: no Votaí, a origem fixa em código + o caminho atual. */
export function destinoDoLogin(
  local: Pick<Location, 'hostname' | 'pathname' | 'search' | 'hash' | 'href'>,
  ambiente: AmbienteVotai = ambienteVotai(),
): string {
  const origem = origemDoVotai(ambiente)
  if (origem !== null && ehHostDoVotai(local.hostname, ambiente))
    return `${origem}${local.pathname}${local.search}${local.hash}`
  return local.href
}

const ID = '[1-9][0-9]{0,9}'
const DO_VOTAI: [RegExp, (id?: string) => string][] = [
  [/^\/$/, () => PREFIXO_INTERNO],
  [new RegExp(`^/(${ID})$`), (id) => `${PREFIXO_INTERNO}/${id}`],
  [/^\/anteriores$/, () => `${PREFIXO_INTERNO}/anteriores`],
  [
    new RegExp(`^/anteriores/(${ID})$`),
    (id) => `${PREFIXO_INTERNO}/anteriores/${id}`,
  ],
]
const DO_SITE: [RegExp, (id?: string) => string][] = [
  [/^\/votacao$/, () => '/'],
  [new RegExp(`^/votacao/(${ID})$`), (id) => `/${id}`],
  [/^\/votacao\/anteriores$/, () => '/anteriores'],
  [new RegExp(`^/votacao/anteriores/(${ID})$`), (id) => `/anteriores/${id}`],
]

function traduz(
  tabela: [RegExp, (id?: string) => string][],
  caminho: string,
): string | null {
  for (const [padrao, destino] of tabela) {
    const casou = padrao.exec(caminho)
    if (casou) return destino(casou[1])
  }
  return null
}

/** Caminho do Votaí → rota interna do app ('/12' → '/votacao/12'). */
export const caminhoInterno = (caminho: string) => traduz(DO_VOTAI, caminho)

/** Rota interna do app → caminho do Votaí ('/votacao/12' → '/12'). */
export const caminhoNoVotai = (caminho: string) => traduz(DO_SITE, caminho)

function ehRecursoEstatico(caminho: string): boolean {
  return (
    caminho.startsWith('/_next/') ||
    /^\/(opengraph-image|twitter-image|icon|apple-icon)(-[\w-]+)?$/.test(
      caminho,
    ) ||
    caminho === '/favicon.ico'
  )
}

export type DecisaoVotai =
  | { tipo: 'seguir' }
  | { tipo: 'reescrever'; caminho: string }
  | { tipo: 'redirecionar'; url: string }
  | { tipo: 'nao-encontrado' }

export function decidirRota(
  pedido: { hostname: string; pathname: string; search: string },
  ambiente: AmbienteVotai = ambienteVotai(),
): DecisaoVotai {
  if (ambiente === 'preview') return { tipo: 'seguir' }
  const origemVotai = VOTAI_ORIGEM[ambiente]
  const { pathname, search } = pedido

  if (ehHostDoVotai(pedido.hostname, ambiente)) {
    if (ehRecursoEstatico(pathname)) return { tipo: 'seguir' }
    const interno = caminhoInterno(pathname)
    if (interno) return { tipo: 'reescrever', caminho: interno }
    const noVotai = caminhoNoVotai(pathname)
    if (noVotai)
      return { tipo: 'redirecionar', url: `${origemVotai}${noVotai}${search}` }
    // No next dev, o Next devolve relativo um Location para qualquer endereço de loopback (o site
    // de dev), e o Votaí redirecionaria para si mesmo em loop: ver "Votaí" no CLAUDE.md.
    if (ambiente === 'dev') return { tipo: 'nao-encontrado' }
    return {
      tipo: 'redirecionar',
      url: `${SITE_ORIGEM.producao}${pathname}${search}`,
    }
  }

  const noVotai = caminhoNoVotai(pathname)
  if (noVotai)
    return { tipo: 'redirecionar', url: `${origemVotai}${noVotai}${search}` }
  return { tipo: 'seguir' }
}
