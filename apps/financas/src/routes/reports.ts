import { Hono } from 'hono'
import {
  byCategory,
  commitments,
  DEFAULT_FIXED_NET_CENTS,
} from '../domain/reports'
import { errJson, okJson } from '../lib/envelope'

type Env = { Bindings: { DB: D1Database } }

export const reportsRoutes = new Hono<Env>()

reportsRoutes.get('/commitments', async (c) => {
  const from = c.req.query('from') ?? ''
  const months = Number(c.req.query('months') ?? '6')
  const fixed = Number(
    c.req.query('fixed_net_cents') ?? String(DEFAULT_FIXED_NET_CENTS),
  )

  try {
    const report = await commitments(c.env.DB, {
      from,
      months,
      fixed_net_cents:
        Number.isFinite(fixed) && fixed > 0 ? fixed : DEFAULT_FIXED_NET_CENTS,
    })
    return okJson(report)
  } catch (err) {
    // RangeError so pode vir das duas validacoes explicitas de commitments()
    // (formato de `from`, janela de `months`) — as duas sao query malformada,
    // por isso 400 (nao o 422 usado quando o RangeError vem de um CAMPO de
    // corpo calendarialmente invalido, como em installments.ts/accounts.ts).
    if (err instanceof RangeError) {
      return errJson(400, 'invalid_query', err.message)
    }
    throw err
  }
})

reportsRoutes.get('/by-category', async (c) => {
  const competence = c.req.query('competence') ?? ''

  try {
    const report = await byCategory(c.env.DB, { competence })
    return okJson(report)
  } catch (err) {
    // RangeError vem de addMonthsToCompetence (via byCategory), disparado
    // pelo formato de `competence` invalido/ausente — e query string, por
    // isso 400 invalid_query, nunca 422 (mesmo padrao de /commitments acima).
    if (err instanceof RangeError) {
      return errJson(400, 'invalid_query', err.message)
    }
    throw err
  }
})
