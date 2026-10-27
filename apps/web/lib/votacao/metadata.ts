import type { Metadata } from 'next'
import { VOTAI_ORIGEM } from '@/lib/votai'

const DESCRICAO =
  'Votaí: a votação de filmes da turma, com a lista da noite e o histórico das votações anteriores.'

/** Metadata das telas do Votaí; o canonical aponta sempre para o host de produção. */
export function metadataDoVotai({
  titulo,
  caminho,
  descricao = DESCRICAO,
  indexavel,
}: {
  titulo: string
  caminho: string
  descricao?: string
  indexavel: boolean
}): Metadata {
  const url = `${VOTAI_ORIGEM.producao}${caminho}`
  return {
    title: { absolute: titulo },
    description: descricao,
    alternates: { canonical: url },
    robots: { index: indexavel, follow: true },
    openGraph: {
      type: 'website',
      locale: 'pt_BR',
      siteName: 'Votaí',
      url,
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
