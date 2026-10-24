import { Hono } from 'hono'
import { gerarInsight } from '../domain/insight-gerar'
import { insightNumbers, latestInsight } from '../domain/insights'
import { type AuthBindings } from '../lib/auth'
import { addMonthsToCompetence, todayInTeresina } from '../lib/dates'
import { errJson, okJson } from '../lib/envelope'
import { type IaBindings, respostaDeErroIa } from '../lib/ia'

// Convenção de módulo: type Env LOCAL, nunca import de Bindings de ../index
// (evita ciclo de import valor↔tipo).
type Env = { Bindings: AuthBindings & IaBindings }

export const insightsRoutes = new Hono<Env>()

insightsRoutes.get('/insights/latest', async (c) => {
  const insight = await latestInsight(c.env.DB)
  return okJson(insight)
})

insightsRoutes.get('/insights/numbers', async (c) => {
  const competence = c.req.query('competence') ?? ''

  try {
    const numbers = await insightNumbers(c.env.DB, { competence })
    return okJson(numbers)
  } catch (err) {
    // Query string malformada é 400, nunca 422 (mesmo padrão de routes/reports.ts).
    if (err instanceof RangeError) {
      return errJson(400, 'invalid_query', err.message)
    }
    throw err
  }
})

function competenciaDoCorpo(
  valor: unknown,
): { ok: true; competence: string } | { ok: false; res: Response } {
  if (valor === undefined || valor === null) {
    return { ok: true, competence: todayInTeresina().slice(0, 7) }
  }
  if (typeof valor !== 'string') {
    return {
      ok: false,
      res: errJson(
        422,
        'invalid_competence',
        'competence precisa ser uma string YYYY-MM',
        'competence',
      ),
    }
  }
  try {
    return { ok: true, competence: addMonthsToCompetence(valor, 0) }
  } catch (err) {
    if (err instanceof RangeError) {
      return {
        ok: false,
        res: errJson(422, 'invalid_competence', err.message, 'competence'),
      }
    }
    throw err
  }
}

insightsRoutes.post('/insights/generate', async (c) => {
  let corpo: { competence?: unknown }
  try {
    corpo = await c.req.json()
  } catch {
    return errJson(400, 'invalid_json', 'corpo da requisicao nao e JSON valido')
  }

  const competencia = competenciaDoCorpo(corpo?.competence)
  if (!competencia.ok) return competencia.res

  try {
    const insight = await gerarInsight(c.env, competencia.competence)
    return okJson(insight)
  } catch (err) {
    return respostaDeErroIa(err)
  }
})
