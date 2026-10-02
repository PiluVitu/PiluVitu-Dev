import type { Captura, ItemPiluLabs } from './pilulabs'
import {
  CONTEXTO_SCHEMA,
  jsonLdBreadcrumb,
  jsonLdDoItem,
  jsonLdVitrine,
} from './pilulabs-json-ld'

const SITE = 'https://piluvitu.com.br'

const DETALHES = {
  applicationSubCategory: 'Extensão de navegador',
  operatingSystem: 'Windows, macOS, Linux, ChromeOS',
  softwareRequirements:
    'Chrome, Edge ou Opera com Chromium 123 ou superior, ou Firefox 153 ou superior',
  featureList: ['Documentos: CPF e CNPJ com dígito verificador'],
}

const BOTAI: ItemPiluLabs = {
  slug: 'botai',
  order: 0,
  nome: 'Botaí',
  subtitulo: 'Gerador de dados fake para formulários (CPF, CNPJ, CEP)',
  descricao: 'Extensão que preenche formulários.',
  tipo: 'extensao',
  tags: [],
  logo: '/pilulabs/botai/icone-128.png',
  sigla: '',
  site: 'https://botai.pilutech.com.br',
  repo: '',
  chromeUrl: '',
  firefoxUrl: '',
  edgeUrl: '',
  operaUrl: '',
  destaque: true,
  data: '2026-10-01',
  listado: false,
  paginaPropria: true,
}

const CAPTURAS: Captura[] = [
  {
    arquivo: '01-a.png',
    src: '/pilulabs/botai/capturas/01-a.png',
    alt: 'Captura de tela: a',
  },
]

function montar(
  item: ItemPiluLabs,
  capturas: Captura[] = [],
  subdominios = false,
) {
  return jsonLdDoItem({
    item,
    siteUrl: SITE,
    caminho: '/pilulabs/botai',
    capturas,
    detalhes: DETALHES,
    subdominios,
  })
}

function aplicacao(
  item: ItemPiluLabs,
  capturas: Captura[] = [],
  subdominios = false,
) {
  return montar(item, capturas, subdominios)['@graph'][0]
}

describe('jsonLdDoItem', () => {
  it('descreve um SoftwareApplication gratuito, com URLs absolutas', () => {
    expect(aplicacao(BOTAI)).toMatchObject({
      '@type': 'SoftwareApplication',
      name: 'Botaí',
      description: BOTAI.subtitulo,
      applicationCategory: 'BrowserApplication',
      ...DETALHES,
      inLanguage: 'pt-BR',
      url: 'https://piluvitu.com.br/pilulabs/botai',
      image: 'https://piluvitu.com.br/pilulabs/botai/icone-128.png',
      offers: { '@type': 'Offer', price: 0, priceCurrency: 'BRL' },
      publisher: {
        '@type': 'Organization',
        name: 'PiluTech',
        url: 'https://piluvitu.com.br/pilulabs',
      },
      author: {
        '@type': 'Person',
        name: 'Paulo Victor Torres Silva',
        url: 'https://piluvitu.com.br/',
      },
    })
  })

  // O Google proíbe agregar nota de outro site (as lojas), e ninguém
  // atualizaria a versão a cada release.
  it('não tem nota nem versão', () => {
    expect(aplicacao(BOTAI)).not.toHaveProperty('aggregateRating')
    expect(aplicacao(BOTAI)).not.toHaveProperty('softwareVersion')
  })

  it('sem loja publicada, sem installUrl', () => {
    expect(aplicacao(BOTAI)).not.toHaveProperty('installUrl')
  })

  it('installUrl só com as lojas publicadas de verdade', () => {
    expect(
      aplicacao({
        ...BOTAI,
        chromeUrl: 'https://chromewebstore.google.com/detail/botai/abc',
        operaUrl: 'https://example.com/botai',
      }),
    ).toMatchObject({
      installUrl: ['https://chromewebstore.google.com/detail/botai/abc'],
    })
  })

  it('screenshot com as capturas em URL absoluta', () => {
    expect(aplicacao(BOTAI, CAPTURAS)).toMatchObject({
      screenshot: ['https://piluvitu.com.br/pilulabs/botai/capturas/01-a.png'],
    })
  })

  it('sem capturas, sem screenshot', () => {
    expect(aplicacao(BOTAI)).not.toHaveProperty('screenshot')
  })

  it('sem logo, sem image', () => {
    expect(aplicacao({ ...BOTAI, logo: '' })).not.toHaveProperty('image')
  })

  it('traz o contexto e a trilha PiluLabs › Botaí', () => {
    const dados = montar(BOTAI)
    expect(dados['@context']).toBe(CONTEXTO_SCHEMA)
    expect(dados['@graph'][1]).toEqual(
      jsonLdBreadcrumb(
        SITE,
        [
          { nome: 'PiluLabs', caminho: '/pilulabs' },
          { nome: 'Botaí', caminho: '/pilulabs/botai' },
        ],
        false,
      ),
    )
  })

  // Com a chave ligada as páginas moram nos subdomínios, mas os arquivos
  // continuam no piluvitu.com.br: no subdomínio, /icone-128.png não existe.
  it('chave ligada: página e PiluTech nos subdomínios; imagem, capturas e autor no piluvitu.com.br', () => {
    expect(aplicacao(BOTAI, CAPTURAS, true)).toMatchObject({
      url: 'https://botai.pilutech.com.br/',
      image: 'https://piluvitu.com.br/pilulabs/botai/icone-128.png',
      screenshot: ['https://piluvitu.com.br/pilulabs/botai/capturas/01-a.png'],
      publisher: { url: 'https://pilutech.com.br/' },
      author: { url: 'https://piluvitu.com.br/' },
    })
  })
})

describe('jsonLdBreadcrumb', () => {
  const trilha = [
    { nome: 'PiluLabs', caminho: '/pilulabs' },
    { nome: 'Botaí', caminho: '/pilulabs/botai' },
    { nome: 'Política de privacidade', caminho: '/pilulabs/botai/privacidade' },
  ]

  it('numera a partir de 1, com URL absoluta', () => {
    expect(jsonLdBreadcrumb(SITE, trilha.slice(0, 2), false)).toEqual({
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'PiluLabs',
          item: 'https://piluvitu.com.br/pilulabs',
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Botaí',
          item: 'https://piluvitu.com.br/pilulabs/botai',
        },
      ],
    })
  })

  it('chave ligada: cada passo no seu host PiluTech', () => {
    expect(
      jsonLdBreadcrumb(SITE, trilha, true).itemListElement.map((i) => i.item),
    ).toEqual([
      'https://pilutech.com.br/',
      'https://botai.pilutech.com.br/',
      'https://botai.pilutech.com.br/privacidade',
    ])
  })
})

describe('jsonLdVitrine', () => {
  it('é uma CollectionPage da PiluTech', () => {
    expect(jsonLdVitrine(SITE, [], false)).toEqual({
      '@context': CONTEXTO_SCHEMA,
      '@type': 'CollectionPage',
      name: 'PiluLabs',
      description: 'Produtos e apps da PiluTech',
      url: 'https://piluvitu.com.br/pilulabs',
      inLanguage: 'pt-BR',
      publisher: {
        '@type': 'Organization',
        name: 'PiluTech',
        url: 'https://piluvitu.com.br/pilulabs',
      },
    })
  })

  it('lista em hasPart o link de cada item; sem link, sem url', () => {
    expect(
      jsonLdVitrine(
        SITE,
        [
          { nome: 'Botaí', href: '/pilulabs/botai' },
          { nome: 'Sombraí', href: 'https://sombrai.pilutech.com.br' },
          { nome: 'Sem link', href: null },
        ],
        false,
      ),
    ).toMatchObject({
      hasPart: [
        {
          '@type': 'SoftwareApplication',
          name: 'Botaí',
          url: 'https://piluvitu.com.br/pilulabs/botai',
        },
        {
          '@type': 'SoftwareApplication',
          name: 'Sombraí',
          url: 'https://sombrai.pilutech.com.br/',
        },
        { '@type': 'SoftwareApplication', name: 'Sem link' },
      ],
    })
  })

  it('chave ligada: a vitrine e a PiluTech em pilutech.com.br', () => {
    expect(jsonLdVitrine(SITE, [], true)).toMatchObject({
      url: 'https://pilutech.com.br/',
      publisher: { url: 'https://pilutech.com.br/' },
    })
  })
})
