import type { Metadata } from 'next'
import { metadataDoVotai } from '@/lib/votacao/metadata'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  return metadataDoVotai({
    titulo: 'Votação encerrada | Votaí',
    caminho: `/anteriores/${id}`,
    descricao:
      'O resultado de uma votação de filmes encerrada no Votaí: os filmes, a contagem de votos e o vencedor.',
    indexavel: /^[1-9][0-9]*$/.test(id),
  })
}

export default function AnteriorLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children
}
