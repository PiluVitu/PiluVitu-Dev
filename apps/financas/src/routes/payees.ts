import { Hono } from 'hono'
import {
  createPayee,
  listPayees,
  updatePayee,
  type PayeeKind,
  type PayeePatch,
} from '../domain/payees'
import { errJson, okJson } from '../lib/envelope'
import { friendlyConstraintMessage, logConstraintError } from '../lib/errors'

// Local, não importado de '../index' — mesma convenção de accounts.ts,
// transactions.ts, installments.ts, debts.ts e reports.ts: evita ciclo de
// import valor↔tipo entre a rota e src/index.ts.
type Env = { Bindings: { DB: D1Database } }

const KINDS: PayeeKind[] = ['person', 'merchant', 'government', 'self_entity']

function isKind(value: unknown): value is PayeeKind {
  return typeof value === 'string' && (KINDS as string[]).includes(value)
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

/**
 * ⚠️ Campo protegido é RECUSA, nunca "ignora e segue" — mesma regra e mesmo
 * código (`protected_field` + `field`) de `PATCH /api/transactions/:id`.
 */
const PROTECTED_FIELDS: Record<string, string> = {
  norm_name:
    'norm_name não é editável: ele é DERIVADO do name (caixa alta, sem acento, sem sufixo de maquininha/cidade) e é a chave de matching do import. Mude o name — o norm_name é recalculado junto, sempre.',
  kind: 'kind não é editável por aqui: esta rota corrige nome, documento e categoria padrão. Se o tipo estiver errado, crie o payee certo.',
  id: 'id não é editável.',
  created_at: 'created_at não é editável.',
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

/**
 * PUT parcial — só os campos PRESENTES no corpo entram no UPDATE. É o que
 * permite CORRIGIR um payee já criado e, principalmente, ENSINAR nele a
 * categoria padrão: sem esta rota, `payees.default_category_id` era gravável
 * só no INSERT, e o único chamador da SPA nunca o mandava — a sugestão do
 * import (`payee-suggest.ts` → `importar.tsx`) lia exatamente esse campo e
 * portanto vinha SEMPRE sem categoria.
 */
payeesRoutes.put('/:id', async (c) => {
  const id = c.req.param('id')
  let body: Record<string, unknown>
  try {
    body = await c.req.json<Record<string, unknown>>()
  } catch {
    return errJson(400, 'invalid_json', 'corpo da requisicao nao e JSON valido')
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return errJson(400, 'invalid_json', 'corpo precisa ser um objeto JSON')
  }

  // Antes de qualquer escrita, e valendo pro corpo inteiro.
  for (const campo of Object.keys(body)) {
    const recusa = PROTECTED_FIELDS[campo]
    if (recusa) return errJson(422, 'protected_field', recusa, campo)
  }

  const patch: PayeePatch = {}

  if ('name' in body) {
    if (typeof body.name !== 'string')
      return errJson(422, 'constraint_violation', 'name invalido', 'name')
    patch.name = body.name
  }
  if ('document' in body) {
    if (!isNullableString(body.document))
      return errJson(
        422,
        'constraint_violation',
        'document invalido',
        'document',
      )
    patch.document = body.document
  }
  if ('default_category_id' in body) {
    if (!isNullableString(body.default_category_id))
      return errJson(
        422,
        'constraint_violation',
        'default_category_id invalido',
        'default_category_id',
      )
    patch.default_category_id = body.default_category_id
  }

  try {
    const atualizado = await updatePayee(c.env.DB, id, patch)
    if (!atualizado)
      return errJson(404, 'not_found', `payee ${id} nao encontrado`)
    return okJson(atualizado)
  } catch (err) {
    if (err instanceof RangeError)
      return errJson(422, 'constraint_violation', err.message)
    // FK real do schema: payees.default_category_id REFERENCES categories(id).
    // Categoria inexistente cai aqui — a mensagem crua (com nome de
    // tabela/coluna) só vai pro console, nunca pro cliente.
    const message = err instanceof Error ? err.message : String(err)
    if (/SQLITE_CONSTRAINT|constraint failed/i.test(message)) {
      logConstraintError('PUT /payees/:id', message)
      return errJson(
        422,
        'constraint_violation',
        friendlyConstraintMessage(message),
      )
    }
    throw err
  }
})
