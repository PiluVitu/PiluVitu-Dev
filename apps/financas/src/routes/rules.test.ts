import { env } from 'cloudflare:test'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { createAccount } from '../domain/accounts'
import { createRule, type NewRule } from '../domain/rules'
import { errJson } from '../lib/envelope'
import { newId } from '../lib/ids'
import { rulesRoutes } from './rules'

const db = env.DB

function app() {
  const a = new Hono()
  a.route('/api/rules', rulesRoutes)
  return a
}

type Envelope<T> = {
  ok: boolean
  data: T
  notifications: { type: string; code: string; message: string }[]
}

async function req<T>(
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: Envelope<T> }> {
  const res = await app().request(`/api/rules${path}`, init, { DB: db })
  return { status: res.status, body: (await res.json()) as Envelope<T> }
}

const corpoValido = {
  name: 'Uber → Transporte',
  match_text: 'uber',
  set_is_business: 1,
} satisfies NewRule

function post(body: unknown) {
  return req<{ id: string }>('', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

describe('POST /api/rules', () => {
  it('201 com a linha inteira no envelope', async () => {
    const { status, body } = await post(corpoValido)
    expect(status).toBe(201)
    expect(body.ok).toBe(true)
    expect(body.data).toMatchObject({
      name: 'Uber → Transporte',
      match_text: 'uber',
      set_is_business: 1,
      priority: 100,
      active: 1,
    })
  })

  it('corpo que não é JSON → 400 invalid_json', async () => {
    const res = await app().request(
      '/api/rules',
      { method: 'POST', body: 'nada disso' },
      { DB: db },
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0].code).toBe('invalid_json')
  })

  it('name ausente → 422 constraint_violation', async () => {
    const { status, body } = await post({ match_text: 'x', set_is_business: 1 })
    expect(status).toBe(422)
    expect(body.notifications[0].code).toBe('constraint_violation')
  })

  it('tipo errado num campo numérico → 422, sem chegar no domínio', async () => {
    const { status, body } = await post({
      ...corpoValido,
      match_min_cents: 'muito',
    })
    expect(status).toBe(422)
    expect(body.notifications[0].message).toMatch(/match_min_cents/)
  })

  it('regra sem condição → 422 com a mensagem do domínio, que diz POR QUÊ', async () => {
    const { status, body } = await post({ name: 'tudo', set_is_business: 1 })
    expect(status).toBe(422)
    expect(body.notifications[0].message).toMatch(/casaria com todos/)
  })

  it('FK inexistente → 422 COZIDO, nunca o texto cru do D1', async () => {
    const { status, body } = await post({
      ...corpoValido,
      set_category_id: newId(),
    })
    expect(status).toBe(422)
    expect(body.notifications[0].code).toBe('constraint_violation')
    expect(body.notifications[0].message).not.toMatch(
      /SQLITE|D1_ERROR|FOREIGN KEY|rules/i,
    )
  })
})

describe('GET /api/rules', () => {
  it('devolve ativas E pausadas, na ordem de aplicação', async () => {
    await createRule(db, { ...corpoValido, name: 'B', priority: 200 })
    await createRule(db, { ...corpoValido, name: 'A', priority: 50 })
    await createRule(db, {
      ...corpoValido,
      name: 'Pausada',
      priority: 300,
      active: 0,
    })
    const { status, body } = await req<{ name: string }[]>('')
    expect(status).toBe(200)
    expect(body.data.map((r) => r.name)).toEqual(['A', 'B', 'Pausada'])
  })

  it('sem nenhuma regra devolve lista vazia, nunca 404', async () => {
    const { status, body } = await req<unknown[]>('')
    expect(status).toBe(200)
    expect(body.data).toEqual([])
  })
})

describe('PUT /api/rules/:id', () => {
  it('patch parcial muda só o campo mandado', async () => {
    const r = await createRule(db, corpoValido)
    const { status, body } = await req<{ priority: number; name: string }>(
      `/${r.id}`,
      {
        method: 'PUT',
        body: JSON.stringify({ priority: 5 }),
        headers: { 'content-type': 'application/json' },
      },
    )
    expect(status).toBe(200)
    expect(body.data.priority).toBe(5)
    expect(body.data.name).toBe('Uber → Transporte')
  })

  it('id inexistente → 404', async () => {
    const { status, body } = await req(`/${newId()}`, {
      method: 'PUT',
      body: JSON.stringify({ priority: 5 }),
      headers: { 'content-type': 'application/json' },
    })
    expect(status).toBe(404)
    expect(body.notifications[0].code).toBe('not_found')
  })

  it('patch que apaga a última condição → 422 e NADA é gravado', async () => {
    const r = await createRule(db, corpoValido)
    const { status, body } = await req(`/${r.id}`, {
      method: 'PUT',
      body: JSON.stringify({ match_text: null }),
      headers: { 'content-type': 'application/json' },
    })
    expect(status).toBe(422)
    expect(body.notifications[0].message).toMatch(/casaria com todos/)
    const lida = await db
      .prepare('SELECT match_text FROM rules WHERE id = ?')
      .bind(r.id)
      .first<{ match_text: string | null }>()
    expect(lida?.match_text).toBe('uber')
  })

  it('pausar é PUT active: 0 — a regra continua na listagem', async () => {
    const r = await createRule(db, corpoValido)
    await req(`/${r.id}`, {
      method: 'PUT',
      body: JSON.stringify({ active: 0 }),
      headers: { 'content-type': 'application/json' },
    })
    const { body } = await req<{ id: string; active: number }[]>('')
    expect(body.data).toEqual([
      expect.objectContaining({ id: r.id, active: 0 }),
    ])
  })
})

describe('DELETE /api/rules/:id', () => {
  it('200 e some da listagem', async () => {
    const r = await createRule(db, corpoValido)
    const { status, body } = await req<{ deleted: boolean }>(`/${r.id}`, {
      method: 'DELETE',
    })
    expect(status).toBe(200)
    expect(body.data).toEqual({ id: r.id, deleted: true })
    expect((await req<unknown[]>('')).body.data).toEqual([])
  })

  it('id inexistente → 404', async () => {
    const { status } = await req(`/${newId()}`, { method: 'DELETE' })
    expect(status).toBe(404)
  })
})

describe('GET /api/rules/matches', () => {
  it('conta os lançamentos existentes por regra, e diz o tamanho da janela', async () => {
    const conta = await createAccount(db, {
      name: 'Nubank',
      scope: 'PJ',
      kind: 'checking',
    })
    for (const [descricao, valor] of [
      ['UBER *TRIP', -2350],
      ['uber *trip 2', -1800],
      ['IFOOD', -4500],
    ] as const) {
      await db
        .prepare(
          `INSERT INTO transactions
            (id, account_id, amount_cents, currency, purchase_date, description,
             is_business, created_at, updated_at)
           VALUES (?, ?, ?, 'BRL', '2026-08-10', ?, 0, ?, ?)`,
        )
        .bind(
          newId(),
          conta.id,
          valor,
          descricao,
          '2026-08-10T00:00:00Z',
          '2026-08-10T00:00:00Z',
        )
        .run()
    }
    const uber = await createRule(db, corpoValido)

    const { status, body } = await req<{
      scanned: number
      counts: Record<string, number>
      scan_limit: number
    }>('/matches')
    expect(status).toBe(200)
    expect(body.data.scanned).toBe(3)
    expect(body.data.counts[uber.id]).toBe(2)
    // ⚠️ O teto volta no corpo: apresentar a contagem sem dizer a janela
    // seria vendê-la como "o histórico inteiro".
    expect(body.data.scan_limit).toBeGreaterThan(0)
  })

  it('⚠️ regra PAUSADA também é contada — é o número que decide se vale reativar', async () => {
    // CONTRATO, não descuido (ver o comentário de `/matches` em routes/rules.ts).
    // Filtrar `active = 1` aqui deixaria a tela sem nada a dizer justamente
    // sobre a regra cujo futuro o dono está decidindo. Quem paga o preço é o
    // TEMPO VERBAL na SPA ("se reativada, casaria…"), nunca a contagem.
    const conta = await createAccount(db, {
      name: 'Nubank',
      scope: 'PJ',
      kind: 'checking',
    })
    await db
      .prepare(
        `INSERT INTO transactions
          (id, account_id, amount_cents, currency, purchase_date, description,
           is_business, created_at, updated_at)
         VALUES (?, ?, -2350, 'BRL', '2026-08-10', 'UBER *TRIP', 0, ?, ?)`,
      )
      .bind(newId(), conta.id, '2026-08-10T00:00:00Z', '2026-08-10T00:00:00Z')
      .run()

    const ativa = await createRule(db, corpoValido)
    const pausada = await createRule(db, { ...corpoValido, active: 0 })

    const { body } = await req<{ counts: Record<string, number> }>('/matches')
    expect(body.data.counts[ativa.id]).toBe(1)
    expect(body.data.counts[pausada.id]).toBe(1)
  })

  it('/matches NÃO é capturado como id — a ordem de registro importa', async () => {
    // Se um `GET /:id` for acrescentado ACIMA desta rota um dia, "matches"
    // vira o id e este teste morre — que é exatamente o ponto.
    const { status, body } = await req<{ counts: Record<string, number> }>(
      '/matches',
    )
    expect(status).toBe(200)
    expect(body.data.counts).toEqual({})
  })
})

describe('registro acima do catch-all', () => {
  it('GET /api/rules bate no handler, não no 404 genérico', async () => {
    // Monta na MESMA ordem de src/index.ts (rota, depois catch-all) e prova
    // por execução, não por leitura do arquivo.
    const a = new Hono()
    a.route('/api/rules', rulesRoutes)
    a.all('/api/*', () => errJson(404, 'not_found', 'rota não encontrada'))
    const res = await a.request('/api/rules', undefined, { DB: db })
    expect(res.status).toBe(200)
  })
})
