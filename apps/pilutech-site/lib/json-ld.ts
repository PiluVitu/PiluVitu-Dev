import { EMAIL_DA_PILUTECH, TELEFONE_INTERNACIONAL } from './contato'
import { SERVICOS } from './conteudo'
import { NOME_DA_MARCA } from './marca'
import { DESCRICAO_DA_HOME } from './seo'
import { SITE_DE_PRODUCAO, urlAbsoluta } from './site'

export const CONTEXTO = 'https://schema.org'
export const ID_DA_PILUTECH = `${SITE_DE_PRODUCAO}/#organizacao`
export const LOGO_DA_PILUTECH = `${SITE_DE_PRODUCAO}/icon`
export const TIPOS_DA_PILUTECH = ['Organization', 'ProfessionalService']

export type NoJsonLd = Record<string, unknown>

export function serializarJsonLd(dados: unknown): string {
  return JSON.stringify(dados).replace(/</g, '\\u003c')
}

export function jsonLdDaHome(siteUrl: string): {
  '@context': string
  '@graph': NoJsonLd[]
} {
  const raiz = urlAbsoluta('/', siteUrl)
  return {
    '@context': CONTEXTO,
    '@graph': [
      {
        '@type': TIPOS_DA_PILUTECH,
        '@id': ID_DA_PILUTECH,
        name: NOME_DA_MARCA,
        description: DESCRICAO_DA_HOME,
        url: SITE_DE_PRODUCAO,
        logo: LOGO_DA_PILUTECH,
        image: LOGO_DA_PILUTECH,
        email: EMAIL_DA_PILUTECH,
        telephone: TELEFONE_INTERNACIONAL,
        contactPoint: {
          '@type': 'ContactPoint',
          contactType: 'sales',
          email: EMAIL_DA_PILUTECH,
          telephone: TELEFONE_INTERNACIONAL,
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
        hasOfferCatalog: {
          '@type': 'OfferCatalog',
          name: 'Serviços da PiluTech',
          itemListElement: SERVICOS.map((servico) => ({
            '@type': 'Offer',
            itemOffered: {
              '@type': 'Service',
              name: servico.nome,
              description: servico.texto,
            },
          })),
        },
      },
      {
        '@type': 'WebSite',
        '@id': `${raiz}#site`,
        name: NOME_DA_MARCA,
        url: raiz,
        inLanguage: 'pt-BR',
        publisher: { '@id': ID_DA_PILUTECH },
      },
    ],
  }
}
