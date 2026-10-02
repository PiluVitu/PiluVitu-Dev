import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  altDaCaptura,
  itemParaProject,
  itensListados,
  linkDoItem,
  listarCapturas,
  metadataDaPagina,
  metadataDoItem,
  normalizarItem,
  ROTULOS_CAPTURA,
  selecionarParaHome,
  siglaDoItem,
  type ItemPiluLabs,
} from './pilulabs'

const SEM_LOJA = { chromeUrl: '', firefoxUrl: '', edgeUrl: '', operaUrl: '' }

const URL_CHROME = 'https://chromewebstore.google.com/detail/botai/abc'

describe('listarCapturas', () => {
  let raiz: string

  beforeEach(() => {
    raiz = mkdtempSync(join(tmpdir(), 'pilulabs-'))
  })
  afterEach(() => {
    rmSync(raiz, { recursive: true, force: true })
  })

  function criarCapturas(...arquivos: string[]): string {
    const pasta = join(raiz, 'pilulabs', 'botai', 'capturas')
    mkdirSync(pasta, { recursive: true })
    for (const arquivo of arquivos) writeFileSync(join(pasta, arquivo), '')
    return pasta
  }

  // Na fase 2 as capturas ainda não existem: a página tem de nascer sem elas.
  it('devolve [] quando a pasta não existe', () => {
    expect(listarCapturas('botai', raiz)).toEqual([])
  })

  it('lista só arquivos PNG, em ordem natural do prefixo NN', () => {
    const pasta = criarCapturas(
      '10-c.png',
      '2-b.png',
      '01-a.png',
      '03-d.PNG',
      '.DS_Store',
      'notas.txt',
    )
    mkdirSync(join(pasta, '04-pasta.png'))
    expect(listarCapturas('botai', raiz).map((c) => c.arquivo)).toEqual([
      '01-a.png',
      '2-b.png',
      '03-d.PNG',
      '10-c.png',
    ])
  })

  it('monta o src público a partir do slug', () => {
    criarCapturas('01-popup-escuro.png')
    expect(listarCapturas('botai', raiz)).toEqual([
      {
        arquivo: '01-popup-escuro.png',
        src: '/pilulabs/botai/capturas/01-popup-escuro.png',
        alt: 'Captura de tela: popup (tema escuro)',
      },
    ])
  })
})

describe('altDaCaptura', () => {
  it('tira o NN e a extensão, devolve o acento e o tema pelo mapa de rótulos', () => {
    expect(altDaCaptura('01-pagina-preenchida-escuro.png')).toBe(
      'Captura de tela: página preenchida (tema escuro)',
    )
  })

  it('palavra fora do mapa entra como está, em minúscula', () => {
    expect(altDaCaptura('02-Popup-pessoa-pronta-claro.png')).toBe(
      'Captura de tela: popup pessoa pronta (tema claro)',
    )
  })

  // Com um objeto comum, "constructor" acharia Object.prototype.constructor.
  it('palavra com nome de propriedade de Object não vira lixo', () => {
    expect(altDaCaptura('03-constructor.png')).toBe(
      'Captura de tela: constructor',
    )
  })

  it('o mapa cobre os temas claro e escuro', () => {
    expect(ROTULOS_CAPTURA.get('claro')).toBe('(tema claro)')
    expect(ROTULOS_CAPTURA.get('escuro')).toBe('(tema escuro)')
  })
})

const PAGINA = {
  caminho: '/pilulabs/botai',
  titulo: 'Botaí | PiluLabs',
  descricao: 'Gerador de dados fake para formulários (CPF, CNPJ, CEP)',
}

describe('metadataDaPagina', () => {
  // O Next substitui o openGraph do layout inteiro: locale e siteName têm de
  // vir de novo, senão a página perde os dois.
  it('chave desligada: canonical e og:url no caminho, siteName piluvitu.com.br', () => {
    expect(metadataDaPagina(PAGINA, false)).toEqual({
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

  it('chave ligada: canonical e og:url no subdomínio, siteName pilutech.com.br', () => {
    const metadata = metadataDaPagina(PAGINA, true)
    expect(metadata.alternates).toEqual({
      canonical: 'https://botai.pilutech.com.br/',
    })
    expect(metadata.openGraph).toMatchObject({
      siteName: 'pilutech.com.br',
      url: 'https://botai.pilutech.com.br/',
    })
  })

  // Declarar images aqui desligaria o opengraph-image.tsx do segmento.
  it('não declara imagens', () => {
    const metadata = metadataDaPagina(PAGINA, true)
    expect(metadata.openGraph).not.toHaveProperty('images')
    expect(metadata.twitter).not.toHaveProperty('images')
  })
})

describe('metadataDoItem', () => {
  it('item não listado: noindex', () => {
    expect(metadataDoItem({ listado: false }, PAGINA, false).robots).toEqual({
      index: false,
    })
  })

  it('item listado: sem robots, igual à metadata da página', () => {
    expect(metadataDoItem({ listado: true }, PAGINA, true)).toEqual(
      metadataDaPagina(PAGINA, true),
    )
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

  it('página própria com subdomínios desligados: a rota do site', () => {
    expect(linkDoItem(item({ paginaPropria: true, site }), false)).toBe(
      '/pilulabs/botai',
    )
  })

  it('senão o site', () => {
    expect(linkDoItem(item({ paginaPropria: true, site }), true)).toBe(site)
    expect(linkDoItem(item({ site, repo: REPO_BOTAI }), false)).toBe(site)
  })

  it('senão a página própria, no subdomínio', () => {
    expect(linkDoItem(item({ paginaPropria: true }), true)).toBe(
      'https://botai.pilutech.com.br/',
    )
  })

  it('senão o repo', () => {
    expect(linkDoItem(item({ repo: REPO_BOTAI }), true)).toBe(REPO_BOTAI)
  })

  it('senão nenhum', () => {
    expect(linkDoItem(item(), false)).toBeNull()
    expect(linkDoItem(item(), true)).toBeNull()
  })
})

describe('siglaDoItem', () => {
  it('a sigla do YAML, ou as 2 primeiras letras do nome em maiúscula', () => {
    expect(siglaDoItem({ sigla: 'LPR', nome: 'Live PRs' })).toBe('LPR')
    expect(siglaDoItem({ sigla: '', nome: 'Botaí' })).toBe('BO')
  })
})

describe('itemParaProject', () => {
  it('vira o card da home, com Acessar e Código', () => {
    expect(
      itemParaProject(
        item({
          paginaPropria: true,
          site: 'https://botai.pilutech.com.br',
          repo: REPO_BOTAI,
        }),
        false,
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
      repoLink: REPO_BOTAI,
      image: '/pilulabs/botai/icone-128.png',
      altImage: 'BO',
    })
  })

  it('com os subdomínios ligados, Acessar vai ao site', () => {
    expect(
      itemParaProject(
        item({ paginaPropria: true, site: 'https://botai.pilutech.com.br' }),
        true,
      ).deployLink,
    ).toBe('https://botai.pilutech.com.br')
  })

  // Sem site nem página, o link do item é o repo: dois botões para a mesma URL.
  it('só com repo, sem Acessar (o Código já leva lá)', () => {
    const p = itemParaProject(item({ repo: REPO_BOTAI }), false)
    expect(p.deployLink).toBe('')
    expect(p.repoLink).toBe(REPO_BOTAI)
  })

  it('sem logo, sem imagem e com a sigla', () => {
    const p = itemParaProject(item({ logo: '', sigla: 'BT' }), false)
    expect(p.image).toBeUndefined()
    expect(p.altImage).toBe('BT')
  })
})
