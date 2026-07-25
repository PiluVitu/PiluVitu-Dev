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

describe('migration 0001 — triggers de teto de alocação', () => {
  it('trg_alloc_item_teto aborta quando a soma passa do valor do item', async () => {
    await novoPayee('p4')
    await novaDivida('d4', 'p4')
    await novoItem('i4', 'd4', 100000) // item de R$ 1.000
    await novoPagamento('pg4a', 'd4', 500000)
    await novoPagamento('pg4b', 'd4', 500000)

    await stmtAlloc('a4-1', 'pg4a', 'i4', 30000).run() // R$ 300, ok

    // R$ 900 sobre um item que já tem R$ 300 => 1.200 > 1.000 => aborta.
    // Os pagamentos são folgados de propósito: quem tem de disparar é o
    // teto do ITEM, não o do pagamento.
    await expect(stmtAlloc('a4-2', 'pg4b', 'i4', 90000).run()).rejects.toThrow(
      /alocacao excede o valor do item/,
    )
  })

  it('trg_alloc_pagamento_teto aborta quando a soma passa do valor do pagamento', async () => {
    await novoPayee('p5')
    await novaDivida('d5', 'p5')
    await novoItem('i5a', 'd5', 1000000) // teto do item bem longe
    await novoItem('i5b', 'd5', 1000000)
    await novoPagamento('pg5', 'd5', 50000) // pagamento de R$ 500

    await stmtAlloc('a5-1', 'pg5', 'i5a', 30000).run() // R$ 300, ok

    // + R$ 300 => R$ 600 alocados de um pagamento de R$ 500.
    // Item diferente de propósito: sem colidir com UNIQUE(payment_id,item_id).
    await expect(stmtAlloc('a5-2', 'pg5', 'i5b', 30000).run()).rejects.toThrow(
      /alocacao excede o valor do pagamento/,
    )
  })

  it('batch() reverte a sequência inteira quando o trigger aborta', async () => {
    await novoPayee('p6')
    await novaDivida('d6', 'p6')
    await novoItem('i6', 'd6', 100000)
    await novoPagamento('pg6a', 'd6', 500000)
    await novoPagamento('pg6b', 'd6', 500000)

    await expect(
      DB.batch([
        stmtAlloc('a6-1', 'pg6a', 'i6', 30000), // sozinha, seria válida
        stmtAlloc('a6-2', 'pg6b', 'i6', 90000), // estoura o teto do item
      ]),
    ).rejects.toThrow(/alocacao excede o valor do item/)

    const { results } = await DB.prepare(
      `SELECT id FROM debt_payment_allocations WHERE item_id = ?`,
    )
      .bind('i6')
      .all<{ id: string }>()

    // Nem a alocação de R$ 300 sobreviveu: o rollback é da sequência inteira.
    expect(results).toEqual([])
  })

  it('alocar exatamente até o teto passa — sem falso positivo', async () => {
    await novoPayee('p7')
    await novaDivida('d7', 'p7')
    await novoItem('i7', 'd7', 100000)
    await novoPagamento('pg7a', 'd7', 30000)
    await novoPagamento('pg7b', 'd7', 70000)

    await DB.batch([
      stmtAlloc('a7-1', 'pg7a', 'i7', 30000),
      stmtAlloc('a7-2', 'pg7b', 'i7', 70000), // fecha em 100000, no teto exato
    ])

    const row = await DB.prepare(
      `SELECT SUM(amount_cents) AS total FROM debt_payment_allocations WHERE item_id = ?`,
    )
      .bind('i7')
      .first<{ total: number }>()

    expect(row?.total).toBe(100000)
  })
})

describe('migration 0001 — views', () => {
  it('v_debt_item_balance responde "o Steam Deck já está quitado?"', async () => {
    await novoPayee('p8')
    await novaDivida('d8', 'p8')
    await novoItem('i8-mac', 'd8', 450000, 'MacBook Air') // R$ 4.500
    await novoItem('i8-steam', 'd8', 280000, 'Steam Deck') // R$ 2.800
    await novoPagamento('pg8a', 'd8', 450000)
    await novoPagamento('pg8b', 'd8', 144000)

    await DB.batch([
      stmtAlloc('a8-1', 'pg8a', 'i8-mac', 450000), // quita o MacBook
      stmtAlloc('a8-2', 'pg8b', 'i8-steam', 144000), // R$ 1.440 no Steam Deck
    ])

    const { results } = await DB.prepare(
      `SELECT item_id, description, amount_cents, allocated_cents,
              remaining_cents, is_settled
         FROM v_debt_item_balance
        WHERE debt_id = ?
        ORDER BY description`,
    )
      .bind('d8')
      .all()

    expect(results).toEqual([
      {
        item_id: 'i8-mac',
        description: 'MacBook Air',
        amount_cents: 450000,
        allocated_cents: 450000,
        remaining_cents: 0,
        is_settled: 1,
      },
      {
        item_id: 'i8-steam',
        description: 'Steam Deck',
        amount_cents: 280000,
        allocated_cents: 144000,
        remaining_cents: 136000, // os R$ 1.360 que ainda faltam
        is_settled: 0,
      },
    ])
  })

  it('v_debt_item_balance mostra item sem nenhum pagamento como 0 alocado', async () => {
    await novoPayee('p8b')
    await novaDivida('d8b', 'p8b')
    await novoItem('i8b', 'd8b', 200000, 'Item intocado')

    const row = await DB.prepare(
      `SELECT allocated_cents, remaining_cents, is_settled
         FROM v_debt_item_balance WHERE item_id = ?`,
    )
      .bind('i8b')
      .first()

    // LEFT JOIN + COALESCE: sem alocação nenhuma a linha ainda aparece.
    expect(row).toEqual({
      allocated_cents: 0,
      remaining_cents: 200000,
      is_settled: 0,
    })
  })

  it('v_cashflow conta só o realizado, sem transferência e sem filha de rateio', async () => {
    await novaConta('c8')

    await DB.batch([
      // pai de rateio, liquidado: ENTRA
      stmtTx('t8-pai', 'c8', -20000, '2026-07-10', '2026-07-10', null, null),
      // previsto (settled_at NULL): FORA
      stmtTx('t8-prev', 'c8', -50000, '2026-07-12', null, null, null),
      // perna de transferência entre contas próprias: FORA
      stmtTx('t8-trf', 'c8', -30000, '2026-07-13', '2026-07-13', 'trf-1', null),
      // filha de rateio (o pai já foi contado cheio): FORA
      stmtTx(
        't8-filha',
        'c8',
        -8000,
        '2026-07-10',
        '2026-07-10',
        null,
        't8-pai',
      ),
    ])

    const { results } = await DB.prepare(
      `SELECT id, amount_cents, competence_month
         FROM v_cashflow WHERE account_id = ? ORDER BY id`,
    )
      .bind('c8')
      .all()

    expect(results).toEqual([
      { id: 't8-pai', amount_cents: -20000, competence_month: '2026-07' },
    ])
  })
})
