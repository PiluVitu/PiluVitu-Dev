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

// Defaults descrevem o Starlink (fixo: min = max = R$ 189) — override pontual
// pro caso de faixa (DAS) ou pra provocar cada CHECK isoladamente.
async function novaRecorrente(
  id: string,
  overrides: Partial<{
    description: string
    scope: string
    dayOfMonth: number
    amountMin: number
    amountMax: number
    startsOn: string
    endsOn: string | null
    active: number
  }> = {},
): Promise<void> {
  const {
    description = `Recorrente ${id}`,
    scope = 'PJ',
    dayOfMonth = 10,
    amountMin = 18900,
    amountMax = 18900,
    startsOn = '2026-01-01',
    endsOn = null,
    active = 1,
  } = overrides

  await DB.prepare(
    `INSERT INTO recurring_expenses
       (id, description, scope, day_of_month, amount_min_cents,
        amount_max_cents, starts_on, ends_on, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      description,
      scope,
      dayOfMonth,
      amountMin,
      amountMax,
      startsOn,
      endsOn,
      active,
      NOW,
      NOW,
    )
    .run()
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

describe('migrations 0001+0002+0005+0006+0007 — tabelas', () => {
  it('cria exatamente as 17 tabelas do modelo (10 do 0001 + 4 do better auth + 1 settings do 0005 + 1 recurring_expenses do 0006 + 1 insights do 0007)', async () => {
    const { results } = await DB.prepare(
      `SELECT name FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'
          AND name NOT LIKE '_cf_%'
          AND name <> 'd1_migrations'
        ORDER BY name`,
    ).all<{ name: string }>()

    expect(results.map((r) => r.name)).toEqual([
      'account',
      'accounts',
      'categories',
      'debt_items',
      'debt_payment_allocations',
      'debt_payments',
      'debts',
      'insights',
      'installment_plans',
      'installments',
      'payees',
      'recurring_expenses',
      'session',
      'settings',
      'transactions',
      'user',
      'verification',
    ])
  })
})

describe('migration 0007 — insights (STRICT, CHECKs de sanidade)', () => {
  it('insere uma linha completa e relê', async () => {
    await DB.prepare(
      `INSERT INTO insights (id, texto, modelo, periodo, generated_at)
       VALUES ('i1', 'Você gastou mais em Mercado.', 'qwen2.5:7b-instruct', '2026-07', ?)`,
    )
      .bind(NOW)
      .run()

    const row = await DB.prepare(
      `SELECT * FROM insights WHERE id = 'i1'`,
    ).first<{
      texto: string
      modelo: string
      periodo: string
      generated_at: string
    }>()
    expect(row).toEqual({
      id: 'i1',
      texto: 'Você gastou mais em Mercado.',
      modelo: 'qwen2.5:7b-instruct',
      periodo: '2026-07',
      generated_at: NOW,
    })
  })

  it.each([
    ['texto vazio', { texto: '', modelo: 'm', periodo: '2026-07' }],
    ['modelo vazio', { texto: 't', modelo: '', periodo: '2026-07' }],
    ['periodo vazio', { texto: 't', modelo: 'm', periodo: '' }],
  ])('CHECK barra %s', async (_label, campos) => {
    await expect(
      DB.prepare(
        `INSERT INTO insights (id, texto, modelo, periodo, generated_at)
         VALUES ('i-ruim', ?, ?, ?, ?)`,
      )
        .bind(campos.texto, campos.modelo, campos.periodo, NOW)
        .run(),
    ).rejects.toThrow(/CHECK constraint failed/)
  })

  it('STRICT: id não pode ser NULL (PRIMARY KEY)', async () => {
    await expect(
      DB.prepare(
        `INSERT INTO insights (id, texto, modelo, periodo, generated_at)
         VALUES (NULL, 't', 'm', '2026-07', ?)`,
      )
        .bind(NOW)
        .run(),
    ).rejects.toThrow(/NOT NULL constraint failed/)
  })
})

describe('migration 0005 — settings (STRICT, PK, upsert)', () => {
  it('key é PRIMARY KEY: duas linhas com a mesma key são recusadas por INSERT direto (sem ON CONFLICT)', async () => {
    await DB.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES ('k', 'v1', ?)`,
    )
      .bind(NOW)
      .run()

    await expect(
      DB.prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES ('k', 'v2', ?)`,
      )
        .bind(NOW)
        .run(),
    ).rejects.toThrow(/UNIQUE constraint failed/)
  })

  it('STRICT: value/updated_at aceitam TEXT normal (sem CHECK travando formato)', async () => {
    await DB.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES ('outra-chave', 'qualquer texto', ?)`,
    )
      .bind(NOW)
      .run()

    const row = await DB.prepare(
      `SELECT value FROM settings WHERE key = 'outra-chave'`,
    ).first<{ value: string }>()
    expect(row?.value).toBe('qualquer texto')
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

describe('migration 0001 — seed de categorias', () => {
  it('semeia os slugs que medem o gap de ~R$ 1.000/mês da PJ', async () => {
    const { results } = await DB.prepare(
      `SELECT slug, kind, default_scope
         FROM categories
        WHERE slug IN ('das','contador','inss','pro-labore')
        ORDER BY slug`,
    ).all()

    expect(results).toEqual([
      { slug: 'contador', kind: 'expense', default_scope: 'PJ' },
      { slug: 'das', kind: 'expense', default_scope: 'PJ' },
      { slug: 'inss', kind: 'expense', default_scope: 'PJ' },
      // Pró-labore é PJ -> PF: é transferência, não despesa. Classificar
      // como 'expense' contaria o mesmo dinheiro duas vezes (despesa na PJ
      // e receita na PF) e inflaria o custo medido da PJ.
      { slug: 'pro-labore', kind: 'transfer', default_scope: 'PJ' },
    ])
  })

  it('semeia as categorias de transfer e debt_settlement', async () => {
    const { results } = await DB.prepare(
      `SELECT slug FROM categories
        WHERE kind IN ('transfer','debt_settlement')
        ORDER BY slug`,
    ).all()

    expect(results).toEqual([
      { slug: 'pro-labore' },
      { slug: 'quitacao-divida' },
      { slug: 'transferencia' },
    ])
  })

  it('DAS, contador e INSS penduram no pai "custos-pj"', async () => {
    const { results } = await DB.prepare(
      `SELECT c.slug
         FROM categories c
         JOIN categories p ON p.id = c.parent_id
        WHERE p.slug = 'custos-pj'
        ORDER BY c.slug`,
    ).all()

    expect(results).toEqual([
      { slug: 'contador' },
      { slug: 'das' },
      { slug: 'inss' },
    ])
  })
})

describe('migration 0002 — STRICT, FK cascade, UNIQUE', () => {
  // DESVIO DO BRIEF, MEDIDO: o brief original previa que uma coluna TEXT em
  // tabela STRICT rejeitaria um INTEGER ('user.createdAt' recebendo 12345).
  // MEDIDO contra o Miniflare local: o INSERT teve sucesso, e a coluna
  // guardou '12345.0' (typeof 'text'). Isso bate com a regra documentada do
  // SQLite para STRICT (https://sqlite.org/stricttables.html): coluna TEXT
  // CONVERTE INTEGER/REAL para texto (equivalente a CAST(x AS TEXT)), não
  // rejeita — só BLOB e a ausência de conversão numérica válida rejeitam.
  // A direção que REALMENTE rejeita (e que a suíte do 0001 já usa, em
  // 'STRICT recusa texto em coluna INTEGER') é TEXT não-numérico dentro de
  // coluna INTEGER — trocado abaixo para provar STRICT de verdade nas
  // tabelas novas, em vez de reafirmar uma premissa que o SQLite não segue.
  it('STRICT recusa TEXT não-numérico em coluna INTEGER (user.emailVerified)', async () => {
    await expect(
      DB.prepare(
        `INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt)
         VALUES ('u-strict', 'Teste', 'teste@exemplo.com', ?, ?, ?)`,
      )
        .bind('nao-e-numero', NOW, NOW)
        .run(),
    ).rejects.toThrow(/cannot store TEXT value in INTEGER column/)
  })

  it('apagar o user cascateia para session e account', async () => {
    await DB.prepare(
      `INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt)
       VALUES ('u-cascade', 'Dono', 'dono@exemplo.com', 1, ?, ?)`,
    )
      .bind(NOW, NOW)
      .run()
    await DB.prepare(
      `INSERT INTO session (id, expiresAt, token, createdAt, updatedAt, userId)
       VALUES ('s-cascade', ?, 'token-cascade', ?, ?, 'u-cascade')`,
    )
      .bind(NOW, NOW, NOW)
      .run()
    await DB.prepare(
      `INSERT INTO account (id, accountId, providerId, userId, createdAt, updatedAt)
       VALUES ('a-cascade', 'google-sub-1', 'google', 'u-cascade', ?, ?)`,
    )
      .bind(NOW, NOW)
      .run()

    await DB.prepare(`DELETE FROM user WHERE id = 'u-cascade'`).run()

    const s = await DB.prepare(
      `SELECT count(*) AS n FROM session WHERE userId = 'u-cascade'`,
    ).first<{ n: number }>()
    const a = await DB.prepare(
      `SELECT count(*) AS n FROM account WHERE userId = 'u-cascade'`,
    ).first<{ n: number }>()
    expect(s?.n).toBe(0)
    expect(a?.n).toBe(0)
  })

  it('email é UNIQUE em user', async () => {
    await DB.prepare(
      `INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt)
       VALUES ('u-uniq-1', 'Um', 'duplicado@exemplo.com', 1, ?, ?)`,
    )
      .bind(NOW, NOW)
      .run()

    await expect(
      DB.prepare(
        `INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt)
         VALUES ('u-uniq-2', 'Dois', 'duplicado@exemplo.com', 1, ?, ?)`,
      )
        .bind(NOW, NOW)
        .run(),
    ).rejects.toThrow(/UNIQUE constraint failed/)
  })
})

describe('migration 0006 — recurring_expenses (STRICT, CHECKs, vínculo com transactions)', () => {
  it('STRICT recusa TEXT não-numérico em coluna INTEGER (day_of_month)', async () => {
    // Direção que REALMENTE rejeita em tabela STRICT: TEXT não-numérico
    // dentro de coluna INTEGER. A direção oposta (INTEGER numa coluna TEXT)
    // apenas CONVERTE — não provaria nada (ver nota do 0002 no CLAUDE.md).
    await expect(
      DB.prepare(
        `INSERT INTO recurring_expenses
           (id, description, scope, day_of_month, amount_min_cents,
            amount_max_cents, starts_on, active, created_at, updated_at)
         VALUES ('r-strict', 'Starlink', 'PJ', ?, 18900, 18900,
                 '2026-01-01', 1, ?, ?)`,
      )
        .bind('nao-e-numero', NOW, NOW)
        .run(),
    ).rejects.toThrow(/cannot store TEXT value in INTEGER column/)
  })

  it('CHECK day_of_month aceita 1..31 e recusa fora da faixa', async () => {
    await expect(novaRecorrente('r-dia-0', { dayOfMonth: 0 })).rejects.toThrow(
      /CHECK constraint failed/,
    )
    await expect(
      novaRecorrente('r-dia-32', { dayOfMonth: 32 }),
    ).rejects.toThrow(/CHECK constraint failed/)

    // controle positivo: dia 31 é aceito na ENTRADA — o aparamento (dia 31
    // -> 28 em fevereiro) é aritmética de LEITURA (src/lib/dates.ts),
    // não uma restrição de escrita.
    await novaRecorrente('r-dia-31', { dayOfMonth: 31 })
    const row = await DB.prepare(
      `SELECT day_of_month FROM recurring_expenses WHERE id = 'r-dia-31'`,
    ).first<{ day_of_month: number }>()
    expect(row?.day_of_month).toBe(31)
  })

  it('CHECK amount_max_cents >= amount_min_cents — a faixa do DAS (12..600) entra, invertida não', async () => {
    await expect(
      novaRecorrente('r-faixa-ruim', { amountMin: 60000, amountMax: 1200 }),
    ).rejects.toThrow(/CHECK constraint failed/)

    await novaRecorrente('r-das', { amountMin: 1200, amountMax: 60000 })
    const row = await DB.prepare(
      `SELECT amount_min_cents, amount_max_cents
         FROM recurring_expenses WHERE id = 'r-das'`,
    ).first<{ amount_min_cents: number; amount_max_cents: number }>()
    expect(row).toEqual({ amount_min_cents: 1200, amount_max_cents: 60000 })
  })

  it('valor fixo (Starlink R$ 189) é só o caso min = max — mesmo CHECK, sem tipo "fixo" separado', async () => {
    await novaRecorrente('r-fixo', { amountMin: 18900, amountMax: 18900 })
    const row = await DB.prepare(
      `SELECT amount_min_cents, amount_max_cents
         FROM recurring_expenses WHERE id = 'r-fixo'`,
    ).first<{ amount_min_cents: number; amount_max_cents: number }>()
    expect(row).toEqual({ amount_min_cents: 18900, amount_max_cents: 18900 })
  })

  it('CHECK amount_min_cents > 0', async () => {
    await expect(
      novaRecorrente('r-min-zero', { amountMin: 0, amountMax: 100 }),
    ).rejects.toThrow(/CHECK constraint failed/)
  })

  it('CHECK ends_on >= starts_on — aceita igual e aceita sem fim (NULL)', async () => {
    await expect(
      novaRecorrente('r-ends-ruim', {
        startsOn: '2026-06-01',
        endsOn: '2026-01-01',
      }),
    ).rejects.toThrow(/CHECK constraint failed/)

    // controles positivos: ends_on == starts_on, e recorrente sem fim.
    await novaRecorrente('r-ends-igual', {
      startsOn: '2026-06-01',
      endsOn: '2026-06-01',
    })
    await novaRecorrente('r-sem-fim', {
      startsOn: '2026-06-01',
      endsOn: null,
    })
    const row = await DB.prepare(
      `SELECT ends_on FROM recurring_expenses WHERE id = 'r-sem-fim'`,
    ).first<{ ends_on: string | null }>()
    expect(row?.ends_on).toBeNull()
  })

  it('CHECK active IN (0,1)', async () => {
    await expect(
      novaRecorrente('r-active-ruim', { active: 2 }),
    ).rejects.toThrow(/CHECK constraint failed/)
  })

  it("CHECK scope IN ('PJ','PF')", async () => {
    await expect(
      novaRecorrente('r-scope-ruim', { scope: 'XX' }),
    ).rejects.toThrow(/CHECK constraint failed/)
  })

  it('recurring_expense_id órfão em transactions é barrado pelo foreign_keys', async () => {
    await novaConta('c-rec-orfa')
    await expect(
      DB.prepare(
        `INSERT INTO transactions
           (id, account_id, amount_cents, currency, purchase_date,
            description, is_business, recurring_expense_id, created_at,
            updated_at)
         VALUES ('t-rec-orfa', 'c-rec-orfa', -1000, 'BRL', '2026-08-10',
                 'Órfã', 0, 'recorrente-que-nao-existe', ?, ?)`,
      )
        .bind(NOW, NOW)
        .run(),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/)
  })

  it('apagar uma recorrente deixa o lançamento vivo, com recurring_expense_id NULO — ON DELETE SET NULL, nunca CASCADE', async () => {
    await novaConta('c-rec')
    await novaRecorrente('r-starlink', { description: 'Starlink' })

    await DB.prepare(
      `INSERT INTO transactions
         (id, account_id, amount_cents, currency, purchase_date, description,
          is_business, recurring_expense_id, created_at, updated_at)
       VALUES ('t-starlink-ago', 'c-rec', -18900, 'BRL', '2026-08-10',
               'Starlink agosto', 1, 'r-starlink', ?, ?)`,
    )
      .bind(NOW, NOW)
      .run()

    const antes = await DB.prepare(
      `SELECT count(*) AS n FROM transactions WHERE id = 't-starlink-ago'`,
    ).first<{ n: number }>()
    expect(antes?.n).toBe(1)

    await DB.prepare(
      `DELETE FROM recurring_expenses WHERE id = 'r-starlink'`,
    ).run()

    // A CONTAGEM prova que a linha continua existindo — CASCADE a teria
    // apagado (n=0). SET NULL só desvincula.
    const depois = await DB.prepare(
      `SELECT count(*) AS n FROM transactions WHERE id = 't-starlink-ago'`,
    ).first<{ n: number }>()
    expect(depois?.n).toBe(1)

    const row = await DB.prepare(
      `SELECT recurring_expense_id, amount_cents, description
         FROM transactions WHERE id = 't-starlink-ago'`,
    ).first<{
      recurring_expense_id: string | null
      amount_cents: number
      description: string
    }>()
    expect(row).toEqual({
      recurring_expense_id: null,
      amount_cents: -18900,
      description: 'Starlink agosto',
    })
  })

  it('idx_tx_recurring existe e é parcial em recurring_expense_id — o índice que a supressão de projeção usa', async () => {
    const idx = await DB.prepare(
      `SELECT sql FROM sqlite_master
        WHERE type = 'index' AND name = 'idx_tx_recurring'`,
    ).first<{ sql: string }>()

    expect(idx?.sql).toContain(
      'transactions(recurring_expense_id, purchase_date)',
    )
    expect(idx?.sql).toContain('WHERE recurring_expense_id IS NOT NULL')
  })
})
