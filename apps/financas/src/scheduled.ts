import { codigoDoErro } from '@piluvitu/ia/erros'
import { mesFortaleza } from '@piluvitu/ia/uso'
import { gerarInsight } from './domain/insight-gerar'
import { existeInsightDoMesFechado } from './domain/insights'
import { generateRecurringOccurrences } from './domain/recurring-auto'
import { addMonthsToCompetence, todayInTeresina } from './lib/dates'
import { errorCode } from './lib/errors'
import type { IaBindings } from './lib/ia'

type Env = { DB: D1Database } & IaBindings

const CRON_INSIGHT = '0 12 1 * *'
const CRON_RECORRENCIA = '0 9 * * *'

export async function scheduled(
  controller: ScheduledController,
  env: Env,
  _ctx: ExecutionContext,
): Promise<void> {
  if (controller.cron === CRON_INSIGHT) {
    return insightDoMesFechado(env, controller.scheduledTime)
  }
  if (controller.cron === CRON_RECORRENCIA) {
    return recorrenciaDoDia(env.DB, controller.scheduledTime)
  }
  console.error('cron desconhecido', controller.cron)
}

async function insightDoMesFechado(
  env: Env,
  scheduledTime: number,
): Promise<void> {
  const competencia = addMonthsToCompetence(
    mesFortaleza(new Date(scheduledTime)),
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

async function recorrenciaDoDia(
  db: D1Database,
  scheduledTime: number,
): Promise<void> {
  const today = todayInTeresina(new Date(scheduledTime))
  try {
    const r = await generateRecurringOccurrences(db, { today })
    console.log(
      'recorrência automática',
      today,
      `gerados=${r.gerados} vinculados=${r.vinculados} sem_conta=${r.sem_conta} falhas=${r.falhas}`,
    )
  } catch (err) {
    console.error('cron da recorrência falhou', today, errorCode(err))
  }
}
