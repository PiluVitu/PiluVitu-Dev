import { ehHttps } from '@piluvitu/tools/pilulabs'
import type { Carreira } from '../mocks/carreira'
import type { Social } from '../mocks/social'
import type { BlogPost } from './blog-posts'
import { STACK } from './home/stack'
import { markdownDoPost } from './markdown-do-post'
import { itensListados, linkDoItem, type ItemPiluLabs } from './pilulabs'
import {
  POLITICA_DE_PRIVACIDADE,
  textoDoTrecho,
  type Paragrafo,
} from './politica-de-privacidade'
import {
  DESCRICAO_DO_SITE,
  PAGINA_FERRAMENTAS,
  PAGINA_KANBAN,
  PAGINA_PILULABS,
  PAGINA_PRIVACIDADE,
  PAGINAS_FIXAS,
  caminhoDaFerramenta,
  caminhoDoPost,
  descricaoDoPost,
  umaLinha,
  urlAbsoluta,
  type Ferramenta,
  type PaginaPublica,
  type PostPublico,
} from './rotas-publicas'
import type { SiteProfileContent } from './site-content'
import { TOOLS } from './tools-registry'

export type PostComCorpo = PostPublico & Pick<BlogPost, 'bodyMdx'>

export type DadosPublicos = {
  perfil: SiteProfileContent
  socials: readonly Social[]
  carreiras: readonly Carreira[]
  piluLabs: readonly ItemPiluLabs[]
  posts: readonly PostComCorpo[]
  ferramentas?: readonly Ferramenta[]
}

const SOBRE_O_SITE =
  'Este site reúne a carreira, os artigos do blog, ferramentas para desenvolvedores e a vitrine PiluLabs, com os produtos da PiluTech.'

const HOST_DE_CONTATO = /(^|\.)(wa\.me|whatsapp\.com)$/

const dataDoPost = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'long',
  timeZone: 'UTC',
})

function escaparTitulo(titulo: string): string {
  return umaLinha(titulo).replace(/[[\]]/g, (c) => `\\${c}`)
}

function link(titulo: string, url: string): string {
  return `[${escaparTitulo(titulo)}](${url})`
}

function itemDaLista(
  titulo: string,
  url: string | null,
  descricao: string,
): string {
  const cabeca = url ? link(titulo, url) : umaLinha(titulo)
  const texto = umaLinha(descricao)
  return texto ? `- ${cabeca}: ${texto}` : `- ${cabeca}`
}

function perfisPublicos(socials: readonly Social[]): Social[] {
  return socials.filter(
    ({ socialLink }) =>
      ehHttps(socialLink) &&
      !HOST_DE_CONTATO.test(new URL(socialLink.trim()).hostname),
  )
}

function linhaDoPerfil({ socialLink, socialDescription }: Social): string {
  const { hostname, pathname } = new URL(socialLink.trim())
  const titulo = `${hostname.replace(/^www\./, '')}${pathname.replace(/\/+$/, '')}`
  return itemDaLista(titulo, socialLink.trim(), socialDescription)
}

function linkDoPiluLabs(item: ItemPiluLabs, origem: string): string | null {
  const destino = linkDoItem(item)
  if (!destino) return null
  if (destino.startsWith('/')) return urlAbsoluta(destino, origem)
  return ehHttps(destino) ? destino : null
}

function cargo(perfil: SiteProfileContent, empresa: string): string {
  return [perfil.roleHighlight, empresa ? `na ${empresa}` : '']
    .map(umaLinha)
    .filter(Boolean)
    .join(' ')
}

function bloco(linhas: readonly string[]): string {
  return linhas.join('\n')
}

function documento(blocos: readonly string[]): string {
  return `${blocos.filter((b) => b.trim() !== '').join('\n\n')}\n`
}

function secao(titulo: string, ...blocos: string[]): string[] {
  const conteudo = blocos.filter((b) => b.trim() !== '')
  return conteudo.length > 0 ? [`## ${titulo}`, ...conteudo] : []
}

function linhaDaPagina(pagina: PaginaPublica, origem: string): string {
  return itemDaLista(
    pagina.nome,
    urlAbsoluta(pagina.caminho, origem),
    pagina.descricao,
  )
}

function linhasDasFerramentas(
  ferramentas: readonly Ferramenta[],
  origem: string,
): string[] {
  return ferramentas.map(({ slug, title, description }) =>
    itemDaLista(
      title,
      urlAbsoluta(caminhoDaFerramenta(slug), origem),
      description,
    ),
  )
}

export function llmsTxt(dados: DadosPublicos, origem: string): string {
  const { perfil } = dados
  const local = umaLinha(perfil.location)
  const apresentacao = [
    `${cargo(perfil, umaLinha(perfil.companyName))}${local ? ` (${local})` : ''}.`,
    SOBRE_O_SITE,
    `O conteúdo das páginas principais, em Markdown, está em ${link(
      'llms-full.txt',
      urlAbsoluta('/llms-full.txt', origem),
    )}.`,
  ].join(' ')

  return documento([
    `# ${umaLinha(perfil.displayName)}`,
    `> ${DESCRICAO_DO_SITE}`,
    apresentacao,
    ...secao(
      'Páginas',
      bloco(PAGINAS_FIXAS.map((pagina) => linhaDaPagina(pagina, origem))),
    ),
    ...secao(
      'Ferramentas',
      bloco(linhasDasFerramentas(dados.ferramentas ?? TOOLS, origem)),
    ),
    ...secao(
      'PiluLabs',
      bloco(
        itensListados(dados.piluLabs).map((item) =>
          itemDaLista(item.nome, linkDoPiluLabs(item, origem), item.descricao),
        ),
      ),
    ),
    ...secao(
      'Posts',
      bloco(
        dados.posts.map((post) =>
          itemDaLista(
            post.title,
            urlAbsoluta(caminhoDoPost(post.slug), origem),
            descricaoDoPost(post),
          ),
        ),
      ),
    ),
    ...secao('Perfis', bloco(perfisPublicos(dados.socials).map(linhaDoPerfil))),
  ])
}

function blocoDaCarreira(carreira: Carreira): string[] {
  const empresa = ehHttps(carreira.orgLink)
    ? link(carreira.orgName, carreira.orgLink.trim())
    : umaLinha(carreira.orgName)
  const sobre = umaLinha(carreira.orgDescription)
  return [
    `### ${umaLinha(carreira.title)} · ${umaLinha(carreira.orgName)}`,
    [carreira.date, carreira.location]
      .map(umaLinha)
      .filter(Boolean)
      .join(' · '),
    sobre ? `${empresa}: ${sobre}` : empresa,
    bloco(carreira.atribuitions.map((a) => `- ${umaLinha(a)}`)),
    carreira.tags.length > 0 ? `Tags: ${carreira.tags.join(', ')}` : '',
  ]
}

function blocoDoPiluLabs(item: ItemPiluLabs, origem: string): string[] {
  const destino = linkDoPiluLabs(item, origem)
  return [
    `### ${umaLinha(item.nome)}`,
    umaLinha(item.subtitulo),
    umaLinha(item.descricao),
    bloco([
      ...(destino ? [`- Link: ${destino}`] : []),
      ...(item.tags.length > 0 ? [`- Tags: ${item.tags.join(', ')}`] : []),
    ]),
  ]
}

function blocoDoPost(post: PostComCorpo, origem: string): string[] {
  const url = urlAbsoluta(caminhoDoPost(post.slug), origem)
  return [
    `### ${umaLinha(post.title)}`,
    bloco([
      `- Link: ${url}`,
      ...(post.semData
        ? []
        : [`- Publicado em: ${dataDoPost.format(new Date(post.publishedAt))}`]),
    ]),
    markdownDoPost(post.bodyMdx, { urlDoPost: url, primeiroNivel: 4 }),
  ]
}

function markdownDoParagrafo(paragrafo: Paragrafo): string {
  return umaLinha(
    paragrafo
      .map((trecho) => {
        if (typeof trecho === 'string') return trecho
        if (trecho.tipo === 'link') return link(trecho.texto, trecho.href)
        if (trecho.tipo === 'codigo') return `\`${trecho.texto}\``
        return textoDoTrecho(trecho)
      })
      .join(''),
  )
}

function blocosDaPolitica(): string[] {
  const { vigencia, resumo, secoes } = POLITICA_DE_PRIVACIDADE
  return [
    `Em vigor desde ${vigencia.texto}`,
    markdownDoParagrafo(resumo),
    ...secoes.flatMap(({ titulo, paragrafos }) => [
      `### ${titulo}`,
      ...paragrafos.map(markdownDoParagrafo),
    ]),
  ]
}

function linhaDoPostCompleta(post: PostPublico, origem: string): string {
  const url = urlAbsoluta(caminhoDoPost(post.slug), origem)
  const quando = post.semData
    ? ''
    : ` (${dataDoPost.format(new Date(post.publishedAt))})`
  const descricao = umaLinha(descricaoDoPost(post))
  return `- ${link(post.title, url)}${quando}${descricao ? `: ${descricao}` : ''}`
}

export function llmsFullTxt(dados: DadosPublicos, origem: string): string {
  const { perfil } = dados
  const empresa = umaLinha(perfil.companyName)
  const empresaComLink =
    empresa && ehHttps(perfil.companyLink)
      ? link(empresa, perfil.companyLink.trim())
      : empresa
  const meta = [perfil.location, ...perfil.disciplines]
    .map(umaLinha)
    .filter(Boolean)
    .join(' · ')
  const perfis = perfisPublicos(dados.socials).map(linhaDoPerfil)

  return documento([
    `# ${umaLinha(perfil.displayName)}`,
    `> ${DESCRICAO_DO_SITE}`,
    `Conteúdo das páginas principais de ${new URL(origem).host}, em Markdown. O índice, com os links, está em ${link(
      'llms.txt',
      urlAbsoluta('/llms.txt', origem),
    )}.`,
    ...secao(
      'Perfil',
      cargo(perfil, empresaComLink),
      umaLinha(perfil.bio),
      meta,
      '### Stack',
      bloco(STACK.map(({ grupo, itens }) => `- ${grupo}: ${itens.join(', ')}`)),
      ...(perfis.length > 0 ? ['### Perfis', bloco(perfis)] : []),
    ),
    ...secao('Carreira', ...dados.carreiras.flatMap(blocoDaCarreira)),
    ...secao(
      'PiluLabs',
      PAGINA_PILULABS.descricao,
      ...itensListados(dados.piluLabs).flatMap((item) =>
        blocoDoPiluLabs(item, origem),
      ),
    ),
    ...secao(
      'Ferramentas',
      PAGINA_FERRAMENTAS.descricao,
      bloco(linhasDasFerramentas(dados.ferramentas ?? TOOLS, origem)),
    ),
    ...secao(
      'Posts',
      bloco(dados.posts.map((post) => linhaDoPostCompleta(post, origem))),
      ...dados.posts.flatMap((post) => blocoDoPost(post, origem)),
    ),
    ...secao(
      'Outras páginas',
      bloco(
        [PAGINA_KANBAN, PAGINA_PRIVACIDADE].map((pagina) =>
          linhaDaPagina(pagina, origem),
        ),
      ),
    ),
    ...secao(POLITICA_DE_PRIVACIDADE.titulo, ...blocosDaPolitica()),
  ])
}
