import { applyD1Migrations, env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import app from '../index'
import { debtsRoutes } from './debts'
import { payeesRoutes } from './payees'

beforeEach(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
  await env.DB.prepare('DELETE FROM payees').run()
})

function postInit(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }
}

describe('payeesRoutes', () => {
  it('esta montado ACIMA do catch-all /api/*', () => {
    const primeiro = app.routes.findIndex((r) =>
      r.path.startsWith('/api/payees'),
    )
    // '/api/*' aparece DUAS vezes em app.routes: o app.use('/api/*', ...) do
    // Access (Task 4), registrado primeiro, e o catch-all app.all('/api/*',
    // ...), registrado por último — findIndex pegaria o do Access. O que
    // importa aqui é o catch-all de verdade, então pega a ÚLTIMA ocorrência.
    const catchAll = app.routes.reduce(
      (last, r, i) => (r.path === '/api/*' ? i : last),
      -1,
    )
    expect(primeiro).toBeGreaterThanOrEqual(0)
    expect(catchAll).toBeGreaterThanOrEqual(0)
    expect(primeiro).toBeLessThan(catchAll)
  })

  it('POST cria e GET lista filtrando por kind', async () => {
    const criado = await payeesRoutes.request(
      '/',
      postInit({ name: 'Pai', kind: 'person' }),
      env,
    )
    expect(criado.status).toBe(201)
    const body = await criado.json<{
      ok: boolean
      data: { id: string; norm_name: string }
      notifications: unknown[]
    }>()
    expect(body.ok).toBe(true)
    expect(body.data.norm_name).toBe('PAI')
    expect(body.notifications).toEqual([])

    await payeesRoutes.request(
      '/',
      postInit({ name: 'Receita Federal', kind: 'government' }),
      env,
    )

    const listados = await payeesRoutes.request('/?kind=person', undefined, env)
    const lista = await listados.json<{ data: { name: string }[] }>()
    expect(lista.data.map((p) => p.name)).toEqual(['Pai'])
  })

  it('rejeita corpo nao-JSON com 400 invalid_json', async () => {
    const res = await payeesRoutes.request(
      '/',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      },
      env,
    )
    expect(res.status).toBe(400)
    const body = await res.json<{
      ok: boolean
      notifications: { code?: string }[]
    }>()
    expect(body.ok).toBe(false)
    expect(body.notifications[0].code).toBe('invalid_json')
  })

  it('rejeita kind fora do enum com 422 constraint_violation', async () => {
    const res = await payeesRoutes.request(
      '/',
      postInit({ name: 'X', kind: 'amigo' }),
      env,
    )
    expect(res.status).toBe(422)
    const body = await res.json<{ notifications: { code?: string }[] }>()
    expect(body.notifications[0].code).toBe('constraint_violation')
  })

  it('rejeita query kind invalida com 400 invalid_query', async () => {
    const res = await payeesRoutes.request('/?kind=amigo', undefined, env)
    expect(res.status).toBe(400)
    const body = await res.json<{ notifications: { code?: string }[] }>()
    expect(body.notifications[0].code).toBe('invalid_query')
  })

  it('id do payee recem-criado serve para POST /api/debts', async () => {
    const criado = await payeesRoutes.request(
      '/',
      postInit({ name: 'Pai', kind: 'person' }),
      env,
    )
    const { data: payee } = await criado.json<{ data: { id: string } }>()

    const divida = await debtsRoutes.request(
      '/',
      postInit({
        payee_id: payee.id,
        direction: 'i_owe',
        title: 'Pai',
        opened_at: '2026-03-05',
      }),
      env,
    )
    expect(divida.status).toBe(201)
    const { data: debt } = await divida.json<{ data: { id: string } }>()

    const row = await env.DB.prepare('SELECT payee_id FROM debts WHERE id = ?')
      .bind(debt.id)
      .first<{ payee_id: string }>()
    expect(row?.payee_id).toBe(payee.id)
  })
})

type Notificacao = { code?: string; message: string; field?: string }

function putInit(body: unknown): RequestInit {
  return {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }
}

async function notificacao(res: Response): Promise<Notificacao> {
  const body = await res.json<{ ok: boolean; notifications: Notificacao[] }>()
  expect(body.ok).toBe(false)
  return body.notifications[0]
}

describe('PUT /api/payees/:id', () => {
  // 'DAS — Simples Nacional', semeada pela migration 0001.
  const DAS = '00000000-0000-4000-8000-000000000002'

  async function criar(body: unknown): Promise<{ id: string }> {
    const res = await payeesRoutes.request('/', postInit(body), env)
    const { data } = await res.json<{ data: { id: string } }>()
    return data
  }

  it('ENSINA default_category_id num payee já criado — e o GET reflete', async () => {
    // O que a SPA posta hoje (DividasPage.tsx): sem categoria nenhuma.
    const payee = await criar({ name: 'Pai', kind: 'person' })

    const res = await payeesRoutes.request(
      `/${payee.id}`,
      putInit({ default_category_id: DAS }),
      env,
    )
    expect(res.status).toBe(200)
    const body = await res.json<{
      ok: boolean
      data: { default_category_id: string | null }
      notifications: unknown[]
    }>()
    expect(body.ok).toBe(true)
    expect(body.notifications).toEqual([])
    expect(body.data.default_category_id).toBe(DAS)

    // É este campo que sugerirPayee (payee-suggest.ts) lê pra sugerir a
    // categoria no import — a cadeia que estava sempre vindo vazia.
    const lista = await payeesRoutes.request('/', undefined, env)
    const { data } = await lista.json<{
      data: { id: string; default_category_id: string | null }[]
    }>()
    expect(data.find((p) => p.id === payee.id)?.default_category_id).toBe(DAS)
  })

  it('renomeia e RECALCULA norm_name por HTTP', async () => {
    const payee = await criar({
      name: 'Mercado São Luiz  Teresina PI',
      kind: 'merchant',
    })
    const res = await payeesRoutes.request(
      `/${payee.id}`,
      putInit({ name: 'Padaria do Zé' }),
      env,
    )
    expect(res.status).toBe(200)
    const { data } = await res.json<{ data: { norm_name: string } }>()
    expect(data.norm_name).toBe('PADARIA DO ZE')
  })

  it('id inexistente vira 404 not_found', async () => {
    const res = await payeesRoutes.request(
      '/nao-existe',
      putInit({ name: 'X' }),
      env,
    )
    expect(res.status).toBe(404)
    expect((await notificacao(res)).code).toBe('not_found')
  })

  it('rejeita corpo nao-JSON com 400 invalid_json', async () => {
    const payee = await criar({ name: 'Pai', kind: 'person' })
    const res = await payeesRoutes.request(
      `/${payee.id}`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: '{',
      },
      env,
    )
    expect(res.status).toBe(400)
    expect((await notificacao(res)).code).toBe('invalid_json')
  })

  it('categoria inexistente vira 422 cozido, sem vazar o erro cru do D1', async () => {
    const payee = await criar({ name: 'Pai', kind: 'person' })
    const res = await payeesRoutes.request(
      `/${payee.id}`,
      putInit({ default_category_id: 'nao-existe' }),
      env,
    )
    expect(res.status).toBe(422)
    const n = await notificacao(res)
    expect(n.code).toBe('constraint_violation')
    expect(n.message).not.toMatch(/SQLITE|D1_ERROR|FOREIGN KEY|payees/i)
  })

  it('RECUSA norm_name com 422 protected_field — e nada é gravado', async () => {
    const payee = await criar({ name: 'Pai', kind: 'person' })
    const res = await payeesRoutes.request(
      `/${payee.id}`,
      putInit({ name: 'Novo Nome', norm_name: 'QUALQUER COISA' }),
      env,
    )
    expect(res.status).toBe(422)
    const n = await notificacao(res)
    expect(n.code).toBe('protected_field')
    expect(n.field).toBe('norm_name')

    const row = await env.DB.prepare(
      'SELECT name, norm_name FROM payees WHERE id = ?',
    )
      .bind(payee.id)
      .first<{ name: string; norm_name: string }>()
    expect(row).toEqual({ name: 'Pai', norm_name: 'PAI' })
  })

  it('name de tipo errado vira 422 constraint_violation com field', async () => {
    const payee = await criar({ name: 'Pai', kind: 'person' })
    const res = await payeesRoutes.request(
      `/${payee.id}`,
      putInit({ name: 42 }),
      env,
    )
    expect(res.status).toBe(422)
    expect((await notificacao(res)).field).toBe('name')
  })
})
