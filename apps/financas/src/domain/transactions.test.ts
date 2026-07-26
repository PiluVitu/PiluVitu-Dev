import { applyD1Migrations, env } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import { accountBalances, createAccount } from './accounts'
import {
  createTransaction,
  createTransfer,
  listTransactions,
} from './transactions'

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
})

function contaCorrente(name: string, opening_balance_cents = 0) {
  return createAccount(env.DB, {
    name,
    scope: 'PF',
    kind: 'checking',
    opening_balance_cents,
  })
}

function cartao(name: string, closing_day: number) {
  return createAccount(env.DB, {
    name,
    scope: 'PF',
    kind: 'credit_card',
    closing_day,
    due_day: 5,
  })
}

describe('createTransaction', () => {
  it('compra de 28/07 em cartao que fecha dia 25 cai na fatura de agosto', async () => {
    const card = await cartao('Nubank cartao', 25)
    const tx = await createTransaction(env.DB, {
      account_id: card.id,
      amount_cents: -12990,
      purchase_date: '2026-07-28',
      description: 'Steam',
    })
    expect(tx.bill_competence).toBe('2026-08')
    expect(tx.settled_at).toBeNull()
    expect(tx.transfer_id).toBeNull()
  })

  it('compra de 20/07 no mesmo cartao cai na fatura de julho', async () => {
    const card = await cartao('Nubank cartao antes do fechamento', 25)
    const tx = await createTransaction(env.DB, {
      account_id: card.id,
      amount_cents: -4500,
      purchase_date: '2026-07-20',
      description: 'iFood',
    })
    expect(tx.bill_competence).toBe('2026-07')
  })

  it('bill_competence informada no input vence a derivacao', async () => {
    const card = await cartao('Inter cartao', 25)
    const tx = await createTransaction(env.DB, {
      account_id: card.id,
      amount_cents: -5000,
      purchase_date: '2026-07-28',
      description: 'ajuste manual',
      bill_competence: '2026-07',
    })
    expect(tx.bill_competence).toBe('2026-07')
  })

  it('lancamento em conta corrente grava bill_competence NULL', async () => {
    const acc = await contaCorrente('Nubank conta')
    const tx = await createTransaction(env.DB, {
      account_id: acc.id,
      amount_cents: -8900,
      purchase_date: '2026-07-28',
      description: 'Padaria',
      settled_at: '2026-07-28',
    })
    expect(tx.bill_competence).toBeNull()
    expect(tx.settled_at).toBe('2026-07-28')
    expect(tx.currency).toBe('BRL')
    expect(tx.is_business).toBe(0)
  })

  it('conta inexistente vira erro com mensagem util', async () => {
    await expect(
      createTransaction(env.DB, {
        account_id: 'nao-existe',
        amount_cents: -100,
        purchase_date: '2026-07-20',
        description: 'x',
      }),
    ).rejects.toThrow('conta nao-existe nao existe')
  })

  it('amount_cents = 0 e barrado pelo CHECK do schema', async () => {
    const acc = await contaCorrente('Conta zero')
    await expect(
      createTransaction(env.DB, {
        account_id: acc.id,
        amount_cents: 0,
        purchase_date: '2026-07-20',
        description: 'nada aconteceu',
      }),
    ).rejects.toThrow()

    const { results } = await env.DB.prepare(
      'SELECT id FROM transactions WHERE account_id = ?',
    )
      .bind(acc.id)
      .all()
    expect(results).toHaveLength(0)
  })

  it('moeda estrangeira sem amount_original_cents e barrada pelo CHECK', async () => {
    const acc = await contaCorrente('Conta USD')
    await expect(
      createTransaction(env.DB, {
        account_id: acc.id,
        amount_cents: -12990,
        currency: 'USD',
        purchase_date: '2026-07-20',
        description: 'AWS',
      }),
    ).rejects.toThrow()

    const ok = await createTransaction(env.DB, {
      account_id: acc.id,
      amount_cents: -12990,
      currency: 'USD',
      amount_original_cents: -2399,
      fx_rate_ppm: 5415000,
      purchase_date: '2026-07-20',
      description: 'AWS',
    })
    expect(ok.currency).toBe('USD')
    expect(ok.amount_original_cents).toBe(-2399)
    expect(ok.fx_rate_ppm).toBe(5415000)
  })
})

describe('createTransfer', () => {
  it('gera duas linhas com o mesmo transfer_id e soma zero', async () => {
    const de = await contaCorrente('Origem PIX', 500000)
    const para = await contaCorrente('Destino PIX', 0)

    const { transfer_id, out, inbound } = await createTransfer(env.DB, {
      from_account_id: de.id,
      to_account_id: para.id,
      amount_cents: 150000,
      date: '2026-07-20',
      description: 'PIX interno',
    })

    expect(out.transfer_id).toBe(transfer_id)
    expect(inbound.transfer_id).toBe(transfer_id)
    expect(out.account_id).toBe(de.id)
    expect(inbound.account_id).toBe(para.id)
    expect(out.amount_cents).toBe(-150000)
    expect(inbound.amount_cents).toBe(150000)
    expect(out.amount_cents + inbound.amount_cents).toBe(0)

    const { results } = await env.DB.prepare(
      'SELECT id FROM transactions WHERE transfer_id = ?',
    )
      .bind(transfer_id)
      .all()
    expect(results).toHaveLength(2)
  })

  it('nao aparece em v_cashflow, enquanto a despesa comum aparece', async () => {
    const de = await contaCorrente('Origem cashflow', 500000)
    const para = await contaCorrente('Destino cashflow', 0)

    const { transfer_id } = await createTransfer(env.DB, {
      from_account_id: de.id,
      to_account_id: para.id,
      amount_cents: 150000,
      date: '2026-07-20',
      description: 'PIX interno',
    })
    await createTransaction(env.DB, {
      account_id: de.id,
      amount_cents: -3000,
      purchase_date: '2026-07-21',
      description: 'Mercado',
      settled_at: '2026-07-21',
    })

    const naTransferencia = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM v_cashflow WHERE transfer_id = ?',
    )
      .bind(transfer_id)
      .first<{ n: number }>()
    expect(naTransferencia?.n).toBe(0)

    const consolidado = await env.DB.prepare(
      'SELECT SUM(amount_cents) AS total FROM v_cashflow WHERE account_id = ?',
    )
      .bind(de.id)
      .first<{ total: number }>()
    expect(consolidado?.total).toBe(-3000)
  })

  it('move o saldo das duas contas sem mexer no consolidado', async () => {
    const de = await contaCorrente('Origem saldo', 500000)
    const para = await contaCorrente('Destino saldo', 100000)

    const antes = await accountBalances(env.DB)
    const consolidadoAntes = antes.reduce((acc, s) => acc + s.balance_cents, 0)

    await createTransfer(env.DB, {
      from_account_id: de.id,
      to_account_id: para.id,
      amount_cents: 150000,
      date: '2026-07-20',
      description: 'PIX interno',
    })

    const depois = await accountBalances(env.DB)
    const porConta = new Map(depois.map((s) => [s.account_id, s.balance_cents]))
    expect(porConta.get(de.id)).toBe(350000)
    expect(porConta.get(para.id)).toBe(250000)
    expect(depois.reduce((acc, s) => acc + s.balance_cents, 0)).toBe(
      consolidadoAntes,
    )
  })

  it('recusa transferencia para a mesma conta e valor nao positivo', async () => {
    const acc = await contaCorrente('Conta unica')
    const outra = await contaCorrente('Conta outra')
    await expect(
      createTransfer(env.DB, {
        from_account_id: acc.id,
        to_account_id: acc.id,
        amount_cents: 1000,
        date: '2026-07-20',
        description: 'loop',
      }),
    ).rejects.toThrow('transferencia exige duas contas diferentes')
    await expect(
      createTransfer(env.DB, {
        from_account_id: acc.id,
        to_account_id: outra.id,
        amount_cents: 0,
        date: '2026-07-20',
        description: 'zero',
      }),
    ).rejects.toThrow('valor da transferencia deve ser positivo')
  })
})

describe('listTransactions', () => {
  it('filtra por conta e por periodo, mais recente primeiro', async () => {
    const acc = await contaCorrente('Extrato')
    const ruido = await contaCorrente('Fora do filtro')

    for (const [date, description] of [
      ['2026-06-30', 'junho'],
      ['2026-07-05', 'julho A'],
      ['2026-07-25', 'julho B'],
    ]) {
      await createTransaction(env.DB, {
        account_id: acc.id,
        amount_cents: -1000,
        purchase_date: date,
        description,
        settled_at: date,
      })
    }
    await createTransaction(env.DB, {
      account_id: ruido.id,
      amount_cents: -9999,
      purchase_date: '2026-07-10',
      description: 'ruido',
      settled_at: '2026-07-10',
    })

    const rows = await listTransactions(env.DB, {
      account_id: acc.id,
      from: '2026-07-01',
      to: '2026-07-31',
    })
    expect(rows.map((r) => r.description)).toEqual(['julho B', 'julho A'])
  })

  it('respeita o limit', async () => {
    const acc = await contaCorrente('Extrato limitado')
    for (const day of ['01', '02', '03']) {
      await createTransaction(env.DB, {
        account_id: acc.id,
        amount_cents: -100,
        purchase_date: `2026-07-${day}`,
        description: `dia ${day}`,
        settled_at: `2026-07-${day}`,
      })
    }
    const rows = await listTransactions(env.DB, {
      account_id: acc.id,
      limit: 2,
    })
    expect(rows).toHaveLength(2)
    expect(rows[0].description).toBe('dia 03')
  })
})
