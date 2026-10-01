import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Metadata } from 'next'
import type { Project } from '@/mocks/projects'

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

export type Sistema = 'windows' | 'mac' | 'linux'
export type Captura = { arquivo: string; src: string; alt: string }
export type PaginaPiluLabs = {
  caminho: string
  titulo: string
  descricao: string
}

const ATALHO_CHROMIUM: Record<Sistema, string> = {
  windows: 'Ctrl+Shift+Y',
  mac: '⌥⇧P',
  linux: 'Ctrl+Shift+Y',
}

export const ATALHOS: Record<Loja, Record<Sistema, string>> = {
  chrome: { ...ATALHO_CHROMIUM },
  edge: { ...ATALHO_CHROMIUM },
  opera: { ...ATALHO_CHROMIUM },
  // Espelha o wxt.config.ts do Botaí: no Firefox para Linux, Ctrl+Shift+Y é dos Downloads.
  firefox: { ...ATALHO_CHROMIUM, linux: 'Alt+Shift+P' },
}

export const ROTULOS_CAPTURA: ReadonlyMap<string, string> = new Map([
  ['pagina', 'página'],
  ['formulario', 'formulário'],
  ['cartao', 'cartão'],
  ['endereco', 'endereço'],
  ['opcoes', 'opções'],
  ['claro', '(tema claro)'],
  ['escuro', '(tema escuro)'],
])

const PREFIXO_DE_ORDEM = /^\d+-/
const EXTENSAO_PNG = /\.png$/i

export function altDaCaptura(arquivo: string): string {
  const palavras = arquivo
    .replace(EXTENSAO_PNG, '')
    .replace(PREFIXO_DE_ORDEM, '')
    .split(/[-_]+/)
    .filter(Boolean)
    .map((palavra) => palavra.toLowerCase())
    .map((palavra) => ROTULOS_CAPTURA.get(palavra) ?? palavra)
  return `Captura de tela: ${palavras.join(' ')}`
}

// Roda no build: na Vercel, public/ não vai para o lambda, e a rota tem de ficar
// estática (ver "PiluLabs" no CLAUDE.md do apps/web).
export function listarCapturas(
  slug: string,
  raizPublica: string = join(process.cwd(), 'public'),
): Captura[] {
  const pasta = join(raizPublica, 'pilulabs', slug, 'capturas')
  let arquivos: string[]
  try {
    arquivos = readdirSync(pasta, { withFileTypes: true })
      .filter((entrada) => entrada.isFile() && EXTENSAO_PNG.test(entrada.name))
      .map((entrada) => entrada.name)
  } catch (erro) {
    if ((erro as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw erro
  }
  return arquivos
    .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }))
    .map((arquivo) => ({
      arquivo,
      src: `/pilulabs/${slug}/capturas/${encodeURIComponent(arquivo)}`,
      alt: altDaCaptura(arquivo),
    }))
}

// O Next substitui o openGraph do layout inteiro, e a imagem só vem do
// opengraph-image.tsx do próprio segmento: por isso tudo de novo e sem images.
export function metadataDaPagina({
  caminho,
  titulo,
  descricao,
}: PaginaPiluLabs): Metadata {
  return {
    title: { absolute: titulo },
    description: descricao,
    alternates: { canonical: caminho },
    openGraph: {
      type: 'website',
      locale: 'pt_BR',
      siteName: 'piluvitu.com.br',
      url: caminho,
      title: titulo,
      description: descricao,
    },
    twitter: {
      card: 'summary_large_image',
      title: titulo,
      description: descricao,
    },
  }
}

export function metadataDoProduto(
  produto: Pick<Produto, 'listado'>,
  pagina: PaginaPiluLabs,
): Metadata {
  const metadata = metadataDaPagina(pagina)
  return produto.listado ? metadata : { ...metadata, robots: { index: false } }
}

export function produtoParaProject(produto: Produto): Project {
  return {
    id: `pilulabs-${produto.slug}`,
    projectName: produto.nome,
    subtitle: 'PiluLabs · Powered by PiluTech',
    projectLogo: produto.icone,
    description: produto.resumo,
    tags: produto.tags,
    deployLink: `/pilulabs/${produto.slug}`,
    deployLabel: 'Ver no PiluLabs',
    repoLink: produto.repoLink,
    image: produto.icone || undefined,
    altImage: produto.nome.slice(0, 2).toUpperCase(),
  }
}
