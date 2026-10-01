export type Loja = 'chrome' | 'firefox' | 'edge' | 'opera'
export type Fase = 'em-breve' | 'disponivel'
export type TipoProduto = 'extensao' | 'web' | 'cli'

export type Produto = {
  slug: string
  order: number
  nome: string
  tipo: TipoProduto
  listado: boolean
  resumo: string
  icone: string
  tags: string[]
  chromeUrl: string
  firefoxUrl: string
  edgeUrl: string
  operaUrl: string
  repoLink: string
}

export type EntradaProduto = {
  order?: number | null
  nome?: string | null
  tipo?: string | null
  listado?: boolean | null
  resumo?: string | null
  icone?: string | null
  tags?: readonly string[] | null
  chromeUrl?: string | null
  firefoxUrl?: string | null
  edgeUrl?: string | null
  operaUrl?: string | null
  repoLink?: string | null
}

export type LojaPublicada = { loja: Loja; url: string }

export const LOJAS: readonly Loja[] = ['chrome', 'firefox', 'edge', 'opera']

const TIPOS: readonly TipoProduto[] = ['extensao', 'web', 'cli']

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
} as const satisfies Record<Loja, keyof Produto>

type UrlsDasLojas = Pick<Produto, (typeof CAMPO_DA_LOJA)[Loja]>

function texto(valor: string | null | undefined): string {
  return typeof valor === 'string' ? valor.trim() : ''
}

export function normalizarProduto(
  slug: string,
  entrada: EntradaProduto,
): Produto {
  return {
    slug,
    order: typeof entrada.order === 'number' ? entrada.order : 0,
    nome: texto(entrada.nome) || slug,
    tipo: TIPOS.find((t) => t === entrada.tipo) ?? 'extensao',
    listado: entrada.listado === true,
    resumo: texto(entrada.resumo),
    icone: texto(entrada.icone),
    tags: (entrada.tags ?? []).map((tag) => texto(tag)).filter(Boolean),
    chromeUrl: texto(entrada.chromeUrl),
    firefoxUrl: texto(entrada.firefoxUrl),
    edgeUrl: texto(entrada.edgeUrl),
    operaUrl: texto(entrada.operaUrl),
    repoLink: texto(entrada.repoLink),
  }
}

function ehUrlDaLoja(loja: Loja, url: string): boolean {
  if (!url) return false
  try {
    const { protocol, hostname } = new URL(url)
    return protocol === 'https:' && hostname === HOST_DA_LOJA[loja]
  } catch {
    return false
  }
}

export function lojasPublicadas(produto: UrlsDasLojas): LojaPublicada[] {
  return LOJAS.flatMap((loja) => {
    const url = produto[CAMPO_DA_LOJA[loja]].trim()
    return ehUrlDaLoja(loja, url) ? [{ loja, url }] : []
  })
}

export function fase(produto: UrlsDasLojas): Fase {
  return lojasPublicadas(produto).length > 0 ? 'disponivel' : 'em-breve'
}

export function produtosListados(produtos: Produto[]): Produto[] {
  return produtos.filter((p) => p.listado)
}
