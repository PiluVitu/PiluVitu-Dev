import { Hono } from 'hono'
import { createPayee, listPayees, type PayeeKind } from '../domain/payees'
import { errJson, okJson } from '../lib/envelope'

// Local, não importado de '../index' — mesma convenção de accounts.ts,
// transactions.ts, installments.ts, debts.ts e reports.ts: evita ciclo de
// import valor↔tipo entre a rota e src/index.ts.
type Env = { Bindings: { DB: D1Database } }

const KINDS: PayeeKind[] = ['person', 'merchant', 'government', 'self_entity']

function isKind(value: unknown): value is PayeeKind {
  return typeof value === 'string' && (KINDS as string[]).includes(value)
}

export const payeesRoutes = new Hono<Env>()

payeesRoutes.get('/', async (c) => {
  const kindParam = c.req.query('kind')
  if (kindParam !== undefined && !isKind(kindParam)) {
    return errJson(
      400,
      'invalid_query',
      'kind precisa ser person, merchant, government ou self_entity',
    )
  }
  const kind = kindParam as PayeeKind | undefined
  return okJson(await listPayees(c.env.DB, { kind }))
})

payeesRoutes.post('/', async (c) => {
  let body: Record<string, unknown>
  try {
    body = await c.req.json<Record<string, unknown>>()
  } catch {
    return errJson(400, 'invalid_json', 'corpo da requisicao nao e JSON valido')
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (name === '')
    return errJson(422, 'constraint_violation', 'name e obrigatorio')
  if (!isKind(body.kind))
    return errJson(422, 'constraint_violation', 'kind invalido')

  try {
    const payee = await createPayee(c.env.DB, {
      name,
      kind: body.kind,
      document: typeof body.document === 'string' ? body.document : null,
      default_category_id:
        typeof body.default_category_id === 'string'
          ? body.default_category_id
          : null,
    })
    return okJson(payee, 201)
  } catch {
    return errJson(
      422,
      'constraint_violation',
      'nao foi possivel gravar o payee',
    )
  }
})
