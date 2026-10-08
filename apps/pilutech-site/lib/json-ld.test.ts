import { SERVICOS } from './conteudo'
import {
  CONTEXTO,
  ID_DA_PILUTECH,
  jsonLdDaHome,
  LOGO_DA_PILUTECH,
  serializarJsonLd,
  TIPOS_DA_PILUTECH,
  type NoJsonLd,
} from './json-ld'
import { DESCRICAO_DA_HOME } from './seo'

const SITE = 'https://pilutech.com.br'
const EMAIL = 'pilutechinformatica@gmail.com'
const TELEFONE = '+55 86 98173-7625'

function no(id: string, grafo: NoJsonLd[]): NoJsonLd | undefined {
  return grafo.find((n) => n['@id'] === id)
}

describe('jsonLdDaHome', () => {
  const dados = jsonLdDaHome(SITE)
  const pilutech = no(ID_DA_PILUTECH, dados['@graph'])

  // Decisões do plano: uma empresa, um nó. Dois nós ligados por parentOrganization diriam que a
  // PiluTech é filha de si mesma; os dois tipos da spec §4 ficam no mesmo nó.
  it('um grafo com a PiluTech (Organization e ProfessionalService num nó só) e o site', () => {
    expect(dados['@context']).toBe(CONTEXTO)
    expect(TIPOS_DA_PILUTECH).toEqual(['Organization', 'ProfessionalService'])
    expect(dados['@graph'].map((n) => n['@type'])).toEqual([
      ['Organization', 'ProfessionalService'],
      'WebSite',
    ])
    expect(JSON.stringify(dados)).not.toContain('parentOrganization')
  })

  // O mesmo @id que a landing do Botaí usa: os sites descrevem a mesma empresa.
  it('a PiluTech: logo, e-mail, telefone, contato comercial, Brasil inteiro e endereço só com cidade, UF e país', () => {
    expect(ID_DA_PILUTECH).toBe('https://pilutech.com.br/#organizacao')
    expect(LOGO_DA_PILUTECH).toBe('https://pilutech.com.br/icon')
    expect(pilutech).toMatchObject({
      '@type': ['Organization', 'ProfessionalService'],
      '@id': ID_DA_PILUTECH,
      name: 'PiluTech',
      description: DESCRICAO_DA_HOME,
      url: SITE,
      logo: LOGO_DA_PILUTECH,
      image: LOGO_DA_PILUTECH,
      email: EMAIL,
      telephone: TELEFONE,
      contactPoint: {
        '@type': 'ContactPoint',
        contactType: 'sales',
        email: EMAIL,
        telephone: TELEFONE,
        areaServed: 'BR',
        availableLanguage: 'pt-BR',
      },
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Teresina',
        addressRegion: 'PI',
        addressCountry: 'BR',
      },
      areaServed: { '@type': 'Country', name: 'Brasil' },
    })
    expect(
      Object.keys(pilutech?.address as Record<string, unknown>).sort(),
    ).toEqual(['@type', 'addressCountry', 'addressLocality', 'addressRegion'])
  })

  it('os 4 serviços no catálogo, na ordem da página, como Service, sem preço', () => {
    const catalogo = pilutech?.hasOfferCatalog as {
      '@type': string
      name: string
      itemListElement: {
        '@type': string
        itemOffered: { '@type': string; name: string; description: string }
      }[]
    }
    expect(catalogo['@type']).toBe('OfferCatalog')
    expect(catalogo.name).toBe('Serviços da PiluTech')
    expect(catalogo.itemListElement.map((o) => o.itemOffered.name)).toEqual([
      'Provisionamento e orçamento de infraestrutura',
      'Criação e implementação de IA personalizada',
      'Criação e manutenção de aplicativos',
      'Desenvolvimento fullstack sob medida',
    ])
    expect(catalogo.itemListElement[1].itemOffered.description).toBe(
      'Criação de assistentes, agentes e automações com IA para os seus dados e processos, com modelos na nuvem ou rodando no seu próprio servidor.',
    )
    expect(catalogo.itemListElement).toEqual(
      SERVICOS.map((servico) => ({
        '@type': 'Offer',
        itemOffered: {
          '@type': 'Service',
          name: servico.nome,
          description: servico.texto,
        },
      })),
    )
  })

  it('WebSite: o site na raiz do domínio, publicado pela PiluTech', () => {
    expect(no(`${SITE}/#site`, dados['@graph'])).toEqual({
      '@type': 'WebSite',
      '@id': `${SITE}/#site`,
      name: 'PiluTech',
      url: `${SITE}/`,
      inLanguage: 'pt-BR',
      publisher: { '@id': ID_DA_PILUTECH },
    })
  })

  // Spec §4: sem FAQPage (o Google não mostra mais o rich result de FAQ, removido em maio de 2026) e sem nota.
  it('sem FAQPage, nota, review nem preço', () => {
    const texto = JSON.stringify(dados)
    for (const proibido of [
      'FAQPage',
      'aggregateRating',
      'review',
      'price',
      'priceRange',
    ])
      expect(texto).not.toContain(proibido)
  })

  it('outro site muda as URLs da página, não as da PiluTech', () => {
    const local = jsonLdDaHome('http://localhost:3021')
    expect(no('http://localhost:3021/#site', local['@graph'])?.url).toBe(
      'http://localhost:3021/',
    )
    expect(no(ID_DA_PILUTECH, local['@graph'])).toMatchObject({
      url: SITE,
      logo: LOGO_DA_PILUTECH,
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
