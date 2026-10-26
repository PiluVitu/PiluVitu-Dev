import type { Meta, StoryObj } from '@storybook/nextjs'
import { HistoricoCard } from './historico-card'
import {
  roletaDoHistorico,
  sessaoDoHistorico,
} from '@/lib/votacao/historico.fixtures'

const meta: Meta<typeof HistoricoCard> = {
  title: 'Votacao/HistoricoCard',
  component: HistoricoCard,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div className="w-96">
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof HistoricoCard>

export const PorVotos: Story = {
  args: { sessao: sessaoDoHistorico(), href: '/anteriores/12' },
}

export const Desempate: Story = {
  args: {
    sessao: sessaoDoHistorico({
      winner_movie_id: 2,
      winner_method: 'roulette',
    }),
    href: '/anteriores/12',
  },
}

export const RoletaDeHalloween: Story = {
  args: { sessao: roletaDoHistorico(), href: '/anteriores/13' },
}

export const SemVencedor: Story = {
  args: {
    sessao: sessaoDoHistorico({ winner_movie_id: null, movies: [] }),
    href: '/anteriores/12',
  },
}
