import { codigoDoErro } from '@piluvitu/ia/erros'
import { mesFortaleza } from '@piluvitu/ia/uso'
import { enviarAlertas, type ResultadoDosAlertas } from './domain/alertas'
import { configuracaoDoEnvio, registrarEnvio } from './domain/alertas-envio'
import { gerarInsight } from './domain/insight-gerar'
import { existeInsightDoMesFechado } from './domain/insights'
import { generateRecurringOccurrences } from './domain/recurring-auto'
import { alertasLigados } from './domain/settings'
import { addMonthsToCompetence, nowIsoUtc, todayInTeresina } from './lib/dates'
import { enviadorDeAlertas } from './lib/envio-email'
import { errorCode } from './lib/errors'
import type { IaBindings } from './lib/ia'

/** Envio dos alertas por e-mail; ver "Alertas por e-mail" no CLAUDE.md. */
export type AlertasBindings = {
  EMAIL?: SendEmail
  ALERTAS_REMETENTE?: string
  ALERTAS_ENVIO?: string
}

type Env = {
  DB: D1Database
  ALLOWED_EMAIL?: string
  BETTER_AUTH_URL?: string
} & IaBindings &
  AlertasBindings

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
    const today = todayInTeresina(new Date(controller.scheduledTime))
    await recorrenciaDoDia(env.DB, today)
    return alertasPorEmail(env, today)
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

async function recorrenciaDoDia(db: D1Database, today: string): Promise<void> {
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

function alertasNaoRodaram(today: string, codigo: string): void {
  console.error('alertas por e-mail não rodaram', today, codigo)
}

async function alertasPorEmail(env: Env, today: string): Promise<void> {
  const { DB } = env
  const config = configuracaoDoEnvio(env)
  if (config.falta) return alertasNaoRodaram(today, config.falta)
  let r: ResultadoDosAlertas
  try {
    r = await enviarAlertas(DB, {
      today,
      enviar: enviadorDeAlertas(config),
      para: config.para,
      de: config.de,
      appUrl: env.BETTER_AUTH_URL ?? '',
      ligado: await alertasLigados(DB),
    })
    console.log(
      'alertas por e-mail',
      today,
      `status=${r.status} enviados=${r.enviados}${r.codigo ? ` codigo=${r.codigo}` : ''}`,
    )
  } catch (err) {
    console.error('cron dos alertas falhou', today, errorCode(err))
    return
  }
  if (r.status !== 'enviado' && r.status !== 'falhou') return
  try {
    await registrarEnvio(DB, config, {
      resultado: r.status,
      codigo: r.codigo,
      em: nowIsoUtc(),
    })
  } catch (err) {
    console.error('alertas: estado do envio não gravado', today, errorCode(err))
  }
}
