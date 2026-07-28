import { Hono } from 'hono'
import {
  getFixedNetCents,
  getSetting,
  setFixedNetCents,
  setSetting,
} from '../domain/settings'
import { errJson, okJson } from '../lib/envelope'

// `fixed_net_cents` só pode ser lido/escrito por `GET|PUT /api/settings`
// (valida FAIXA numérica via `setFixedNetCents`) — nunca pelo caminho
// genérico `/settings/:key` abaixo, que trataria `value` como string opaca
// e deixaria qualquer lixo "salvo" nessa chave sem passar pelo RangeError
// que protege o denominador do % de Comprometido.
const RESERVED_KEYS = new Set(['fixed_net_cents'])

// Convenção de módulo (accounts.ts/transactions.ts/installments.ts/debts.ts/
// reports.ts/payees.ts/categories.ts): type Env LOCAL, nunca import de
// Bindings de ../index — evita ciclo de import valor↔tipo.
type Env = { Bindings: { DB: D1Database } }

export const settingsRoutes = new Hono<Env>()

settingsRoutes.get('/settings', async (c) => {
  const fixed_net_cents = await getFixedNetCents(c.env.DB)
  return okJson({ fixed_net_cents })
})

settingsRoutes.put('/settings', async (c) => {
  let body: { fixed_net_cents?: unknown }
  try {
    body = await c.req.json()
  } catch {
    return errJson(400, 'invalid_json', 'corpo da requisicao nao e JSON valido')
  }

  const raw = body.fixed_net_cents
  // Corpo (não query string) ⇒ 422, nunca 400 — mesma regra documentada em
  // CLAUDE.md/"Rotas" (Task 10: query string malformada é 400, campo de
  // corpo inválido é 422). `typeof raw !== 'number'` cobre ausente,
  // string, null, boolean etc antes de chegar em setFixedNetCents.
  if (typeof raw !== 'number') {
    return errJson(
      422,
      'invalid_setting',
      'fixed_net_cents precisa ser um número inteiro em centavos',
      'fixed_net_cents',
    )
  }

  try {
    const fixed_net_cents = await setFixedNetCents(c.env.DB, raw)
    return okJson({ fixed_net_cents })
  } catch (err) {
    if (err instanceof RangeError) {
      return errJson(422, 'invalid_setting', err.message, 'fixed_net_cents')
    }
    throw err
  }
})

// Genérico (fatia ②, Tasks 4-5) — `key` livre, exceto as reservadas acima.
// `value` é sempre string opaca: o chamador (SPA) decide o formato (aqui,
// JSON.stringify de um MapaColunas) — mesmo raciocínio de `getSetting`/
// `setSetting` no domínio.
settingsRoutes.get('/settings/:key', async (c) => {
  const key = c.req.param('key')
  if (RESERVED_KEYS.has(key)) {
    return errJson(
      422,
      'reserved_setting_key',
      `'${key}' é reservada — use GET /api/settings`,
      'key',
    )
  }
  const value = await getSetting(c.env.DB, key)
  return okJson({ key, value })
})

settingsRoutes.put('/settings/:key', async (c) => {
  const key = c.req.param('key')
  if (RESERVED_KEYS.has(key)) {
    return errJson(
      422,
      'reserved_setting_key',
      `'${key}' é reservada — use PUT /api/settings`,
      'key',
    )
  }

  let body: { value?: unknown }
  try {
    body = await c.req.json()
  } catch {
    return errJson(400, 'invalid_json', 'corpo da requisicao nao e JSON valido')
  }

  if (typeof body.value !== 'string') {
    return errJson(
      422,
      'invalid_setting',
      'value precisa ser uma string',
      'value',
    )
  }

  await setSetting(c.env.DB, key, body.value)
  return okJson({ key, value: body.value })
})
