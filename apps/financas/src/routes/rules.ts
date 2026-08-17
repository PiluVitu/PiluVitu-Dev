import { Hono } from 'hono'
import {
  countRuleMatches,
  createRule,
  deleteRule,
  listRules,
  MATCH_SCAN_LIMIT,
  updateRule,
  type NewRule,
  type RulePatch,
} from '../domain/rules'
import { errJson, okJson } from '../lib/envelope'
import { friendlyConstraintMessage, logConstraintError } from '../lib/errors'

// Local, não importado de '../index' — convenção das rotas irmãs
// (accounts/transactions/recurring/...): evita ciclo valor↔tipo.
type Env = { Bindings: { DB: D1Database } }

function isNullableString(v: unknown): v is string | null {
  return v === null || typeof v === 'string'
}
function isOptionalNullableString(v: unknown): v is string | null | undefined {
  return v === undefined || isNullableString(v)
}
function isNullableInt(v: unknown): v is number | null {
  return v === null || (typeof v === 'number' && Number.isInteger(v))
}
function isOptionalNullableInt(v: unknown): v is number | null | undefined {
  return v === undefined || isNullableInt(v)
}

/**
 * Mesmo `toValidationError` de recurring.ts: DOIS caminhos pro MESMO 422 —
 * `RangeError` do domínio (validação em TS, mensagem já legível) e
 * `SQLITE_CONSTRAINT` cru do D1 (FK pra conta/categoria/payee inexistente,
 * ou os CHECKs estruturais da 0009 disparados por uma linha que escapou da
 * validação em TS). O texto cru, com nome de tabela/coluna, só vai pro
 * `console.error` via `logConstraintError` — nunca pro cliente.
 */
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

/** Valida os campos comuns a POST e PUT; devolve `null` quando tudo passa. */
function validarCampos(body: Record<string, unknown>): Response | null {
  for (const campo of [
    'match_text',
    'match_account_id',
    'match_direction',
    'set_category_id',
    'set_payee_id',
  ] as const) {
    if (campo in body && !isOptionalNullableString(body[campo]))
      return errJson(422, 'constraint_violation', `${campo} inválido`)
  }
  for (const campo of [
    'match_min_cents',
    'match_max_cents',
    'set_is_business',
    'priority',
    'active',
  ] as const) {
    if (campo in body && !isOptionalNullableInt(body[campo]))
      return errJson(
        422,
        'constraint_violation',
        `${campo} inválido (esperado inteiro ou nulo)`,
      )
  }
  return null
}

export const rulesRoutes = new Hono<Env>()

/**
 * ⚠️ `/matches` PRECISA ser registrado antes de qualquer `/:id` — no Hono a
 * ordem de registro decide, e um `GET /:id` acima capturaria a string
 * "matches" como id. Não existe `GET /:id` hoje; a ordem fica assim
 * mesmo pra que acrescentar um não vire um 404 silencioso aqui.
 *
 * ⚠️ A CONTAGEM É O QUE FAZ A TELA DE REGRAS SER CONFIÁVEL. Uma regra cujo
 * efeito o dono não consegue prever é uma regra que ele não vai usar — o
 * número de lançamentos existentes que ela casaria é a única forma de ele
 * descobrir que "MERCADO" pega 40 linhas e não as 3 que ele imaginava,
 * ANTES de rodar um import com ela ligada.
 *
 * `scanned` volta no corpo de propósito: a varredura é bounded
 * (`MATCH_SCAN_LIMIT`), e apresentar a contagem como se fosse o histórico
 * inteiro seria a mesma desonestidade que o teto de 500 da dedupe do import
 * evita dizendo o número em voz alta.
 */
rulesRoutes.get('/matches', async (c) => {
  const rules = await listRules(c.env.DB)
  const resultado = await countRuleMatches(c.env.DB, rules)
  return okJson({ ...resultado, scan_limit: MATCH_SCAN_LIMIT })
})

/**
 * Listagem de CRUD/gestão: TODAS as regras, ativas E pausadas — mesmo
 * motivo de `GET /api/recurring` (esconder a pausada tornaria a linha
 * inalcançável, e a única forma de reativar seria adivinhar o id). Quem
 * filtra `active = 1` é `aplicarRegras`, no motor, pra todo consumidor de
 * uma vez.
 */
rulesRoutes.get('/', async (c) => okJson(await listRules(c.env.DB)))

rulesRoutes.post('/', async (c) => {
  let body: Record<string, unknown>
  try {
    body = await c.req.json<Record<string, unknown>>()
  } catch {
    return errJson(400, 'invalid_json', 'corpo da requisição não é JSON válido')
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body))
    return errJson(
      422,
      'constraint_violation',
      'corpo precisa ser um objeto JSON',
    )

  if (typeof body.name !== 'string' || body.name.trim() === '')
    return errJson(422, 'constraint_violation', 'name é obrigatório')
  const invalido = validarCampos(body)
  if (invalido) return invalido

  try {
    return okJson(await createRule(c.env.DB, body as unknown as NewRule), 201)
  } catch (err) {
    return toValidationError('POST /rules', err)
  }
})

rulesRoutes.put('/:id', async (c) => {
  const id = c.req.param('id')
  let body: Record<string, unknown>
  try {
    body = await c.req.json<Record<string, unknown>>()
  } catch {
    return errJson(400, 'invalid_json', 'corpo da requisição não é JSON válido')
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body))
    return errJson(
      422,
      'constraint_violation',
      'corpo precisa ser um objeto JSON',
    )

  if (
    'name' in body &&
    (typeof body.name !== 'string' || body.name.trim() === '')
  )
    return errJson(422, 'constraint_violation', 'name inválido')
  const invalido = validarCampos(body)
  if (invalido) return invalido

  // Patch parcial por presença da chave — espelha PATCHABLE_FIELDS
  // (domain/rules.ts). PUT aqui documenta atualização PARCIAL: quem define
  // esse contrato é o domínio, a rota só encaminha o que o corpo mandou.
  const patch: RulePatch = {}
  for (const campo of [
    'name',
    'match_text',
    'match_account_id',
    'match_min_cents',
    'match_max_cents',
    'match_direction',
    'set_category_id',
    'set_payee_id',
    'set_is_business',
    'priority',
    'active',
  ] as const) {
    if (campo in body) (patch as Record<string, unknown>)[campo] = body[campo]
  }

  try {
    const updated = await updateRule(c.env.DB, id, patch)
    if (!updated) return errJson(404, 'not_found', `regra ${id} não encontrada`)
    return okJson(updated)
  } catch (err) {
    return toValidationError('PUT /rules/:id', err)
  }
})

// Convenção do módulo: domínio devolve boolean (meta.changes > 0), a rota
// traduz false em 404 — sem isso, id inexistente é indistinguível de
// sucesso.
rulesRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  if (!(await deleteRule(c.env.DB, id)))
    return errJson(404, 'not_found', `regra ${id} não encontrada`)
  return okJson({ id, deleted: true })
})
