import { applyD1Migrations, env } from 'cloudflare:test'
import { Hono } from 'hono'
import { beforeAll, describe, expect, it } from 'vitest'
import app from '../index'
import { settingsRoutes } from './settings'

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
})

// Monta só o router, sem o middleware do Better Auth — mesmo padrão de
// routes/reports.test.ts: o que está sob teste aqui é o contrato HTTP +
// envelope, não autenticação.
function router() {
  const hono = new Hono()
  hono.route('/api', settingsRoutes)
  return hono
}

function get() {
  return router().request('/api/settings', {}, { DB: env.DB })
}

function put(body: unknown) {
  return router().request(
    '/api/settings',
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
    { DB: env.DB },
  )
}

function getKey(key: string) {
  return router().request(`/api/settings/${key}`, {}, { DB: env.DB })
}

function putKey(key: string, body: unknown) {
  return router().request(
    `/api/settings/${key}`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
    { DB: env.DB },
  )
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

describe('settingsRoutes — montagem', () => {
  it('está montado ACIMA do catch-all /api/*', () => {
    const primeiro = app.routes.findIndex((r) =>
      r.path.startsWith('/api/settings'),
    )
    const catchAll = app.routes.reduce(
      (last, r, i) => (r.path === '/api/*' ? i : last),
      -1,
    )
    expect(primeiro).toBeGreaterThanOrEqual(0)
    expect(catchAll).toBeGreaterThanOrEqual(0)
    expect(primeiro).toBeLessThan(catchAll)
  })
})

describe('GET /api/settings', () => {
  it('devolve o default (R$ 3.600 = 360000 centavos) quando nada foi salvo', async () => {
    const res = await get()
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<{ fixed_net_cents: number }>
    expect(body.ok).toBe(true)
    expect(body.notifications).toEqual([])
    expect(body.data.fixed_net_cents).toBe(360000)
  })

  it('devolve o valor salvo por um PUT anterior', async () => {
    await put({ fixed_net_cents: 548000 })

    const res = await get()
    const body = (await res.json()) as Envelope<{ fixed_net_cents: number }>
    expect(body.data.fixed_net_cents).toBe(548000)
  })

  // CRITICAL C2 (fix final): esta é a tela `#/configuracoes` — uma das TRÊS
  // que dependiam do mesmo `getFixedNetCents` sem proteção contra a tabela
  // `settings` faltando (as outras duas são o bloco Comprometido da home e
  // `#/comprometido`, cobertas em `routes/reports.test.ts`). Prova que a
  // degradação é da ROTA, não só do domínio.
  it('tabela settings ausente: continua 200 com o default, nunca 500', async () => {
    await env.DB.prepare('DROP TABLE settings').run()

    const res = await get()
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<{ fixed_net_cents: number }>
    expect(body.ok).toBe(true)
    expect(body.data.fixed_net_cents).toBe(360000)
  })
})

describe('PUT /api/settings', () => {
  it('salva e devolve 200 com o valor salvo no envelope', async () => {
    const res = await put({ fixed_net_cents: 420000 })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<{ fixed_net_cents: number }>
    expect(body.ok).toBe(true)
    expect(body.notifications).toEqual([])
    expect(body.data.fixed_net_cents).toBe(420000)
  })

  it.each([
    ['zero', 0],
    ['negativo', -100000],
    ['não inteiro', 360000.5],
    ['absurdamente grande', 100_000_001],
  ])(
    '%s devolve 422 invalid_setting com field fixed_net_cents',
    async (_label, value) => {
      const res = await put({ fixed_net_cents: value })
      expect(res.status).toBe(422)
      const body = (await res.json()) as Envelope<null>
      expect(body.ok).toBe(false)
      expect(body.notifications[0].code).toBe('invalid_setting')
      expect(body.notifications[0].field).toBe('fixed_net_cents')
    },
  )

  it('fixed_net_cents ausente/não numérico (string) devolve 422', async () => {
    const res = await put({ fixed_net_cents: '3600,00' })
    expect(res.status).toBe(422)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0].code).toBe('invalid_setting')
  })

  it('corpo malformado (não é JSON) devolve 400 invalid_json', async () => {
    const res = await router().request(
      '/api/settings',
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: '{nao-e-json',
      },
      { DB: env.DB },
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0].code).toBe('invalid_json')
  })

  it('valor inválido não sobrescreve um valor salvo anteriormente válido', async () => {
    await put({ fixed_net_cents: 250000 })
    await put({ fixed_net_cents: -1 })

    const res = await get()
    const body = (await res.json()) as Envelope<{ fixed_net_cents: number }>
    expect(body.data.fixed_net_cents).toBe(250000)
  })
})

// GET/PUT /api/settings/:key — chave-valor genérico (fatia ②, Tasks 4-5: o
// mapa de colunas de import por conta, `import_map:<account_id>`). Rota
// NOVA, `/api/settings` (sem parâmetro) acima continua intocada.
describe('GET/PUT /api/settings/:key — genérico', () => {
  it('chave nunca salva devolve { key, value: null }', async () => {
    const res = await getKey('import_map:conta-1')
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<{
      key: string
      value: string | null
    }>
    expect(body.ok).toBe(true)
    expect(body.data).toEqual({ key: 'import_map:conta-1', value: null })
  })

  it('salva e relê pela mesma chave', async () => {
    const put1 = await putKey('import_map:conta-1', { value: '{"data":0}' })
    expect(put1.status).toBe(200)

    const res = await getKey('import_map:conta-1')
    const body = (await res.json()) as Envelope<{
      key: string
      value: string | null
    }>
    expect(body.data.value).toBe('{"data":0}')
  })

  it('chaves diferentes não colidem', async () => {
    await putKey('import_map:conta-1', { value: 'A' })
    await putKey('import_map:conta-2', { value: 'B' })

    const r1 = (await (await getKey('import_map:conta-1')).json()) as Envelope<{
      value: string | null
    }>
    const r2 = (await (await getKey('import_map:conta-2')).json()) as Envelope<{
      value: string | null
    }>
    expect(r1.data.value).toBe('A')
    expect(r2.data.value).toBe('B')
  })

  it('PUT value ausente/não-string devolve 422 invalid_setting', async () => {
    const res = await putKey('import_map:conta-1', { value: 123 })
    expect(res.status).toBe(422)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0].code).toBe('invalid_setting')
    expect(body.notifications[0].field).toBe('value')
  })

  it('corpo malformado (não é JSON) devolve 400 invalid_json', async () => {
    const res = await router().request(
      '/api/settings/import_map:conta-1',
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: '{nao-e-json',
      },
      { DB: env.DB },
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0].code).toBe('invalid_json')
  })

  // A validação NUMÉRICA de fixed_net_cents (setFixedNetCents) não pode ser
  // contornada escrevendo por este caminho genérico — senão qualquer string
  // viraria um valor "salvo" pra essa chave, sem passar pelo RangeError que
  // `PUT /api/settings` garante.
  it('chave reservada (fixed_net_cents) recusa os dois verbos, 422 reserved_setting_key', async () => {
    const resGet = await getKey('fixed_net_cents')
    expect(resGet.status).toBe(422)
    const bodyGet = (await resGet.json()) as Envelope<null>
    expect(bodyGet.notifications[0].code).toBe('reserved_setting_key')

    const resPut = await putKey('fixed_net_cents', { value: 'lixo' })
    expect(resPut.status).toBe(422)
    const bodyPut = (await resPut.json()) as Envelope<null>
    expect(bodyPut.notifications[0].code).toBe('reserved_setting_key')

    // E o valor numérico salvo por PUT /api/settings continua intocado.
    await put({ fixed_net_cents: 250000 })
    const resGetDepois = await getKey('fixed_net_cents')
    expect(resGetDepois.status).toBe(422)
    const semValorCorrompido = await get()
    const bodySemValorCorrompido =
      (await semValorCorrompido.json()) as Envelope<{
        fixed_net_cents: number
      }>
    expect(bodySemValorCorrompido.data.fixed_net_cents).toBe(250000)
  })
})
