import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { createAccount } from './accounts'
import { createTransaction, createTransfer } from './transactions'
import { cashflow } from './cashflow'

const db = env.DB

async function contaCorrente(name: string, opening_balance_cents = 0) {
  return createAccount(db, {
    name,
    scope: 'PJ',
    kind: 'checking',
    opening_balance_cents,
  })
}

async function cartao(name: string) {
  return createAccount(db, {
    name,
    scope: 'PF',
    kind: 'credit_card',
    closing_day: 25,
    due_day: 5,
  })
}

describe('cashflow', () => {
  it('1. entrada e saida somadas por mes, com sinal correto', async () => {
    const conta = await contaCorrente('Conta corrente')
    await createTransaction(db, {
      account_id: conta.id,
      amount_cents: 500000,
      purchase_date: '2026-01-05',
      settled_at: '2026-01-05',
      description: 'salario',
    })
    await createTransaction(db, {
      account_id: conta.id,
      amount_cents: -120000,
      purchase_date: '2026-01-10',
      settled_at: '2026-01-10',
      description: 'aluguel',
    })

    const report = await cashflow(db, { from: '2026-01', months: 1 })

    expect(report.meses).toEqual(['2026-01'])
    expect(report.linhas).toEqual([
      {
        competence: '2026-01',
        entrou_cents: 500000,
        saiu_cents: 120000,
        saldo_cents: 380000,
        acumulado_cents: 380000,
      },
    ])
  })

  // O TESTE QUE DECIDE A FATIA. 22h de 31/01 em Teresina (UTC-3) e 01h de
  // 01/02 em UTC — settled_at grava o instante UTC. Trocar a implementacao
  // para `substr(settled_at, 1, 7)` (o bug da view v_cashflow) tem que
  // fazer este teste falhar: verificado por mutacao, nao so argumentado
  // (ver CLAUDE.md apos a implementacao).
  it('2. lancamento as 22h de Teresina cai no mes LOCAL, nao no UTC', async () => {
    const conta = await contaCorrente('Conta corrente')
    await createTransaction(db, {
      account_id: conta.id,
      amount_cents: -5000,
      purchase_date: '2026-01-31',
      settled_at: '2026-02-01T01:00:00Z',
      description: 'compra as 22h de Teresina',
    })

    const report = await cashflow(db, { from: '2026-01', months: 2 })

    expect(report.linhas[0]).toMatchObject({
      competence: '2026-01',
      saiu_cents: 5000,
    })
    expect(report.linhas[1]).toMatchObject({
      competence: '2026-02',
      saiu_cents: 0,
    })
  })

  it('3. transferencia entre contas proprias nao aparece de lado nenhum', async () => {
    const origem = await contaCorrente('Conta origem')
    const destino = await contaCorrente('Conta destino')
    await createTransfer(db, {
      from_account_id: origem.id,
      to_account_id: destino.id,
      amount_cents: 30000,
      date: '2026-01-15',
      description: 'transferencia interna',
    })

    const report = await cashflow(db, { from: '2026-01', months: 1 })

    expect(report.linhas[0].entrou_cents).toBe(0)
    expect(report.linhas[0].saiu_cents).toBe(0)
  })

  it('4. filha de rateio nao duplica o pai', async () => {
    const conta = await contaCorrente('Conta corrente')
    const pai = await createTransaction(db, {
      account_id: conta.id,
      amount_cents: -30000,
      purchase_date: '2026-01-10',
      settled_at: '2026-01-10',
      description: 'mercado (pai)',
    })
    await db
      .prepare(
        `INSERT INTO transactions
           (id, account_id, amount_cents, currency, purchase_date, settled_at,
            description, is_business, parent_id, created_at, updated_at)
         VALUES (?, ?, ?, 'BRL', ?, ?, ?, 0, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        conta.id,
        -30000,
        '2026-01-10',
        '2026-01-10',
        'mercado (filha)',
        pai.id,
        '2026-01-10T12:00:00Z',
        '2026-01-10T12:00:00Z',
      )
      .run()

    const report = await cashflow(db, { from: '2026-01', months: 1 })

    expect(report.linhas[0].saiu_cents).toBe(30000)
  })

  it('5. lancamento nao liquidado (settled_at IS NULL) nao entra', async () => {
    const nubank = await cartao('Nubank cartao')
    await createTransaction(db, {
      account_id: nubank.id,
      amount_cents: -50000,
      purchase_date: '2026-01-10',
      bill_competence: '2026-01',
      description: 'parcela prevista',
    })

    const report = await cashflow(db, { from: '2026-01', months: 1 })

    expect(report.linhas[0].entrou_cents).toBe(0)
    expect(report.linhas[0].saiu_cents).toBe(0)
  })

  it('6. mes sem movimento aparece zerado, nao ausente', async () => {
    const conta = await contaCorrente('Conta corrente')
    await createTransaction(db, {
      account_id: conta.id,
      amount_cents: 100000,
      purchase_date: '2026-01-05',
      settled_at: '2026-01-05',
      description: 'entrada',
    })

    const report = await cashflow(db, { from: '2026-01', months: 3 })

    expect(report.meses).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(report.linhas).toHaveLength(3)
    expect(report.linhas[1]).toMatchObject({
      competence: '2026-02',
      entrou_cents: 0,
      saiu_cents: 0,
      saldo_cents: 0,
    })
    expect(report.linhas[2]).toMatchObject({
      competence: '2026-03',
      entrou_cents: 0,
      saiu_cents: 0,
      saldo_cents: 0,
    })
  })

  it('7. acumulado parte do saldo de abertura das contas, nao de zero', async () => {
    await createAccount(db, {
      name: 'Conta A',
      scope: 'PJ',
      kind: 'checking',
      opening_balance_cents: 200000,
    })
    await createAccount(db, {
      name: 'Conta B',
      scope: 'PF',
      kind: 'checking',
      opening_balance_cents: 50000,
    })

    const report = await cashflow(db, { from: '2026-01', months: 1 })

    expect(report.linhas[0]).toMatchObject({
      saldo_cents: 0,
      acumulado_cents: 250000,
    })
  })

  it('8. acumulado do mes N = acumulado de N-1 + saldo de N', async () => {
    const conta = await createAccount(db, {
      name: 'Conta',
      scope: 'PJ',
      kind: 'checking',
      opening_balance_cents: 100000,
    })
    await createTransaction(db, {
      account_id: conta.id,
      amount_cents: 50000,
      purchase_date: '2026-01-05',
      settled_at: '2026-01-05',
      description: 'entrada jan',
    })
    await createTransaction(db, {
      account_id: conta.id,
      amount_cents: -20000,
      purchase_date: '2026-02-05',
      settled_at: '2026-02-05',
      description: 'saida fev',
    })

    const report = await cashflow(db, { from: '2026-01', months: 2 })

    expect(report.linhas).toEqual([
      {
        competence: '2026-01',
        entrou_cents: 50000,
        saiu_cents: 0,
        saldo_cents: 50000,
        acumulado_cents: 150000,
      },
      {
        competence: '2026-02',
        entrou_cents: 0,
        saiu_cents: 20000,
        saldo_cents: -20000,
        acumulado_cents: 130000,
      },
    ])
  })
})
