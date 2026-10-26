import type { Metadata } from 'next'
import { metadataDoVotai } from '@/lib/votacao/metadata'

export const metadata: Metadata = metadataDoVotai({
  titulo: 'Votações anteriores | Votaí',
  caminho: '/anteriores',
  descricao:
    'As votações de filmes já encerradas no Votaí: os filmes de cada noite, quantos votos cada um teve e o vencedor.',
  indexavel: true,
})

export default function AnterioresLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children
}
