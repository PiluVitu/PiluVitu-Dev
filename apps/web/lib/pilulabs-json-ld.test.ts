import type { Captura, Produto } from './pilulabs'
import {
  CONTEXTO_SCHEMA,
  jsonLdBreadcrumb,
  jsonLdDoProduto,
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

const BOTAI: Produto = {
  slug: 'botai',
  order: 0,
  nome: 'Botaí',
  tipo: 'extensao',
  listado: false,
  resumo: 'Gerador de dados fake para formulários (CPF, CNPJ, CEP)',
  icone: '/pilulabs/botai/icone-128.png',
  tags: [],
  chromeUrl: '',
  firefoxUrl: '',
  edgeUrl: '',
  operaUrl: '',
  repoLink: '',
}

const CAPTURAS: Captura[] = [
  {
    arquivo: '01-a.png',
    src: '/pilulabs/botai/capturas/01-a.png',
    alt: 'Captura de tela: a',
  },
]

function montar(produto: Produto, capturas: Captura[] = []) {
  return jsonLdDoProduto({
    produto,
    siteUrl: SITE,
    caminho: '/pilulabs/botai',
    capturas,
    detalhes: DETALHES,
  })
}

function aplicacao(produto: Produto, capturas: Captura[] = []) {
  return montar(produto, capturas)['@graph'][0]
}

describe('jsonLdDoProduto', () => {
  it('descreve um SoftwareApplication gratuito, com URLs absolutas', () => {
    expect(aplicacao(BOTAI)).toMatchObject({
      '@type': 'SoftwareApplication',
      name: 'Botaí',
      description: BOTAI.resumo,
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

  it('sem ícone, sem image', () => {
    expect(aplicacao({ ...BOTAI, icone: '' })).not.toHaveProperty('image')
  })

  it('traz o contexto e a trilha PiluLabs › Botaí', () => {
    const dados = montar(BOTAI)
    expect(dados['@context']).toBe(CONTEXTO_SCHEMA)
    expect(dados['@graph'][1]).toEqual(
      jsonLdBreadcrumb(SITE, [
        { nome: 'PiluLabs', caminho: '/pilulabs' },
        { nome: 'Botaí', caminho: '/pilulabs/botai' },
      ]),
    )
  })
})

describe('jsonLdBreadcrumb', () => {
  it('numera a partir de 1, com URL absoluta', () => {
    expect(
      jsonLdBreadcrumb(SITE, [
        { nome: 'PiluLabs', caminho: '/pilulabs' },
        { nome: 'Botaí', caminho: '/pilulabs/botai' },
      ]),
    ).toEqual({
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
})

describe('jsonLdVitrine', () => {
  it('é uma CollectionPage da PiluTech', () => {
    expect(jsonLdVitrine(SITE, [])).toEqual({
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

  it('lista os produtos em hasPart', () => {
    expect(jsonLdVitrine(SITE, [BOTAI])).toMatchObject({
      hasPart: [
        {
          '@type': 'SoftwareApplication',
          name: 'Botaí',
          url: 'https://piluvitu.com.br/pilulabs/botai',
        },
      ],
    })
  })
})
