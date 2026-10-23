import type { Meta, StoryObj } from '@storybook/nextjs'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HalloweenRoleta } from './halloween-roleta'
import { HalloweenHeading, HalloweenScope } from './halloween-scope'
import type { SessionMovie } from '@/lib/votacao/types'

function filme(ID: number, Title: string): SessionMovie {
  return {
    ID,
    SessionID: 1,
    Category: 'terror',
    Title,
    Type: 'filme',
    PosterURL: '',
    WasWatched: false,
  }
}

const POUCOS = [
  filme(1, 'Corra!'),
  filme(2, 'Sinners'),
  filme(3, 'Fale Comigo'),
  filme(4, 'O Macaco'),
  filme(5, 'Herege'),
]

const TODOS = [
  'A Entidade',
  'A Hora do Mal',
  'A Lenda de Candyman',
  'A Morte do Demônio',
  'Bring Her Back',
  'Casamento Sangrento',
  'Corra!',
  'Doce Vingança',
  'Donnie Darko',
  'Drácula de Bram Stoker',
  'Exhuma',
  'Fale Comigo',
  'Herege',
  'Imaculada',
  'Invasão Zumbi',
  'Jogo Perigoso',
  'Nós',
  'O Homem Invisível',
  'O Macaco',
  'Sinners',
].map((t, i) => filme(i + 1, t))

const meta: Meta<typeof HalloweenRoleta> = {
  title: 'Votacao/HalloweenRoleta',
  component: HalloweenRoleta,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <QueryClientProvider client={new QueryClient()}>
        <HalloweenScope>
          <div className="mx-auto max-w-4xl space-y-8 px-6 py-16">
            <HalloweenHeading title="Noite de Halloween" roleta />
            <Story />
          </div>
        </HalloweenScope>
      </QueryClientProvider>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof HalloweenRoleta>

/** Admin com a sessão aberta: o botão captura a entropia e gira. */
export const Admin: Story = {
  args: { sessionId: 1, movies: POUCOS, isAdmin: true, winnerMovieId: null },
}

/** Quem não é admin só vê os candidatos e espera o giro. */
export const Visitante: Story = {
  args: { sessionId: 1, movies: POUCOS, isAdmin: false, winnerMovieId: null },
}

/** Mais de 12 filmes: os nomes saem da roda e ficam só na lista. */
export const MuitosFilmes: Story = {
  args: { sessionId: 1, movies: TODOS, isAdmin: true, winnerMovieId: null },
}

/** Sessão encerrada: mostra o vencedor gravado. */
export const Encerrada: Story = {
  args: { sessionId: 1, movies: POUCOS, isAdmin: false, winnerMovieId: 2 },
}
