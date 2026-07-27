import { applyD1Migrations, env } from 'cloudflare:test'
import { Hono } from 'hono'
import { beforeAll, describe, expect, it } from 'vitest'
import { createAccount } from '../domain/accounts'
import { setFixedNetCents } from '../domain/settings'
import { createTransaction } from '../domain/transactions'
import { reportsRoutes } from './reports'

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
})

// Monta so o router, sem o middleware do Access: o objetivo aqui e o
// contrato HTTP + envelope, nao a autenticacao (coberta na Task 4).
function app() {
  const hono = new Hono()
  hono.route('/api/reports', reportsRoutes)
  return hono
}

function get(path: string) {
  return app().request(path, {}, { DB: env.DB })
}

type Envelope<T> = {
  ok: boolean
  data: T
  notifications: Array<{ type: string; code: string; message: string }>
}

async function cartao(name: string) {
  return createAccount(env.DB, {
    name,
    scope: 'PF',
    kind: 'credit_card',
    closing_day: 25,
    due_day: 5,
  })
}

describe('GET /api/reports/commitments', () => {
  it('devolve 200 com envelope ok, competencias e o default de fixed_net_cents', async () => {
    const nubank = await cartao('Nubank cartao rota')
    await createTransaction(env.DB, {
      account_id: nubank.id,
      amount_cents: -124000,
      purchase_date: '2026-07-28',
      bill_competence: '2026-08',
      description: 'parcela rota',
    })

    const res = await get('/api/reports/commitments?from=2026-08&months=3')
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<{
      competences: string[]
      rows: Array<{ account_name: string; cells: number[] }>
      totals: number[]
      fixed_net_cents: number
      pct_of_fixed_net: number[]
    }>
    expect(body.ok).toBe(true)
    expect(body.notifications).toEqual([])
    expect(body.data.competences).toEqual(['2026-08', '2026-09', '2026-10'])
    expect(body.data.rows).toEqual([
      {
        account_id: nubank.id,
        account_name: 'Nubank cartao rota',
        cells: [124000, 0, 0],
      },
    ])
    expect(body.data.totals).toEqual([124000, 0, 0])
    expect(body.data.fixed_net_cents).toBe(360000)
  })

  it('conta sem parcela nenhuma na janela devolve rows vazio, nunca linha zerada', async () => {
    const res = await get('/api/reports/commitments?from=2100-01&months=2')
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<{
      rows: unknown[]
      totals: number[]
    }>
    expect(body.data.rows).toEqual([])
    expect(body.data.totals).toEqual([0, 0])
  })

  it('aceita fixed_net_cents customizado via query', async () => {
    const res = await get(
      '/api/reports/commitments?from=2026-08&months=1&fixed_net_cents=100000',
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<{ fixed_net_cents: number }>
    expect(body.data.fixed_net_cents).toBe(100000)
  })

  // Task 10: fixed_net_cents deixou de ser só constante+override de query —
  // agora é editável via PUT /api/settings (settings.ts), sem deploy. Sem
  // `?fixed_net_cents=` explícito na query, o default passa a ser o valor
  // SALVO (quando existir), não mais direto DEFAULT_FIXED_NET_CENTS.
  it('sem override na query, usa o valor SALVO em settings como default', async () => {
    await setFixedNetCents(env.DB, 548000)

    const res = await get('/api/reports/commitments?from=2026-08&months=1')
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<{ fixed_net_cents: number }>
    expect(body.data.fixed_net_cents).toBe(548000)
  })

  // Precedência: ?fixed_net_cents= explícito na query SEMPRE vence o valor
  // salvo — é o atalho de depuração/preview documentado no CLAUDE.md, nunca
  // grava nada (só o PUT persiste).
  it('fixed_net_cents na query vence o valor salvo em settings', async () => {
    await setFixedNetCents(env.DB, 548000)

    const res = await get(
      '/api/reports/commitments?from=2026-08&months=1&fixed_net_cents=250000',
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<{ fixed_net_cents: number }>
    expect(body.data.fixed_net_cents).toBe(250000)
  })

  // Fix round 1 (Minor 1 do review): fixed_net_cents PRESENTE mas INVÁLIDO
  // (vazio, não numérico, ≤ 0) precisa cair pro valor SALVO, não pular
  // direto pro DEFAULT_FIXED_NET_CENTS — senão um bookmark velho ou uma URL
  // de debug digitada errada faz o dono "perder" um valor que ele salvou de
  // verdade, em silêncio (sem 400, sem aviso nenhum). it.each cobre as três
  // formas de "presente mas inválido" citadas no achado do review.
  it.each([
    ['vazio', ''],
    ['não numérico', 'abc'],
    ['negativo', '-5'],
  ])(
    'fixed_net_cents=%s (presente mas inválido) usa o valor SALVO, não o default',
    async (_label, valorInvalido) => {
      await setFixedNetCents(env.DB, 548000)

      const res = await get(
        `/api/reports/commitments?from=2026-08&months=1&fixed_net_cents=${valorInvalido}`,
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as Envelope<{ fixed_net_cents: number }>
      expect(body.data.fixed_net_cents).toBe(548000)
    },
  )

  it('sem query nenhuma (from vazio) devolve 400 invalid_query', async () => {
    const res = await get('/api/reports/commitments')
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.ok).toBe(false)
    expect(body.notifications[0].code).toBe('invalid_query')
  })

  it("from='2026-8' (formato invalido) devolve 400 invalid_query", async () => {
    const res = await get('/api/reports/commitments?from=2026-8&months=6')
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.ok).toBe(false)
    expect(body.notifications[0].code).toBe('invalid_query')
  })

  it('months=0 devolve 400 invalid_query', async () => {
    const res = await get('/api/reports/commitments?from=2026-08&months=0')
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.ok).toBe(false)
    expect(body.notifications[0].code).toBe('invalid_query')
  })

  it('months nao numerico devolve 400 invalid_query', async () => {
    const res = await get('/api/reports/commitments?from=2026-08&months=abc')
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.ok).toBe(false)
    expect(body.notifications[0].code).toBe('invalid_query')
  })
})

describe('GET /api/reports/by-category', () => {
  it('devolve 200 com envelope ok, competencia e linhas por categoria', async () => {
    const conta = await createAccount(env.DB, {
      name: 'Conta corrente rota by-category',
      scope: 'PF',
      kind: 'checking',
    })
    await createTransaction(env.DB, {
      account_id: conta.id,
      amount_cents: -8000,
      purchase_date: '2026-07-12',
      description: 'Mercado rota',
      settled_at: '2026-07-12',
    })

    const res = await get('/api/reports/by-category?competence=2026-07')
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<{
      competence: string
      rows: Array<{
        category_id: string | null
        category_name: string
        category_slug: string | null
        total_cents: number
      }>
      total_cents: number
    }>
    expect(body.ok).toBe(true)
    expect(body.notifications).toEqual([])
    expect(body.data.competence).toBe('2026-07')
    expect(body.data.rows).toEqual([
      {
        category_id: null,
        category_name: 'Sem categoria',
        category_slug: null,
        total_cents: -8000,
      },
    ])
    expect(body.data.total_cents).toBe(-8000)
  })

  it('mes sem lancamento nenhum devolve rows vazio e total zero', async () => {
    const res = await get('/api/reports/by-category?competence=2100-02')
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<{
      rows: unknown[]
      total_cents: number
    }>
    expect(body.data.rows).toEqual([])
    expect(body.data.total_cents).toBe(0)
  })

  it('sem competence devolve 400 invalid_query', async () => {
    const res = await get('/api/reports/by-category')
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.ok).toBe(false)
    expect(body.notifications[0].code).toBe('invalid_query')
  })

  it("competence='2026-7' (formato invalido) devolve 400 invalid_query", async () => {
    const res = await get('/api/reports/by-category?competence=2026-7')
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.ok).toBe(false)
    expect(body.notifications[0].code).toBe('invalid_query')
  })

  it("competence='2026-13' (mes inexistente) devolve 400 invalid_query", async () => {
    const res = await get('/api/reports/by-category?competence=2026-13')
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.ok).toBe(false)
    expect(body.notifications[0].code).toBe('invalid_query')
  })
})
