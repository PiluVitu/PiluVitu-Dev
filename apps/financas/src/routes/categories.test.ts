import { applyD1Migrations, env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import app from '../index'
import { categoriesRoutes } from './categories'

type Categoria = { id: string; name: string; kind: string; slug: string | null }

beforeEach(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
})

describe('categoriesRoutes', () => {
  it('esta montado ACIMA do catch-all /api/*', () => {
    const primeiro = app.routes.findIndex((r) =>
      r.path.startsWith('/api/categories'),
    )
    // Ver nota em routes/payees.test.ts: '/api/*' aparece 2x (middleware do
    // Access + catch-all) — pega a ÚLTIMA ocorrência, que é o catch-all real.
    const catchAll = app.routes.reduce(
      (last, r, i) => (r.path === '/api/*' ? i : last),
      -1,
    )
    expect(primeiro).toBeGreaterThanOrEqual(0)
    expect(catchAll).toBeGreaterThanOrEqual(0)
    expect(primeiro).toBeLessThan(catchAll)
  })

  it('devolve as categorias semeadas, incluindo os 4 slugs do gap da PJ', async () => {
    const res = await categoriesRoutes.request('/', undefined, env)
    expect(res.status).toBe(200)

    const body = await res.json<{
      ok: boolean
      data: Categoria[]
      notifications: unknown[]
    }>()
    expect(body.ok).toBe(true)
    expect(body.notifications).toEqual([])
    expect(body.data.length).toBeGreaterThan(0)

    const slugs = body.data.map((c) => c.slug)
    for (const slug of ['das', 'contador', 'inss', 'pro-labore']) {
      expect(slugs).toContain(slug)
    }

    const quitacao = body.data.find((c) => c.slug === 'quitacao-divida')
    expect(quitacao?.kind).toBe('debt_settlement')
  })

  it('filtra por kind e rejeita kind invalido com 400 invalid_query', async () => {
    const ok = await categoriesRoutes.request(
      '/?kind=debt_settlement',
      undefined,
      env,
    )
    const body = await ok.json<{ data: Categoria[] }>()
    expect(body.data.every((c) => c.kind === 'debt_settlement')).toBe(true)

    const ruim = await categoriesRoutes.request('/?kind=lucro', undefined, env)
    expect(ruim.status).toBe(400)
    const erro = await ruim.json<{ notifications: { code?: string }[] }>()
    expect(erro.notifications[0].code).toBe('invalid_query')
  })
})
