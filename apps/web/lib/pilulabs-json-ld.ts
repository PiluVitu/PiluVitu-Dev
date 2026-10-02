import { lojasPublicadas, type Captura, type ItemPiluLabs } from './pilulabs'
import { urlPublica } from './pilutech-dominios'

export const CONTEXTO_SCHEMA = 'https://schema.org'

export type ItemTrilha = { nome: string; caminho: string }
export type ParteDaVitrine = { nome: string; href: string | null }

export type DetalhesSoftware = {
  applicationSubCategory: string
  operatingSystem: string
  softwareRequirements: string
  featureList: string[]
}

type EntradaJsonLdItem = {
  item: ItemPiluLabs
  siteUrl: string
  caminho: string
  capturas: Captura[]
  detalhes: DetalhesSoftware
  subdominios: boolean
}

function absoluto(siteUrl: string, caminho: string): string {
  return new URL(caminho, `${siteUrl}/`).href
}

function urlDaPagina(
  siteUrl: string,
  caminho: string,
  subdominios: boolean,
): string {
  return absoluto(siteUrl, urlPublica(caminho, subdominios))
}

function publicador(siteUrl: string, subdominios: boolean) {
  return {
    '@type': 'Organization',
    name: 'PiluTech',
    url: urlDaPagina(siteUrl, '/pilulabs', subdominios),
  }
}

export function jsonLdBreadcrumb(
  siteUrl: string,
  itens: ItemTrilha[],
  subdominios: boolean,
) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: itens.map((item, indice) => ({
      '@type': 'ListItem',
      position: indice + 1,
      name: item.nome,
      item: urlDaPagina(siteUrl, item.caminho, subdominios),
    })),
  }
}

export function jsonLdDoItem({
  item,
  siteUrl,
  caminho,
  capturas,
  detalhes,
  subdominios,
}: EntradaJsonLdItem) {
  const lojas = lojasPublicadas(item)
  return {
    '@context': CONTEXTO_SCHEMA,
    '@graph': [
      {
        '@type': 'SoftwareApplication',
        name: item.nome,
        description: item.subtitulo,
        applicationCategory: 'BrowserApplication',
        ...detalhes,
        inLanguage: 'pt-BR',
        url: urlDaPagina(siteUrl, caminho, subdominios),
        ...(item.logo ? { image: absoluto(siteUrl, item.logo) } : {}),
        ...(capturas.length > 0
          ? { screenshot: capturas.map((c) => absoluto(siteUrl, c.src)) }
          : {}),
        ...(lojas.length > 0 ? { installUrl: lojas.map((l) => l.url) } : {}),
        offers: { '@type': 'Offer', price: 0, priceCurrency: 'BRL' },
        publisher: publicador(siteUrl, subdominios),
        author: {
          '@type': 'Person',
          name: 'Paulo Victor Torres Silva',
          url: absoluto(siteUrl, '/'),
        },
      },
      jsonLdBreadcrumb(
        siteUrl,
        [
          { nome: 'PiluLabs', caminho: '/pilulabs' },
          { nome: item.nome, caminho },
        ],
        subdominios,
      ),
    ],
  }
}

export function jsonLdVitrine(
  siteUrl: string,
  partes: ParteDaVitrine[],
  subdominios: boolean,
) {
  return {
    '@context': CONTEXTO_SCHEMA,
    '@type': 'CollectionPage',
    name: 'PiluLabs',
    description: 'Produtos e apps da PiluTech',
    url: urlDaPagina(siteUrl, '/pilulabs', subdominios),
    inLanguage: 'pt-BR',
    publisher: publicador(siteUrl, subdominios),
    ...(partes.length > 0
      ? {
          hasPart: partes.map((parte) => ({
            '@type': 'SoftwareApplication',
            name: parte.nome,
            ...(parte.href ? { url: absoluto(siteUrl, parte.href) } : {}),
          })),
        }
      : {}),
  }
}
