import type { Metadata, Viewport } from 'next'
import { CORES_DA_MARCA, NOME_DA_MARCA } from './marca'

export const TITULO_DA_HOME =
  'PiluTech · Apps, infraestrutura e desenvolvimento fullstack'
export const DESCRICAO_DA_HOME =
  'Criação e manutenção de aplicativos, infraestrutura em nuvem e desenvolvimento fullstack. A PiluTech fica em Teresina (PI) e atende remoto em todo o Brasil.'

export const COR_DO_TEMA = CORES_DA_MARCA.noite

export type PaginaDoSite = {
  caminho: string
  titulo: string
  descricao: string
}

export function metadataDaPagina({
  caminho,
  titulo,
  descricao,
}: PaginaDoSite): Metadata {
  return {
    title: { absolute: titulo },
    description: descricao,
    alternates: { canonical: caminho },
    openGraph: {
      type: 'website',
      locale: 'pt_BR',
      siteName: NOME_DA_MARCA,
      url: caminho,
      title: titulo,
      description: descricao,
    },
    twitter: {
      card: 'summary_large_image',
      title: titulo,
      description: descricao,
    },
  }
}

export function metadataDoSite(
  siteUrl: string,
  env: Record<string, string | undefined> = process.env,
): Metadata {
  const google = env.GOOGLE_SITE_VERIFICATION?.trim()
  return {
    metadataBase: new URL(`${siteUrl}/`),
    applicationName: NOME_DA_MARCA,
    creator: NOME_DA_MARCA,
    publisher: NOME_DA_MARCA,
    formatDetection: { telephone: false, address: false, email: false },
    ...(google ? { verification: { google } } : {}),
  }
}

export const VIEWPORT: Viewport = { themeColor: COR_DO_TEMA }
