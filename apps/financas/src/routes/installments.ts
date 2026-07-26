import { Hono } from 'hono'
import {
  createInstallmentPlan,
  InstallmentPlanError,
} from '../domain/installments'
import { errJson, okJson } from '../lib/envelope'

type Env = { Bindings: { DB: D1Database } }

type Body = {
  account_id?: unknown
  description?: unknown
  total_cents?: unknown
  installments_count?: unknown
  purchase_date?: unknown
  payee_id?: unknown
  category_id?: unknown
  is_business?: unknown
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export const installmentPlansRoutes = new Hono<Env>()

installmentPlansRoutes.post('/', async (c) => {
  let body: Body
  try {
    body = await c.req.json<Body>()
  } catch {
    return errJson(400, 'invalid_json', 'corpo da requisição não é JSON válido')
  }

  if (typeof body?.account_id !== 'string' || body.account_id === '') {
    return errJson(400, 'invalid_json', 'account_id é obrigatório')
  }
  if (typeof body.description !== 'string' || body.description.trim() === '') {
    return errJson(400, 'invalid_json', 'description é obrigatória')
  }
  if (
    typeof body.total_cents !== 'number' ||
    !Number.isInteger(body.total_cents)
  ) {
    return errJson(
      400,
      'invalid_json',
      'total_cents deve ser inteiro em centavos',
    )
  }
  if (
    typeof body.installments_count !== 'number' ||
    !Number.isInteger(body.installments_count)
  ) {
    return errJson(400, 'invalid_json', 'installments_count deve ser inteiro')
  }
  if (
    typeof body.purchase_date !== 'string' ||
    !DATE_RE.test(body.purchase_date)
  ) {
    return errJson(
      400,
      'invalid_json',
      'purchase_date deve estar no formato YYYY-MM-DD',
    )
  }

  try {
    const result = await createInstallmentPlan(c.env.DB, {
      account_id: body.account_id,
      description: body.description,
      total_cents: body.total_cents,
      installments_count: body.installments_count,
      purchase_date: body.purchase_date,
      payee_id: typeof body.payee_id === 'string' ? body.payee_id : null,
      category_id:
        typeof body.category_id === 'string' ? body.category_id : null,
      is_business: body.is_business === true,
    })
    return okJson(result, 201)
  } catch (err) {
    if (err instanceof InstallmentPlanError) {
      return errJson(422, err.code, err.message)
    }
    // RangeError cru: não vem só de validação explícita do domínio, também
    // sobe de lib/dates.ts (billCompetence/addMonthsToCompetence/
    // competenceDueDate) quando purchase_date passa no regex de FORMATO do
    // body (acima) mas é calendarialmente inválida (ex.: mês 13) — o regex
    // não valida calendário, só shape. Mesma convenção de accounts.ts e
    // transactions.ts: RangeError do domínio vira 422, nunca escapa cru para
    // o handler default do Hono (que devolveria 500 sem envelope).
    if (err instanceof RangeError) {
      return errJson(422, 'constraint_violation', err.message)
    }
    if (
      err instanceof Error &&
      /SQLITE_CONSTRAINT|constraint failed/i.test(err.message)
    ) {
      return errJson(422, 'constraint_violation', err.message)
    }
    throw err
  }
})
