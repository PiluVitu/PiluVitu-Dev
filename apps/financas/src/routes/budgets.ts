import { Hono } from 'hono'
import {
  budgetReport,
  copyPreviousMonth,
  deleteBudget,
  MesInvalidoError,
  setBudget,
} from '../domain/budgets'
import { errJson, okJson } from '../lib/envelope'
import { friendlyConstraintMessage, logConstraintError } from '../lib/errors'

type Env = { Bindings: { DB: D1Database } }

export const budgetsRoutes = new Hono<Env>()

// Mês (query/caminho) malformado é 400; campo de corpo ou categoria é 422.
function mesInvalido(err: unknown): Response | null {
  if (err instanceof MesInvalidoError)
    return errJson(400, 'invalid_query', err.message)
  return null
}

function toValidationError(context: string, err: unknown): Response {
  if (err instanceof RangeError)
    return errJson(422, 'constraint_violation', err.message)
  const message = err instanceof Error ? err.message : String(err)
  if (/SQLITE_CONSTRAINT|constraint failed/i.test(message)) {
    logConstraintError(context, message)
    return errJson(
      422,
      'constraint_violation',
      friendlyConstraintMessage(message),
    )
  }
  throw err
}

budgetsRoutes.get('/', async (c) => {
  try {
    return okJson(await budgetReport(c.env.DB, c.req.query('month') ?? ''))
  } catch (err) {
    return mesInvalido(err) ?? toValidationError('GET /api/budgets', err)
  }
})

budgetsRoutes.put('/:month/:categoryId', async (c) => {
  let body: { amount_cents?: unknown }
  try {
    body = await c.req.json()
  } catch {
    return errJson(400, 'invalid_json', 'corpo da requisição não é JSON válido')
  }
  const month = c.req.param('month')
  const categoryId = c.req.param('categoryId')
  try {
    return okJson(
      await setBudget(
        c.env.DB,
        month,
        categoryId,
        body?.amount_cents as number,
      ),
    )
  } catch (err) {
    return mesInvalido(err) ?? toValidationError('PUT /api/budgets', err)
  }
})

budgetsRoutes.delete('/:month/:categoryId', async (c) => {
  const month = c.req.param('month')
  const categoryId = c.req.param('categoryId')
  try {
    if (!(await deleteBudget(c.env.DB, month, categoryId)))
      return errJson(404, 'not_found', 'orçamento não encontrado')
    return okJson({ month, category_id: categoryId, deleted: true })
  } catch (err) {
    return mesInvalido(err) ?? toValidationError('DELETE /api/budgets', err)
  }
})

budgetsRoutes.post('/:month/copy-previous', async (c) => {
  try {
    return okJson(await copyPreviousMonth(c.env.DB, c.req.param('month')))
  } catch (err) {
    return mesInvalido(err) ?? toValidationError('POST /api/budgets', err)
  }
})
