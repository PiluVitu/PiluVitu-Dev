import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

const DB = env.DB
const NOW = '2026-07-25T12:00:00Z'

// --------------------------------------------------------------------------
// Helpers de fixture. Cada teste usa ids proprios: o reset() do beforeEach
// global (src/test-setup.ts) ja limpa tudo entre testes, mas ids distintos
// deixam a falha legivel quando alguma coisa vaza mesmo assim.
// --------------------------------------------------------------------------

async function novaConta(
  id: string,
  kind = 'checking',
  closing: number | null = null,
  due: number | null = null,
): Promise<void> {
  await DB.prepare(
    `INSERT INTO accounts
       (id, name, scope, kind, currency, closing_day, due_day,
        opening_balance_cents, created_at, updated_at)
     VALUES (?, ?, 'PF', ?, 'BRL', ?, ?, 0, ?, ?)`,
  )
    .bind(id, `Conta ${id}`, kind, closing, due, NOW, NOW)
    .run()
}

async function novoPayee(id: string): Promise<void> {
  await DB.prepare(
    `INSERT INTO payees (id, name, norm_name, kind, created_at)
     VALUES (?, ?, ?, 'person', ?)`,
  )
    .bind(id, `Payee ${id}`, `PAYEE ${id}`, NOW)
    .run()
}

async function novaDivida(id: string, payeeId: string): Promise<void> {
  await DB.prepare(
    `INSERT INTO debts
       (id, payee_id, direction, title, currency, opened_at, status,
        created_at, updated_at)
     VALUES (?, ?, 'i_owe', ?, 'BRL', '2026-03-05', 'open', ?, ?)`,
  )
    .bind(id, payeeId, `Divida ${id}`, NOW, NOW)
    .run()
}

async function novoItem(
  id: string,
  debtId: string,
  cents: number,
  descricao = `Item ${id}`,
): Promise<void> {
  await DB.prepare(
    `INSERT INTO debt_items
       (id, debt_id, description, amount_cents, incurred_on, created_at)
     VALUES (?, ?, ?, ?, '2026-03-05', ?)`,
  )
    .bind(id, debtId, descricao, cents, NOW)
    .run()
}

// kind='offset' (encontro de contas) não toca no caixa, então não exige
// transaction_id — é o pagamento mais barato de montar num teste de schema.
async function novoPagamento(
  id: string,
  debtId: string,
  cents: number,
): Promise<void> {
  await DB.prepare(
    `INSERT INTO debt_payments
       (id, debt_id, paid_on, amount_cents, kind, transaction_id, created_at)
     VALUES (?, ?, '2026-05-10', ?, 'offset', NULL, ?)`,
  )
    .bind(id, debtId, cents, NOW)
    .run()
}

function stmtAlloc(
  id: string,
  paymentId: string,
  itemId: string,
  cents: number,
): D1PreparedStatement {
  return DB.prepare(
    `INSERT INTO debt_payment_allocations
       (id, payment_id, item_id, amount_cents, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).bind(id, paymentId, itemId, cents, NOW)
}

function stmtTx(
  id: string,
  accountId: string,
  cents: number,
  purchase: string,
  settled: string | null,
  transferId: string | null,
  parentId: string | null,
): D1PreparedStatement {
  return DB.prepare(
    `INSERT INTO transactions
       (id, account_id, amount_cents, currency, purchase_date, settled_at,
        description, is_business, transfer_id, parent_id, created_at, updated_at)
     VALUES (?, ?, ?, 'BRL', ?, ?, ?, 0, ?, ?, ?, ?)`,
  ).bind(
    id,
    accountId,
    cents,
    purchase,
    settled,
    `Lancamento ${id}`,
    transferId,
    parentId,
    NOW,
    NOW,
  )
}

// --------------------------------------------------------------------------

describe('migration 0001 — tabelas', () => {
  it('cria exatamente as 10 tabelas do modelo', async () => {
    const { results } = await DB.prepare(
      `SELECT name FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'
          AND name NOT LIKE '_cf_%'
          AND name <> 'd1_migrations'
        ORDER BY name`,
    ).all<{ name: string }>()

    expect(results.map((r) => r.name)).toEqual([
      'accounts',
      'categories',
      'debt_items',
      'debt_payment_allocations',
      'debt_payments',
      'debts',
      'installment_plans',
      'installments',
      'payees',
      'transactions',
    ])
  })
})

describe('migration 0001 — STRICT e foreign keys', () => {
  it('STRICT recusa texto em coluna INTEGER', async () => {
    await expect(
      DB.prepare(
        `INSERT INTO accounts
           (id, name, scope, kind, currency, opening_balance_cents,
            created_at, updated_at)
         VALUES (?, ?, 'PF', 'checking', 'BRL', ?, ?, ?)`,
      )
        .bind('c-strict', 'Conta STRICT', 'nao-e-numero', NOW, NOW)
        .run(),
    ).rejects.toThrow(/cannot store TEXT value in INTEGER column/)
  })

  it('foreign_keys está ativo: lançamento órfão falha', async () => {
    await expect(
      DB.prepare(
        `INSERT INTO transactions
           (id, account_id, amount_cents, currency, purchase_date,
            description, is_business, created_at, updated_at)
         VALUES (?, ?, -1000, 'BRL', '2026-07-10', 'Órfão', 0, ?, ?)`,
      )
        .bind('t-orfa', 'conta-que-nao-existe', NOW, NOW)
        .run(),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/)
  })
})

describe('migration 0001 — CHECKs de entrada', () => {
  it('cartão de crédito sem closing_day/due_day é barrado na entrada', async () => {
    await expect(
      DB.prepare(
        `INSERT INTO accounts
           (id, name, scope, kind, currency, closing_day, due_day,
            opening_balance_cents, created_at, updated_at)
         VALUES ('c9-ruim', 'Cartão sem fechamento', 'PF', 'credit_card',
                 'BRL', NULL, NULL, 0, ?, ?)`,
      )
        .bind(NOW, NOW)
        .run(),
    ).rejects.toThrow(/CHECK constraint failed/)

    // controle positivo: com fechamento e vencimento, entra.
    await novaConta('c9-bom', 'credit_card', 25, 5)
    const row = await DB.prepare(
      `SELECT closing_day, due_day FROM accounts WHERE id = 'c9-bom'`,
    ).first<{ closing_day: number; due_day: number }>()
    expect(row).toEqual({ closing_day: 25, due_day: 5 })
  })

  it('moeda != BRL exige amount_original_cents e fx_rate_ppm', async () => {
    await novaConta('c10')

    await expect(
      DB.prepare(
        `INSERT INTO transactions
           (id, account_id, amount_cents, currency, purchase_date,
            description, is_business, created_at, updated_at)
         VALUES ('t10-ruim', ?, -5432, 'USD', '2026-07-10', 'Steam', 0, ?, ?)`,
      )
        .bind('c10', NOW, NOW)
        .run(),
    ).rejects.toThrow(/CHECK constraint failed/)

    // controle positivo: US$ 10,00 a 5,4321 => R$ 54,32.
    await DB.prepare(
      `INSERT INTO transactions
         (id, account_id, amount_cents, currency, amount_original_cents,
          fx_rate_ppm, purchase_date, description, is_business,
          created_at, updated_at)
       VALUES ('t10-bom', ?, -5432, 'USD', 1000, 5432100, '2026-07-10',
               'Steam', 0, ?, ?)`,
    )
      .bind('c10', NOW, NOW)
      .run()

    const row = await DB.prepare(
      `SELECT fx_rate_ppm FROM transactions WHERE id = 't10-bom'`,
    ).first<{ fx_rate_ppm: number }>()
    expect(row?.fx_rate_ppm).toBe(5432100)
  })
})
