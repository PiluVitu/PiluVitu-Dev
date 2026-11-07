import { Hono } from 'hono'
import {
  createGoal,
  deleteGoal,
  listGoals,
  updateGoal,
  type NewGoal,
} from '../domain/goals'
import { todayInTeresina } from '../lib/dates'
import { errJson, okJson } from '../lib/envelope'
import { friendlyConstraintMessage, logConstraintError } from '../lib/errors'

type Env = { Bindings: { DB: D1Database } }

export const goalsRoutes = new Hono<Env>()

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

async function lerCorpo(req: Request): Promise<NewGoal | Response> {
  try {
    const body = (await req.json()) as NewGoal
    if (body === null || typeof body !== 'object')
      return errJson(
        400,
        'invalid_json',
        'corpo da requisição não é um objeto JSON',
      )
    return body
  } catch {
    return errJson(400, 'invalid_json', 'corpo da requisição não é JSON válido')
  }
}

goalsRoutes.get('/', async (c) =>
  okJson(await listGoals(c.env.DB, todayInTeresina())),
)

goalsRoutes.post('/', async (c) => {
  const body = await lerCorpo(c.req.raw)
  if (body instanceof Response) return body
  try {
    return okJson(await createGoal(c.env.DB, body), 201)
  } catch (err) {
    return toValidationError('POST /api/goals', err)
  }
})

goalsRoutes.put('/:id', async (c) => {
  const body = await lerCorpo(c.req.raw)
  if (body instanceof Response) return body
  try {
    const meta = await updateGoal(c.env.DB, c.req.param('id'), body)
    if (!meta) return errJson(404, 'not_found', 'meta não encontrada')
    return okJson(meta)
  } catch (err) {
    return toValidationError('PUT /api/goals', err)
  }
})

goalsRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  if (!(await deleteGoal(c.env.DB, id)))
    return errJson(404, 'not_found', 'meta não encontrada')
  return okJson({ id, deleted: true })
})
