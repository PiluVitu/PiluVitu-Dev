import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { createInstallmentPlan, InstallmentPlanError } from './installments'

async function seedAccount(
  id: string,
  kind: 'credit_card' | 'checking',
  closingDay: number | null,
  dueDay: number | null,
) {
  await env.DB.prepare(
    `INSERT INTO accounts (id, name, scope, kind, institution, currency, closing_day, due_day,
       credit_limit_cents, opening_balance_cents, opening_date, archived_at, created_at, updated_at)
     VALUES (?, ?, 'PF', ?, 'Nubank', 'BRL', ?, ?, NULL, 0, NULL, NULL,
       '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z')`,
  )
    .bind(id, `conta ${id}`, kind, closingDay, dueDay)
    .run()
  return id
}

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM installments'),
    env.DB.prepare('DELETE FROM installment_plans'),
    env.DB.prepare('DELETE FROM transactions'),
    env.DB.prepare('DELETE FROM accounts'),
  ])
})

describe('createInstallmentPlan', () => {
  it('plano de 10x gera 10 parcelas e 10 transactions com settled_at NULL', async () => {
    const accountId = await seedAccount('acc-cc', 'credit_card', 25, 5)

    const { plan, installments } = await createInstallmentPlan(env.DB, {
      account_id: accountId,
      description: 'Geladeira',
      total_cents: 250000,
      installments_count: 10,
      purchase_date: '2026-07-28',
    })

    expect(plan.installments_count).toBe(10)
    expect(plan.first_competence).toBe('2026-08')
    expect(installments).toHaveLength(10)
    expect(installments.map((i) => i.seq)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ])

    const rows = await env.DB.prepare(
      `SELECT t.settled_at, t.bill_competence, t.amount_cents
         FROM installments i JOIN transactions t ON t.id = i.transaction_id
        WHERE i.plan_id = ? ORDER BY i.seq`,
    )
      .bind(plan.id)
      .all<{
        settled_at: string | null
        bill_competence: string
        amount_cents: number
      }>()

    expect(rows.results).toHaveLength(10)
    expect(rows.results.every((r) => r.settled_at === null)).toBe(true)
    expect(rows.results.every((r) => r.amount_cents < 0)).toBe(true)
    expect(rows.results[0].bill_competence).toBe('2026-08')
  })

  it('SUM das parcelas fecha no último centavo: R$ 100 em 3x = 3334+3333+3333', async () => {
    const accountId = await seedAccount('acc-cc', 'credit_card', 25, 5)

    const { plan } = await createInstallmentPlan(env.DB, {
      account_id: accountId,
      description: 'Fone',
      total_cents: 10000,
      installments_count: 3,
      purchase_date: '2026-07-10',
    })

    const rows = await env.DB.prepare(
      `SELECT t.amount_cents FROM installments i
         JOIN transactions t ON t.id = i.transaction_id
        WHERE i.plan_id = ? ORDER BY i.seq`,
    )
      .bind(plan.id)
      .all<{ amount_cents: number }>()

    expect(rows.results.map((r) => r.amount_cents)).toEqual([
      -3334, -3333, -3333,
    ])

    const total = await env.DB.prepare(
      `SELECT SUM(-t.amount_cents) AS total FROM installments i
         JOIN transactions t ON t.id = i.transaction_id WHERE i.plan_id = ?`,
    )
      .bind(plan.id)
      .first<{ total: number }>()

    expect(total?.total).toBe(10000)
  })

  it('competências consecutivas viram o ano: 12x em novembro/2026 termina em outubro/2027', async () => {
    const accountId = await seedAccount('acc-cc', 'credit_card', 25, 5)

    const { plan, installments } = await createInstallmentPlan(env.DB, {
      account_id: accountId,
      description: 'Notebook',
      total_cents: 120000,
      installments_count: 12,
      purchase_date: '2026-11-20',
    })

    expect(plan.first_competence).toBe('2026-11')
    expect(installments[0].due_date).toBe('2026-11-05')
    expect(installments[11].due_date).toBe('2027-10-05')

    const comps = await env.DB.prepare(
      `SELECT t.bill_competence AS c FROM installments i
         JOIN transactions t ON t.id = i.transaction_id
        WHERE i.plan_id = ? ORDER BY i.seq`,
    )
      .bind(plan.id)
      .all<{ c: string }>()

    expect(comps.results.map((r) => r.c)).toEqual([
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
      '2027-03',
      '2027-04',
      '2027-05',
      '2027-06',
      '2027-07',
      '2027-08',
      '2027-09',
      '2027-10',
    ])
  })

  it('plano de 60x roda num único batch de 16 statements (regressão do multi-row)', async () => {
    const accountId = await seedAccount('acc-cc', 'credit_card', 25, 5)

    const batchSizes: number[] = []
    const spyDb = new Proxy(env.DB, {
      get(target, prop, receiver) {
        if (prop === 'batch') {
          return (statements: D1PreparedStatement[]) => {
            batchSizes.push(statements.length)
            return target.batch(statements)
          }
        }
        const value = Reflect.get(target, prop, receiver)
        return typeof value === 'function' ? value.bind(target) : value
      },
    }) as D1Database

    const { plan } = await createInstallmentPlan(spyDb, {
      account_id: accountId,
      description: 'Cirurgia do gato',
      total_cents: 600000,
      installments_count: 60,
      purchase_date: '2026-07-10',
    })

    // 1 plano + ceil(60/5) transactions + ceil(60/20) installments = 1 + 12 + 3
    expect(batchSizes).toEqual([16])

    const count = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM installments WHERE plan_id = ?',
    )
      .bind(plan.id)
      .first<{ n: number }>()
    expect(count?.n).toBe(60)
  })

  it('recusa conta que não é credit_card', async () => {
    const accountId = await seedAccount('acc-ck', 'checking', null, null)

    await expect(
      createInstallmentPlan(env.DB, {
        account_id: accountId,
        description: 'Geladeira',
        total_cents: 10000,
        installments_count: 3,
        purchase_date: '2026-07-10',
      }),
    ).rejects.toMatchObject({ code: 'invalid_account' })
  })

  it('recusa installments_count fora de 1..360', async () => {
    const accountId = await seedAccount('acc-cc', 'credit_card', 25, 5)
    const base = {
      account_id: accountId,
      description: 'Geladeira',
      total_cents: 10000,
      purchase_date: '2026-07-10',
    }

    await expect(
      createInstallmentPlan(env.DB, { ...base, installments_count: 0 }),
    ).rejects.toBeInstanceOf(InstallmentPlanError)
    await expect(
      createInstallmentPlan(env.DB, { ...base, installments_count: 361 }),
    ).rejects.toMatchObject({ code: 'constraint_violation' })

    const orphans = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM transactions',
    ).first<{
      n: number
    }>()
    expect(orphans?.n).toBe(0)
  })
})
