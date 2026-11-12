import type { LinhaImportada } from '@piluvitu/tools/import'
import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { createCategory } from './categories'
import { ImportError, importTransactions } from './import'
import { createPayee } from './payees'
import { createRecurring, type Frequency } from './recurring'
import { generateRecurringOccurrences } from './recurring-auto'
import { commitments } from './reports'
import { payBill } from './transactions'
import { setNomesProprios } from './transfer-pairing'

async function seedAccount(
  id: string,
  kind: 'credit_card' | 'checking' = 'checking',
  closingDay: number | null = null,
  dueDay: number | null = null,
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

function linha(overrides: Partial<LinhaImportada> = {}): LinhaImportada {
  return {
    imported_id: 'fitid-1',
    purchase_date: '2026-07-10',
    amount_cents: -1500,
    description: 'Padaria X',
    ...overrides,
  }
}

async function countTransactions(accountId?: string): Promise<number> {
  const row = accountId
    ? await env.DB.prepare(
        'SELECT COUNT(*) AS n FROM transactions WHERE account_id = ?',
      )
        .bind(accountId)
        .first<{ n: number }>()
    : await env.DB.prepare('SELECT COUNT(*) AS n FROM transactions').first<{
        n: number
      }>()
  return row?.n ?? 0
}

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM transactions'),
    env.DB.prepare('DELETE FROM accounts'),
  ])
})

describe('importTransactions', () => {
  it('importa N linhas e a tabela transactions cresce N', async () => {
    const accountId = await seedAccount('acc-1')
    const rows = [
      linha({ imported_id: 'fitid-1' }),
      linha({ imported_id: 'fitid-2' }),
      linha({ imported_id: 'fitid-3' }),
    ]

    const before = await countTransactions(accountId)
    const result = await importTransactions(env.DB, {
      account_id: accountId,
      import_source: 'ofx',
      rows,
    })
    const after = await countTransactions(accountId)

    expect(after - before).toBe(3)
    expect(result).toEqual({ total: 3, imported: 3, skipped: 0, reconciled: 0 })
  })

  it('reimportar as MESMAS linhas não cria nenhuma linha nova (contado no D1)', async () => {
    const accountId = await seedAccount('acc-1')
    const rows = [
      linha({ imported_id: 'fitid-1' }),
      linha({ imported_id: 'fitid-2' }),
    ]

    await importTransactions(env.DB, {
      account_id: accountId,
      import_source: 'ofx',
      rows,
    })
    const afterFirst = await countTransactions(accountId)
    expect(afterFirst).toBe(2)

    const result = await importTransactions(env.DB, {
      account_id: accountId,
      import_source: 'ofx',
      rows,
    })
    const afterSecond = await countTransactions(accountId)

    // A contagem no D1, não a resposta, é a prova real de idempotência.
    expect(afterSecond).toBe(afterFirst)
    expect(result).toEqual({ total: 2, imported: 0, skipped: 2, reconciled: 0 })
  })

  it('o mesmo imported_id em OUTRA conta é aceito (o índice é por conta)', async () => {
    const accountA = await seedAccount('acc-a')
    const accountB = await seedAccount('acc-b')
    const row = linha({ imported_id: 'fitid-compartilhado' })

    await importTransactions(env.DB, {
      account_id: accountA,
      import_source: 'ofx',
      rows: [row],
    })
    const result = await importTransactions(env.DB, {
      account_id: accountB,
      import_source: 'ofx',
      rows: [row],
    })

    expect(result).toEqual({ total: 1, imported: 1, skipped: 0, reconciled: 0 })
    expect(await countTransactions(accountA)).toBe(1)
    expect(await countTransactions(accountB)).toBe(1)
  })

  it('lote acima de 5 linhas gera múltiplos statements (espiando db.batch)', async () => {
    const accountId = await seedAccount('acc-1')
    // 12 linhas => ceil(12/5) = 3 statements no INSERT de transactions.
    const rows = Array.from({ length: 12 }, (_, i) =>
      linha({ imported_id: `fitid-${i}`, purchase_date: '2026-07-10' }),
    )

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

    const result = await importTransactions(spyDb, {
      account_id: accountId,
      import_source: 'csv',
      rows,
    })

    expect(result.imported).toBe(12)
    // 12 linhas / 5 por statement = 3 statements num único batch().
    expect(batchSizes).toEqual([3])
    expect(await countTransactions(accountId)).toBe(12)
  })

  it('account_id inexistente lança ImportError invalid_account', async () => {
    await expect(
      importTransactions(env.DB, {
        account_id: 'conta-que-nao-existe',
        import_source: 'ofx',
        rows: [linha()],
      }),
    ).rejects.toMatchObject({
      name: 'ImportError',
      code: 'invalid_account',
    })
    expect(await countTransactions()).toBe(0)
  })

  it('linha com valor zero é recusada pelo CHECK do schema (erro de constraint, nenhuma linha gravada)', async () => {
    const accountId = await seedAccount('acc-1')

    await expect(
      importTransactions(env.DB, {
        account_id: accountId,
        import_source: 'ofx',
        rows: [linha({ imported_id: 'fitid-zero', amount_cents: 0 })],
      }),
    ).rejects.toThrow(/CONSTRAINT|constraint/i)
    expect(await countTransactions(accountId)).toBe(0)
  })

  it('import_source fora do enum lança ImportError invalid_import_source', async () => {
    const accountId = await seedAccount('acc-1')

    await expect(
      importTransactions(env.DB, {
        account_id: accountId,
        import_source: 'excel',
        rows: [linha()],
      }),
    ).rejects.toMatchObject({
      name: 'ImportError',
      code: 'invalid_import_source',
    })
    expect(await countTransactions(accountId)).toBe(0)
  })

  it('lança ImportError quando um dos ImportError customizados carrega .code (usado pela rota p/ 422)', async () => {
    expect(new ImportError('x', 'y')).toBeInstanceOf(Error)
  })

  describe('bill_competence', () => {
    it('conta credit_card: toda linha ganha bill_competence, e compra após o fechamento cai no mês SEGUINTE', async () => {
      // Mesmo caso canônico já usado em domain/installments.test.ts: cartão
      // fecha dia 25, compra em 28/07 (depois do fechamento) cai em '2026-08'.
      const accountId = await seedAccount('acc-cc', 'credit_card', 25, 5)
      const rows = [
        linha({ imported_id: 'fitid-depois', purchase_date: '2026-07-28' }),
        linha({ imported_id: 'fitid-antes', purchase_date: '2026-07-10' }),
      ]

      const result = await importTransactions(env.DB, {
        account_id: accountId,
        import_source: 'ofx',
        rows,
      })
      expect(result).toEqual({
        total: 2,
        imported: 2,
        skipped: 0,
        reconciled: 0,
      })

      const gravadas = await env.DB.prepare(
        'SELECT imported_id, bill_competence FROM transactions WHERE account_id = ? ORDER BY imported_id',
      )
        .bind(accountId)
        .all<{ imported_id: string; bill_competence: string | null }>()

      const porId = new Map(
        gravadas.results.map((r) => [r.imported_id, r.bill_competence]),
      )
      // Nenhuma linha ficou sem competência (é o que faz o extrato de cartão
      // entrar em commitments() — ver teste de integração abaixo).
      expect(porId.get('fitid-depois')).toBe('2026-08')
      expect(porId.get('fitid-antes')).toBe('2026-07')
    })

    it('conta checking: bill_competence permanece NULL', async () => {
      const accountId = await seedAccount('acc-ck', 'checking')
      const rows = [
        linha({ imported_id: 'fitid-1', purchase_date: '2026-07-28' }),
      ]

      await importTransactions(env.DB, {
        account_id: accountId,
        import_source: 'ofx',
        rows,
      })

      const row = await env.DB.prepare(
        'SELECT bill_competence FROM transactions WHERE account_id = ? AND imported_id = ?',
      )
        .bind(accountId, 'fitid-1')
        .first<{ bill_competence: string | null }>()
      expect(row?.bill_competence).toBeNull()
    })
  })

  describe('integração com commitments()', () => {
    it('linhas importadas num cartão aparecem em commitments() na competência derivada', async () => {
      const accountId = await seedAccount('acc-cc-commit', 'credit_card', 25, 5)
      const rows = [
        // Ambas depois do fechamento (dia 25) => competência '2026-08'.
        linha({
          imported_id: 'fitid-a',
          purchase_date: '2026-07-28',
          amount_cents: -100000, // R$ 1.000,00
        }),
        linha({
          imported_id: 'fitid-b',
          purchase_date: '2026-07-29',
          amount_cents: -50000, // R$ 500,00
        }),
      ]

      const result = await importTransactions(env.DB, {
        account_id: accountId,
        import_source: 'ofx',
        rows,
      })
      // As linhas importadas nascem com settled_at NULL (fatura ainda em
      // aberto) — é exatamente o que commitments() soma como "previsto".
      expect(result).toEqual({
        total: 2,
        imported: 2,
        skipped: 0,
        reconciled: 0,
      })
      const settled = await env.DB.prepare(
        'SELECT COUNT(*) AS n FROM transactions WHERE account_id = ? AND settled_at IS NOT NULL',
      )
        .bind(accountId)
        .first<{ n: number }>()
      expect(settled?.n).toBe(0)

      const report = await commitments(env.DB, {
        from: '2026-08',
        months: 1,
        fixed_net_cents: 360000,
      })

      const linhaConta = report.rows.find((r) => r.account_id === accountId)
      expect(linhaConta).toBeDefined()
      // -SUM(amount_cents) das duas linhas: 100000 + 50000 = 150000.
      expect(linhaConta?.cells).toEqual([150000])
    })
  })
})

// ---------------------------------------------------------------------
// Escopo PJ/PF e pareamento de transferencia — fatia "gasto inflado".
// ---------------------------------------------------------------------

async function seedAccountScope(id: string, scope: 'PJ' | 'PF') {
  await env.DB.prepare(
    `INSERT INTO accounts (id, name, scope, kind, institution, currency, closing_day, due_day,
       credit_limit_cents, opening_balance_cents, opening_date, archived_at, created_at, updated_at)
     VALUES (?, ?, ?, 'checking', 'Inter', 'BRL', NULL, NULL, NULL, 0, NULL, NULL,
       '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')`,
  )
    .bind(id, `conta ${id}`, scope)
    .run()
  return id
}

async function isBusinessDe(imported_id: string): Promise<number> {
  const row = await env.DB.prepare(
    'SELECT is_business FROM transactions WHERE imported_id = ?',
  )
    .bind(imported_id)
    .first<{ is_business: number }>()
  return row!.is_business
}

describe('is_business herdado da conta', () => {
  it('linha importada em conta PJ nasce is_business = 1', async () => {
    const acc = await seedAccountScope('acc-pj', 'PJ')
    await importTransactions(env.DB, {
      account_id: acc,
      import_source: 'pluggy',
      rows: [linha({ imported_id: 'pj-1' })],
    })
    expect(await isBusinessDe('pj-1')).toBe(1)
  })

  it('linha importada em conta PF nasce is_business = 0', async () => {
    const acc = await seedAccountScope('acc-pf', 'PF')
    await importTransactions(env.DB, {
      account_id: acc,
      import_source: 'pluggy',
      rows: [linha({ imported_id: 'pf-1' })],
    })
    expect(await isBusinessDe('pf-1')).toBe(0)
  })

  // A conta da o DEFAULT, nao a verdade final (schema 0001: "aqui e
  // sobrescrivivel porque na pratica gasto de PJ cai em cartao PF").
  it('is_business explicito na linha vence o escopo da conta', async () => {
    const acc = await seedAccountScope('acc-pj2', 'PJ')
    await importTransactions(env.DB, {
      account_id: acc,
      import_source: 'pluggy',
      rows: [{ ...linha({ imported_id: 'pj-2' }), is_business: 0 }],
    })
    expect(await isBusinessDe('pj-2')).toBe(0)
  })
})

describe('pareamento automatico no import', () => {
  beforeEach(async () => {
    await setNomesProprios(env.DB, ['Paulo Victor Torres Silva', 'Pilu Tech'])
  })

  it('pareia as duas pernas quando a segunda perna e importada', async () => {
    const pj = await seedAccountScope('acc-pj3', 'PJ')
    const pf = await seedAccountScope('acc-pf3', 'PF')

    await importTransactions(env.DB, {
      account_id: pj,
      import_source: 'pluggy',
      rows: [
        linha({
          imported_id: 'saida-1',
          amount_cents: -430000,
          purchase_date: '2026-09-02',
          description: 'Pix enviado  - Paulo Victor Torres Silva',
        }),
      ],
    })

    const soUmaPerna = await env.DB.prepare(
      'SELECT transfer_id FROM transactions WHERE imported_id = ?',
    )
      .bind('saida-1')
      .first<{ transfer_id: string | null }>()
    expect(soUmaPerna?.transfer_id).toBeNull()

    await importTransactions(env.DB, {
      account_id: pf,
      import_source: 'pluggy',
      rows: [
        linha({
          imported_id: 'entrada-1',
          amount_cents: 430000,
          purchase_date: '2026-09-02',
          description: 'Pix recebido - Pilu Tech',
        }),
      ],
    })

    const rows = await env.DB.prepare(
      'SELECT imported_id, transfer_id FROM transactions WHERE imported_id IN (?, ?)',
    )
      .bind('saida-1', 'entrada-1')
      .all<{ imported_id: string; transfer_id: string | null }>()
    const ids = rows.results.map((r) => r.transfer_id)
    expect(ids[0]).not.toBeNull()
    expect(ids[0]).toBe(ids[1])
  })

  it('nao pareia entrada de terceiro que so coincide em valor e data', async () => {
    const a = await seedAccountScope('acc-a', 'PF')
    const b = await seedAccountScope('acc-b', 'PF')
    await importTransactions(env.DB, {
      account_id: a,
      import_source: 'pluggy',
      rows: [
        linha({
          imported_id: 's-50',
          amount_cents: -5000,
          purchase_date: '2026-06-25',
          description: 'Transferencia enviada|Paulo Victor Torres Silva',
        }),
      ],
    })
    await importTransactions(env.DB, {
      account_id: b,
      import_source: 'pluggy',
      rows: [
        linha({
          imported_id: 'e-50',
          amount_cents: 5000,
          purchase_date: '2026-06-25',
          description: 'Pix recebido - Livia R P Oliveira',
        }),
      ],
    })

    const row = await env.DB.prepare(
      'SELECT transfer_id FROM transactions WHERE imported_id = ?',
    )
      .bind('s-50')
      .first<{ transfer_id: string | null }>()
    expect(row?.transfer_id).toBeNull()
  })
})

// ---------------------------------------------------------------------
// settled_at: extrato bancario ja acontenceu; fatura de cartao nao.
// ---------------------------------------------------------------------

async function seedAccountKind(id: string, kind: 'checking' | 'credit_card') {
  await env.DB.prepare(
    `INSERT INTO accounts (id, name, scope, kind, institution, currency, closing_day, due_day,
       credit_limit_cents, opening_balance_cents, opening_date, archived_at, created_at, updated_at)
     VALUES (?, ?, 'PF', ?, 'Inter', 'BRL', ?, ?, NULL, 0, NULL, NULL,
       '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')`,
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

async function settledDe(imported_id: string): Promise<string | null> {
  const row = await env.DB.prepare(
    'SELECT settled_at FROM transactions WHERE imported_id = ?',
  )
    .bind(imported_id)
    .first<{ settled_at: string | null }>()
  return row!.settled_at
}

describe('settled_at no import', () => {
  // O Pluggy so importa status POSTED (pluggy-map.ts#STATUS_IMPORTAVEL):
  // o dinheiro JA se moveu. Nascer previsto punha "falta marcar como pago"
  // em todo lancamento de conta corrente — inclusive num Pix RECEBIDO.
  it('conta corrente: despesa importada nasce liquidada na data do fato', async () => {
    const acc = await seedAccountKind('acc-cc', 'checking')
    await importTransactions(env.DB, {
      account_id: acc,
      import_source: 'pluggy',
      rows: [
        linha({
          imported_id: 'saida',
          amount_cents: -5990,
          purchase_date: '2026-09-18',
        }),
      ],
    })
    expect(await settledDe('saida')).toBe('2026-09-18')
  })

  it('conta corrente: Pix RECEBIDO tambem nasce liquidado', async () => {
    const acc = await seedAccountKind('acc-cc2', 'checking')
    await importTransactions(env.DB, {
      account_id: acc,
      import_source: 'pluggy',
      rows: [
        linha({
          imported_id: 'entrada',
          amount_cents: 21000,
          purchase_date: '2026-09-20',
          description: 'Pix recebido - Maria Lacilene',
        }),
      ],
    })
    expect(await settledDe('entrada')).toBe('2026-09-20')
  })

  // A justificativa original do NULL ("extrato importado e fatura ainda em
  // aberto") vale SO aqui — e continua valendo.
  it('cartao de credito: compra importada continua prevista (fatura em aberto)', async () => {
    const acc = await seedAccountKind('acc-cartao', 'credit_card')
    await importTransactions(env.DB, {
      account_id: acc,
      import_source: 'pluggy',
      rows: [
        linha({
          imported_id: 'compra',
          amount_cents: -9900,
          purchase_date: '2026-09-18',
        }),
      ],
    })
    expect(await settledDe('compra')).toBeNull()
  })
})

// Item 3 (D6): a recorrente que lança sozinha cria o pendente no vencimento;
// quando o extrato traz o mesmo pagamento, a linha importada ATUALIZA o
// pendente em vez de virar uma segunda linha. Só com casamento único dos dois
// lados — ambíguo, insere e deixa o pendente para o dono resolver.
describe('conciliação recorrente × importação', () => {
  type Pendente = {
    id: string
    account_id: string
    amount_cents: number
    purchase_date: string
    bill_competence: string | null
    settled_at: string | null
    description: string
    payee_id: string | null
    category_id: string | null
    is_business: number
    imported_id: string | null
    import_source: string | null
    recurring_expense_id: string | null
    transfer_id: string | null
  }

  async function recorrenteComPendente(
    accountId: string,
    opts: {
      frequency?: Frequency
      dayOfMonth?: number
      startsOn?: string
      today?: string
      categoryId?: string | null
      min?: number
      max?: number
    } = {},
  ) {
    const recorrente = await createRecurring(
      env.DB,
      {
        description: 'Internet fibra',
        scope: 'PF',
        account_id: accountId,
        category_id: opts.categoryId ?? null,
        frequency: opts.frequency ?? 'monthly',
        day_of_month: opts.dayOfMonth ?? 10,
        amount_min_cents: opts.min ?? 9990,
        amount_max_cents: opts.max ?? 12990,
        starts_on: opts.startsOn ?? '2026-01-10',
        auto_generate: true,
      },
      { today: '2026-07-01' },
    )
    await generateRecurringOccurrences(env.DB, {
      today: opts.today ?? '2026-07-10',
    })
    const pendente = await env.DB.prepare(
      'SELECT id FROM transactions WHERE recurring_expense_id = ? ORDER BY purchase_date DESC',
    )
      .bind(recorrente.id)
      .first<{ id: string }>()
    if (!pendente) throw new Error('a geração não criou o pendente')
    return { recorrente, pendenteId: pendente.id }
  }

  async function lerLancamento(id: string): Promise<Pendente> {
    const row = await env.DB.prepare(
      `SELECT id, account_id, amount_cents, purchase_date, bill_competence,
              settled_at, description, payee_id, category_id, is_business,
              imported_id, import_source, recurring_expense_id, transfer_id
         FROM transactions WHERE id = ?`,
    )
      .bind(id)
      .first<Pendente>()
    if (!row) throw new Error(`lançamento ${id} sumiu`)
    return row
  }

  const SEM_MUDANCA = {
    amount_cents: -12990,
    purchase_date: '2026-07-10',
    settled_at: null,
    imported_id: null,
    import_source: null,
  }

  function importar(accountId: string, rows: LinhaImportada[]) {
    return importTransactions(env.DB, {
      account_id: accountId,
      import_source: 'ofx',
      rows,
    })
  }

  it('casa e atualiza o pendente com os dados da importação, sem linha nova', async () => {
    const acc = await seedAccount('acc-1')
    const { recorrente, pendenteId } = await recorrenteComPendente(acc)

    const result = await importar(acc, [
      linha({
        imported_id: 'fitid-net-07',
        purchase_date: '2026-07-12',
        amount_cents: -10990,
        description: 'NET FIBRA 07/26',
      }),
    ])

    expect(result).toEqual({ total: 1, imported: 0, skipped: 0, reconciled: 1 })
    expect(await countTransactions(acc)).toBe(1)
    expect(await lerLancamento(pendenteId)).toMatchObject({
      account_id: acc,
      amount_cents: -10990,
      purchase_date: '2026-07-12',
      bill_competence: null,
      settled_at: '2026-07-12',
      description: 'NET FIBRA 07/26',
      imported_id: 'fitid-net-07',
      import_source: 'ofx',
      recurring_expense_id: recorrente.id,
    })
  })

  it('categoria: fica a do pendente; sem ela, vale a da linha. Favorecido e is_business da linha quando vierem', async () => {
    const casa = await createCategory(env.DB, { name: 'Casa', kind: 'expense' })
    const lazer = await createCategory(env.DB, {
      name: 'Lazer',
      kind: 'expense',
    })
    const operadora = await createPayee(env.DB, {
      name: 'Operadora Teste',
      kind: 'merchant',
    })
    const comCategoria = await seedAccount('acc-1')
    const semCategoria = await seedAccount('acc-2')
    const a = await recorrenteComPendente(comCategoria, { categoryId: casa.id })
    const b = await recorrenteComPendente(semCategoria)

    await importTransactions(env.DB, {
      account_id: comCategoria,
      import_source: 'ofx',
      rows: [
        {
          ...linha({ imported_id: 'fitid-a', amount_cents: -10990 }),
          category_id: lazer.id,
          payee_id: operadora.id,
          is_business: 1,
        },
      ],
    })
    await importTransactions(env.DB, {
      account_id: semCategoria,
      import_source: 'ofx',
      rows: [
        {
          ...linha({ imported_id: 'fitid-b', amount_cents: -10990 }),
          category_id: lazer.id,
        },
      ],
    })

    expect(await lerLancamento(a.pendenteId)).toMatchObject({
      category_id: casa.id,
      payee_id: operadora.id,
      is_business: 1,
    })
    expect(await lerLancamento(b.pendenteId)).toMatchObject({
      category_id: lazer.id,
      payee_id: null,
      is_business: 0,
    })
  })

  it.each([
    ['valor acima da faixa', { amount_cents: -13000 }],
    ['valor abaixo da faixa', { amount_cents: -9989 }],
    ['entrada, não saída', { amount_cents: 10990 }],
    ['outra competência', { purchase_date: '2026-08-02' }],
  ])(
    '%s: não concilia, insere a linha e deixa o pendente como está',
    async (_caso, over) => {
      const acc = await seedAccount('acc-1')
      const { pendenteId } = await recorrenteComPendente(acc)

      const result = await importar(acc, [
        linha({ imported_id: 'fitid-x', amount_cents: -10990, ...over }),
      ])

      expect(result).toEqual({
        total: 1,
        imported: 1,
        skipped: 0,
        reconciled: 0,
      })
      expect(await countTransactions(acc)).toBe(2)
      expect(await lerLancamento(pendenteId)).toMatchObject(SEM_MUDANCA)
    },
  )

  // A busca dos candidatos é por intervalo de datas largo (cobre as duas
  // janelas); quem decide a competência é a janela da ocorrência.
  it('mensal: um dia antes do vencimento, mas na competência anterior, não concilia', async () => {
    const acc = await seedAccount('acc-1')
    // Começa em agosto: sem o pendente de julho, que casaria de verdade.
    const { pendenteId } = await recorrenteComPendente(acc, {
      dayOfMonth: 1,
      startsOn: '2026-08-01',
      today: '2026-08-01',
    })

    const result = await importar(acc, [
      linha({
        imported_id: 'fitid-x',
        amount_cents: -10990,
        purchase_date: '2026-07-31',
      }),
    ])

    expect(result).toEqual({ total: 1, imported: 1, skipped: 0, reconciled: 0 })
    expect((await lerLancamento(pendenteId)).imported_id).toBeNull()
  })

  it('o pendente de outra conta não concilia', async () => {
    const daRecorrente = await seedAccount('acc-1')
    const outra = await seedAccount('acc-2')
    const { pendenteId } = await recorrenteComPendente(daRecorrente)

    const result = await importar(outra, [
      linha({ imported_id: 'fitid-x', amount_cents: -10990 }),
    ])

    expect(result.reconciled).toBe(0)
    expect(await countTransactions(outra)).toBe(1)
    expect(await lerLancamento(pendenteId)).toMatchObject(SEM_MUDANCA)
  })

  it('dois pendentes candidatos para a mesma linha: não concilia nenhum', async () => {
    const acc = await seedAccount('acc-1')
    const a = await recorrenteComPendente(acc)
    const b = await recorrenteComPendente(acc, { dayOfMonth: 5 })

    const result = await importar(acc, [
      linha({ imported_id: 'fitid-x', amount_cents: -10990 }),
    ])

    expect(result).toEqual({ total: 1, imported: 1, skipped: 0, reconciled: 0 })
    expect((await lerLancamento(a.pendenteId)).imported_id).toBeNull()
    expect((await lerLancamento(b.pendenteId)).imported_id).toBeNull()
  })

  it('duas linhas candidatas para o mesmo pendente: não concilia nenhuma', async () => {
    const acc = await seedAccount('acc-1')
    const { pendenteId } = await recorrenteComPendente(acc)

    const result = await importar(acc, [
      linha({ imported_id: 'fitid-x', amount_cents: -10990 }),
      linha({
        imported_id: 'fitid-y',
        amount_cents: -11990,
        purchase_date: '2026-07-20',
      }),
    ])

    expect(result).toEqual({ total: 2, imported: 2, skipped: 0, reconciled: 0 })
    expect(await countTransactions(acc)).toBe(3)
    expect(await lerLancamento(pendenteId)).toMatchObject(SEM_MUDANCA)
  })

  it('a linha que o dedupe descartou não conta na unicidade', async () => {
    const acc = await seedAccount('acc-1')
    const { pendenteId } = await recorrenteComPendente(acc)
    // A linha antiga entra numa importação ambígua (duas candidatas), então
    // fica solta sem conciliar. Importada ANTES do pendente, a geração a
    // vincularia à ocorrência e não haveria pendente para este teste.
    const ambigua = await importar(acc, [
      linha({
        imported_id: 'fitid-antigo',
        amount_cents: -10990,
        purchase_date: '2026-07-02',
      }),
      linha({
        imported_id: 'fitid-outro',
        amount_cents: -10990,
        purchase_date: '2026-07-03',
      }),
    ])
    expect(ambigua.reconciled).toBe(0)

    const result = await importar(acc, [
      linha({
        imported_id: 'fitid-antigo',
        amount_cents: -10990,
        purchase_date: '2026-07-02',
      }),
      linha({ imported_id: 'fitid-novo', amount_cents: -11990 }),
    ])

    expect(result).toEqual({ total: 2, imported: 0, skipped: 1, reconciled: 1 })
    expect((await lerLancamento(pendenteId)).imported_id).toBe('fitid-novo')
  })

  it('pendente já liquidado à mão também concilia (a data de liquidação passa a ser a do extrato)', async () => {
    const acc = await seedAccount('acc-1')
    const { pendenteId } = await recorrenteComPendente(acc)
    await env.DB.prepare(
      "UPDATE transactions SET settled_at = '2026-07-11' WHERE id = ?",
    )
      .bind(pendenteId)
      .run()

    const result = await importar(acc, [
      linha({
        imported_id: 'fitid-x',
        amount_cents: -10990,
        purchase_date: '2026-07-13',
      }),
    ])

    expect(result.reconciled).toBe(1)
    expect(await lerLancamento(pendenteId)).toMatchObject({
      settled_at: '2026-07-13',
      imported_id: 'fitid-x',
    })
  })

  it('reimportar o mesmo arquivo depois não duplica nem concilia de novo', async () => {
    const acc = await seedAccount('acc-1')
    await recorrenteComPendente(acc)
    const rows = [linha({ imported_id: 'fitid-x', amount_cents: -10990 })]

    await importar(acc, rows)
    const segunda = await importar(acc, rows)

    expect(segunda).toEqual({
      total: 1,
      imported: 0,
      skipped: 1,
      reconciled: 0,
    })
    expect(await countTransactions(acc)).toBe(1)
  })

  it('perna de transferência (contraparte própria) não concilia, e o pareamento continua', async () => {
    await setNomesProprios(env.DB, ['Fulano de Teste'])
    const acc = await seedAccount('acc-1')
    const outra = await seedAccount('acc-2')
    const { pendenteId } = await recorrenteComPendente(acc)
    await importar(outra, [
      linha({
        imported_id: 'entrada-1',
        amount_cents: 10990,
        purchase_date: '2026-07-12',
        description: 'Pix recebido - Fulano de Teste',
      }),
    ])

    const result = await importar(acc, [
      linha({
        imported_id: 'saida-1',
        amount_cents: -10990,
        purchase_date: '2026-07-12',
        description: 'Pix enviado - Fulano de Teste',
      }),
    ])

    expect(result).toEqual({ total: 1, imported: 1, skipped: 0, reconciled: 0 })
    expect(await lerLancamento(pendenteId)).toMatchObject(SEM_MUDANCA)
    const saida = await env.DB.prepare(
      "SELECT transfer_id FROM transactions WHERE imported_id = 'saida-1'",
    ).first<{ transfer_id: string | null }>()
    expect(saida?.transfer_id).not.toBeNull()
  })

  it('semanal: casa até 3 dias do vencimento, não com 4', async () => {
    const tres = await seedAccount('acc-1')
    const quatro = await seedAccount('acc-2')
    const semanal = {
      frequency: 'weekly' as const,
      dayOfMonth: 6,
      startsOn: '2026-07-06',
      today: '2026-07-06',
    }
    const a = await recorrenteComPendente(tres, semanal)
    const b = await recorrenteComPendente(quatro, semanal)

    const casou = await importar(tres, [
      linha({
        imported_id: 'fitid-a',
        amount_cents: -10990,
        purchase_date: '2026-07-09',
      }),
    ])
    const naoCasou = await importar(quatro, [
      linha({
        imported_id: 'fitid-b',
        amount_cents: -10990,
        purchase_date: '2026-07-10',
      }),
    ])

    expect(casou.reconciled).toBe(1)
    expect((await lerLancamento(a.pendenteId)).purchase_date).toBe('2026-07-09')
    expect(naoCasou.reconciled).toBe(0)
    expect((await lerLancamento(b.pendenteId)).imported_id).toBeNull()
  })

  it('cartão: o conciliado ganha bill_competence e settled_at como a importação calcularia', async () => {
    const cartao = await seedAccount('acc-cartao', 'credit_card', 25, 5)
    const { pendenteId } = await recorrenteComPendente(cartao, {
      dayOfMonth: 28,
      today: '2026-07-28',
    })
    expect((await lerLancamento(pendenteId)).bill_competence).toBe('2026-08')

    const result = await importar(cartao, [
      linha({
        imported_id: 'fitid-x',
        amount_cents: -10990,
        purchase_date: '2026-07-20',
      }),
    ])

    expect(result.reconciled).toBe(1)
    expect(await lerLancamento(pendenteId)).toMatchObject({
      purchase_date: '2026-07-20',
      bill_competence: '2026-07',
      settled_at: null,
    })
  })

  // A importação calcula settled_at NULL para linha de cartão. Gravar isso
  // por cima de um pendente que o pagamento da fatura já liquidou reabriria a
  // fatura paga: payBill voltaria a ver saldo aberto e deixaria pagar de novo
  // (o dinheiro sairia duas vezes), e commitments() voltaria a somá-la.
  it('cartão: pendente já liquidado pelo pagamento da fatura continua liquidado e na mesma fatura', async () => {
    const cartao = await seedAccount('acc-cartao', 'credit_card', 25, 5)
    const corrente = await seedAccount('acc-corrente')
    const { pendenteId } = await recorrenteComPendente(cartao)
    expect((await lerLancamento(pendenteId)).bill_competence).toBe('2026-07')
    await payBill(env.DB, {
      card_account_id: cartao,
      competence: '2026-07',
      paid_on: '2026-08-05',
      from_account_id: corrente,
    })

    // 27/07 passa do fechamento (dia 25): a importação jogaria a linha na
    // fatura de agosto.
    const result = await importTransactions(env.DB, {
      account_id: cartao,
      import_source: 'pdf',
      rows: [
        linha({
          imported_id: 'fitid-x',
          amount_cents: -10990,
          purchase_date: '2026-07-27',
        }),
      ],
    })

    expect(result.reconciled).toBe(1)
    expect(await lerLancamento(pendenteId)).toMatchObject({
      amount_cents: -10990,
      imported_id: 'fitid-x',
      settled_at: '2026-08-05',
      bill_competence: '2026-07',
    })
    await expect(
      payBill(env.DB, {
        card_account_id: cartao,
        competence: '2026-07',
        paid_on: '2026-08-06',
        from_account_id: corrente,
      }),
    ).rejects.toMatchObject({ code: 'already_paid' })
  })

  it('corrida: pendente que mudou de conta entre a leitura e a escrita não é conciliado, e a linha entra normalmente', async () => {
    const acc = await seedAccount('acc-1')
    const outra = await seedAccount('acc-2')
    const { pendenteId } = await recorrenteComPendente(acc)
    const mudouDeConta = new Proxy(env.DB, {
      get(alvo, prop) {
        if (prop === 'batch') {
          return async (stmts: D1PreparedStatement[]) => {
            await alvo
              .prepare('UPDATE transactions SET account_id = ? WHERE id = ?')
              .bind(outra, pendenteId)
              .run()
            return alvo.batch(stmts)
          }
        }
        const valor = Reflect.get(alvo, prop)
        return typeof valor === 'function' ? valor.bind(alvo) : valor
      },
    })

    const result = await importTransactions(mudouDeConta, {
      account_id: acc,
      import_source: 'ofx',
      rows: [linha({ imported_id: 'fitid-x', amount_cents: -10990 })],
    })

    expect(result).toEqual({ total: 1, imported: 1, skipped: 0, reconciled: 0 })
    expect(await countTransactions(acc)).toBe(1)
    expect(await lerLancamento(pendenteId)).toMatchObject({
      account_id: outra,
      imported_id: null,
    })
  })

  it('corrida: pendente que ganhou outro imported_id entre a leitura e a escrita fica como está, e a linha entra normalmente', async () => {
    const acc = await seedAccount('acc-1')
    const { pendenteId } = await recorrenteComPendente(acc)
    const outroImport = new Proxy(env.DB, {
      get(alvo, prop) {
        if (prop === 'batch') {
          return async (stmts: D1PreparedStatement[]) => {
            await alvo
              .prepare(
                "UPDATE transactions SET imported_id = 'fitid-outro' WHERE id = ?",
              )
              .bind(pendenteId)
              .run()
            return alvo.batch(stmts)
          }
        }
        const valor = Reflect.get(alvo, prop)
        return typeof valor === 'function' ? valor.bind(alvo) : valor
      },
    })

    const result = await importTransactions(outroImport, {
      account_id: acc,
      import_source: 'ofx',
      rows: [linha({ imported_id: 'fitid-x', amount_cents: -10990 })],
    })

    expect(result).toEqual({ total: 1, imported: 1, skipped: 0, reconciled: 0 })
    expect(await countTransactions(acc)).toBe(2)
    expect((await lerLancamento(pendenteId)).imported_id).toBe('fitid-outro')
  })

  it('corrida com a mesma linha (outra importação do mesmo arquivo já conciliou): nada novo, conta como pulada', async () => {
    const acc = await seedAccount('acc-1')
    const { pendenteId } = await recorrenteComPendente(acc)
    const mesmoArquivo = new Proxy(env.DB, {
      get(alvo, prop) {
        if (prop === 'batch') {
          return async (stmts: D1PreparedStatement[]) => {
            await alvo
              .prepare(
                "UPDATE transactions SET imported_id = 'fitid-x' WHERE id = ?",
              )
              .bind(pendenteId)
              .run()
            return alvo.batch(stmts)
          }
        }
        const valor = Reflect.get(alvo, prop)
        return typeof valor === 'function' ? valor.bind(alvo) : valor
      },
    })

    const result = await importTransactions(mesmoArquivo, {
      account_id: acc,
      import_source: 'ofx',
      rows: [linha({ imported_id: 'fitid-x', amount_cents: -10990 })],
    })

    expect(result).toEqual({ total: 1, imported: 0, skipped: 1, reconciled: 0 })
    expect(await countTransactions(acc)).toBe(1)
  })
})
