import { Hono } from 'hono'
import {
  ImportError,
  type ImportRow,
  importTransactions,
} from '../domain/import'
import { errJson, okJson } from '../lib/envelope'
import { friendlyConstraintMessage, logConstraintError } from '../lib/errors'

type Env = { Bindings: { DB: D1Database } }

type Body = {
  account_id?: unknown
  import_source?: unknown
  rows?: unknown
}

export const importRoutes = new Hono<Env>()

// CHECK/UNIQUE do schema (amount_cents <> 0, uq_tx_imported) chegam como
// D1_ERROR. São erro do usuário, não do servidor: viram 422, nunca 500 cru
// — mesma convenção de routes/transactions.ts#isConstraint.
function isConstraint(e: unknown): e is Error {
  return (
    e instanceof Error && /SQLITE_CONSTRAINT|constraint failed/i.test(e.message)
  )
}

importRoutes.post('/transactions/import', async (c) => {
  let body: Body
  try {
    body = await c.req.json<Body>()
  } catch {
    return errJson(400, 'invalid_json', 'corpo da requisição não é JSON válido')
  }

  if (typeof body?.account_id !== 'string' || body.account_id === '') {
    return errJson(400, 'invalid_json', 'account_id é obrigatório')
  }
  if (typeof body.import_source !== 'string' || body.import_source === '') {
    return errJson(400, 'invalid_json', 'import_source é obrigatório')
  }
  if (!Array.isArray(body.rows)) {
    return errJson(400, 'invalid_json', 'rows deve ser um array')
  }

  try {
    const result = await importTransactions(c.env.DB, {
      account_id: body.account_id,
      import_source: body.import_source,
      rows: body.rows as ImportRow[],
    })
    return okJson(result, 201)
  } catch (err) {
    if (err instanceof ImportError) {
      return errJson(422, err.code, err.message)
    }
    if (isConstraint(err)) {
      logConstraintError('POST /transactions/import', err.message)
      return errJson(
        422,
        'constraint_violation',
        friendlyConstraintMessage(err.message),
      )
    }
    throw err
  }
})
