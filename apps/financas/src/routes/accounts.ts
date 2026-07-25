import { Hono } from 'hono'
import {
  accountBalances,
  archiveAccount,
  createAccount,
  listAccounts,
  type NewAccount,
  type Scope,
} from '../domain/accounts'
import { errJson, okJson } from '../lib/envelope'

type Env = { Bindings: { DB: D1Database } }

export const accountsRoutes = new Hono<Env>()

accountsRoutes.get('/accounts', async (c) => {
  const scope = c.req.query('scope')
  if (scope !== undefined && scope !== 'PJ' && scope !== 'PF') {
    return errJson(422, 'invalid_scope', "scope aceita apenas 'PJ' ou 'PF'")
  }
  const includeArchived = c.req.query('archived') === '1'

  const [contas, saldos] = await Promise.all([
    listAccounts(c.env.DB, {
      scope: scope as Scope | undefined,
      includeArchived,
    }),
    accountBalances(c.env.DB),
  ])
  const porConta = new Map(saldos.map((s) => [s.account_id, s.balance_cents]))
  return okJson(
    contas.map((a) => ({
      ...a,
      balance_cents: porConta.get(a.id) ?? a.opening_balance_cents,
    })),
  )
})

accountsRoutes.post('/accounts', async (c) => {
  let body: NewAccount
  try {
    body = await c.req.json<NewAccount>()
  } catch {
    return errJson(400, 'invalid_json', 'corpo da requisicao nao e JSON valido')
  }
  try {
    return okJson(await createAccount(c.env.DB, body), 201)
  } catch (e) {
    if (e instanceof RangeError)
      return errJson(422, 'invalid_account', e.message)
    if (
      e instanceof Error &&
      /SQLITE_CONSTRAINT|constraint failed/i.test(e.message)
    ) {
      return errJson(422, 'constraint_violation', e.message)
    }
    throw e
  }
})

accountsRoutes.post('/accounts/:id/archive', async (c) => {
  const id = c.req.param('id')
  await archiveAccount(c.env.DB, id)
  return okJson({ id, archived: true })
})
