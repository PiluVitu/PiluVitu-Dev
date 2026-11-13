import type { Carreira } from '@/mocks/carreira'
import type { Social } from '@/mocks/social'
import { llmsFullTxt, llmsTxt, type DadosPublicos } from './llms'
import type { ItemPiluLabs } from './pilulabs'
import {
  DESCRICAO_DO_SITE,
  PAGINA_FERRAMENTAS,
  PAGINA_PILULABS,
  rotasPublicas,
  type PostPublico,
} from './rotas-publicas'
import { TOOLS } from './tools-registry'

const ORIGEM = 'https://piluvitu.com.br'

function social(parcial: Partial<Social>): Social {
  return {
    id: 'github',
    socialDescription: 'Acesse o meu Github',
    socialLink: 'https://github.com/PiluVitu',
    altImage: 'GH',
    iconMode: 'fontawesome',
    fontawesomeIcon: 'brands__github',
    ...parcial,
  }
}

function item(parcial: Partial<ItemPiluLabs> = {}): ItemPiluLabs {
  return {
    slug: 'botai',
    order: 0,
    nome: 'Botaí',
    subtitulo: 'Gerador de dados fake para formulários',
    descricao: 'Extensão que gera uma pessoa de teste e preenche o formulário.',
    tipo: 'extensao',
    tags: ['Extensão', 'QA'],
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
    metaDescription: 'Git hooks com o Husky em dois passos.',
    publishedAt: '2025-01-01T00:00:00.000Z',
    ...parcial,
  }
}

const carreira: Carreira = {
  id: 'viralizeplus',
  orgName: 'ViralizePlus',
  orgDescription: 'Sua comunidade de desenvolvimento open source!',
  orgLink: 'https://www.viralizeplus.com.br/',
  altImage: 'VP',
  title: 'Site Reliability Engineer',
  location: 'Remoto',
  date: 'Dez, 2024 - Atualmente',
  atribuitions: ['Entregas com GitHub Actions', 'Monitoramento com Grafana'],
  current: true,
  tags: ['Remoto'],
}

function dados(parcial: Partial<DadosPublicos> = {}): DadosPublicos {
  return {
    perfil: {
      displayName: 'Paulo Victor Torres Silva',
      avatarSrc: '/profile-2.jpg',
      avatarAlt: 'Foto',
      roleHighlight: 'Site Reliability Engineering',
      companyName: 'Reapho',
      companyLink: 'https://reapho.app/en',
      companyLinkColor: '#14b8a6',
      bio: 'DevOps Engineer focado em sistemas em nuvem.',
      availabilityOpen: true,
      availabilityLabel: 'Disponível',
      location: 'Brasil · Remoto',
      disciplines: ['SRE', 'DevOps'],
    },
    socials: [
      social({}),
      social({
        id: 'linkedin',
        socialDescription: 'Vamos nos conectar',
        socialLink: 'https://www.linkedin.com/in/pilu-vitu/',
      }),
      social({ id: 'email', socialLink: 'mailto:alguem@exemplo.com.br' }),
      social({ id: 'tel', socialLink: 'tel:+5586999990000' }),
      social({ id: 'zap', socialLink: 'https://wa.me/5586999990000' }),
      social({
        id: 'zap2',
        socialLink: 'https://api.whatsapp.com/send?phone=1',
      }),
      social({ id: 'inseguro', socialLink: 'http://exemplo.com.br/perfil' }),
    ],
    carreiras: [carreira],
    piluLabs: [
      item(),
      item({
        slug: 'sem-link',
        nome: 'Sem Link',
        descricao: 'Ainda sem site.',
        site: '',
        order: 1,
      }),
      item({
        slug: 'escondido',
        nome: 'Escondido',
        listado: false,
        site: 'https://escondido.pilutech.com.br',
      }),
    ],
    posts: [
      post(),
      post({
        slug: 'sem-descricao',
        title: 'Post sem descrição',
        excerpt: '',
        metaDescription: '',
      }),
    ],
    ...parcial,
  }
}

const texto = llmsTxt(dados(), ORIGEM)
const linhas = texto.split('\n')

function links(conteudo: string): string[] {
  return [...conteudo.matchAll(/\]\(([^)\s]+)\)/g)].map(([, url]) => url)
}

const SEM_CONTATO_PRIVADO: [string, RegExp][] = [
  ['e-mail', /[\w.+-]+@[\w-]+\.[\w.]+/],
  ['mailto', /mailto:/i],
  ['tel', /\btel:/i],
  ['WhatsApp', /wa\.me|whatsapp/i],
  ['telefone', /(?:\d[\s().-]?){10,}/],
]

describe('llms.txt: formato do llmstxt.org', () => {
  it('título, linha em branco e o resumo em citação', () => {
    expect(linhas[0]).toBe('# Paulo Victor Torres Silva')
    expect(linhas[1]).toBe('')
    expect(linhas[2]).toBe(`> ${DESCRICAO_DO_SITE}`)
    expect(linhas[3]).toBe('')
  })

  it('um parágrafo curto antes das seções, com o link do llms-full.txt', () => {
    const paragrafo = linhas[4]
    expect(paragrafo).toMatch(/^Site Reliability Engineering na Reapho/)
    expect(paragrafo).toContain(
      '[llms-full.txt](https://piluvitu.com.br/llms-full.txt)',
    )
    expect(linhas[5]).toBe('')
  })

  it('seções na ordem: Páginas, Ferramentas, PiluLabs, Posts, Perfis', () => {
    const secoes = linhas.filter((l) => l.startsWith('## '))
    expect(secoes).toEqual([
      '## Páginas',
      '## Ferramentas',
      '## PiluLabs',
      '## Posts',
      '## Perfis',
    ])
  })

  it('cada item é "- [título](url): descrição", "- [título](url)" ou "- nome: descrição"', () => {
    const itens = linhas.filter((l) => l.startsWith('- '))
    expect(itens.length).toBeGreaterThan(0)
    for (const linha of itens)
      expect(linha).toMatch(
        /^- (\[[^\]]+\]\(https?:\/\/[^)\s]+\)(: \S.*)?|[^[\s][^:]*: \S.*)$/,
      )
  })

  it('termina com uma quebra de linha', () => {
    expect(texto.endsWith('\n')).toBe(true)
    expect(texto.endsWith('\n\n')).toBe(false)
  })

  it('sem seção de posts quando não há post publicado', () => {
    expect(llmsTxt(dados({ posts: [] }), ORIGEM)).not.toContain('## Posts')
  })
})

describe('llms.txt: links', () => {
  const rotas = rotasPublicas({
    posts: dados().posts,
    piluLabs: dados().piluLabs,
  })
  const internos = new Set([
    ...rotas.map(({ caminho }) => new URL(caminho, `${ORIGEM}/`).href),
    `${ORIGEM}/llms-full.txt`,
  ])
  const externos = new Set([
    'https://github.com/PiluVitu',
    'https://www.linkedin.com/in/pilu-vitu/',
    'https://botai.pilutech.com.br',
  ])

  it('todo link é absoluto: rota pública na origem, perfil público ou item do PiluLabs', () => {
    for (const url of links(texto)) {
      if (url.startsWith(`${ORIGEM}/`)) expect(internos).toContain(url)
      else expect(externos).toContain(url)
    }
  })

  it('toda rota pública aparece no llms.txt', () => {
    const presentes = new Set(links(texto))
    for (const url of internos) expect(presentes).toContain(url)
  })

  it('usa a origem recebida', () => {
    const local = llmsTxt(dados(), 'http://localhost:3045')
    expect(local).toContain('- [Página inicial](http://localhost:3045/): ')
    expect(local).not.toContain(ORIGEM)
  })
})

describe('llms.txt: dados das páginas', () => {
  it('Páginas: o nome e a descrição de cada página fixa', () => {
    expect(texto).toContain(
      `- [Página inicial](https://piluvitu.com.br/): ${DESCRICAO_DO_SITE}`,
    )
    expect(texto).toContain(
      `- [PiluLabs](https://piluvitu.com.br/pilulabs): ${PAGINA_PILULABS.descricao}`,
    )
    expect(texto).toContain(
      `- [Ferramentas](https://piluvitu.com.br/tools): ${PAGINA_FERRAMENTAS.descricao}`,
    )
  })

  it('Ferramentas: o título e a descrição de cada uma do TOOLS', () => {
    for (const { slug, title, description } of TOOLS)
      expect(linhas).toContain(
        `- [${title}](https://piluvitu.com.br/tools/${slug}): ${description}`,
      )
  })

  it('mudou a fonte, muda o llms.txt', () => {
    const outra = llmsTxt(
      dados({
        ferramentas: TOOLS.map((tool) =>
          tool.slug === 'cpf'
            ? { ...tool, title: 'CPF novo', description: 'Outro texto' }
            : tool,
        ),
      }),
      ORIGEM,
    )
    expect(outra).toContain(
      '- [CPF novo](https://piluvitu.com.br/tools/cpf): Outro texto',
    )
    expect(outra).not.toContain('- [CPF](')
  })

  it('mudou o perfil, mudam o título e o parágrafo dos dois arquivos', () => {
    const perfil = {
      ...dados().perfil,
      displayName: 'Outro Nome',
      roleHighlight: 'Platform Engineering',
      companyName: 'Outra Empresa',
    }
    for (const gerar of [llmsTxt, llmsFullTxt]) {
      const outro = gerar(dados({ perfil }), ORIGEM)
      expect(outro.split('\n')[0]).toBe('# Outro Nome')
      expect(outro).toContain('Platform Engineering na ')
      expect(outro).toContain('Outra Empresa')
      expect(outro).not.toContain('Paulo Victor Torres Silva')
    }
    expect(llmsTxt(dados({ perfil }), ORIGEM).split('\n')[4]).toMatch(
      /^Platform Engineering na Outra Empresa \(Brasil · Remoto\)\. /,
    )
  })

  it('PiluLabs: só os listados, com o link do card; sem link, sem link inventado', () => {
    expect(linhas).toContain(
      '- [Botaí](https://botai.pilutech.com.br): Extensão que gera uma pessoa de teste e preenche o formulário.',
    )
    expect(linhas).toContain('- Sem Link: Ainda sem site.')
    expect(texto).not.toContain('Escondido')
  })

  it('PiluLabs: item com página própria aponta para ela no site', () => {
    const comPagina = llmsTxt(
      dados({ piluLabs: [item({ slug: 'novo', paginaPropria: true })] }),
      ORIGEM,
    )
    expect(comPagina).toContain(
      '- [Botaí](https://piluvitu.com.br/pilulabs/novo): ',
    )
  })

  it('Posts: título, link e descrição; sem descrição, só o link', () => {
    expect(linhas).toContain(
      '- [Como usar o Husky](https://piluvitu.com.br/posts/husky): Git hooks com o Husky em dois passos.',
    )
    expect(linhas).toContain(
      '- [Post sem descrição](https://piluvitu.com.br/posts/sem-descricao)',
    )
  })

  it('Perfis: só os links https, com o endereço como título e o texto do site como descrição', () => {
    const secao = texto.slice(texto.indexOf('## Perfis'))
    expect(secao.split('\n').filter((l) => l.startsWith('- '))).toEqual([
      '- [github.com/PiluVitu](https://github.com/PiluVitu): Acesse o meu Github',
      '- [linkedin.com/in/pilu-vitu](https://www.linkedin.com/in/pilu-vitu/): Vamos nos conectar',
    ])
  })

  it.each(SEM_CONTATO_PRIVADO)('sem %s', (_nome, padrao) => {
    expect(texto).not.toMatch(padrao)
  })

  it('texto com quebra de linha vira uma linha só, e colchete no título não quebra o link', () => {
    const torto = llmsTxt(
      dados({
        posts: [
          post({
            title: 'O [beta] do Next',
            metaDescription: 'Linha um.\nLinha dois.',
          }),
        ],
      }),
      ORIGEM,
    )
    expect(torto).toContain(
      '- [O \\[beta\\] do Next](https://piluvitu.com.br/posts/husky): Linha um. Linha dois.',
    )
  })
})

describe('llms-full.txt', () => {
  const completo = llmsFullTxt(dados(), ORIGEM)

  it('começa como o llms.txt e aponta o índice', () => {
    const [titulo, , resumo] = completo.split('\n')
    expect(titulo).toBe('# Paulo Victor Torres Silva')
    expect(resumo).toBe(`> ${DESCRICAO_DO_SITE}`)
    expect(completo).toContain('[llms.txt](https://piluvitu.com.br/llms.txt)')
    expect(completo.endsWith('\n')).toBe(true)
  })

  it('seções: Perfil, Carreira, PiluLabs, Ferramentas, Posts e Outras páginas', () => {
    expect(completo.split('\n').filter((l) => l.startsWith('## '))).toEqual([
      '## Perfil',
      '## Carreira',
      '## PiluLabs',
      '## Ferramentas',
      '## Posts',
      '## Outras páginas',
    ])
  })

  it('Perfil: cargo, empresa, bio, local e disciplinas, stack e perfis', () => {
    expect(completo).toContain(
      'Site Reliability Engineering na [Reapho](https://reapho.app/en)',
    )
    expect(completo).toContain('DevOps Engineer focado em sistemas em nuvem.')
    expect(completo).toContain('Brasil · Remoto · SRE · DevOps')
    expect(completo).toContain('### Stack')
    expect(completo).toContain(
      '- infra: AWS, Cloudflare, Docker, GitHub Actions',
    )
    expect(completo).toContain(
      '- [github.com/PiluVitu](https://github.com/PiluVitu): Acesse o meu Github',
    )
  })

  it('Carreira: cargo, empresa, período, local, atribuições e tags', () => {
    expect(completo).toContain('### Site Reliability Engineer · ViralizePlus')
    expect(completo).toContain('Dez, 2024 - Atualmente · Remoto')
    expect(completo).toContain(
      '[ViralizePlus](https://www.viralizeplus.com.br/): Sua comunidade de desenvolvimento open source!',
    )
    expect(completo).toContain('- Entregas com GitHub Actions')
    expect(completo).toContain('- Monitoramento com Grafana')
    expect(completo).toContain('Tags: Remoto')
  })

  it('PiluLabs: a descrição da página e cada listado com subtítulo, descrição, link e tags', () => {
    expect(completo).toContain(PAGINA_PILULABS.descricao)
    expect(completo).toContain('### Botaí')
    expect(completo).toContain('Gerador de dados fake para formulários')
    expect(completo).toContain(
      'Extensão que gera uma pessoa de teste e preenche o formulário.',
    )
    expect(completo).toContain('- Link: https://botai.pilutech.com.br')
    expect(completo).toContain('- Tags: Extensão, QA')
    expect(completo).toContain('### Sem Link')
    expect(completo).not.toContain('Escondido')
  })

  it('Ferramentas: a descrição da página e cada ferramenta', () => {
    expect(completo).toContain(PAGINA_FERRAMENTAS.descricao)
    for (const { slug, title, description } of TOOLS)
      expect(completo).toContain(
        `- [${title}](https://piluvitu.com.br/tools/${slug}): ${description}`,
      )
  })

  it('Posts: título, link, data (a do frontmatter) e descrição, sem o corpo', () => {
    const comCorpo = llmsFullTxt(
      dados({
        posts: [{ ...post(), bodyMdx: 'CORPO DO POST' } as PostPublico],
      }),
      ORIGEM,
    )
    expect(comCorpo).toContain(
      '- [Como usar o Husky](https://piluvitu.com.br/posts/husky) (1 de janeiro de 2025): Git hooks com o Husky em dois passos.',
    )
    expect(comCorpo).not.toContain('CORPO DO POST')
  })

  it('Posts: sem data real, sem data', () => {
    const semData = llmsFullTxt(
      dados({ posts: [post({ semData: true })] }),
      ORIGEM,
    )
    expect(semData).toContain(
      '- [Como usar o Husky](https://piluvitu.com.br/posts/husky): Git hooks com o Husky em dois passos.',
    )
  })

  it('Outras páginas: o Kanban e a privacidade', () => {
    const secao = completo.slice(completo.indexOf('## Outras páginas'))
    expect(secao).toContain('- [Mini Kanban](https://piluvitu.com.br/tasks): ')
    expect(secao).toContain(
      '- [Política de privacidade](https://piluvitu.com.br/privacidade): ',
    )
  })

  it.each(SEM_CONTATO_PRIVADO)('sem %s', (_nome, padrao) => {
    expect(completo).not.toMatch(padrao)
  })

  it('carreira com link que não é https fica sem link', () => {
    const semLink = llmsFullTxt(
      dados({ carreiras: [{ ...carreira, orgLink: 'javascript:alert(1)' }] }),
      ORIGEM,
    )
    expect(semLink).toContain(
      'ViralizePlus: Sua comunidade de desenvolvimento open source!',
    )
    expect(semLink).not.toContain('javascript:')
  })
})
