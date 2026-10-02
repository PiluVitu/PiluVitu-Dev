import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Metadata } from 'next'
import type { Project } from '@/mocks/projects'
import {
  ehDataValida,
  ehHttps,
  ehUrlDaLoja,
  LOJAS,
  TIPO_PADRAO,
  TIPOS,
  type Loja,
  type TipoItem,
} from './pilulabs-regras'
import { DOMINIO_PILUTECH, urlPublica } from './pilutech-dominios'

export { LOJAS, TIPOS } from './pilulabs-regras'
export type { Loja, TipoItem } from './pilulabs-regras'

export type Fase = 'em-breve' | 'disponivel'

export type ItemPiluLabs = {
  slug: string
  order: number
  nome: string
  subtitulo: string
  descricao: string
  tipo: TipoItem
  tags: string[]
  logo: string
  sigla: string
  site: string
  repo: string
  chromeUrl: string
  firefoxUrl: string
  edgeUrl: string
  operaUrl: string
  destaque: boolean
  data: string
  listado: boolean
  paginaPropria: boolean
}

export type EntradaItem = {
  order?: number | null
  nome?: string | null
  subtitulo?: string | null
  descricao?: string | null
  tipo?: string | null
  tags?: readonly string[] | null
  logo?: string | null
  sigla?: string | null
  site?: string | null
  repo?: string | null
  chromeUrl?: string | null
  firefoxUrl?: string | null
  edgeUrl?: string | null
  operaUrl?: string | null
  destaque?: boolean | null
  data?: string | null
  listado?: boolean | null
  paginaPropria?: boolean | null
}

export type LojaPublicada = { loja: Loja; url: string }

const CAMPO_DA_LOJA = {
  chrome: 'chromeUrl',
  firefox: 'firefoxUrl',
  edge: 'edgeUrl',
  opera: 'operaUrl',
} as const satisfies Record<Loja, keyof ItemPiluLabs>

type UrlsDasLojas = Pick<ItemPiluLabs, (typeof CAMPO_DA_LOJA)[Loja]>
type Ordenavel = Pick<ItemPiluLabs, 'order' | 'slug'>

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : ''
}

function https(valor: unknown): string {
  const url = texto(valor)
  return ehHttps(url) ? url : ''
}

export function normalizarItem(
  slug: string,
  entrada: EntradaItem,
): ItemPiluLabs {
  const data = texto(entrada.data)
  return {
    slug,
    order: typeof entrada.order === 'number' ? entrada.order : 0,
    nome: texto(entrada.nome) || slug,
    subtitulo: texto(entrada.subtitulo),
    descricao: texto(entrada.descricao),
    tipo: TIPOS.find((t) => t === entrada.tipo) ?? TIPO_PADRAO,
    tags: (entrada.tags ?? []).map(texto).filter(Boolean),
    logo: texto(entrada.logo),
    sigla: texto(entrada.sigla),
    site: https(entrada.site),
    repo: https(entrada.repo),
    chromeUrl: texto(entrada.chromeUrl),
    firefoxUrl: texto(entrada.firefoxUrl),
    edgeUrl: texto(entrada.edgeUrl),
    operaUrl: texto(entrada.operaUrl),
    destaque: entrada.destaque === true,
    data: ehDataValida(data) ? data : '',
    listado: entrada.listado === true,
    paginaPropria: entrada.paginaPropria === true,
  }
}

export function lojasPublicadas(item: UrlsDasLojas): LojaPublicada[] {
  return LOJAS.flatMap((loja) => {
    const url = item[CAMPO_DA_LOJA[loja]].trim()
    return ehUrlDaLoja(loja, url) ? [{ loja, url }] : []
  })
}

export function fase(item: UrlsDasLojas): Fase {
  return lojasPublicadas(item).length > 0 ? 'disponivel' : 'em-breve'
}

function porOrdem(a: Ordenavel, b: Ordenavel): number {
  if (a.order !== b.order) return a.order - b.order
  return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0
}

function maisNovoPrimeiro(a: string, b: string): number {
  if (a === b) return 0
  if (a === '') return 1
  if (b === '') return -1
  return a < b ? 1 : -1
}

export function itensListados<
  T extends Ordenavel & Pick<ItemPiluLabs, 'listado'>,
>(itens: readonly T[]): T[] {
  return itens.filter((item) => item.listado).sort(porOrdem)
}

export function selecionarParaHome<
  T extends Ordenavel & Pick<ItemPiluLabs, 'listado' | 'destaque' | 'data'>,
>(itens: readonly T[], max = 4): T[] {
  const listados = itensListados(itens)
  const destaques = listados.filter((item) => item.destaque)
  const demais = listados
    .filter((item) => !item.destaque)
    .sort((a, b) => maisNovoPrimeiro(a.data, b.data) || porOrdem(a, b))
  return [...destaques, ...demais].slice(0, max)
}

export function linkDoItem(
  item: Pick<ItemPiluLabs, 'slug' | 'paginaPropria' | 'site' | 'repo'>,
  subdominiosAtivos: boolean,
): string | null {
  const pagina = `/pilulabs/${item.slug}`
  if (item.paginaPropria && !subdominiosAtivos) return pagina
  if (item.site) return item.site
  if (item.paginaPropria) return urlPublica(pagina, subdominiosAtivos)
  return item.repo || null
}

export function siglaDoItem(
  item: Pick<ItemPiluLabs, 'sigla' | 'nome'>,
): string {
  return item.sigla || item.nome.slice(0, 2).toUpperCase()
}

export function itemParaProject(
  item: ItemPiluLabs,
  subdominiosAtivos: boolean,
): Project {
  const link = linkDoItem(item, subdominiosAtivos)
  return {
    id: `pilulabs-${item.slug}`,
    projectName: item.nome,
    subtitle: item.subtitulo,
    projectLogo: item.logo,
    description: item.descricao,
    tags: item.tags,
    deployLink: link && link !== item.repo ? link : '',
    deployLabel: 'Acessar',
    repoLink: item.repo,
    image: item.logo || undefined,
    altImage: siglaDoItem(item),
  }
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
export function metadataDaPagina(
  { caminho, titulo, descricao }: PaginaPiluLabs,
  subdominiosAtivos: boolean,
): Metadata {
  const url = urlPublica(caminho, subdominiosAtivos)
  return {
    title: { absolute: titulo },
    description: descricao,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      locale: 'pt_BR',
      siteName: subdominiosAtivos ? DOMINIO_PILUTECH : 'piluvitu.com.br',
      url,
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

export function metadataDoItem(
  item: Pick<ItemPiluLabs, 'listado'>,
  pagina: PaginaPiluLabs,
  subdominiosAtivos: boolean,
): Metadata {
  const metadata = metadataDaPagina(pagina, subdominiosAtivos)
  return item.listado ? metadata : { ...metadata, robots: { index: false } }
}
