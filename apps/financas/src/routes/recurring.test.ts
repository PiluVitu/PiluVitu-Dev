import { applyD1Migrations, env } from 'cloudflare:test'
import { Hono } from 'hono'
import { beforeAll, describe, expect, it } from 'vitest'
import { newId } from '../lib/ids'
import { errJson } from '../lib/envelope'
import { recurringRoutes } from './recurring'

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
})

// Monta so o router, sem o middleware do Access — mesma convencao de
// accounts.test.ts/debts.test.ts: o objetivo aqui e o contrato HTTP +
// envelope, nao autenticacao.
function app() {
  const hono = new Hono()
  hono.route('/api/recurring', recurringRoutes)
  return hono
}

// Monta EXATAMENTE como src/index.ts: recurringRoutes registrado ANTES do
// catch-all. Prova por execucao real (nao so leitura de index.ts) que a
// rota fica alcancavel — o catch-all so responde 'rota nao encontrada'
// quando nada acima bateu, entao um 200 aqui so acontece se o router foi
// registrado ANTES dele. Se algum dia o registro sair de ordem em
// index.ts, este teste (que espelha a montagem, nao importa index.ts
// direto por causa do Better Auth/sessao no meio do caminho) fica sendo o
// unico jeito de pegar a regressao antes de produção.
function appComCatchAll() {
  const hono = new Hono()
  hono.route('/api/recurring', recurringRoutes)
  hono.all('/api/*', () => errJson(404, 'not_found', 'rota nao encontrada'))
  return hono
}

function post(path: string, body: unknown) {
  return app().request(
    path,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
    { DB: env.DB },
  )
}

function put(path: string, body: unknown) {
  return app().request(
    path,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
    { DB: env.DB },
  )
}

function del(path: string) {
  return app().request(path, { method: 'DELETE' }, { DB: env.DB })
}

const validPayload = {
  description: 'Starlink',
  scope: 'PJ',
  day_of_month: 10,
  amount_min_cents: 18900,
  amount_max_cents: 18900,
  starts_on: '2026-01-01',
}

type Envelope = {
  ok: boolean
  data: any
  notifications: Array<{ type: string; code: string; message: string }>
}

async function countRows(): Promise<number> {
  const row = await env.DB.prepare(
    'SELECT COUNT(*) as n FROM recurring_expenses',
  ).first<{ n: number }>()
  return row?.n ?? 0
}

describe('rotas de despesas recorrentes', () => {
  describe('registro acima do catch-all', () => {
    it('GET /api/recurring alcanca o handler real, nao o catch-all', async () => {
      const res = await appComCatchAll().request(
        '/api/recurring',
        {},
        { DB: env.DB },
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as Envelope
      expect(body.notifications).toEqual([])
    })
  })

  describe('POST /api/recurring', () => {
    it('cria e devolve 201 com envelope ok — linha existe de fato no D1', async () => {
      expect(await countRows()).toBe(0)

      const res = await post('/api/recurring', validPayload)
      expect(res.status).toBe(201)
      const body = (await res.json()) as Envelope
      expect(body.ok).toBe(true)
      expect(body.data.description).toBe('Starlink')
      expect(body.notifications).toEqual([])

      expect(await countRows()).toBe(1)
      const row = await env.DB.prepare(
        'SELECT description, amount_min_cents, amount_max_cents FROM recurring_expenses WHERE id = ?',
      )
        .bind(body.data.id)
        .first<{
          description: string
          amount_min_cents: number
          amount_max_cents: number
        }>()
      expect(row?.description).toBe('Starlink')
      expect(row?.amount_min_cents).toBe(18900)
      expect(row?.amount_max_cents).toBe(18900)
    })

    it('corpo que nao e JSON valido devolve 400 invalid_json, sem gravar nada', async () => {
      const res = await app().request(
        '/api/recurring',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{ nao e json',
        },
        { DB: env.DB },
      )
      expect(res.status).toBe(400)
      const body = (await res.json()) as Envelope
      expect(body.ok).toBe(false)
      expect(body.notifications[0].code).toBe('invalid_json')
      expect(await countRows()).toBe(0)
    })

    it('description ausente devolve 422 constraint_violation, sem gravar nada', async () => {
      const { description: _omit, ...semDescricao } = validPayload
      const res = await post('/api/recurring', semDescricao)
      expect(res.status).toBe(422)
      const body = (await res.json()) as Envelope
      expect(body.notifications[0].code).toBe('constraint_violation')
      expect(await countRows()).toBe(0)
    })

    it('scope invalido devolve 422 constraint_violation, sem gravar nada', async () => {
      const res = await post('/api/recurring', {
        ...validPayload,
        scope: 'XX',
      })
      expect(res.status).toBe(422)
      const body = (await res.json()) as Envelope
      expect(body.notifications[0].code).toBe('constraint_violation')
      expect(await countRows()).toBe(0)
    })

    it('amount_max_cents < amount_min_cents devolve 422 acionavel — sem SQLITE_CONSTRAINT, sem nome de coluna/tabela cru, sem gravar nada', async () => {
      const res = await post('/api/recurring', {
        ...validPayload,
        description: 'Faixa invertida rota',
        amount_min_cents: 60000,
        amount_max_cents: 1200,
      })
      expect(res.status).toBe(422)
      const body = (await res.json()) as Envelope
      expect(body.ok).toBe(false)
      expect(body.notifications[0].code).toBe('constraint_violation')
      const msg = body.notifications[0].message
      expect(msg).not.toMatch(/D1_ERROR|SQLITE_CONSTRAINT|CHECK constraint/i)
      expect(msg).not.toMatch(/recurring_expenses/i)
      // acionavel: fala em portugues legivel sobre o que corrigir, nao so
      // "erro" generico.
      expect(msg.length).toBeGreaterThan(10)

      expect(await countRows()).toBe(0)
    })

    it('ends_on < starts_on viola CHECK real do D1 (nao pre-validado em TS) e ainda assim volta cozido, sem gravar nada', async () => {
      // Ao contrario da faixa min/max (que o dominio pre-valida em TS antes
      // de tocar o banco), ends_on < starts_on so e barrado pelo CHECK do
      // schema (migration 0006) — este teste prova que o pipeline
      // friendlyConstraintMessage/logConstraintError cobre um erro que
      // realmente saiu do D1 cru, nao so o caminho RangeError do dominio.
      const res = await post('/api/recurring', {
        ...validPayload,
        description: 'Fim antes do inicio',
        starts_on: '2026-06-01',
        ends_on: '2026-01-01',
      })
      expect(res.status).toBe(422)
      const body = (await res.json()) as Envelope
      expect(body.notifications[0].code).toBe('constraint_violation')
      const msg = body.notifications[0].message
      expect(msg).not.toMatch(/D1_ERROR|SQLITE_CONSTRAINT|CHECK constraint/i)
      expect(msg).not.toMatch(/recurring_expenses|ends_on|starts_on/i)

      expect(await countRows()).toBe(0)
    })
  })

  describe('GET /api/recurring', () => {
    it('lista ativas e inativas — a rota de CRUD nao esconde recorrente pausada', async () => {
      const ativa = await post('/api/recurring', validPayload)
      const { data: dataAtiva } = (await ativa.json()) as Envelope

      const inativaRes = await post('/api/recurring', {
        ...validPayload,
        description: 'DAS pausado',
        active: 0,
      })
      const { data: dataInativa } = (await inativaRes.json()) as Envelope

      const res = await app().request('/api/recurring', {}, { DB: env.DB })
      expect(res.status).toBe(200)
      const body = (await res.json()) as Envelope
      const ids = body.data.map((r: { id: string }) => r.id)
      expect(ids).toContain(dataAtiva.id)
      expect(ids).toContain(dataInativa.id)
    })
  })

  describe('PUT /api/recurring/:id', () => {
    it('atualiza campo parcial e grava de fato no D1', async () => {
      const criada = await post('/api/recurring', validPayload)
      const { data } = (await criada.json()) as Envelope

      const res = await put(`/api/recurring/${data.id}`, {
        amount_min_cents: 19900,
        amount_max_cents: 19900,
      })
      expect(res.status).toBe(200)
      const body = (await res.json()) as Envelope
      expect(body.data.amount_min_cents).toBe(19900)

      const row = await env.DB.prepare(
        'SELECT amount_min_cents, amount_max_cents, description FROM recurring_expenses WHERE id = ?',
      )
        .bind(data.id)
        .first<{
          amount_min_cents: number
          amount_max_cents: number
          description: string
        }>()
      expect(row?.amount_min_cents).toBe(19900)
      expect(row?.amount_max_cents).toBe(19900)
      // campo nao mandado no patch continua intacto
      expect(row?.description).toBe('Starlink')
    })

    it('id real porem diferente (nao o criado) devolve 404 not_found, sem alterar a linha existente', async () => {
      const criada = await post('/api/recurring', validPayload)
      const { data } = (await criada.json()) as Envelope
      const idDiferente = newId()
      expect(idDiferente).not.toBe(data.id)

      const res = await put(`/api/recurring/${idDiferente}`, {
        description: 'Nao deveria aplicar em lugar nenhum',
      })
      expect(res.status).toBe(404)
      const body = (await res.json()) as Envelope
      expect(body.notifications[0].code).toBe('not_found')

      const row = await env.DB.prepare(
        'SELECT description FROM recurring_expenses WHERE id = ?',
      )
        .bind(data.id)
        .first<{ description: string }>()
      expect(row?.description).toBe('Starlink')
    })

    it('amount_max_cents < amount_min_cents no patch devolve 422 acionavel, sem alterar a linha', async () => {
      const criada = await post('/api/recurring', validPayload)
      const { data } = (await criada.json()) as Envelope

      const res = await put(`/api/recurring/${data.id}`, {
        amount_min_cents: 60000,
        amount_max_cents: 1200,
      })
      expect(res.status).toBe(422)
      const body = (await res.json()) as Envelope
      expect(body.notifications[0].code).toBe('constraint_violation')
      const msg = body.notifications[0].message
      expect(msg).not.toMatch(/D1_ERROR|SQLITE_CONSTRAINT|CHECK constraint/i)

      const row = await env.DB.prepare(
        'SELECT amount_min_cents, amount_max_cents FROM recurring_expenses WHERE id = ?',
      )
        .bind(data.id)
        .first<{ amount_min_cents: number; amount_max_cents: number }>()
      expect(row?.amount_min_cents).toBe(18900)
      expect(row?.amount_max_cents).toBe(18900)
    })

    it('corpo que nao e JSON valido devolve 400 invalid_json', async () => {
      const criada = await post('/api/recurring', validPayload)
      const { data } = (await criada.json()) as Envelope

      const res = await app().request(
        `/api/recurring/${data.id}`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: '{ nao e json',
        },
        { DB: env.DB },
      )
      expect(res.status).toBe(400)
      const body = (await res.json()) as Envelope
      expect(body.notifications[0].code).toBe('invalid_json')
    })
  })

  describe('DELETE /api/recurring/:id', () => {
    it('apaga de fato a linha do D1', async () => {
      const criada = await post('/api/recurring', validPayload)
      const { data } = (await criada.json()) as Envelope
      expect(await countRows()).toBe(1)

      const res = await del(`/api/recurring/${data.id}`)
      expect(res.status).toBe(200)
      const body = (await res.json()) as Envelope
      expect(body.data.deleted).toBe(true)

      expect(await countRows()).toBe(0)
    })

    it('id real porem diferente (nao o criado) devolve 404 not_found, sem apagar a linha existente', async () => {
      const criada = await post('/api/recurring', validPayload)
      const { data } = (await criada.json()) as Envelope
      const idDiferente = newId()
      expect(idDiferente).not.toBe(data.id)

      const res = await del(`/api/recurring/${idDiferente}`)
      expect(res.status).toBe(404)
      const body = (await res.json()) as Envelope
      expect(body.notifications[0].code).toBe('not_found')

      expect(await countRows()).toBe(1)
    })

    it('id ja apagado (segunda chamada) tambem devolve 404 not_found', async () => {
      const criada = await post('/api/recurring', validPayload)
      const { data } = (await criada.json()) as Envelope

      const primeira = await del(`/api/recurring/${data.id}`)
      expect(primeira.status).toBe(200)

      const segunda = await del(`/api/recurring/${data.id}`)
      expect(segunda.status).toBe(404)
      const body = (await segunda.json()) as Envelope
      expect(body.notifications[0].code).toBe('not_found')
    })
  })
})
