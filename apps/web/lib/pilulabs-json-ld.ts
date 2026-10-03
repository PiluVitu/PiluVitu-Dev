export const CONTEXTO_SCHEMA = 'https://schema.org'

const PILUTECH = {
  '@type': 'Organization',
  '@id': 'https://pilutech.com.br/#organizacao',
  name: 'PiluTech',
  url: 'https://pilutech.com.br',
}

export type ParteDaVitrine = { nome: string; href: string | null }

function absoluto(siteUrl: string, caminho: string): string {
  return new URL(caminho, `${siteUrl}/`).href
}

export function jsonLdVitrine(siteUrl: string, partes: ParteDaVitrine[]) {
  return {
    '@context': CONTEXTO_SCHEMA,
    '@type': 'CollectionPage',
    name: 'PiluLabs',
    description: 'Produtos e apps da PiluTech',
    url: absoluto(siteUrl, '/pilulabs'),
    inLanguage: 'pt-BR',
    publisher: PILUTECH,
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
