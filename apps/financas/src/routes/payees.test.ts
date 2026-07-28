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
