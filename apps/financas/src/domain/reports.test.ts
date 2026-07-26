import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { createAccount } from './accounts'
import { createTransaction } from './transactions'
import { addDebtItem, createDebt, payDebt } from './debts'
import { commitments, DEFAULT_FIXED_NET_CENTS } from './reports'

const db = env.DB

async function cartao(name: string) {
  return createAccount(db, {
    name,
    scope: 'PF',
    kind: 'credit_card',
    closing_day: 25,
    due_day: 5,
  })
}

async function parcela(
  account_id: string,
  competence: string,
  cents: number,
  settled_at: string | null = null,
) {
  return createTransaction(db, {
    account_id,
    amount_cents: -cents,
    purchase_date: '2026-07-28',
    bill_competence: competence,
    settled_at,
    description: `parcela ${competence}`,
  })
}

describe('commitments', () => {
  it('devolve 6 competencias a partir do from, em ordem', async () => {
    const nubank = await cartao('Nubank cartao')
    await parcela(nubank.id, '2026-08', 124000)

    const report = await commitments(db, {
      from: '2026-08',
      months: 6,
      fixed_net_cents: DEFAULT_FIXED_NET_CENTS,
    })

    expect(report.competences).toEqual([
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
      '2026-12',
      '2027-01',
    ])
    expect(report.rows).toHaveLength(1)
    expect(report.rows[0].account_name).toBe('Nubank cartao')
    expect(report.rows[0].cells).toEqual([124000, 0, 0, 0, 0, 0])
  })

  it('soma varias parcelas na mesma competencia e separa por conta', async () => {
    const nubank = await cartao('Nubank cartao')
    const inter = await cartao('Inter cartao')
    await parcela(nubank.id, '2026-08', 100000)
    await parcela(nubank.id, '2026-08', 24000)
    await parcela(inter.id, '2026-08', 42000)
    await parcela(inter.id, '2026-09', 42000)

    const report = await commitments(db, {
      from: '2026-08',
      months: 2,
      fixed_net_cents: DEFAULT_FIXED_NET_CENTS,
    })

    const porNome = Object.fromEntries(
      report.rows.map((r) => [r.account_name, r.cells]),
    )
    expect(porNome['Nubank cartao']).toEqual([124000, 0])
    expect(porNome['Inter cartao']).toEqual([42000, 42000])
    expect(report.totals).toEqual([166000, 42000])
  })

  it('conta sem parcela nenhuma na janela nao aparece', async () => {
    const nubank = await cartao('Nubank cartao')
    await cartao('Cartao dormente')
    const conta = await createAccount(db, {
      name: 'Nubank conta',
      scope: 'PF',
      kind: 'checking',
    })
    await createTransaction(db, {
      account_id: conta.id,
      amount_cents: -5000,
      purchase_date: '2026-08-10',
      description: 'mercado',
      settled_at: '2026-08-10',
    })
    await parcela(nubank.id, '2026-08', 124000)

    const report = await commitments(db, {
      from: '2026-08',
      months: 3,
      fixed_net_cents: DEFAULT_FIXED_NET_CENTS,
    })

    expect(report.rows.map((r) => r.account_name)).toEqual(['Nubank cartao'])
  })

  it('parcela ja liquidada (settled_at preenchido) nao conta', async () => {
    const nubank = await cartao('Nubank cartao')
    await parcela(nubank.id, '2026-08', 124000, '2026-08-05')
    await parcela(nubank.id, '2026-09', 124000)

    const report = await commitments(db, {
      from: '2026-08',
      months: 2,
      fixed_net_cents: DEFAULT_FIXED_NET_CENTS,
    })

    expect(report.rows[0].cells).toEqual([0, 124000])
    expect(report.totals).toEqual([0, 124000])
  })

  it('nao conta perna de transferencia nem filha de rateio', async () => {
    const nubank = await cartao('Nubank cartao')
    await parcela(nubank.id, '2026-08', 100000)

    const pai = await createTransaction(db, {
      account_id: nubank.id,
      amount_cents: -30000,
      purchase_date: '2026-07-28',
      bill_competence: '2026-08',
      description: 'mercado (pai)',
    })
    await db
      .prepare(
        `INSERT INTO transactions
           (id, account_id, amount_cents, currency, purchase_date, bill_competence,
            description, is_business, parent_id, created_at, updated_at)
         VALUES (?, ?, ?, 'BRL', ?, ?, ?, 0, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        nubank.id,
        -30000,
        '2026-07-28',
        '2026-08',
        'mercado (filha)',
        pai.id,
        '2026-07-28T12:00:00Z',
        '2026-07-28T12:00:00Z',
      )
      .run()

    const report = await commitments(db, {
      from: '2026-08',
      months: 1,
      fixed_net_cents: DEFAULT_FIXED_NET_CENTS,
    })

    expect(report.totals).toEqual([130000])
  })

  it('percentual bate contra o liquido fixo, nunca contra o liquido com freela', async () => {
    const nubank = await cartao('Nubank cartao')
    await parcela(nubank.id, '2026-08', 216000)
    await parcela(nubank.id, '2026-09', 90000)

    const report = await commitments(db, {
      from: '2026-08',
      months: 2,
      fixed_net_cents: DEFAULT_FIXED_NET_CENTS,
    })

    expect(report.fixed_net_cents).toBe(360000)
    expect(report.pct_of_fixed_net).toEqual([60, 25])
  })

  it('vira o ano corretamente', async () => {
    const nubank = await cartao('Nubank cartao')
    await parcela(nubank.id, '2026-12', 50000)
    await parcela(nubank.id, '2027-01', 50000)

    const report = await commitments(db, {
      from: '2026-11',
      months: 3,
      fixed_net_cents: DEFAULT_FIXED_NET_CENTS,
    })

    expect(report.competences).toEqual(['2026-11', '2026-12', '2027-01'])
    expect(report.rows[0].cells).toEqual([0, 50000, 50000])
  })

  it('saldo aberto de divida i_owe entra na primeira competencia da janela', async () => {
    const payeeId = crypto.randomUUID()
    await db
      .prepare(
        `INSERT INTO payees (id, name, norm_name, kind, created_at)
         VALUES (?, 'Pai', 'PAI', 'person', ?)`,
      )
      .bind(payeeId, '2026-01-01T00:00:00Z')
      .run()

    const divida = await createDebt(db, {
      payee_id: payeeId,
      direction: 'i_owe',
      title: 'Pai',
      opened_at: '2026-03-01',
    })
    await addDebtItem(db, {
      debt_id: divida.id,
      description: 'Steam Deck',
      amount_cents: 280000,
      incurred_on: '2026-03-01',
    })

    const report = await commitments(db, {
      from: '2026-08',
      months: 3,
      fixed_net_cents: DEFAULT_FIXED_NET_CENTS,
    })

    const linha = report.rows.find((r) => r.account_name === 'Divida — Pai')
    expect(linha).toBeDefined()
    expect(linha!.cells).toEqual([280000, 0, 0])
    expect(report.totals).toEqual([280000, 0, 0])
  })

  it('divida owed_to_me nao é compromisso meu', async () => {
    const payeeId = crypto.randomUUID()
    await db
      .prepare(
        `INSERT INTO payees (id, name, norm_name, kind, created_at)
         VALUES (?, 'Amigo', 'AMIGO', 'person', ?)`,
      )
      .bind(payeeId, '2026-01-01T00:00:00Z')
      .run()

    const divida = await createDebt(db, {
      payee_id: payeeId,
      direction: 'owed_to_me',
      title: 'Amigo',
      opened_at: '2026-03-01',
    })
    await addDebtItem(db, {
      debt_id: divida.id,
      description: 'Notebook',
      amount_cents: 320000,
      incurred_on: '2026-03-01',
    })

    const report = await commitments(db, {
      from: '2026-08',
      months: 2,
      fixed_net_cents: DEFAULT_FIXED_NET_CENTS,
    })

    expect(report.rows).toEqual([])
    expect(report.totals).toEqual([0, 0])
  })

  it('INVARIANTE: pagar uma divida reduz o comprometido exatamente pelo valor alocado, gera exatamente 1 linha no caixa, e nunca vira despesa', async () => {
    // debt_items e debt_payments so tabelas separadas justamente pra isto:
    // estoque (o que devo) e fluxo (o dinheiro que efetivamente saiu) nunca
    // se somam. Nenhum teste ate agora ligava payDebt() a commitments() —
    // reports.test.ts so usava createDebt+addDebtItem, e debts.test.ts
    // conferia v_cashflow/v_debt_item_balance mas nunca commitments(). O
    // invariante valia por leitura de codigo, nao por teste.
    const payeeId = crypto.randomUUID()
    await db
      .prepare(
        `INSERT INTO payees (id, name, norm_name, kind, created_at)
         VALUES (?, 'Pai', 'PAI', 'person', ?)`,
      )
      .bind(payeeId, '2026-01-01T00:00:00Z')
      .run()

    const conta = await createAccount(db, {
      name: 'Nubank conta corrente',
      scope: 'PF',
      kind: 'checking',
    })

    const divida = await createDebt(db, {
      payee_id: payeeId,
      direction: 'i_owe',
      title: 'Pai',
      opened_at: '2026-03-01',
    })
    const steam = await addDebtItem(db, {
      debt_id: divida.id,
      description: 'Steam Deck',
      amount_cents: 280000,
      incurred_on: '2026-03-01',
    })
    await addDebtItem(db, {
      debt_id: divida.id,
      description: 'MacBook Air',
      amount_cents: 450000,
      incurred_on: '2026-03-01',
    })

    const antes = await commitments(db, {
      from: '2026-08',
      months: 1,
      fixed_net_cents: DEFAULT_FIXED_NET_CENTS,
    })
    const linhaAntes = antes.rows.find((r) => r.account_name === 'Divida — Pai')
    expect(linhaAntes?.cells).toEqual([730000]) // 280000 + 450000

    const ALOCADO = 100000
    const { payment, transaction } = await payDebt(db, {
      debt_id: divida.id,
      paid_on: '2026-07-10',
      amount_cents: ALOCADO,
      account_id: conta.id,
      allocations: [{ item_id: steam.id, amount_cents: ALOCADO }],
    })
    expect(payment.amount_cents).toBe(ALOCADO)

    const depois = await commitments(db, {
      from: '2026-08',
      months: 1,
      fixed_net_cents: DEFAULT_FIXED_NET_CENTS,
    })
    const linhaDepois = depois.rows.find(
      (r) => r.account_name === 'Divida — Pai',
    )
    // exatamente o valor alocado, nem mais nem menos.
    expect(linhaDepois?.cells).toEqual([730000 - ALOCADO])
    expect(depois.totals).toEqual([730000 - ALOCADO])

    // 1x no caixa via v_cashflow (o pagamento liquidou de verdade).
    const cashflow = await db
      .prepare('SELECT COUNT(*) AS n FROM v_cashflow WHERE id = ?')
      .bind(transaction!.id)
      .first<{ n: number }>()
    expect(cashflow?.n).toBe(1)

    // 0x como despesa — a categoria e sempre 'quitacao-divida'
    // (kind='debt_settlement'), nunca 'expense'.
    const comoDespesa = await db
      .prepare(
        `SELECT COUNT(*) AS n FROM transactions t
           JOIN categories c ON c.id = t.category_id
          WHERE c.kind = 'expense'`,
      )
      .first<{ n: number }>()
    expect(comoDespesa?.n).toBe(0)
  })

  it('rejeita competencia e janela invalidas', async () => {
    await expect(
      commitments(db, { from: '2026-8', months: 6, fixed_net_cents: 360000 }),
    ).rejects.toThrow(RangeError)
    await expect(
      commitments(db, { from: '2026-08', months: 0, fixed_net_cents: 360000 }),
    ).rejects.toThrow(RangeError)
  })
})
