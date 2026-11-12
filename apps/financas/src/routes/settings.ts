import { Hono } from 'hono'
import {
  ALERTAS_EMAIL_ENVIO_KEY,
  type ConfigDeEnvio,
  estadoDoEnvio,
} from '../domain/alertas-envio'
import {
  ALERTAS_EMAIL_KEY,
  alertasLigados,
  getFixedNetCents,
  getSetting,
  setAlertasLigados,
  setFixedNetCents,
  setSetting,
} from '../domain/settings'
import { errJson, okJson } from '../lib/envelope'

// `fixed_net_cents` só pode ser lido/escrito por `GET|PUT /api/settings`
// (valida FAIXA numérica via `setFixedNetCents`) — nunca pelo caminho
// genérico `/settings/:key` abaixo, que trataria `value` como string opaca
// e deixaria qualquer lixo "salvo" nessa chave sem passar pelo RangeError
// que protege o denominador do % de Comprometido. Mesma regra para o
// liga/desliga dos alertas e o registro do envio (escrito só pelo Cron).
// Valor = a rota que a chave usa.
const RESERVED_KEYS = new Map([
  ['fixed_net_cents', '/api/settings'],
  [ALERTAS_EMAIL_KEY, '/api/settings/alertas'],
  [ALERTAS_EMAIL_ENVIO_KEY, '/api/settings/alertas'],
])

// Convenção de módulo (accounts.ts/transactions.ts/installments.ts/debts.ts/
// reports.ts/payees.ts/categories.ts): type Env LOCAL, nunca import de
// Bindings de ../index — evita ciclo de import valor↔tipo.
type Env = { Bindings: { DB: D1Database } & ConfigDeEnvio }

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

// Antes da genérica `/settings/:key`: no Hono a ordem de registro decide.
settingsRoutes.get('/settings/alertas', async (c) => {
  return okJson({
    ligado: await alertasLigados(c.env.DB),
    envio: await estadoDoEnvio(c.env.DB, c.env),
  })
})

settingsRoutes.put('/settings/alertas', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return errJson(400, 'invalid_json', 'corpo da requisicao nao e JSON valido')
  }

  const ligado =
    typeof body === 'object' && body !== null && 'ligado' in body
      ? body.ligado
      : undefined
  if (typeof ligado !== 'boolean') {
    return errJson(
      422,
      'invalid_setting',
      'ligado precisa ser verdadeiro ou falso',
      'ligado',
    )
  }
  return okJson({
    ligado: await setAlertasLigados(c.env.DB, ligado),
    envio: await estadoDoEnvio(c.env.DB, c.env),
  })
})

// Genérico (fatia ②, Tasks 4-5) — `key` livre, exceto as reservadas acima.
// `value` é sempre string opaca: o chamador (SPA) decide o formato (aqui,
// JSON.stringify de um MapaColunas) — mesmo raciocínio de `getSetting`/
// `setSetting` no domínio.
settingsRoutes.get('/settings/:key', async (c) => {
  const key = c.req.param('key')
  const reservada = RESERVED_KEYS.get(key)
  if (reservada) {
    return errJson(
      422,
      'reserved_setting_key',
      `'${key}' é reservada — use GET ${reservada}`,
      'key',
    )
  }
  const value = await getSetting(c.env.DB, key)
  return okJson({ key, value })
})

settingsRoutes.put('/settings/:key', async (c) => {
  const key = c.req.param('key')
  const reservada = RESERVED_KEYS.get(key)
  if (reservada) {
    return errJson(
      422,
      'reserved_setting_key',
      `'${key}' é reservada — use PUT ${reservada}`,
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
