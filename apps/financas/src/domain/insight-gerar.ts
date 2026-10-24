import { comOrcamento } from '@piluvitu/ia/uso'
import { TETOS_FINANCAS } from '../lib/ia'
import { montarPromptInsight } from './insight-prompt'
import { createInsight, insightNumbers, type Insight } from './insights'

export const MODELO_INSIGHT = 'claude-sonnet-5-5'

const SYSTEM_INSIGHT =
  'Você responde só com o parágrafo pedido, em português do Brasil, sem markdown.'

export async function gerarInsight(
  env: { DB: D1Database; ANTHROPIC_API_KEY?: string },
  competence: string,
  opts: { fetch?: typeof fetch } = {},
): Promise<Insight> {
  const numbers = await insightNumbers(env.DB, { competence })
  const resposta = await comOrcamento(
    env.DB,
    {
      feature: 'insight',
      tetoMicro: TETOS_FINANCAS.insight,
      apiKey: env.ANTHROPIC_API_KEY,
      fetch: opts.fetch,
    },
    {
      modelo: MODELO_INSIGHT,
      system: SYSTEM_INSIGHT,
      user: montarPromptInsight(numbers),
      maxTokens: 600,
    },
  )
  return createInsight(env.DB, {
    texto: resposta.texto,
    modelo: MODELO_INSIGHT,
    periodo: numbers.competence,
  })
}
