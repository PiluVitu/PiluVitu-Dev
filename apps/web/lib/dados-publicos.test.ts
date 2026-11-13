/** @jest-environment node */
type Entrada = Record<string, unknown>
type Conteudo = {
  perfil: Entrada | null
  socials: { slug: string; entry: Entrada }[]
  carreiras: { slug: string; entry: Entrada }[]
  pilulabs: { slug: string; entry: Entrada }[]
}

const perfilDoDeploy: Entrada = {
  displayName: 'Paulo Victor Torres Silva',
  avatarSrc: '/profile-2.jpg',
  avatarAlt: 'Foto',
  roleHighlight: 'Site Reliability Engineering',
  companyName: 'Reapho',
  companyLink: 'https://reapho.app/en',
  companyLinkColor: '#14b8a6',
  bio: 'A bio publicada.',
  availabilityOpen: true,
  availabilityLabel: 'Disponível',
  location: 'Brasil · Remoto',
  disciplines: ['SRE'],
}

const itemPublicado: Entrada = {
  order: 0,
  nome: 'Botaí',
  descricao: 'Extensão publicada.',
  tipo: 'extensao',
  site: 'https://botai.pilutech.com.br',
  listado: true,
}

const DEPLOY: Conteudo = {
  perfil: perfilDoDeploy,
  socials: [
    {
      slug: 'github',
      entry: {
        socialDescription: 'Acesse o meu Github',
        socialLink: 'https://github.com/PiluVitu',
        altImage: 'GH',
        iconMode: 'fontawesome',
        order: 0,
      },
    },
  ],
  carreiras: [
    {
      slug: 'reapho',
      entry: {
        orgName: 'Reapho',
        orgDescription: 'A empresa.',
        orgLink: 'https://reapho.app/en',
        altImage: 'R',
        title: 'SRE',
        location: 'Remoto',
        date: '2025 - Atualmente',
        atribuitions: ['Plantão'],
        order: 0,
      },
    },
  ],
  pilulabs: [
    { slug: 'botai', entry: itemPublicado },
    {
      slug: 'fora-da-vitrine',
      entry: { ...itemPublicado, nome: 'Fora da Vitrine', listado: false },
    },
  ],
}

// O ramo de trabalho do Keystatic: perfil editado e um item listado, com página
// própria, que ainda não foi publicado. Nada disso pode chegar às saídas de SEO.
const RAMO_DE_PREVIEW: Conteudo = {
  ...DEPLOY,
  perfil: { ...perfilDoDeploy, displayName: 'Nome Só No Ramo' },
  pilulabs: [
    ...DEPLOY.pilulabs,
    {
      slug: 'so-no-ramo',
      entry: {
        ...itemPublicado,
        order: 1,
        nome: 'Só No Ramo',
        descricao: 'Item que só existe no ramo de preview.',
        site: 'https://so-no-ramo.pilutech.com.br',
        paginaPropria: true,
      },
    },
  ],
}

function leitor(conteudo: Conteudo) {
  return {
    singletons: { siteProfile: { read: async () => conteudo.perfil } },
    collections: {
      socials: { all: async () => conteudo.socials },
      carreiras: { all: async () => conteudo.carreiras },
      pilulabs: { all: async () => conteudo.pilulabs },
      feeds: { all: async () => [] },
    },
  }
}

const mockPreview = { ligado: true }
const mockDeploy = { perfil: DEPLOY.perfil as Entrada | null }
const mockDraftMode = jest.fn(async () => ({ isEnabled: mockPreview.ligado }))
const mockCookies = jest.fn(async () => ({
  get: (nome: string) =>
    mockPreview.ligado && nome === 'ks-branch'
      ? { value: 'ramo-de-preview' }
      : undefined,
}))
const mockCreateReader = jest.fn<ReturnType<typeof leitor>, [string, unknown]>(
  () => leitor({ ...DEPLOY, perfil: mockDeploy.perfil }),
)
const mockCreateGitHubReader = jest.fn(() => leitor(RAMO_DE_PREVIEW))

jest.mock('server-only', () => ({}))
jest.mock('next/headers', () => ({
  draftMode: () => mockDraftMode(),
  cookies: () => mockCookies(),
}))
jest.mock('next/cache', () => ({
  unstable_noStore: () => undefined,
  unstable_cache: (fn: unknown) => fn,
}))
jest.mock('@/keystatic.config', () => ({
  __esModule: true,
  default: {},
  getGithubRepoSlash: () => 'PiluVitu/PiluVitu-Dev',
}))
jest.mock('@keystatic/core/reader', () => ({
  createReader: (raiz: string, config: unknown) =>
    mockCreateReader(raiz, config),
}))
jest.mock('@keystatic/core/reader/github', () => ({
  createGitHubReader: () => mockCreateGitHubReader(),
}))
// O blog de verdade (só o GitHub é falso), com um rascunho no repositório: em
// draft mode o getBlogPosts o mostraria; as saídas de SEO nunca.
const mockPostsDoBlog: Record<string, string> = {
  'publicado.mdx': [
    '---',
    'title: Post publicado',
    "publishedAt: '2025-01-01'",
    'metaDescription: Descrição.',
    '---',
    "import { Aviso } from '../aviso'",
    '',
    '## Corpo publicado',
    '',
    '<Aviso>Texto do aviso.</Aviso>',
  ].join('\n'),
  'rascunho.mdx': [
    '---',
    'title: Título do rascunho',
    "publishedAt: '2025-02-01'",
    'draft: true',
    '---',
    'Corpo do rascunho.',
  ].join('\n'),
}
jest.mock('@octokit/rest', () => ({
  Octokit: class {
    repos = {
      getContent: async ({ path }: { path: string }) =>
        path === 'content/posts'
          ? {
              data: Object.keys(mockPostsDoBlog).map((name) => ({
                name,
                type: 'file',
              })),
            }
          : {
              data: {
                type: 'file',
                encoding: 'base64',
                content: Buffer.from(
                  mockPostsDoBlog[path.replace('content/posts/', '')],
                ).toString('base64'),
              },
            },
    }
  },
}))

import { GET as llmsFullTxt } from '@/app/llms-full.txt/route'
import { GET as llmsTxt } from '@/app/llms.txt/route'
import { GET as robotsTxt } from '@/app/robots.txt/route'
import sitemap from '@/app/sitemap'
import { lerDadosPublicos } from './dados-publicos'
import { PERFIL_PADRAO } from './perfil-padrao'

async function saidasDeSeo(): Promise<string[]> {
  return [
    JSON.stringify(await sitemap()),
    await (await llmsTxt()).text(),
    await (await llmsFullTxt()).text(),
    await robotsTxt().text(),
  ]
}

beforeEach(() => {
  mockPreview.ligado = true
  mockDeploy.perfil = DEPLOY.perfil
  jest.clearAllMocks()
})

describe('lerDadosPublicos', () => {
  it('junta o perfil, as redes, a carreira, os listados do PiluLabs e só os posts publicados', async () => {
    const dados = await lerDadosPublicos()
    expect(dados.perfil.displayName).toBe('Paulo Victor Torres Silva')
    expect(dados.socials.map(({ id }) => id)).toEqual(['github'])
    expect(dados.carreiras.map(({ id }) => id)).toEqual(['reapho'])
    expect(dados.piluLabs.map(({ slug }) => slug)).toEqual(['botai'])
    expect(dados.posts.map(({ slug }) => slug)).toEqual(['publicado'])
  })

  it('sem perfil no CMS, usa o mesmo perfil padrão da home', async () => {
    mockDeploy.perfil = null
    expect((await lerDadosPublicos()).perfil).toBe(PERFIL_PADRAO)
  })
})

describe('saídas de SEO com draft mode ligado e o cookie ks-branch', () => {
  it('leem só o conteúdo do deploy: nada do ramo de preview, sem draftMode, cookies nem GitHub', async () => {
    const dados = await lerDadosPublicos()
    expect(dados.perfil.displayName).toBe('Paulo Victor Torres Silva')
    expect(dados.piluLabs.map(({ slug }) => slug)).toEqual(['botai'])
    expect(mockCreateReader).toHaveBeenCalledWith(
      process.cwd(),
      expect.anything(),
    )
    expect(mockCreateGitHubReader).not.toHaveBeenCalled()
    expect(mockDraftMode).not.toHaveBeenCalled()
    expect(mockCookies).not.toHaveBeenCalled()
  })

  it('o sitemap, os dois llms e o robots saem iguais aos de quem não está em preview', async () => {
    const emPreview = await saidasDeSeo()
    mockPreview.ligado = false
    const anonimas = await saidasDeSeo()
    expect(emPreview).toEqual(anonimas)
    for (const saida of emPreview) {
      expect(saida).not.toContain('Só No Ramo')
      expect(saida).not.toContain('so-no-ramo')
      expect(saida).not.toContain('Fora da Vitrine')
    }
    expect(mockCreateGitHubReader).not.toHaveBeenCalled()
  })

  it('o rascunho do blog fica de fora, e o post publicado entra com o corpo em Markdown', async () => {
    const [sitemapJson, indice, completo] = await saidasDeSeo()
    for (const saida of [sitemapJson, indice, completo]) {
      expect(saida).not.toContain('rascunho')
      expect(saida).not.toContain('Título do rascunho')
    }
    expect(completo).toContain('#### Corpo publicado\n\nTexto do aviso.')
    expect(completo).not.toContain("from '../aviso'")
    expect(completo).not.toContain('<Aviso>')
  })
})
