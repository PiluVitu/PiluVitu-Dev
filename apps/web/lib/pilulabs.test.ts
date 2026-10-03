import {
  itemParaProject,
  itensListados,
  linkDoItem,
  metadataDaPagina,
  normalizarItem,
  selecionarParaHome,
  siglaDoItem,
  type ItemPiluLabs,
} from './pilulabs'

const SEM_LOJA = { chromeUrl: '', firefoxUrl: '', edgeUrl: '', operaUrl: '' }

const URL_CHROME = 'https://chromewebstore.google.com/detail/botai/abc'

const PAGINA = {
  caminho: '/pilulabs/botai',
  titulo: 'Botaí | PiluLabs',
  descricao: 'Gerador de dados fake para formulários (CPF, CNPJ, CEP)',
}

describe('metadataDaPagina', () => {
  // O Next substitui o openGraph do layout inteiro: locale e siteName têm de
  // vir de novo, senão a página perde os dois.
  it('canonical e og:url no caminho do piluvitu.com.br', () => {
    expect(metadataDaPagina(PAGINA)).toEqual({
      title: { absolute: 'Botaí | PiluLabs' },
      description: PAGINA.descricao,
      alternates: { canonical: '/pilulabs/botai' },
      openGraph: {
        type: 'website',
        locale: 'pt_BR',
        siteName: 'piluvitu.com.br',
        url: '/pilulabs/botai',
        title: 'Botaí | PiluLabs',
        description: PAGINA.descricao,
      },
      twitter: {
        card: 'summary_large_image',
        title: 'Botaí | PiluLabs',
        description: PAGINA.descricao,
      },
    })
  })

  // Declarar images aqui desligaria o opengraph-image.tsx do segmento.
  it('não declara imagens', () => {
    const metadata = metadataDaPagina(PAGINA)
    expect(metadata.openGraph).not.toHaveProperty('images')
    expect(metadata.twitter).not.toHaveProperty('images')
  })
})

const REPO_BOTAI =
  'https://github.com/PiluVitu/PiluVitu-Dev/tree/main/apps/botai'

function item(parcial: Partial<ItemPiluLabs> = {}): ItemPiluLabs {
  return {
    slug: 'botai',
    order: 0,
    nome: 'Botaí',
    subtitulo: 'Gerador de dados fake para formulários (CPF, CNPJ, CEP)',
    descricao: 'Extensão que preenche formulários.',
    tipo: 'extensao',
    tags: ['QA'],
    logo: '/pilulabs/botai/icone-128.png',
    sigla: '',
    site: '',
    repo: '',
    ...SEM_LOJA,
    destaque: false,
    data: '',
    listado: true,
    paginaPropria: false,
    ...parcial,
  }
}

const slugs = (itens: Pick<ItemPiluLabs, 'slug'>[]) => itens.map((i) => i.slug)

describe('normalizarItem', () => {
  it('lê a entrada completa do YAML, aparando espaços', () => {
    expect(
      normalizarItem('botai', {
        order: 2,
        nome: ' Botaí ',
        subtitulo: ' s ',
        descricao: 'd',
        tipo: 'mobile',
        tags: ['A', ' B ', ''],
        logo: '/i.png',
        sigla: 'BT',
        site: ' https://botai.pilutech.com.br ',
        repo: 'https://github.com/x',
        chromeUrl: ` ${URL_CHROME} `,
        firefoxUrl: '',
        edgeUrl: '',
        operaUrl: '',
        destaque: true,
        data: '2026-10-01',
        listado: true,
        paginaPropria: true,
      }),
    ).toEqual({
      slug: 'botai',
      order: 2,
      nome: 'Botaí',
      subtitulo: 's',
      descricao: 'd',
      tipo: 'mobile',
      tags: ['A', 'B'],
      logo: '/i.png',
      sigla: 'BT',
      site: 'https://botai.pilutech.com.br',
      repo: 'https://github.com/x',
      chromeUrl: URL_CHROME,
      firefoxUrl: '',
      edgeUrl: '',
      operaUrl: '',
      destaque: true,
      data: '2026-10-01',
      listado: true,
      paginaPropria: true,
    })
  })

  // O Keystatic apaga do YAML o campo opcional vazio: campo ausente vira o
  // vazio do tipo, e um item sem `listado` não aparece em lugar nenhum.
  it('campo omitido vira o vazio do tipo', () => {
    expect(normalizarItem('novo', {})).toEqual({
      slug: 'novo',
      order: 0,
      nome: 'novo',
      subtitulo: '',
      descricao: '',
      tipo: 'web',
      tags: [],
      logo: '',
      sigla: '',
      site: '',
      repo: '',
      ...SEM_LOJA,
      destaque: false,
      data: '',
      listado: false,
      paginaPropria: false,
    })
  })

  it('order nulo vira 0, tags nulas viram [], tipo desconhecido vira web', () => {
    const i = normalizarItem('x', { order: null, tags: null, tipo: 'desktop' })
    expect(i.order).toBe(0)
    expect(i.tags).toEqual([])
    expect(i.tipo).toBe('web')
  })

  it('só o booleano true liga destaque, listado e paginaPropria', () => {
    const textoTrue = 'true' as unknown as boolean
    const i = normalizarItem('x', {
      destaque: textoTrue,
      listado: textoTrue,
      paginaPropria: textoTrue,
    })
    expect([i.destaque, i.listado, i.paginaPropria]).toEqual([
      false,
      false,
      false,
    ])
  })

  // Um href="javascript:…" no card seria XSS; http e sem esquema também saem.
  it.each([
    'javascript:alert(1)',
    'http://sombrai.pilutech.com.br',
    'sombrai.pilutech.com.br',
  ])('site e repo que não são https viram vazio: %p', (url) => {
    const i = normalizarItem('x', { site: url, repo: url })
    expect([i.site, i.repo]).toEqual(['', ''])
  })

  it.each(['2026-02-30', '01/10/2026', 'amanhã'])(
    'data inválida vira vazia: %p',
    (data) => {
      expect(normalizarItem('x', { data }).data).toBe('')
    },
  )
})

describe('itensListados', () => {
  it('só os listados, por order e depois slug', () => {
    expect(
      slugs(
        itensListados([
          item({ slug: 'c', order: 1 }),
          item({ slug: 'oculto', order: 0, listado: false }),
          item({ slug: 'b', order: 1 }),
          item({ slug: 'a', order: 2 }),
        ]),
      ),
    ).toEqual(['b', 'c', 'a'])
  })

  it('não mexe na lista recebida', () => {
    const lista = [item({ slug: 'b', order: 1 }), item({ slug: 'a', order: 0 })]
    itensListados(lista)
    expect(slugs(lista)).toEqual(['b', 'a'])
  })
})

describe('selecionarParaHome', () => {
  it('sem item, nada', () => {
    expect(selecionarParaHome([])).toEqual([])
  })

  it('sem destaque, os mais novos primeiro', () => {
    expect(
      slugs(
        selecionarParaHome([
          item({ slug: 'velho', data: '2024-08-28' }),
          item({ slug: 'novo', data: '2026-10-01' }),
          item({ slug: 'meio', data: '2026-09-23' }),
        ]),
      ),
    ).toEqual(['novo', 'meio', 'velho'])
  })

  it('1 destaque vem antes do mais novo', () => {
    expect(
      slugs(
        selecionarParaHome([
          item({ slug: 'novo', data: '2026-10-01' }),
          item({ slug: 'escolhido', data: '2020-01-01', destaque: true }),
        ]),
      ),
    ).toEqual(['escolhido', 'novo'])
  })

  it('4 destaques ocupam a home, por order', () => {
    const destaques = ['d', 'c', 'b', 'a'].map((slug, order) =>
      item({ slug, order, destaque: true }),
    )
    expect(
      slugs(
        selecionarParaHome([
          item({ slug: 'novo', data: '2026-10-01' }),
          ...destaques,
        ]),
      ),
    ).toEqual(['d', 'c', 'b', 'a'])
  })

  it('6 destaques: só os 4 primeiros por order', () => {
    const destaques = [5, 4, 3, 2, 1, 0].map((order) =>
      item({ slug: `d${order}`, order, destaque: true }),
    )
    expect(slugs(selecionarParaHome(destaques))).toEqual([
      'd0',
      'd1',
      'd2',
      'd3',
    ])
  })

  it('destaque não listado fica de fora', () => {
    expect(
      slugs(
        selecionarParaHome([
          item({ slug: 'escondido', destaque: true, listado: false }),
          item({ slug: 'visivel' }),
        ]),
      ),
    ).toEqual(['visivel'])
  })

  it('data vazia conta como a mais antiga', () => {
    expect(
      slugs(
        selecionarParaHome([
          item({ slug: 'sem-data', data: '' }),
          item({ slug: 'antigo', data: '2001-01-01' }),
        ]),
      ),
    ).toEqual(['antigo', 'sem-data'])
  })

  it('empate de data: order, depois slug', () => {
    expect(
      slugs(
        selecionarParaHome([
          item({ slug: 'b', order: 1, data: '2026-01-01' }),
          item({ slug: 'z', order: 0, data: '2026-01-01' }),
          item({ slug: 'a', order: 1, data: '2026-01-01' }),
        ]),
      ),
    ).toEqual(['z', 'a', 'b'])
  })

  it('respeita o max', () => {
    const muitos = ['a', 'b', 'c'].map((slug) => item({ slug }))
    expect(selecionarParaHome(muitos, 2)).toHaveLength(2)
  })
})

describe('linkDoItem', () => {
  const site = 'https://botai.pilutech.com.br'

  it('página própria: a rota no piluvitu.com.br, mesmo com site', () => {
    expect(linkDoItem(item({ paginaPropria: true, site }))).toBe(
      '/pilulabs/botai',
    )
  })

  it('senão o site', () => {
    expect(linkDoItem(item({ site, repo: REPO_BOTAI }))).toBe(site)
  })

  it('senão o repo', () => {
    expect(linkDoItem(item({ repo: REPO_BOTAI }))).toBe(REPO_BOTAI)
  })

  it('senão nenhum', () => {
    expect(linkDoItem(item())).toBeNull()
  })
})

describe('siglaDoItem', () => {
  it('a sigla do YAML, ou as 2 primeiras letras do nome em maiúscula', () => {
    expect(siglaDoItem({ sigla: 'LPR', nome: 'Live PRs' })).toBe('LPR')
    expect(siglaDoItem({ sigla: '', nome: 'Botaí' })).toBe('BO')
  })
})

describe('itemParaProject', () => {
  it('vira o card da home, com o Acessar', () => {
    expect(
      itemParaProject(
        item({
          paginaPropria: true,
          site: 'https://botai.pilutech.com.br',
          repo: REPO_BOTAI,
        }),
      ),
    ).toEqual({
      id: 'pilulabs-botai',
      projectName: 'Botaí',
      subtitle: 'Gerador de dados fake para formulários (CPF, CNPJ, CEP)',
      projectLogo: '/pilulabs/botai/icone-128.png',
      description: 'Extensão que preenche formulários.',
      tags: ['QA'],
      deployLink: '/pilulabs/botai',
      deployLabel: 'Acessar',
      image: '/pilulabs/botai/icone-128.png',
      altImage: 'BO',
    })
  })

  // O card da home não tem mais o botão Código: sem site nem página, o Acessar
  // é o único caminho até o projeto, e leva ao repo.
  it('só com repo, o Acessar leva ao repo e não há link de código à parte', () => {
    const p = itemParaProject(item({ repo: REPO_BOTAI }))
    expect(p.deployLink).toBe(REPO_BOTAI)
    expect(p).not.toHaveProperty('repoLink')
  })

  it('sem logo, sem imagem e com a sigla', () => {
    const p = itemParaProject(item({ logo: '', sigla: 'BT' }))
    expect(p.image).toBeUndefined()
    expect(p.altImage).toBe('BT')
  })
})
