import {
  ehDataValida,
  ehHttps,
  TIPO_PADRAO,
  TIPOS,
  type TipoItem,
} from '@piluvitu/tools/pilulabs'
import type { Metadata } from 'next'
import type { Project } from '@/mocks/projects'
import { DOMINIO_PILUTECH, urlPublica } from './pilutech-dominios'

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
    deployLink: link ?? '',
    deployLabel: 'Acessar',
    image: item.logo || undefined,
    altImage: siglaDoItem(item),
  }
}

export type PaginaPiluLabs = {
  caminho: string
  titulo: string
  descricao: string
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
