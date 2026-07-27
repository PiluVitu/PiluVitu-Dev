import { Hono } from 'hono'
import {
  byCategory,
  commitments,
  DEFAULT_FIXED_NET_CENTS,
} from '../domain/reports'
import { getFixedNetCents } from '../domain/settings'
import { errJson, okJson } from '../lib/envelope'

type Env = { Bindings: { DB: D1Database } }

export const reportsRoutes = new Hono<Env>()

/**
 * Precedência (Task 10): `?fixed_net_cents=` explícito na query > valor
 * SALVO em `settings` (`PUT /api/settings`) > `DEFAULT_FIXED_NET_CENTS`. A
 * query é só o atalho de depuração/preview que já existia antes desta
 * task — nunca grava nada; só o PUT persiste. Sem override na query, o
 * default deixou de ser `DEFAULT_FIXED_NET_CENTS` direto e passou a ser
 * `getFixedNetCents(db)`, que por sua vez já cai de volta no mesmo
 * `DEFAULT_FIXED_NET_CENTS` quando nada foi salvo — o piso R$ 3.600
 * continua sendo o que aparece sem nenhuma configuração feita.
 */
async function resolveFixedNetCents(
  db: D1Database,
  queryValue: string | undefined,
): Promise<number> {
  if (queryValue !== undefined) {
    const n = Number(queryValue)
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_FIXED_NET_CENTS
  }
  return getFixedNetCents(db)
}

reportsRoutes.get('/commitments', async (c) => {
  const from = c.req.query('from') ?? ''
  const months = Number(c.req.query('months') ?? '6')
  const fixed_net_cents = await resolveFixedNetCents(
    c.env.DB,
    c.req.query('fixed_net_cents'),
  )

  try {
    const report = await commitments(c.env.DB, {
      from,
      months,
      fixed_net_cents,
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
