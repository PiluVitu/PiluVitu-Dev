import { applyD1Migrations, env } from 'cloudflare:test'
import { Hono } from 'hono'
import { beforeAll, describe, expect, it } from 'vitest'
import { createAccount } from '../domain/accounts'
import { MAX_FIXED_NET_CENTS, setFixedNetCents } from '../domain/settings'
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
      totals: Array<{ min: number; max: number }>
      fixed_net_cents: number
      pct_of_fixed_net: Array<{ min: number; max: number }>
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
    // Sem recorrente cadastrada nesta rota: min === max, mesmo valor de
    // antes desta task (Task 3, faixa em domain/reports.ts).
    expect(body.data.totals).toEqual([
      { min: 124000, max: 124000 },
      { min: 0, max: 0 },
      { min: 0, max: 0 },
    ])
    expect(body.data.fixed_net_cents).toBe(360000)
  })

  it('conta sem parcela nenhuma na janela devolve rows vazio, nunca linha zerada', async () => {
    const res = await get('/api/reports/commitments?from=2100-01&months=2')
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<{
      rows: unknown[]
      totals: Array<{ min: number; max: number }>
    }>
    expect(body.data.rows).toEqual([])
    expect(body.data.totals).toEqual([
      { min: 0, max: 0 },
      { min: 0, max: 0 },
    ])
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
    // M7 (fix final): antes deste fix, `resolveFixedNetCents` aceitava
    // qualquer `Number.isFinite(n) && n > 0` — uma fração de centavo
    // passava direto (denominador `360000.5` num app cuja moeda é
    // INTEGER centavos ponta a ponta), e um valor acima do teto de
    // sanidade também não era barrado aqui (só em `setFixedNetCents`, o
    // caminho que PERSISTE). Agora exige `Number.isInteger` e
    // `<= MAX_FIXED_NET_CENTS`, igual ao caminho que salva.
    ['fração de centavo (não inteiro)', '360000.5'],
    ['acima do teto de sanidade', String(MAX_FIXED_NET_CENTS + 1)],
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

  // CRITICAL C2 (fix final): `resolveFixedNetCents` é chamado FORA do
  // try/catch da rota (linha acima da chamada de `commitments()`), e
  // `src/index.ts` não registra `onError` — antes deste fix, um `SELECT`
  // contra uma tabela `settings` ausente (deploy rodado antes da
  // migration 0005, ver CLAUDE.md/"Deploy") propagava cru até um 500 sem
  // envelope. `getFixedNetCents` (`domain/settings.ts`) agora captura
  // esse erro e degrada pro default — este teste prova que a ROTA (não
  // só o domínio) continua respondendo 200 com o piso de sempre mesmo
  // com a tabela inteira faltando.
  it('tabela settings ausente: commitments continua 200 com o default, nunca 500', async () => {
    await env.DB.prepare('DROP TABLE settings').run()

    const res = await get('/api/reports/commitments?from=2026-08&months=1')
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<{ fixed_net_cents: number }>
    expect(body.ok).toBe(true)
    expect(body.data.fixed_net_cents).toBe(360000)
  })

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

describe('GET /api/reports/cashflow', () => {
  it('devolve 200 com envelope ok, meses e linhas (entrou/saiu/saldo/acumulado)', async () => {
    const conta = await createAccount(env.DB, {
      name: 'Conta corrente fluxo',
      scope: 'PJ',
      kind: 'checking',
    })
    await createTransaction(env.DB, {
      account_id: conta.id,
      amount_cents: 500000,
      purchase_date: '2026-07-05',
      settled_at: '2026-07-05',
      description: 'entrada fluxo rota',
    })
    await createTransaction(env.DB, {
      account_id: conta.id,
      amount_cents: -120000,
      purchase_date: '2026-07-10',
      settled_at: '2026-07-10',
      description: 'saida fluxo rota',
    })

    const res = await get('/api/reports/cashflow?from=2026-07&months=1')
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<{
      meses: string[]
      linhas: Array<{
        competence: string
        entrou_cents: number
        saiu_cents: number
        saldo_cents: number
        acumulado_cents: number
      }>
    }>
    expect(body.ok).toBe(true)
    expect(body.notifications).toEqual([])
    expect(body.data.meses).toEqual(['2026-07'])
    expect(body.data.linhas).toEqual([
      {
        competence: '2026-07',
        entrou_cents: 500000,
        saiu_cents: 120000,
        saldo_cents: 380000,
        acumulado_cents: 380000,
      },
    ])
  })

  it('sem months explicito usa o default de 12 meses', async () => {
    const res = await get('/api/reports/cashflow?from=2026-07')
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<{ meses: string[] }>
    expect(body.data.meses).toHaveLength(12)
    expect(body.data.meses[0]).toBe('2026-07')
  })

  it('sem from devolve 400 invalid_query', async () => {
    const res = await get('/api/reports/cashflow')
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.ok).toBe(false)
    expect(body.notifications[0].code).toBe('invalid_query')
  })

  // O branch de RangeError e' obrigatorio aqui: sem ele, um `from` malformado
  // vazaria como 500 sem envelope (ja aconteceu nesse modulo antes — ver
  // CLAUDE.md, secao "Relatorio de comprometido"/"Relatorio por categoria").
  it("from='2026-8' (formato invalido) devolve 400 invalid_query, nao 500", async () => {
    const res = await get('/api/reports/cashflow?from=2026-8&months=6')
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.ok).toBe(false)
    expect(body.notifications[0].code).toBe('invalid_query')
  })

  it("from='2026-13' (mes inexistente) devolve 400 invalid_query", async () => {
    const res = await get('/api/reports/cashflow?from=2026-13&months=6')
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.ok).toBe(false)
    expect(body.notifications[0].code).toBe('invalid_query')
  })

  it('months=0 devolve 400 invalid_query', async () => {
    const res = await get('/api/reports/cashflow?from=2026-07&months=0')
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.ok).toBe(false)
    expect(body.notifications[0].code).toBe('invalid_query')
  })

  it('months nao numerico devolve 400 invalid_query', async () => {
    const res = await get('/api/reports/cashflow?from=2026-07&months=abc')
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.ok).toBe(false)
    expect(body.notifications[0].code).toBe('invalid_query')
  })

  // cashflow() (domain/cashflow.ts, Task 1) valida months em 1..24 — o
  // mesmo teto de commitments(). months=25 tem que ser rejeitado, nao
  // silenciosamente aceito nem vazar como 500.
  it('months=25 (acima do teto de cashflow()) devolve 400 invalid_query', async () => {
    const res = await get('/api/reports/cashflow?from=2026-07&months=25')
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
