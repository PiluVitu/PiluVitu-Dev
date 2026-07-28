import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { installmentPlansRoutes } from './installments'

async function seedAccount(id: string, kind: 'credit_card' | 'checking') {
  await env.DB.prepare(
    `INSERT INTO accounts (id, name, scope, kind, institution, currency, closing_day, due_day,
       credit_limit_cents, opening_balance_cents, opening_date, archived_at, created_at, updated_at)
     VALUES (?, ?, 'PF', ?, 'Nubank', 'BRL', ?, ?, NULL, 0, NULL, NULL,
       '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z')`,
  )
    .bind(
      id,
      `conta ${id}`,
      kind,
      kind === 'credit_card' ? 25 : null,
      kind === 'credit_card' ? 5 : null,
    )
    .run()
  return id
}

function post(body: unknown) {
  return installmentPlansRoutes.request(
    '/',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    },
    { DB: env.DB },
  )
}

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM installments'),
    env.DB.prepare('DELETE FROM installment_plans'),
    env.DB.prepare('DELETE FROM transactions'),
    env.DB.prepare('DELETE FROM accounts'),
  ])
})

describe('POST /api/installment-plans', () => {
  it('cria o plano e devolve envelope ok com as parcelas', async () => {
    const accountId = await seedAccount('acc-cc', 'credit_card')

    const res = await post({
      account_id: accountId,
      description: 'Fone',
      total_cents: 10000,
      installments_count: 3,
      purchase_date: '2026-07-10',
    })
    const body = (await res.json()) as {
      ok: boolean
      data: {
        plan: { first_competence: string }
        installments: unknown[]
      } | null
      notifications: unknown[]
    }

    expect(res.status).toBe(201)
    expect(body.ok).toBe(true)
    expect(body.notifications).toEqual([])
    expect(body.data?.installments).toHaveLength(3)
    expect(body.data?.plan.first_competence).toBe('2026-07')
  })

  it('is_business: 1 (numero, o wire type que a SPA manda) grava as parcelas com is_business = 1', async () => {
    // Regressao: routes/installments.ts comparava `body.is_business === true`
    // — como a SPA manda NUMERO (1|0, mesmo wire type de /api/transactions),
    // `1 === true` e `false` em JS e todo plano de parcelas gravava
    // is_business = 0 mesmo com "PJ" marcado. 201/sem aviso: silencioso.
    const accountId = await seedAccount('acc-cc', 'credit_card')

    const res = await post({
      account_id: accountId,
      description: 'Contador PJ',
      total_cents: 30000,
      installments_count: 3,
      purchase_date: '2026-07-10',
      is_business: 1,
    })
    expect(res.status).toBe(201)

    const rows = await env.DB.prepare(
      'SELECT is_business FROM transactions WHERE account_id = ? ORDER BY created_at',
    )
      .bind(accountId)
      .all<{ is_business: number }>()
    expect(rows.results).toHaveLength(3)
    expect(rows.results.every((r) => r.is_business === 1)).toBe(true)
  })

  it('recusa conta que não é credit_card com 422 invalid_account', async () => {
    const accountId = await seedAccount('acc-ck', 'checking')

    const res = await post({
      account_id: accountId,
      description: 'Fone',
      total_cents: 10000,
      installments_count: 3,
      purchase_date: '2026-07-10',
    })
    const body = (await res.json()) as {
      ok: boolean
      notifications: { type: string; code?: string }[]
    }

    expect(res.status).toBe(422)
    expect(body.ok).toBe(false)
    expect(body.notifications[0].code).toBe('invalid_account')
    expect(body.notifications[0].type).toBe('error')
  })

  it('recusa installments_count fora de 1..360 com 422 constraint_violation', async () => {
    const accountId = await seedAccount('acc-cc', 'credit_card')

    const res = await post({
      account_id: accountId,
      description: 'Fone',
      total_cents: 10000,
      installments_count: 361,
      purchase_date: '2026-07-10',
    })
    const body = (await res.json()) as { notifications: { code?: string }[] }

    expect(res.status).toBe(422)
    expect(body.notifications[0].code).toBe('constraint_violation')
  })

  it('recusa corpo malformado com 400 invalid_json', async () => {
    const res = await post('{ isso nao e json')
    const body = (await res.json()) as { notifications: { code?: string }[] }

    expect(res.status).toBe(400)
    expect(body.notifications[0].code).toBe('invalid_json')
  })

  it('recusa purchase_date com mês inválido (passa no formato, falha no calendário) com envelope 422, nunca 500 pelado', async () => {
    const accountId = await seedAccount('acc-cc', 'credit_card')

    // '2026-13-01' casa com o regex de FORMATO (\d{4}-\d{2}-\d{2}) mas mês 13
    // não existe. billCompetence não valida isso e devolve '2026-13' direto
    // (dia 1 <= fechamento, sem roll-forward); addMonthsToCompetence('2026-13', 0)
    // na primeira iteração é quem rejeita, com RangeError puro (lib/dates.ts),
    // não InstallmentPlanError — a rota precisa tratar isso sem vazar um 500
    // sem envelope (que é o que o handler default do Hono devolveria).
    const res = await post({
      account_id: accountId,
      description: 'Fone',
      total_cents: 10000,
      installments_count: 3,
      purchase_date: '2026-13-01',
    })

    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
    const body = (await res.json()) as {
      ok: boolean
      notifications: { code?: string }[]
    }
    expect(body.ok).toBe(false)
    expect(body.notifications[0].code).toBeTruthy()

    const [plans, txs, installments] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) AS n FROM installment_plans').first<{
        n: number
      }>(),
      env.DB.prepare('SELECT COUNT(*) AS n FROM transactions').first<{
        n: number
      }>(),
      env.DB.prepare('SELECT COUNT(*) AS n FROM installments').first<{
        n: number
      }>(),
    ])
    expect(plans?.n).toBe(0)
    expect(txs?.n).toBe(0)
    expect(installments?.n).toBe(0)
  })
})
