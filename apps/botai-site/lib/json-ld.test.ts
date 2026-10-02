import {
  CONTEXTO,
  ID_DA_PILUTECH,
  jsonLdDaHome,
  jsonLdDaTrilha,
  serializarJsonLd,
  type NoJsonLd,
} from './json-ld'

const SITE = 'https://botai.pilutech.com.br'
const SEM_LOJA = { chromeUrl: '', firefoxUrl: '', edgeUrl: '', operaUrl: '' }
const URL_CHROME = 'https://chromewebstore.google.com/detail/botai/abc'
const URL_FIREFOX = 'https://addons.mozilla.org/pt-BR/firefox/addon/botai/'

function no(tipo: string, grafo: NoJsonLd[]): NoJsonLd | undefined {
  return grafo.find((n) => n['@type'] === tipo)
}

describe('jsonLdDaHome', () => {
  const dados = jsonLdDaHome(SITE, SEM_LOJA)

  it('um grafo com a PiluTech, o site e a aplicação', () => {
    expect(dados['@context']).toBe(CONTEXTO)
    expect(dados['@graph'].map((n) => n['@type'])).toEqual([
      'Organization',
      'WebSite',
      'SoftwareApplication',
    ])
  })

  // Sem logo: não há logo da PiluTech no repo, e o ícone do Botaí não é o logo da empresa.
  it('Organization: a PiluTech, sem logo', () => {
    expect(no('Organization', dados['@graph'])).toEqual({
      '@type': 'Organization',
      '@id': ID_DA_PILUTECH,
      name: 'PiluTech',
      url: 'https://pilutech.com.br',
    })
  })

  it('WebSite: o nome do site na raiz do subdomínio', () => {
    expect(no('WebSite', dados['@graph'])).toEqual({
      '@type': 'WebSite',
      '@id': `${SITE}/#site`,
      name: 'Botaí',
      url: `${SITE}/`,
      inLanguage: 'pt-BR',
      publisher: { '@id': ID_DA_PILUTECH },
    })
  })

  it('SoftwareApplication gratuito, de navegador, com as capturas', () => {
    expect(no('SoftwareApplication', dados['@graph'])).toEqual({
      '@type': 'SoftwareApplication',
      '@id': `${SITE}/#aplicacao`,
      name: 'Botaí',
      description: 'Gerador de dados fake para formulários (CPF, CNPJ, CEP)',
      applicationCategory: 'BrowserApplication',
      applicationSubCategory: 'Extensão de navegador',
      operatingSystem: 'Windows, macOS, Linux, ChromeOS',
      softwareRequirements:
        'Chrome, Edge ou Opera com Chromium 123 ou superior, ou Firefox 153 ou superior',
      featureList: [
        'Documentos: CPF, CNPJ, RG, PIS/NIS e título de eleitor, com os dígitos verificadores certos.',
        'Endereço: CEP real, com rua, bairro, cidade e UF que batem com ele.',
        'Contato: Nome, data de nascimento, celular, e-mail e senha.',
        'Empresa: Razão social, nome fantasia e CNPJ.',
        'Cartão: O cartão de teste documentado da Stripe: número, nome impresso, validade e CVV.',
      ],
      inLanguage: 'pt-BR',
      url: `${SITE}/`,
      image: `${SITE}/icon.png`,
      screenshot: [
        `${SITE}/capturas/01-pagina-preenchida-escuro.png`,
        `${SITE}/capturas/03-pessoa-de-teste-escuro.png`,
        `${SITE}/capturas/05-resultado-escuro.png`,
      ],
      offers: { '@type': 'Offer', price: 0, priceCurrency: 'BRL' },
      publisher: { '@id': ID_DA_PILUTECH },
      author: { '@id': ID_DA_PILUTECH },
    })
  })

  // O Google proíbe copiar a nota das lojas.
  it('sem nota, review nem versão', () => {
    const aplicacao = no('SoftwareApplication', dados['@graph'])
    for (const campo of ['aggregateRating', 'review', 'softwareVersion'])
      expect(aplicacao).not.toHaveProperty(campo)
  })

  // Review Focus 1: só loja válida vira installUrl.
  it('installUrl só das lojas publicadas, na ordem fixa', () => {
    const aplicacao = no(
      'SoftwareApplication',
      jsonLdDaHome(SITE, {
        ...SEM_LOJA,
        firefoxUrl: URL_FIREFOX,
        chromeUrl: URL_CHROME,
        edgeUrl: URL_FIREFOX,
      })['@graph'],
    )
    expect(aplicacao?.installUrl).toEqual([URL_CHROME, URL_FIREFOX])
  })

  it('outro site muda as URLs da página, não a da PiluTech', () => {
    const local = jsonLdDaHome('http://localhost:3020', SEM_LOJA)
    expect(no('SoftwareApplication', local['@graph'])?.url).toBe(
      'http://localhost:3020/',
    )
    expect(no('Organization', local['@graph'])?.url).toBe(
      'https://pilutech.com.br',
    )
  })
})

describe('jsonLdDaTrilha', () => {
  it.each([
    ['/privacidade', 'Política de privacidade'],
    ['/termos', 'Termos de uso'],
  ])('a trilha Botaí › %s', (caminho, nome) => {
    expect(jsonLdDaTrilha(SITE, { nome, caminho })).toEqual({
      '@context': CONTEXTO,
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Botaí', item: `${SITE}/` },
        {
          '@type': 'ListItem',
          position: 2,
          name: nome,
          item: `${SITE}${caminho}`,
        },
      ],
    })
  })
})

describe('serializarJsonLd', () => {
  // Um texto com </script> não pode fechar a tag.
  it('troca < por \\u003c', () => {
    expect(serializarJsonLd({ nome: '</script><b>' })).toBe(
      '{"nome":"\\u003c/script>\\u003cb>"}',
    )
  })
})
