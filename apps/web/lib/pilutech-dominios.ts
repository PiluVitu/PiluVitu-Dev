export const DOMINIO_PILUTECH = 'pilutech.com.br'
export const SITE_DO_AUTOR = 'https://piluvitu.com.br'

const BASES = [DOMINIO_PILUTECH, 'pilutech.localhost']
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const PREFIXOS_INTOCAVEIS = ['/_next/', '/__nextjs', '/_vercel/', '/api/']
const ARQUIVO = /\.[a-z0-9]+$/i
const IMAGEM_DE_ROTA = /^(?:opengraph|twitter)-image/

export type DestinoDoHost = { tipo: 'vitrine' } | { tipo: 'item'; slug: string }

export type Roteamento =
  | { acao: 'seguir' }
  | { acao: 'reescrever'; caminho: string }
  | { acao: 'redirecionar'; url: string }

export type Pedido = {
  host: string | null
  caminho: string
  busca: string
  subdominiosAtivos: boolean
}

const SEGUIR: Roteamento = { acao: 'seguir' }

export function subdominiosAtivos(
  env: Record<string, string | undefined> = process.env,
): boolean {
  // A Vercel marca Production, Preview e Development ao criar a variável: fora
  // de Production, a chave mandaria o /pilulabs* com 308 para a produção.
  if (env.VERCEL_ENV && env.VERCEL_ENV !== 'production') return false
  const valor = (env.PILUTECH_SUBDOMINIOS ?? '').trim().toLowerCase()
  return valor === '1' || valor === 'true'
}

function ehSlugDeSubdominio(slug: string): boolean {
  return SLUG.test(slug) && slug !== 'www'
}

function semBarraFinal(caminho: string): string {
  return caminho.length > 1 ? caminho.replace(/\/+$/, '') : caminho
}

function ehCaminhoPiluLabs(caminho: string): boolean {
  return caminho === '/pilulabs' || caminho.startsWith('/pilulabs/')
}

export function ehCaminhoIntocavel(caminho: string): boolean {
  if (
    caminho === '/api' ||
    PREFIXOS_INTOCAVEIS.some((prefixo) => caminho.startsWith(prefixo))
  )
    return true
  const ultimo = caminho.slice(caminho.lastIndexOf('/') + 1)
  return ARQUIVO.test(ultimo) || IMAGEM_DE_ROTA.test(ultimo)
}

export function destinoDoHost(host: string | null): DestinoDoHost | null {
  if (!host) return null
  const nome = host.trim().toLowerCase().replace(/:\d+$/, '')
  for (const base of BASES) {
    if (nome === base || nome === `www.${base}`) return { tipo: 'vitrine' }
    if (nome.endsWith(`.${base}`)) {
      const slug = nome.slice(0, -(base.length + 1))
      return ehSlugDeSubdominio(slug) ? { tipo: 'item', slug } : null
    }
  }
  return null
}

export function urlPublica(caminho: string, ativos: boolean): string {
  if (!ativos || ehCaminhoIntocavel(caminho)) return caminho
  const [, raiz, slug, ...resto] = semBarraFinal(caminho).split('/')
  if (raiz !== 'pilulabs') return caminho
  if (slug === undefined) return `https://${DOMINIO_PILUTECH}/`
  if (!ehSlugDeSubdominio(slug)) return caminho
  return `https://${slug}.${DOMINIO_PILUTECH}/${resto.join('/')}`
}

export function rotearPorHost(pedido: Pedido): Roteamento {
  const caminho = semBarraFinal(pedido.caminho)
  if (ehCaminhoIntocavel(caminho)) return SEGUIR
  const destino = destinoDoHost(pedido.host)
  if (destino === null) {
    if (!pedido.subdominiosAtivos || !ehCaminhoPiluLabs(caminho)) return SEGUIR
    const url = urlPublica(caminho, true)
    return url.startsWith('https://')
      ? { acao: 'redirecionar', url: url + pedido.busca }
      : SEGUIR
  }
  if (ehCaminhoPiluLabs(caminho)) return SEGUIR
  if (destino.tipo === 'vitrine')
    return caminho === '/'
      ? { acao: 'reescrever', caminho: '/pilulabs' }
      : { acao: 'redirecionar', url: SITE_DO_AUTOR + caminho + pedido.busca }
  const base = `/pilulabs/${destino.slug}`
  return {
    acao: 'reescrever',
    caminho: caminho === '/' ? base : base + caminho,
  }
}
