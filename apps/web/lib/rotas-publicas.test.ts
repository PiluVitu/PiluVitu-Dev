import { resolveSitemap } from 'next/dist/build/webpack/loaders/metadata/resolve-route-data'
import type { ItemPiluLabs } from './pilulabs'
import {
  DESCRICAO_DO_SITE,
  PAGINAS_FIXAS,
  PAGINA_FERRAMENTAS,
  PAGINA_INICIAL,
  PAGINA_KANBAN,
  PAGINA_PILULABS,
  PAGINA_PRIVACIDADE,
  ROTAS_FORA_DO_ROBOTS,
  caminhoDoPost,
  descricaoDoPost,
  entradasDoSitemap,
  metadataDaFerramenta,
  robotsTxt,
  rotasPublicas,
  urlAbsoluta,
  type PostPublico,
} from './rotas-publicas'
import { TOOLS, type ToolMeta } from './tools-registry'

const ORIGEM = 'https://piluvitu.com.br'

function item(parcial: Partial<ItemPiluLabs> = {}): ItemPiluLabs {
  return {
    slug: 'botai',
    order: 0,
    nome: 'Botaí',
    subtitulo: '',
    descricao: 'Extensão que preenche formulários.',
    tipo: 'extensao',
    tags: [],
    logo: '',
    sigla: '',
    site: 'https://botai.pilutech.com.br',
    repo: '',
    chromeUrl: '',
    firefoxUrl: '',
    edgeUrl: '',
    operaUrl: '',
    destaque: false,
    data: '',
    listado: true,
    paginaPropria: false,
    ...parcial,
  }
}

function post(parcial: Partial<PostPublico> = {}): PostPublico {
  return {
    slug: 'husky',
    title: 'Como usar o Husky',
    excerpt: 'O excerpt do post.',
    metaDescription: '',
    publishedAt: '2025-01-01T00:00:00.000Z',
    ...parcial,
  }
}

const caminhosDasFerramentas = TOOLS.map(({ slug }) => `/tools/${slug}`)

describe('páginas fixas', () => {
  it('são a home, o PiluLabs, as ferramentas, o Kanban e a privacidade', () => {
    expect(PAGINAS_FIXAS.map(({ caminho }) => caminho)).toEqual([
      '/',
      '/pilulabs',
      '/tools',
      '/tasks',
      '/privacidade',
    ])
  })

  it('o nome é o título que cada página mostra', () => {
    expect(PAGINAS_FIXAS.map(({ nome }) => nome)).toEqual([
      'Página inicial',
      'PiluLabs',
      'Ferramentas',
      'Mini Kanban',
      'Política de privacidade',
    ])
  })

  it('a home usa a descrição do site, a mesma do layout', () => {
    expect(PAGINA_INICIAL.descricao).toBe(DESCRICAO_DO_SITE)
    expect(DESCRICAO_DO_SITE).toMatch(/^DevOps Engineer com 3 anos/)
  })

  it('PiluLabs e privacidade guardam o texto que as páginas já publicavam', () => {
    expect(PAGINA_PILULABS.descricao).toBe(
      'Produtos e apps que o Paulo Victor faz e mantém. Powered by PiluTech.',
    )
    expect(PAGINA_PRIVACIDADE.descricao).toBe(
      'O que o piluvitu.com.br registra: estatísticas de visita sem cookie, o login da votação de filmes, o formulário de contato e os seus direitos na LGPD.',
    )
  })

  it('a descrição das ferramentas sai do TOOLS, na ordem do registro', () => {
    expect(PAGINA_FERRAMENTAS.descricao).toBe(
      'Utilitários para o dia a dia do desenvolvedor: Leitor de QR, Gerador de QR, CPF, CNPJ, JSON, Base64, JWT, UUID e Roleta / Sorteio.',
    )
  })

  it('o Kanban diz que os dados ficam no navegador', () => {
    expect(PAGINA_KANBAN.descricao).toContain('só no seu navegador')
  })

  // A home herda a descrição longa do layout; as que este módulo escreve cabem no snippet da busca.
  it.each(
    [
      PAGINA_PILULABS,
      PAGINA_FERRAMENTAS,
      PAGINA_KANBAN,
      PAGINA_PRIVACIDADE,
    ].map((p) => [p.caminho, p.descricao] as const),
  )('%s: descrição entre 50 e 160 caracteres', (_caminho, descricao) => {
    expect(descricao.length).toBeGreaterThanOrEqual(50)
    expect(descricao.length).toBeLessThanOrEqual(160)
  })
})

describe('rotasPublicas', () => {
  it('as fixas, uma por ferramenta do TOOLS e uma por post publicado, nessa ordem', () => {
    const rotas = rotasPublicas({
      posts: [post({ slug: 'a' }), post({ slug: 'b' })],
      piluLabs: [],
    })
    expect(rotas.map(({ caminho }) => caminho)).toEqual([
      '/',
      '/pilulabs',
      '/tools',
      '/tasks',
      '/privacidade',
      ...caminhosDasFerramentas,
      '/posts/a',
      '/posts/b',
    ])
  })

  it('ferramenta nova no registro entra sozinha, com o título e a descrição dela', () => {
    const nova: ToolMeta = {
      slug: 'hash',
      title: 'Hash',
      description: 'Calcula SHA-256',
      icon: TOOLS[0].icon,
      group: 'dev',
    }
    const rotas = rotasPublicas({
      posts: [],
      piluLabs: [],
      ferramentas: [...TOOLS, nova],
    })
    expect(rotas).toContainEqual({
      caminho: '/tools/hash',
      nome: 'Hash',
      descricao:
        'Hash: Calcula SHA-256. Utilitário para desenvolvedores que roda direto no navegador.',
    })
  })

  it('o post leva o título, a descrição e a data dele', () => {
    const [rota] = rotasPublicas({
      posts: [post({ metaDescription: 'Para a busca.' })],
      piluLabs: [],
    }).slice(-1)
    expect(rota).toEqual({
      caminho: '/posts/husky',
      nome: 'Como usar o Husky',
      descricao: 'Para a busca.',
      data: '2025-01-01T00:00:00.000Z',
    })
  })

  // Post sem publishedAt no frontmatter recebe a data do build no reader: não é data real.
  it('post sem data no frontmatter fica sem data', () => {
    const [rota] = rotasPublicas({
      posts: [post({ semData: true })],
      piluLabs: [],
    }).slice(-1)
    expect(rota).not.toHaveProperty('data')
  })

  it('item do PiluLabs listado e com página própria entra; os outros não', () => {
    const rotas = rotasPublicas({
      posts: [],
      piluLabs: [
        item({ slug: 'novo', nome: 'Novo', paginaPropria: true }),
        item({ slug: 'escondido', paginaPropria: true, listado: false }),
        item({ slug: 'botai' }),
      ],
    })
    const doPiluLabs = rotas.filter(({ caminho }) =>
      caminho.startsWith('/pilulabs/'),
    )
    expect(doPiluLabs).toEqual([
      {
        caminho: '/pilulabs/novo',
        nome: 'Novo',
        descricao: 'Extensão que preenche formulários.',
      },
    ])
  })

  it('nunca lista admin, api, preview, votação nem o feed', () => {
    const rotas = rotasPublicas({ posts: [post()], piluLabs: [item()] })
    for (const { caminho } of rotas)
      expect(caminho).not.toMatch(/^\/(admin|api|preview|votacao|feed)(\/|$)/)
  })

  it('as fixas e as ferramentas sempre têm descrição', () => {
    const rotas = rotasPublicas({ posts: [], piluLabs: [] })
    for (const { descricao } of rotas) expect(descricao.trim()).not.toBe('')
  })

  it('descrição com quebra de linha vira uma linha só', () => {
    const [rota] = rotasPublicas({
      posts: [post({ excerpt: 'Primeira linha.\n  Segunda linha.' })],
      piluLabs: [item({ paginaPropria: true, descricao: 'Um\ndois' })],
    }).slice(-2)
    expect(rota.descricao).toBe('Um dois')
    const ultima = rotasPublicas({
      posts: [post({ excerpt: 'Primeira linha.\n  Segunda linha.' })],
      piluLabs: [],
    }).at(-1)
    expect(ultima?.descricao).toBe('Primeira linha. Segunda linha.')
  })
})

describe('descricaoDoPost', () => {
  it('usa a metaDescription sem os espaços das pontas', () => {
    expect(descricaoDoPost(post({ metaDescription: '  Para a busca. ' }))).toBe(
      'Para a busca.',
    )
  })

  it('cai no excerpt quando a metaDescription é vazia ou só espaço', () => {
    expect(descricaoDoPost(post({ metaDescription: ' \n ' }))).toBe(
      'O excerpt do post.',
    )
  })

  it('sem nenhum dos dois, volta vazia', () => {
    expect(descricaoDoPost(post({ excerpt: '' }))).toBe('')
  })
})

describe('metadataDaFerramenta', () => {
  const cpf = TOOLS.find(({ slug }) => slug === 'cpf') as ToolMeta

  it('mantém o título e põe a descrição e o canonical da ferramenta', () => {
    expect(metadataDaFerramenta(cpf)).toEqual({
      title: 'CPF',
      description:
        'CPF: Gerar e validar CPF. Utilitário para desenvolvedores que roda direto no navegador.',
      alternates: { canonical: '/tools/cpf' },
    })
  })

  it.each(TOOLS.map((tool) => [tool.slug, tool] as const))(
    '%s: descrição entre 50 e 160 caracteres',
    (_slug, tool) => {
      const { description } = metadataDaFerramenta(tool)
      expect((description as string).length).toBeGreaterThanOrEqual(50)
      expect((description as string).length).toBeLessThanOrEqual(160)
    },
  )
})

describe('urlAbsoluta', () => {
  it('monta a URL na origem, com a barra da home', () => {
    expect(urlAbsoluta('/', ORIGEM)).toBe('https://piluvitu.com.br/')
    expect(urlAbsoluta('/tools/cpf', ORIGEM)).toBe(
      'https://piluvitu.com.br/tools/cpf',
    )
    expect(urlAbsoluta('/tasks', 'http://localhost:3045')).toBe(
      'http://localhost:3045/tasks',
    )
  })
})

describe('entradasDoSitemap', () => {
  it('URLs absolutas na origem, mais o llms.txt e o llms-full.txt no fim', () => {
    const entradas = entradasDoSitemap(
      rotasPublicas({ posts: [], piluLabs: [] }),
      ORIGEM,
    )
    expect(entradas.map(({ url }) => url)).toEqual([
      'https://piluvitu.com.br/',
      'https://piluvitu.com.br/pilulabs',
      'https://piluvitu.com.br/tools',
      'https://piluvitu.com.br/tasks',
      'https://piluvitu.com.br/privacidade',
      ...caminhosDasFerramentas.map((c) => `https://piluvitu.com.br${c}`),
      'https://piluvitu.com.br/llms.txt',
      'https://piluvitu.com.br/llms-full.txt',
    ])
  })

  it('lastModified só na entrada que tem data real', () => {
    const entradas = entradasDoSitemap(
      rotasPublicas({
        posts: [
          post({ slug: 'com-data' }),
          post({ slug: 'sem', semData: true }),
        ],
        piluLabs: [],
      }),
      ORIGEM,
    )
    const comData = entradas.filter((e) => 'lastModified' in e)
    expect(comData).toEqual([
      {
        url: 'https://piluvitu.com.br/posts/com-data',
        lastModified: '2025-01-01T00:00:00.000Z',
      },
    ])
  })

  // O Next escreve o <loc> sem escapar (resolveSitemap): um `&` cru deixaria o
  // XML inválido, e trocá-lo por %26 daria outra URL, diferente do canonical do
  // post e do link do llms.txt. O `&amp;` é lido de volta como `&`.
  it('slug com &: o <loc> escapa o & para o XML, e quem lê o XML recebe a URL do post', () => {
    const xml = resolveSitemap(
      entradasDoSitemap(
        rotasPublicas({ posts: [post({ slug: 'git&ci' })], piluLabs: [] }),
        ORIGEM,
      ),
    )
    expect(xml).toContain('<loc>https://piluvitu.com.br/posts/git&amp;ci</loc>')
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0)
    const locs = [...doc.getElementsByTagName('loc')].map((l) => l.textContent)
    expect(locs).toContain(urlAbsoluta(caminhoDoPost('git&ci'), ORIGEM))
    expect(locs).toContain('https://piluvitu.com.br/posts/git&ci')
  })

  it('o XML de um & cru é inválido (o que o escape evita)', () => {
    const xml = resolveSitemap([
      { url: 'https://piluvitu.com.br/posts/git&ci' },
    ])
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    expect(doc.getElementsByTagName('parsererror').length).toBeGreaterThan(0)
  })
})

describe('robotsTxt', () => {
  it('libera o site, bloqueia admin, api e preview e aponta o sitemap e o llms.txt', () => {
    expect(robotsTxt(ORIGEM)).toBe(
      [
        'User-Agent: *',
        'Allow: /',
        'Disallow: /admin',
        'Disallow: /api',
        'Disallow: /preview',
        '',
        'Sitemap: https://piluvitu.com.br/sitemap.xml',
        '# llms.txt: https://piluvitu.com.br/llms.txt',
        '',
      ].join('\n'),
    )
  })

  it('o bloqueio é a lista exportada', () => {
    expect(ROTAS_FORA_DO_ROBOTS).toEqual(['/admin', '/api', '/preview'])
  })

  it('usa a origem recebida', () => {
    expect(robotsTxt('http://localhost:3045')).toContain(
      'Sitemap: http://localhost:3045/sitemap.xml',
    )
  })
})
