import { Hono } from 'hono'
import type { Scope } from '../domain/accounts'
import {
  createRecurring,
  deleteRecurring,
  listRecurring,
  updateRecurring,
  type RecurringPatch,
} from '../domain/recurring'
import { errJson, okJson } from '../lib/envelope'
import { friendlyConstraintMessage, logConstraintError } from '../lib/errors'

// Local, não importado de '../index' — mesma convenção de accounts.ts/
// transactions.ts/installments.ts/debts.ts/reports.ts/payees.ts/
// categories.ts/settings.ts: evita ciclo de import valor↔tipo com
// src/index.ts.
type Env = { Bindings: { DB: D1Database } }

const SCOPES: Scope[] = ['PJ', 'PF']

function isScope(value: unknown): value is Scope {
  return typeof value === 'string' && (SCOPES as string[]).includes(value)
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

// category_id/account_id/ends_on/notes sao opcionais no corpo — ausentes
// (undefined) e' valido (vira null), so um valor PRESENTE e do tipo
// errado (numero, boolean, objeto) e' rejeitado.
function isOptionalNullableString(value: unknown): value is string | null {
  return value === undefined || isNullableString(value)
}

/**
 * Traduz um erro de dominio/D1 pra 422 constraint_violation cozido. Cobre
 * DOIS caminhos: RangeError (validacao em TS, ex. amount_max_cents <
 * amount_min_cents — nunca chega a tocar o banco) e SQLITE_CONSTRAINT cru
 * do D1 (ex. CHECK ends_on >= starts_on, que o dominio NAO pre-valida em
 * TS). Os dois saem com o MESMO codigo (`constraint_violation`, per Task 4
 * brief) e, no caso do D1, sempre passando por friendlyConstraintMessage —
 * a mensagem crua (com nome de tabela/coluna) so vai pro console via
 * logConstraintError, nunca pro cliente.
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

export const recurringRoutes = new Hono<Env>()

// GET: listagem de CRUD — TODAS as recorrentes, ativas E pausadas
// (`includeInactive: true`), ao contrario do default do dominio (so
// ativas). `active = 0` e dado de negocio (pausa), nao exclusao — esconder
// da listagem depois de pausar tornaria a linha inalcancavel por esta
// rota (a unica forma de reativar seria adivinhar o id). A projecao
// (`commitments()`/`projectRecurring`) ja filtra `active = 1` por conta
// propria, entao esconder aqui tambem seria redundante, nao protetor.
recurringRoutes.get('/', async (c) => {
  const rows = await listRecurring(c.env.DB, { includeInactive: true })
  return okJson(rows)
})

recurringRoutes.post('/', async (c) => {
  let body: Record<string, unknown>
  try {
    body = await c.req.json<Record<string, unknown>>()
  } catch {
    return errJson(400, 'invalid_json', 'corpo da requisicao nao e JSON valido')
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return errJson(
      422,
      'constraint_violation',
      'corpo precisa ser um objeto JSON',
    )
  }

  const {
    description,
    category_id,
    account_id,
    scope,
    day_of_month,
    amount_min_cents,
    amount_max_cents,
    starts_on,
    ends_on,
    active,
    notes,
  } = body

  if (typeof description !== 'string' || description.trim() === '')
    return errJson(422, 'constraint_violation', 'description e obrigatoria')
  if (!isScope(scope))
    return errJson(
      422,
      'constraint_violation',
      "scope precisa ser 'PJ' ou 'PF'",
    )
  if (typeof starts_on !== 'string' || starts_on === '')
    return errJson(422, 'constraint_violation', 'starts_on e obrigatorio')
  if (!isOptionalNullableString(category_id))
    return errJson(422, 'constraint_violation', 'category_id invalido')
  if (!isOptionalNullableString(account_id))
    return errJson(422, 'constraint_violation', 'account_id invalido')
  if (!isOptionalNullableString(ends_on))
    return errJson(422, 'constraint_violation', 'ends_on invalido')
  if (!isOptionalNullableString(notes))
    return errJson(422, 'constraint_violation', 'notes invalido')
  if (active !== undefined && active !== 0 && active !== 1)
    return errJson(422, 'constraint_violation', 'active precisa ser 0 ou 1')

  try {
    const created = await createRecurring(c.env.DB, {
      description,
      category_id: category_id ?? null,
      account_id: account_id ?? null,
      scope,
      // day_of_month/amount_min_cents/amount_max_cents: o dominio
      // (validateDayOfMonth/validateAmounts) confere Number.isInteger e
      // devolve RangeError com mensagem legivel pra qualquer tipo errado
      // (string, undefined, float) — duplicar o typeof aqui so
      // divergiria da mensagem canonica sem ganhar nada.
      day_of_month: day_of_month as number,
      amount_min_cents: amount_min_cents as number,
      amount_max_cents: amount_max_cents as number,
      starts_on,
      ends_on: (ends_on as string | null | undefined) ?? null,
      active: active as 0 | 1 | undefined,
      notes: notes ?? null,
    })
    return okJson(created, 201)
  } catch (err) {
    return toValidationError('POST /recurring', err)
  }
})

recurringRoutes.put('/:id', async (c) => {
  const id = c.req.param('id')
  let body: Record<string, unknown>
  try {
    body = await c.req.json<Record<string, unknown>>()
  } catch {
    return errJson(400, 'invalid_json', 'corpo da requisicao nao e JSON valido')
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return errJson(
      422,
      'constraint_violation',
      'corpo precisa ser um objeto JSON',
    )
  }

  // Patch parcial por whitelist — so os campos PRESENTES no corpo entram
  // em `patch`, espelhando PATCHABLE_FIELDS/updateRecurring
  // (domain/recurring.ts). PUT aqui documenta atualizacao PARCIAL, nao
  // substituicao total: e o dominio quem ja define esse contrato (patch
  // parcial), a rota so encaminha os campos que o corpo de fato mandou.
  const patch: RecurringPatch = {}

  if ('description' in body) {
    if (typeof body.description !== 'string' || body.description.trim() === '')
      return errJson(422, 'constraint_violation', 'description invalida')
    patch.description = body.description
  }
  if ('category_id' in body) {
    if (!isNullableString(body.category_id))
      return errJson(422, 'constraint_violation', 'category_id invalido')
    patch.category_id = body.category_id
  }
  if ('account_id' in body) {
    if (!isNullableString(body.account_id))
      return errJson(422, 'constraint_violation', 'account_id invalido')
    patch.account_id = body.account_id
  }
  if ('scope' in body) {
    if (!isScope(body.scope))
      return errJson(
        422,
        'constraint_violation',
        "scope precisa ser 'PJ' ou 'PF'",
      )
    patch.scope = body.scope
  }
  if ('day_of_month' in body) {
    // validateDayOfMonth (dominio) confere o range/tipo — ver comentario
    // equivalente no POST acima.
    patch.day_of_month = body.day_of_month as number
  }
  if ('amount_min_cents' in body) {
    patch.amount_min_cents = body.amount_min_cents as number
  }
  if ('amount_max_cents' in body) {
    patch.amount_max_cents = body.amount_max_cents as number
  }
  if ('starts_on' in body) {
    if (typeof body.starts_on !== 'string' || body.starts_on === '')
      return errJson(422, 'constraint_violation', 'starts_on invalido')
    patch.starts_on = body.starts_on
  }
  if ('ends_on' in body) {
    if (!isNullableString(body.ends_on))
      return errJson(422, 'constraint_violation', 'ends_on invalido')
    patch.ends_on = body.ends_on
  }
  if ('active' in body) {
    if (body.active !== 0 && body.active !== 1)
      return errJson(422, 'constraint_violation', 'active precisa ser 0 ou 1')
    patch.active = body.active
  }
  if ('notes' in body) {
    if (!isNullableString(body.notes))
      return errJson(422, 'constraint_violation', 'notes invalido')
    patch.notes = body.notes
  }

  try {
    const updated = await updateRecurring(c.env.DB, id, patch)
    // updateRecurring devolve null tanto pra id inexistente (meta.changes
    // === 0 no UPDATE) quanto pra id inexistente com patch vazio (SELECT
    // que nao acha linha) — os dois casos sao 404 aqui, nunca 200
    // fantasma. Ver domain/recurring.ts#updateRecurring.
    if (!updated)
      return errJson(404, 'not_found', `recorrente ${id} nao encontrada`)
    return okJson(updated)
  } catch (err) {
    return toValidationError('PUT /recurring/:id', err)
  }
})

// Convencao de modulo (debts.ts#deleteDebt, accounts.ts#archiveAccount):
// funcao de dominio devolve boolean (meta.changes > 0), a rota traduz
// false em 404 not_found — id inexistente e id ja apagado ficam
// indistinguiveis de sucesso sem essa traducao.
recurringRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const deleted = await deleteRecurring(c.env.DB, id)
  if (!deleted)
    return errJson(404, 'not_found', `recorrente ${id} nao encontrada`)
  return okJson({ id, deleted: true })
})
