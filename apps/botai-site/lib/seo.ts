import type { Metadata, Viewport } from 'next'
import { NOME } from './conteudo'

export const TITULO_DA_HOME =
  'Botaí: gerador de CPF, CNPJ e CEP para testar formulários'
export const DESCRICAO_DA_HOME =
  'Extensão para Chrome, Firefox, Edge e Opera que gera dados de teste: CPF e CNPJ válidos, CEP real com endereço, e preenche o formulário com um atalho.'
export const TITULO_DA_PRIVACIDADE = 'Política de privacidade do Botaí'
export const DESCRICAO_DA_PRIVACIDADE =
  'Como o Botaí trata os dados: nada sai do seu navegador. O que a extensão acessa, o que guarda, as permissões de cada navegador e como apagar a pessoa gerada.'
export const TITULO_DOS_TERMOS = 'Termos de uso do Botaí'
export const DESCRICAO_DOS_TERMOS =
  'Termos de uso do Botaí: dados fictícios só para teste, o que é proibido (fraude, cadastro real, burlar verificação), a licença MIT, garantias e o foro.'

export const COR_DO_TEMA_CLARO = '#f7f9fc'
export const COR_DO_TEMA_ESCURO = '#090b11'

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
      siteName: NOME,
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
    applicationName: NOME,
    creator: 'PiluTech',
    publisher: 'PiluTech',
    formatDetection: { telephone: false, address: false, email: false },
    ...(google ? { verification: { google } } : {}),
  }
}

export const VIEWPORT: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: COR_DO_TEMA_CLARO },
    { media: '(prefers-color-scheme: dark)', color: COR_DO_TEMA_ESCURO },
  ],
}
