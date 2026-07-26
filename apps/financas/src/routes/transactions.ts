import { Hono } from 'hono'
import {
  createTransaction,
  createTransfer,
  listTransactions,
  type NewTransaction,
} from '../domain/transactions'
import { errJson, okJson } from '../lib/envelope'

type Env = { Bindings: { DB: D1Database } }

type NewTransfer = {
  from_account_id: string
  to_account_id: string
  amount_cents: number
  date: string
  description: string
}

// CHECK/FK do schema (amount_cents <> 0, moeda sem valor original) chegam como
// D1_ERROR. Sao erro do usuario, nao do servidor: viram 422, nunca 500.
function isConstraint(e: unknown): e is Error {
  return (
    e instanceof Error && /SQLITE_CONSTRAINT|constraint failed/i.test(e.message)
  )
}

export const transactionsRoutes = new Hono<Env>()

transactionsRoutes.get('/transactions', async (c) => {
  const limitRaw = c.req.query('limit')
  const limit = limitRaw === undefined ? undefined : Number(limitRaw)
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
    return errJson(422, 'invalid_limit', 'limit deve ser um inteiro >= 1')
  }
  const rows = await listTransactions(c.env.DB, {
    account_id: c.req.query('account_id'),
    from: c.req.query('from'),
    to: c.req.query('to'),
    limit,
  })
  return okJson(rows)
})

transactionsRoutes.post('/transactions', async (c) => {
  let body: NewTransaction
  try {
    body = await c.req.json<NewTransaction>()
  } catch {
    return errJson(400, 'invalid_json', 'corpo da requisicao nao e JSON valido')
  }
  try {
    return okJson(await createTransaction(c.env.DB, body), 201)
  } catch (e) {
    if (e instanceof RangeError) return errJson(422, 'invalid_entry', e.message)
    if (isConstraint(e)) return errJson(422, 'constraint_violation', e.message)
    throw e
  }
})

transactionsRoutes.post('/transfers', async (c) => {
  let body: NewTransfer
  try {
    body = await c.req.json<NewTransfer>()
  } catch {
    return errJson(400, 'invalid_json', 'corpo da requisicao nao e JSON valido')
  }
  try {
    return okJson(await createTransfer(c.env.DB, body), 201)
  } catch (e) {
    if (e instanceof RangeError)
      return errJson(422, 'invalid_transfer', e.message)
    if (isConstraint(e)) return errJson(422, 'constraint_violation', e.message)
    throw e
  }
})
