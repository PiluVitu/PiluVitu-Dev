import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { importRoutes } from './import'

async function seedAccount(id: string) {
  await env.DB.prepare(
    `INSERT INTO accounts (id, name, scope, kind, institution, currency, closing_day, due_day,
       credit_limit_cents, opening_balance_cents, opening_date, archived_at, created_at, updated_at)
     VALUES (?, ?, 'PF', 'checking', 'Nubank', 'BRL', NULL, NULL, NULL, 0, NULL, NULL,
       '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z')`,
  )
    .bind(id, `conta ${id}`)
    .run()
  return id
}

function post(body: unknown) {
  return importRoutes.request(
    '/transactions/import',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    },
    { DB: env.DB },
  )
}

async function countTransactions(accountId: string): Promise<number> {
  const row = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM transactions WHERE account_id = ?',
  )
    .bind(accountId)
    .first<{ n: number }>()
  return row?.n ?? 0
}

type Envelope = {
  ok: boolean
  data: { total: number; imported: number; skipped: number } | null
  notifications: { type: string; code?: string; message?: string }[]
}

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM transactions'),
    env.DB.prepare('DELETE FROM accounts'),
  ])
})

describe('POST /api/transactions/import', () => {
  it('importa N linhas: 201, envelope com os totais e o D1 realmente cresce N', async () => {
    const accountId = await seedAccount('acc-1')

    const res = await post({
      account_id: accountId,
      import_source: 'ofx',
      rows: [
        {
          imported_id: 'fitid-1',
          purchase_date: '2026-07-10',
          amount_cents: -1500,
          description: 'Padaria X',
        },
        {
          imported_id: 'fitid-2',
          purchase_date: '2026-07-11',
          amount_cents: -2000,
          description: 'Mercado Y',
        },
      ],
    })
    const body = (await res.json()) as Envelope

    expect(res.status).toBe(201)
    expect(body.ok).toBe(true)
    expect(body.notifications).toEqual([])
    expect(body.data).toEqual({ total: 2, imported: 2, skipped: 0 })
    expect(await countTransactions(accountId)).toBe(2)
  })

  it('reimportar o mesmo payload não cria linha nova no D1 e a resposta reporta o skip', async () => {
    const accountId = await seedAccount('acc-1')
    const rows = [
      {
        imported_id: 'fitid-1',
        purchase_date: '2026-07-10',
        amount_cents: -1500,
        description: 'Padaria X',
      },
    ]

    await post({ account_id: accountId, import_source: 'ofx', rows })
    const countAfterFirst = await countTransactions(accountId)
    expect(countAfterFirst).toBe(1)

    const res = await post({
      account_id: accountId,
      import_source: 'ofx',
      rows,
    })
    const body = (await res.json()) as Envelope

    expect(res.status).toBe(201)
    expect(body.data).toEqual({ total: 1, imported: 0, skipped: 1 })
    // A prova real de idempotência é a contagem no D1, não confiar no corpo.
    expect(await countTransactions(accountId)).toBe(countAfterFirst)
  })

  it('account_id inexistente devolve 422 com mensagem cozida (nunca D1_ERROR/SQLITE cru)', async () => {
    const res = await post({
      account_id: 'conta-fantasma',
      import_source: 'ofx',
      rows: [
        {
          imported_id: 'fitid-1',
          purchase_date: '2026-07-10',
          amount_cents: -1500,
          description: 'Padaria X',
        },
      ],
    })
    const body = (await res.json()) as Envelope

    expect(res.status).toBe(422)
    expect(body.ok).toBe(false)
    expect(body.notifications[0].code).toBe('invalid_account')
    expect(body.notifications[0].message).not.toMatch(/D1_ERROR|SQLITE/i)
  })

  it('linha com amount_cents = 0 devolve 422 (CHECK do schema traduzido) e não grava nada', async () => {
    const accountId = await seedAccount('acc-1')

    const res = await post({
      account_id: accountId,
      import_source: 'ofx',
      rows: [
        {
          imported_id: 'fitid-zero',
          purchase_date: '2026-07-10',
          amount_cents: 0,
          description: 'Linha inválida',
        },
      ],
    })
    const body = (await res.json()) as Envelope

    expect(res.status).toBe(422)
    expect(body.ok).toBe(false)
    expect(body.notifications[0].code).toBe('constraint_violation')
    expect(body.notifications[0].message).not.toMatch(/D1_ERROR|SQLITE/i)
    expect(await countTransactions(accountId)).toBe(0)
  })

  it('import_source fora do enum devolve 422 invalid_import_source', async () => {
    const accountId = await seedAccount('acc-1')

    const res = await post({
      account_id: accountId,
      import_source: 'excel',
      rows: [
        {
          imported_id: 'fitid-1',
          purchase_date: '2026-07-10',
          amount_cents: -1500,
          description: 'Padaria X',
        },
      ],
    })
    const body = (await res.json()) as Envelope

    expect(res.status).toBe(422)
    expect(body.notifications[0].code).toBe('invalid_import_source')
    expect(await countTransactions(accountId)).toBe(0)
  })

  it('o mesmo imported_id em OUTRA conta é aceito (índice é por conta, não global)', async () => {
    const accountA = await seedAccount('acc-a')
    const accountB = await seedAccount('acc-b')
    const rows = [
      {
        imported_id: 'fitid-compartilhado',
        purchase_date: '2026-07-10',
        amount_cents: -500,
        description: 'Mesmo FITID, banco diferente',
      },
    ]

    await post({ account_id: accountA, import_source: 'ofx', rows })
    const res = await post({ account_id: accountB, import_source: 'ofx', rows })
    const body = (await res.json()) as Envelope

    expect(res.status).toBe(201)
    expect(body.data).toEqual({ total: 1, imported: 1, skipped: 0 })
    expect(await countTransactions(accountA)).toBe(1)
    expect(await countTransactions(accountB)).toBe(1)
  })

  it('lote de 12 linhas (acima do teto de 5/statement) importa todas via HTTP', async () => {
    const accountId = await seedAccount('acc-1')
    const rows = Array.from({ length: 12 }, (_, i) => ({
      imported_id: `fitid-${i}`,
      purchase_date: '2026-07-10',
      amount_cents: -(100 + i),
      description: `Linha ${i}`,
    }))

    const res = await post({
      account_id: accountId,
      import_source: 'csv',
      rows,
    })
    const body = (await res.json()) as Envelope

    expect(res.status).toBe(201)
    expect(body.data).toEqual({ total: 12, imported: 12, skipped: 0 })
    expect(await countTransactions(accountId)).toBe(12)
  })

  it('corpo malformado devolve 400 invalid_json', async () => {
    const res = await post('{ isso nao e json')
    const body = (await res.json()) as Envelope

    expect(res.status).toBe(400)
    expect(body.notifications[0].code).toBe('invalid_json')
  })

  it('rows ausente/não-array devolve 400 invalid_json', async () => {
    const accountId = await seedAccount('acc-1')
    const res = await post({ account_id: accountId, import_source: 'ofx' })
    const body = (await res.json()) as Envelope

    expect(res.status).toBe(400)
    expect(body.notifications[0].code).toBe('invalid_json')
  })
})
