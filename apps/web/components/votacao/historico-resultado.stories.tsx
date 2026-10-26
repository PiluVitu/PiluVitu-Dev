import type { Meta, StoryObj } from '@storybook/nextjs'
import { HistoricoResultado } from './historico-resultado'
import { HalloweenScope } from './halloween-scope'
import {
  filmeDoHistorico,
  roletaDoHistorico,
  sessaoDoHistorico,
} from '@/lib/votacao/historico.fixtures'

const meta: Meta<typeof HistoricoResultado> = {
  title: 'Votacao/HistoricoResultado',
  component: HistoricoResultado,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-2xl">
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof HistoricoResultado>

export const PorVotos: Story = { args: { sessao: sessaoDoHistorico() } }

export const EmpateComDesempate: Story = {
  args: {
    sessao: sessaoDoHistorico({
      winner_movie_id: 2,
      winner_method: 'roulette',
      total_votes: 4,
      movies: [
        filmeDoHistorico(1, 'A Coisa', 2),
        filmeDoHistorico(2, 'Forrest Gump', 2),
      ],
    }),
  },
}

export const RoletaDeHalloween: Story = {
  args: { sessao: roletaDoHistorico() },
  decorators: [
    (Story) => (
      <HalloweenScope>
        <div className="p-6">
          <Story />
        </div>
      </HalloweenScope>
    ),
  ],
}
