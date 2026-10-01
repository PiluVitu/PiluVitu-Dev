import { lojasPublicadas, type Captura, type Produto } from './pilulabs'

export const CONTEXTO_SCHEMA = 'https://schema.org'

export type ItemTrilha = { nome: string; caminho: string }

export type DetalhesSoftware = {
  applicationSubCategory: string
  operatingSystem: string
  softwareRequirements: string
  featureList: string[]
}

type EntradaJsonLdProduto = {
  produto: Produto
  siteUrl: string
  caminho: string
  capturas: Captura[]
  detalhes: DetalhesSoftware
}

function absoluto(siteUrl: string, caminho: string): string {
  return new URL(caminho, `${siteUrl}/`).href
}

function publicador(siteUrl: string) {
  return {
    '@type': 'Organization',
    name: 'PiluTech',
    url: absoluto(siteUrl, '/pilulabs'),
  }
}

export function jsonLdBreadcrumb(siteUrl: string, itens: ItemTrilha[]) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: itens.map((item, indice) => ({
      '@type': 'ListItem',
      position: indice + 1,
      name: item.nome,
      item: absoluto(siteUrl, item.caminho),
    })),
  }
}

export function jsonLdDoProduto({
  produto,
  siteUrl,
  caminho,
  capturas,
  detalhes,
}: EntradaJsonLdProduto) {
  const lojas = lojasPublicadas(produto)
  return {
    '@context': CONTEXTO_SCHEMA,
    '@graph': [
      {
        '@type': 'SoftwareApplication',
        name: produto.nome,
        description: produto.resumo,
        applicationCategory: 'BrowserApplication',
        ...detalhes,
        inLanguage: 'pt-BR',
        url: absoluto(siteUrl, caminho),
        ...(produto.icone ? { image: absoluto(siteUrl, produto.icone) } : {}),
        ...(capturas.length > 0
          ? { screenshot: capturas.map((c) => absoluto(siteUrl, c.src)) }
          : {}),
        ...(lojas.length > 0 ? { installUrl: lojas.map((l) => l.url) } : {}),
        offers: { '@type': 'Offer', price: 0, priceCurrency: 'BRL' },
        publisher: publicador(siteUrl),
        author: {
          '@type': 'Person',
          name: 'Paulo Victor Torres Silva',
          url: absoluto(siteUrl, '/'),
        },
      },
      jsonLdBreadcrumb(siteUrl, [
        { nome: 'PiluLabs', caminho: '/pilulabs' },
        { nome: produto.nome, caminho },
      ]),
    ],
  }
}

export function jsonLdVitrine(
  siteUrl: string,
  produtos: Pick<Produto, 'slug' | 'nome'>[],
) {
  return {
    '@context': CONTEXTO_SCHEMA,
    '@type': 'CollectionPage',
    name: 'PiluLabs',
    description: 'Produtos e apps da PiluTech',
    url: absoluto(siteUrl, '/pilulabs'),
    inLanguage: 'pt-BR',
    publisher: publicador(siteUrl),
    ...(produtos.length > 0
      ? {
          hasPart: produtos.map((p) => ({
            '@type': 'SoftwareApplication',
            name: p.nome,
            url: absoluto(siteUrl, `/pilulabs/${p.slug}`),
          })),
        }
      : {}),
  }
}
