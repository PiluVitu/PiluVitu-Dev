import type { Metadata } from 'next'
import { metadataDoVotai } from '@/lib/votacao/metadata'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  return metadataDoVotai({
    titulo: 'Votação | Votaí',
    caminho: `/${id}`,
    indexavel: false,
  })
}

export default function SessaoLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children
}
