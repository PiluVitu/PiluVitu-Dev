import { urlPublica } from './pilutech-dominios'

export const CONTEXTO_SCHEMA = 'https://schema.org'

export type ParteDaVitrine = { nome: string; href: string | null }

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
