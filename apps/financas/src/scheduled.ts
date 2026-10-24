import { codigoDoErro } from '@piluvitu/ia/erros'
import { mesFortaleza } from '@piluvitu/ia/uso'
import { gerarInsight } from './domain/insight-gerar'
import { existeInsightDoMesFechado } from './domain/insights'
import { addMonthsToCompetence } from './lib/dates'
import type { IaBindings } from './lib/ia'

type Env = { DB: D1Database } & IaBindings

export async function scheduled(
  controller: ScheduledController,
  env: Env,
  _ctx: ExecutionContext,
): Promise<void> {
  const competencia = addMonthsToCompetence(
    mesFortaleza(new Date(controller.scheduledTime)),
    -1,
  )
  try {
    if (await existeInsightDoMesFechado(env.DB, competencia)) return
    await gerarInsight(env, competencia)
  } catch (err) {
    // Só o código e a mensagem traduzida: o erro cru da SDK pode trazer o
    // corpo da API, e o corpo do 401 ecoa o começo da chave.
    const erro = codigoDoErro(err)
    console.error(
      'cron do insight falhou',
      competencia,
      erro ? `${erro.code}: ${erro.message}` : err,
    )
  }
}
