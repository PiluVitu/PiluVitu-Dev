import type { Metadata } from 'next'
import { metadataDoVotai } from '@/lib/votacao/metadata'

export const metadata: Metadata = metadataDoVotai({
  titulo: 'Votaí',
  caminho: '/',
  indexavel: false,
})

export default function VotaiLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children
}
