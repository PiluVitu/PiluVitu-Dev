import { applyD1Migrations, env } from 'cloudflare:test'
import { Hono } from 'hono'
import { beforeAll, describe, expect, it } from 'vitest'
import { errJson } from '../lib/envelope'
import { nowIsoUtc } from '../lib/dates'
import { newId } from '../lib/ids'
import { reserveRoutes } from './reserve'

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
})

const DB = env.DB

// --------------------------------------------------------------------------
// Fixtures — mesmo padrão de domain/reserve.test.ts (helpers próprios por
// arquivo, ids distintos por teste; reset() do beforeEach global já limpa
// tudo entre testes).
// --------------------------------------------------------------------------

async function novaConta(openingBalanceCents = 0): Promise<string> {
  const id = newId()
  const now = nowIsoUtc()
  await DB.prepare(
    `INSERT INTO accounts
       (id, name, scope, kind, currency, opening_balance_cents, archived_at, created_at, updated_at)
     VALUES (?, 'Conta de teste', 'PJ', 'checking', 'BRL', ?, NULL, ?, ?)`,
  )
    .bind(id, openingBalanceCents, now, now)
    .run()
  return id
}

async function novaRecorrente(
  minCents: number,
  maxCents: number,
): Promise<string> {
  const id = newId()
  const now = nowIsoUtc()
  await DB.prepare(
    `INSERT INTO recurring_expenses
       (id, description, scope, day_of_month, amount_min_cents, amount_max_cents,
        starts_on, ends_on, active, created_at, updated_at)
     VALUES (?, 'Recorrente de teste', 'PJ', 10, ?, ?, '2020-01-01', NULL, 1, ?, ?)`,
  )
    .bind(id, minCents, maxCents, now, now)
    .run()
  return id
}

// Monta só o router, sem o middleware do Better Auth — mesma convenção de
// routes/settings.test.ts/routes/recurring.test.ts.
function app() {
  const hono = new Hono()
  hono.route('/api', reserveRoutes)
  return hono
}

// Monta EXATAMENTE como src/index.ts: reserveRoutes registrado ANTES do
// catch-all. Prova por EXECUÇÃO REAL (não por leitura de index.ts) que a
// rota fica alcançável — mesmo padrão de routes/recurring.test.ts.
function appComCatchAll() {
  const hono = new Hono()
  hono.route('/api', reserveRoutes)
  hono.all('/api/*', () => errJson(404, 'not_found', 'rota nao encontrada'))
  return hono
}

function get(path = '/api/reserve') {
  return app().request(path, {}, { DB })
}

function put(body: unknown) {
  return app().request(
    '/api/reserve/accounts',
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
    { DB },
  )
}

type FixedCostRange = { min: number; max: number }
type EmergencyStatusBody = {
  saldo_cents: number
  meta_cents: FixedCostRange
  meses: FixedCostRange | null
  contas: string[]
  goal_months: number
}
type Envelope<T> = {
  ok: boolean
  data: T
  notifications: Array<{
    type: string
    code: string
    message: string
    field?: string
  }>
}

describe('reserveRoutes — montagem', () => {
  it('GET /api/reserve alcanca o handler real, nao o catch-all', async () => {
    const res = await appComCatchAll().request('/api/reserve', {}, { DB })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<EmergencyStatusBody>
    expect(body.notifications).toEqual([])
  })

  it('PUT /api/reserve/accounts alcanca o handler real, nao o catch-all', async () => {
    const res = await appComCatchAll().request(
      '/api/reserve/accounts',
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ account_ids: [] }),
      },
      { DB },
    )
    expect(res.status).toBe(200)
  })
})

describe('GET /api/reserve', () => {
  it('200 com envelope, estado vazio: saldo 0, contas [], meses null, goal_months default 3', async () => {
    const res = await get()
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<EmergencyStatusBody>
    expect(body.ok).toBe(true)
    expect(body.notifications).toEqual([])
    expect(body.data.saldo_cents).toBe(0)
    expect(body.data.contas).toEqual([])
    expect(body.data.meses).toBeNull()
    expect(body.data.goal_months).toBe(3)
  })

  // Módulo law: um `meses: null` que SOME do JSON (chave ausente) em vez de
  // aparecer como `null` transforma "desconhecido" em "ausente" — a SPA não
  // consegue distinguir os dois. `JSON.stringify` não descarta `null`
  // (só `undefined`), mas o contrato precisa da prova textual, não só do
  // valor pós-`JSON.parse` (que mascararia um bug de outra natureza).
  it('meses: null sobrevive ao round-trip JSON — a chave existe e é null, nunca some', async () => {
    const res = await get()
    const text = await res.text()
    expect(text).toContain('"meses":null')
    const body = JSON.parse(text) as Envelope<EmergencyStatusBody>
    expect('meses' in body.data).toBe(true)
    expect(body.data.meses).toBeNull()
  })

  it('com recorrente cadastrada e conta designada, devolve saldo/meses calculados de verdade', async () => {
    const a = await novaConta(100000)
    await novaRecorrente(18900, 18900) // Starlink, fixo
    await novaRecorrente(1200, 60000) // DAS, faixa aberta
    await put({ account_ids: [a] })

    const res = await get()
    const body = (await res.json()) as Envelope<EmergencyStatusBody>
    expect(body.data.saldo_cents).toBe(100000)
    expect(body.data.meses).not.toBeNull()
    // custo {min: 20100, max: 78900} — mesmo cenário de domain/reserve.test.ts#4
    expect(body.data.meses!.min).toBeCloseTo(100000 / 78900, 6)
    expect(body.data.meses!.max).toBeCloseTo(100000 / 20100, 6)
    expect(body.data.meta_cents).toEqual({ min: 20100 * 3, max: 78900 * 3 })
  })

  it('?goal_months= customiza a meta (meta_cents escala, goal_months ecoa no envelope)', async () => {
    await novaRecorrente(10000, 10000)
    const res = await get('/api/reserve?goal_months=6')
    const body = (await res.json()) as Envelope<EmergencyStatusBody>
    expect(body.data.goal_months).toBe(6)
    expect(body.data.meta_cents).toEqual({ min: 60000, max: 60000 })
  })

  it.each([
    ['nao numerico', 'abc'],
    ['zero', '0'],
    ['negativo', '-1'],
    ['fracionario', '2.5'],
    ['vazio', ''],
  ])(
    '?goal_months= invalido (%s) devolve 400 invalid_query — query string, nunca 422',
    async (_label, v) => {
      const res = await get(`/api/reserve?goal_months=${v}`)
      expect(res.status).toBe(400)
      const body = (await res.json()) as Envelope<null>
      expect(body.ok).toBe(false)
      expect(body.notifications[0].code).toBe('invalid_query')
    },
  )
})

describe('PUT /api/reserve/accounts', () => {
  it('designa contas existentes e devolve 200 com a lista ecoada', async () => {
    const a = await novaConta()
    const b = await novaConta()
    const res = await put({ account_ids: [a, b] })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<{ account_ids: string[] }>
    expect(body.ok).toBe(true)
    expect(body.data.account_ids).toEqual([a, b])
  })

  it('id de conta inexistente ⇒ 422 constraint_violation, mensagem COZIDA (sem D1_ERROR/SQLITE/FOREIGN KEY crus)', async () => {
    const res = await put({ account_ids: ['id-que-nao-existe'] })
    expect(res.status).toBe(422)
    const body = (await res.json()) as Envelope<null>
    expect(body.ok).toBe(false)
    expect(body.notifications[0].code).toBe('constraint_violation')
    const msg = body.notifications[0].message
    expect(msg).not.toMatch(/D1_ERROR|SQLITE|FOREIGN KEY/i)
    expect(msg.length).toBeGreaterThan(0)
  })

  it('id inexistente misturado com um válido: nada é salvo (sem escrita parcial)', async () => {
    const a = await novaConta()
    await put({ account_ids: [a] }) // designação válida anterior
    const res = await put({ account_ids: [a, 'id-que-nao-existe'] })
    expect(res.status).toBe(422)

    const depois = await get()
    const body = (await depois.json()) as Envelope<EmergencyStatusBody>
    // continua só a designação válida ANTERIOR — a tentativa inválida não
    // sobrescreveu nem parcialmente.
    expect(body.data.contas).toEqual([a])
  })

  it('array vazio limpa a designação', async () => {
    const a = await novaConta()
    await put({ account_ids: [a] })
    await put({ account_ids: [] })

    const res = await get()
    const body = (await res.json()) as Envelope<EmergencyStatusBody>
    expect(body.data.contas).toEqual([])
  })

  it('account_ids ausente/tipo errado ⇒ 422 constraint_violation (corpo, não query)', async () => {
    const res = await put({ account_ids: 'nao-e-array' })
    expect(res.status).toBe(422)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0].code).toBe('constraint_violation')
  })

  it('item da lista que não é string ⇒ 422 constraint_violation', async () => {
    const res = await put({ account_ids: [123] })
    expect(res.status).toBe(422)
  })

  it('corpo malformado (não é JSON) ⇒ 400 invalid_json', async () => {
    const res = await app().request(
      '/api/reserve/accounts',
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: '{nao-e-json',
      },
      { DB },
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0].code).toBe('invalid_json')
  })

  it('conta arquivada pode ser designada (a rota não filtra archived_at na validação)', async () => {
    const id = newId()
    const now = nowIsoUtc()
    await DB.prepare(
      `INSERT INTO accounts
         (id, name, scope, kind, currency, opening_balance_cents, archived_at, created_at, updated_at)
       VALUES (?, 'Conta arquivada', 'PJ', 'checking', 'BRL', 500000, ?, ?, ?)`,
    )
      .bind(id, now, now, now)
      .run()

    const res = await put({ account_ids: [id] })
    expect(res.status).toBe(200)

    // Aparece em `contas` (o que foi designado)...
    const depois = await get()
    const body = (await depois.json()) as Envelope<EmergencyStatusBody>
    expect(body.data.contas).toEqual([id])
    // ...mas NÃO soma no saldo (mesma regra provada em domain/reserve.test.ts#7).
    expect(body.data.saldo_cents).toBe(0)
  })

  it('designar conta e reler: saldo muda no GET seguinte (round-trip PUT + GET)', async () => {
    const a = await novaConta(250000)
    await put({ account_ids: [a] })

    const res = await get()
    const body = (await res.json()) as Envelope<EmergencyStatusBody>
    expect(body.data.saldo_cents).toBe(250000)
  })
})
