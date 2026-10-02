import { lojasPublicadas, type UrlsDasLojas } from '@piluvitu/tools/pilulabs'
import { CAPTURAS } from './capturas'
import {
  NOME,
  PROPOSTA,
  RECURSOS,
  REQUISITOS_DO_SOFTWARE,
  URL_DA_PILUTECH,
} from './conteudo'
import { urlAbsoluta } from './site'

export const CONTEXTO = 'https://schema.org'
export const ID_DA_PILUTECH = `${URL_DA_PILUTECH}/#organizacao`

export type NoJsonLd = Record<string, unknown>

export function serializarJsonLd(dados: unknown): string {
  return JSON.stringify(dados).replace(/</g, '\\u003c')
}

export function jsonLdDaHome(
  siteUrl: string,
  urls: UrlsDasLojas,
): { '@context': string; '@graph': NoJsonLd[] } {
  const raiz = urlAbsoluta('/', siteUrl)
  const instalacao = lojasPublicadas(urls).map(({ url }) => url)
  const pilutech = { '@id': ID_DA_PILUTECH }
  return {
    '@context': CONTEXTO,
    '@graph': [
      {
        '@type': 'Organization',
        '@id': ID_DA_PILUTECH,
        name: 'PiluTech',
        url: URL_DA_PILUTECH,
      },
      {
        '@type': 'WebSite',
        '@id': `${raiz}#site`,
        name: NOME,
        url: raiz,
        inLanguage: 'pt-BR',
        publisher: pilutech,
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${raiz}#aplicacao`,
        name: NOME,
        description: PROPOSTA,
        applicationCategory: 'BrowserApplication',
        applicationSubCategory: 'Extensão de navegador',
        operatingSystem: 'Windows, macOS, Linux, ChromeOS',
        softwareRequirements: REQUISITOS_DO_SOFTWARE,
        featureList: RECURSOS.map((r) => `${r.titulo}: ${r.texto}`),
        inLanguage: 'pt-BR',
        url: raiz,
        image: urlAbsoluta('/icon.png', siteUrl),
        screenshot: CAPTURAS.map((c) =>
          urlAbsoluta(c.variantes.escuro.src, siteUrl),
        ),
        ...(instalacao.length > 0 ? { installUrl: instalacao } : {}),
        offers: { '@type': 'Offer', price: 0, priceCurrency: 'BRL' },
        publisher: pilutech,
        author: pilutech,
      },
    ],
  }
}

export function jsonLdDaPrivacidade(siteUrl: string): NoJsonLd {
  return {
    '@context': CONTEXTO,
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: NOME,
        item: urlAbsoluta('/', siteUrl),
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Política de privacidade',
        item: urlAbsoluta('/privacidade', siteUrl),
      },
    ],
  }
}
