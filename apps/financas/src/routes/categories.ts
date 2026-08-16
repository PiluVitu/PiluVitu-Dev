import { Hono } from 'hono'
import {
  archiveCategory,
  CATEGORY_KINDS,
  createCategory,
  listCategories,
  updateCategory,
  type CategoryKind,
  type CategoryPatch,
} from '../domain/categories'
import { errJson, okJson } from '../lib/envelope'
import { friendlyConstraintMessage, logConstraintError } from '../lib/errors'

// Local, não importado de '../index' — mesma convenção das demais rotas
// (accounts.ts, transactions.ts, installments.ts, debts.ts, reports.ts,
// payees.ts): evita ciclo de import valor↔tipo com src/index.ts.
type Env = { Bindings: { DB: D1Database } }

// Re-export: o tipo nasceu neste arquivo e migrou pro domínio quando o CRUD
// chegou. Mantido aqui pra quem já importava daqui.
export type { Category } from '../domain/categories'

function isKind(value: unknown): value is CategoryKind {
  return (
    typeof value === 'string' && (CATEGORY_KINDS as string[]).includes(value)
  )
}

/**
 * ⚠️ Campo protegido é RECUSA, nunca "ignora e segue" — mesma regra (e mesmo
 * código `protected_field` + `field`) de `PATCH /api/transactions/:id`.
 * Gravar o que dá e calar sobre o resto responderia 200 pra uma requisição
 * que fez metade do pedido.
 *
 * Assimetria deliberada com o POST: no POST, `slug` (e qualquer outra chave)
 * é IGNORADO, porque a resposta 201 devolve a linha inteira — o cliente lê
 * `"slug": null` no ato e vê exatamente o que foi gravado, sem precisar de
 * um erro pra descobrir. No PUT o cliente manda só o delta e já tem o objeto
 * em mãos: um campo dropado em silêncio vira uma alteração que ele acredita
 * ter feito.
 */
const PROTECTED_FIELDS: Record<string, string> = {
  kind: 'kind não é editável: trocar o tipo de uma categoria que já tem lançamentos reclassificaria o histórico inteiro em silêncio (despesa virando receita, ou virando transferência — que todo relatório de resultado exclui). Crie outra categoria com o tipo certo e mova os lançamentos.',
  slug: 'slug não é editável nem definível pelo cliente: é a identidade que o próprio código procura (a quitação de dívida, o gap da PJ) e vem semeada pela migration. Categoria criada por você nasce sem slug, e é assim que fica.',
  archived_at:
    'archived_at não é editável por aqui: arquivar tem rota própria (POST /api/categories/:id/archive).',
  id: 'id não é editável.',
  created_at: 'created_at não é editável.',
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

/**
 * Traduz erro de domínio/D1 em 422. `RangeError` cobre toda validação em TS
 * (nome vazio, kind fora do enum, hierarquia de 3 níveis, ciclo, mãe com
 * filhas ativas) e sai com a mensagem CRUA do domínio — é ela que nomeia a
 * saída ("arquive as filhas primeiro"). `SQLITE_CONSTRAINT` cru do D1 passa
 * sempre por friendlyConstraintMessage: o texto original (com nome de
 * tabela/coluna) só vai pro console via logConstraintError, nunca pro
 * cliente.
 */
function toValidationError(context: string, err: unknown): Response {
  if (err instanceof RangeError) {
    return errJson(422, 'constraint_violation', err.message)
  }
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

export const categoriesRoutes = new Hono<Env>()

categoriesRoutes.get('/', async (c) => {
  const kind = c.req.query('kind')
  if (kind !== undefined && !isKind(kind)) {
    return errJson(
      400,
      'invalid_query',
      'kind precisa ser income, expense, transfer ou debt_settlement',
    )
  }

  return okJson(await listCategories(c.env.DB, { kind }))
})

categoriesRoutes.post('/', async (c) => {
  let body: Record<string, unknown>
  try {
    body = await c.req.json<Record<string, unknown>>()
  } catch {
    return errJson(400, 'invalid_json', 'corpo da requisicao nao e JSON valido')
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return errJson(400, 'invalid_json', 'corpo precisa ser um objeto JSON')
  }

  if (!isKind(body.kind)) {
    return errJson(
      422,
      'constraint_violation',
      'kind precisa ser income, expense, transfer ou debt_settlement',
      'kind',
    )
  }
  if (body.parent_id !== undefined && !isNullableString(body.parent_id)) {
    return errJson(
      422,
      'constraint_violation',
      'parent_id invalido',
      'parent_id',
    )
  }
  if (
    body.default_scope !== undefined &&
    !isNullableString(body.default_scope)
  ) {
    return errJson(
      422,
      'constraint_violation',
      'default_scope invalido',
      'default_scope',
    )
  }

  try {
    // Só estes quatro campos atravessam. `slug` mandado pelo cliente morre
    // aqui, em silêncio e de propósito — ver o ⚠️ em NewCategory
    // (domain/categories.ts) e a nota de assimetria em PROTECTED_FIELDS.
    const criada = await createCategory(c.env.DB, {
      // name/default_scope: o domínio valida (validateName/validateScope) e
      // devolve RangeError com a mensagem canônica — duplicar o typeof aqui
      // só divergiria dela.
      name: body.name as string,
      kind: body.kind,
      parent_id: (body.parent_id as string | null | undefined) ?? null,
      default_scope:
        (body.default_scope as 'PJ' | 'PF' | null | undefined) ?? null,
    })
    return okJson(criada, 201)
  } catch (err) {
    return toValidationError('POST /categories', err)
  }
})

categoriesRoutes.put('/:id', async (c) => {
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

  // A recusa roda ANTES de qualquer escrita e vale pro corpo INTEIRO:
  // { name, kind } não renomeia e ignora o resto.
  for (const campo of Object.keys(body)) {
    const recusa = PROTECTED_FIELDS[campo]
    if (recusa) return errJson(422, 'protected_field', recusa, campo)
  }

  const patch: CategoryPatch = {}

  if ('name' in body) {
    if (typeof body.name !== 'string')
      return errJson(422, 'constraint_violation', 'name invalido', 'name')
    patch.name = body.name
  }
  if ('default_scope' in body) {
    if (!isNullableString(body.default_scope))
      return errJson(
        422,
        'constraint_violation',
        'default_scope invalido',
        'default_scope',
      )
    patch.default_scope = body.default_scope as 'PJ' | 'PF' | null
  }
  if ('parent_id' in body) {
    if (!isNullableString(body.parent_id))
      return errJson(
        422,
        'constraint_violation',
        'parent_id invalido',
        'parent_id',
      )
    patch.parent_id = body.parent_id
  }

  try {
    const atualizada = await updateCategory(c.env.DB, id, patch)
    // null cobre id inexistente com patch cheio (meta.changes === 0) E id
    // inexistente com patch vazio (SELECT sem linha) — os dois são 404,
    // nunca um 200 fantasma.
    if (!atualizada)
      return errJson(404, 'not_found', `categoria ${id} nao encontrada`)
    return okJson(atualizada)
  } catch (err) {
    return toValidationError('PUT /categories/:id', err)
  }
})

// Transição de estado: função de domínio devolve boolean (meta.changes > 0),
// a rota traduz false em 404 — convenção de accounts.ts#archive. A recusa de
// mãe-com-filhas-ativas vem antes, como RangeError → 422.
categoriesRoutes.post('/:id/archive', async (c) => {
  const id = c.req.param('id')
  try {
    const arquivada = await archiveCategory(c.env.DB, id)
    if (!arquivada) {
      return errJson(
        404,
        'not_found',
        `categoria ${id} nao encontrada ou ja arquivada`,
      )
    }
    return okJson({ id, archived: true })
  } catch (err) {
    return toValidationError('POST /categories/:id/archive', err)
  }
})
