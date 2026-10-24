import type { CartaoLeituraProps } from './insight'
import { CartaoLeitura } from './insight'

// CSF puro, sem tipos do Storybook: o apps/financas/web ainda não tem
// Storybook instalado. insight.test.tsx renderiza cada story.
type Story = { args: Partial<CartaoLeituraProps> }

const meta = {
  title: 'Finanças/Insight/Leitura',
  component: CartaoLeitura,
  args: {
    insight: null,
    insightError: null,
    insightLoaded: true,
    gerando: false,
    geracaoErro: null,
    onGerar: () => {},
  } satisfies CartaoLeituraProps,
}

export default meta

const insightPronto = {
  id: 'story',
  texto:
    'Outubro custou R$ 4.230,00, 12% a menos que setembro. Moradia segue como o maior peso do mês, e Mercado foi o que mais cresceu.',
  modelo: 'claude-sonnet-5-5',
  periodo: '2026-10',
  generated_at: new Date().toISOString(),
}

export const SemInsight: Story = { args: {} }

export const Gerando: Story = { args: { gerando: true } }

export const Pronto: Story = { args: { insight: insightPronto } }

export const TetoAtingido: Story = {
  args: {
    insight: insightPronto,
    geracaoErro:
      'O teto de IA de US$ 2,00 para "insight" em 2026-10 foi atingido (gasto até agora: US$ 2,00). Volta no mês que vem.',
  },
}

export const ClaudeDesligado: Story = {
  args: {
    geracaoErro:
      'A IA está desligada: falta a ANTHROPIC_API_KEY neste Worker (wrangler secret put ANTHROPIC_API_KEY).',
  },
}
