import type { Metadata, MetadataRoute } from 'next'
import type { BlogPost } from './blog-posts'
import { itensListados, linkDoItem, type ItemPiluLabs } from './pilulabs'
import { TOOLS, type ToolMeta } from './tools-registry'

export type PaginaPublica = {
  caminho: string
  nome: string
  descricao: string
  data?: string
}

export type PostPublico = Pick<
  BlogPost,
  'slug' | 'title' | 'excerpt' | 'metaDescription' | 'publishedAt' | 'semData'
>

export type Ferramenta = Pick<ToolMeta, 'slug' | 'title' | 'description'>

export const DESCRICAO_DO_SITE =
  'DevOps Engineer com 3 anos de experiência focado em sistemas em nuvem com alta disponibilidade e custo eficiente. Especialista em automatizar operações com ferramentas de mercado, monitorar a saúde das aplicações em tempo real e antecipar falhas antes que afetem o usuário final.'

export function umaLinha(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim()
}

const emLista = new Intl.ListFormat('pt-BR', { type: 'conjunction' })

export function descricaoDasFerramentas(
  ferramentas: readonly Ferramenta[],
): string {
  return `Utilitários para o dia a dia do desenvolvedor: ${emLista.format(
    ferramentas.map(({ title }) => title),
  )}.`
}

export function descricaoDaFerramenta({
  title,
  description,
}: Ferramenta): string {
  return `${title}: ${description}. Utilitário para desenvolvedores que roda direto no navegador.`
}

export const PAGINA_INICIAL: PaginaPublica = {
  caminho: '/',
  nome: 'Página inicial',
  descricao: DESCRICAO_DO_SITE,
}

export const PAGINA_PILULABS: PaginaPublica = {
  caminho: '/pilulabs',
  nome: 'PiluLabs',
  descricao:
    'Produtos e apps que o Paulo Victor faz e mantém. Powered by PiluTech.',
}

export const PAGINA_FERRAMENTAS: PaginaPublica = {
  caminho: '/tools',
  nome: 'Ferramentas',
  descricao: descricaoDasFerramentas(TOOLS),
}

export const PAGINA_KANBAN: PaginaPublica = {
  caminho: '/tasks',
  nome: 'Mini Kanban',
  descricao:
    'Mini Kanban pessoal: colunas, cartões e tags que ficam só no seu navegador, com exportação e importação em JSON.',
}

export const PAGINA_PRIVACIDADE: PaginaPublica = {
  caminho: '/privacidade',
  nome: 'Política de privacidade',
  descricao:
    'O que o piluvitu.com.br registra: estatísticas de visita sem cookie, o login da votação de filmes, o formulário de contato e os seus direitos na LGPD.',
}

export const PAGINAS_FIXAS: readonly PaginaPublica[] = [
  PAGINA_INICIAL,
  PAGINA_PILULABS,
  PAGINA_FERRAMENTAS,
  PAGINA_KANBAN,
  PAGINA_PRIVACIDADE,
]

export const ROTAS_FORA_DO_ROBOTS = ['/admin', '/api', '/preview'] as const

const ARQUIVOS_LLMS = ['/llms.txt', '/llms-full.txt'] as const

export function caminhoDaFerramenta(slug: string): string {
  return `/tools/${slug}`
}

export function caminhoDoPost(slug: string): string {
  return `/posts/${slug}`
}

export function descricaoDoPost({
  metaDescription,
  excerpt,
}: Pick<PostPublico, 'metaDescription' | 'excerpt'>): string {
  return metaDescription.trim() || excerpt.trim()
}

function paginaDaFerramenta(ferramenta: Ferramenta): PaginaPublica {
  return {
    caminho: caminhoDaFerramenta(ferramenta.slug),
    nome: ferramenta.title,
    descricao: descricaoDaFerramenta(ferramenta),
  }
}

function paginasDoPiluLabs(itens: readonly ItemPiluLabs[]): PaginaPublica[] {
  return itensListados(itens).flatMap((item) => {
    const link = linkDoItem(item)
    return item.paginaPropria && link
      ? [
          {
            caminho: link,
            nome: item.nome,
            descricao: umaLinha(item.descricao),
          },
        ]
      : []
  })
}

function paginaDoPost(post: PostPublico): PaginaPublica {
  return {
    caminho: caminhoDoPost(post.slug),
    nome: post.title,
    descricao: umaLinha(descricaoDoPost(post)),
    ...(post.semData ? {} : { data: post.publishedAt }),
  }
}

export function rotasPublicas({
  posts,
  piluLabs,
  ferramentas = TOOLS,
}: {
  posts: readonly PostPublico[]
  piluLabs: readonly ItemPiluLabs[]
  ferramentas?: readonly Ferramenta[]
}): PaginaPublica[] {
  return [
    ...PAGINAS_FIXAS,
    ...ferramentas.map(paginaDaFerramenta),
    ...paginasDoPiluLabs(piluLabs),
    ...posts.map(paginaDoPost),
  ]
}

export function urlAbsoluta(caminho: string, origem: string): string {
  return new URL(caminho, `${origem}/`).href
}

function escaparParaOXmlDoNext(url: string): string {
  return url.replaceAll('&', '&amp;')
}

export function entradasDoSitemap(
  paginas: readonly PaginaPublica[],
  origem: string,
): MetadataRoute.Sitemap {
  return [
    ...paginas.map(({ caminho, data }) => ({
      url: escaparParaOXmlDoNext(urlAbsoluta(caminho, origem)),
      ...(data ? { lastModified: data } : {}),
    })),
    ...ARQUIVOS_LLMS.map((caminho) => ({ url: urlAbsoluta(caminho, origem) })),
  ]
}

export function robotsTxt(origem: string): string {
  return [
    'User-Agent: *',
    'Allow: /',
    ...ROTAS_FORA_DO_ROBOTS.map((caminho) => `Disallow: ${caminho}`),
    '',
    `Sitemap: ${urlAbsoluta('/sitemap.xml', origem)}`,
    `# llms.txt: ${urlAbsoluta('/llms.txt', origem)}`,
    '',
  ].join('\n')
}

export function metadataDaFerramenta(ferramenta: Ferramenta): Metadata {
  return {
    title: ferramenta.title,
    description: descricaoDaFerramenta(ferramenta),
    alternates: { canonical: caminhoDaFerramenta(ferramenta.slug) },
  }
}
