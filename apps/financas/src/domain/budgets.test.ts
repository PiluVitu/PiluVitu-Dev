import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { newId } from '../lib/ids'
import { createAccount } from './accounts'
import {
  budgetReport,
  copyPreviousMonth,
  deleteBudget,
  setBudget,
} from './budgets'
import { archiveCategory, createCategory } from './categories'
import { byCategory } from './reports'

const db = env.DB

async function conta() {
  return createAccount(db, {
    name: 'Conta teste',
    scope: 'PF',
    kind: 'checking',
  })
}

async function gasto(opts: {
  account_id: string
  category_id: string | null
  amount_cents: number
  purchase_date: string
  transfer_id?: string | null
  parent_id?: string | null
}) {
  const id = newId()
  await db
    .prepare(
      `INSERT INTO transactions
        (id, account_id, amount_cents, currency, purchase_date, description,
         category_id, is_business, transfer_id, parent_id, created_at, updated_at)
       VALUES (?, ?, ?, 'BRL', ?, 'lançamento de teste', ?, 0, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      opts.account_id,
      opts.amount_cents,
      opts.purchase_date,
      opts.category_id,
      opts.transfer_id ?? null,
      opts.parent_id ?? null,
      '2026-08-01T00:00:00Z',
      '2026-08-01T00:00:00Z',
    )
    .run()
  return id
}

const despesa = (name: string) => createCategory(db, { name, kind: 'expense' })

describe('setBudget', () => {
  it('cria e depois atualiza o valor do mesmo mês e categoria, sem duplicar', async () => {
    const cat = await despesa('Mercado')
    const a = await setBudget(db, '2026-08', cat.id, 80000)
    const b = await setBudget(db, '2026-08', cat.id, 90000)
    expect(b.id).toBe(a.id)
    expect(b.amount_cents).toBe(90000)
    const { results } = await db.prepare('SELECT id FROM budgets').all()
    expect(results).toHaveLength(1)
  })

  it.each([0, -100, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '500'])(
    'recusa valor inválido %j',
    async (valor) => {
      const cat = await despesa('Mercado')
      await expect(
        setBudget(db, '2026-08', cat.id, valor as number),
      ).rejects.toThrow(RangeError)
    },
  )

  it('recusa valor acima do teto de sanidade', async () => {
    const cat = await despesa('Mercado')
    await expect(
      setBudget(db, '2026-08', cat.id, 100_000_000_000),
    ).rejects.toThrow(RangeError)
  })

  it.each(['2026-13', '2026-8', 'agosto', ''])(
    'recusa o mês %j',
    async (mes) => {
      const cat = await despesa('Mercado')
      await expect(setBudget(db, mes, cat.id, 1000)).rejects.toThrow(RangeError)
    },
  )

  it('recusa categoria inexistente, de receita ou arquivada', async () => {
    const receita = await createCategory(db, {
      name: 'Salário',
      kind: 'income',
    })
    const arquivada = await despesa('Antiga')
    await archiveCategory(db, arquivada.id)
    await expect(setBudget(db, '2026-08', 'nao-existe', 1000)).rejects.toThrow(
      /categoria/i,
    )
    await expect(setBudget(db, '2026-08', receita.id, 1000)).rejects.toThrow(
      /despesa/i,
    )
    await expect(setBudget(db, '2026-08', arquivada.id, 1000)).rejects.toThrow(
      /arquivada/i,
    )
  })
})

describe('deleteBudget', () => {
  it('devolve true ao remover e false quando não havia nada', async () => {
    const cat = await despesa('Mercado')
    await setBudget(db, '2026-08', cat.id, 1000)
    expect(await deleteBudget(db, '2026-08', cat.id)).toBe(true)
    expect(await deleteBudget(db, '2026-08', cat.id)).toBe(false)
  })
})

describe('budgetReport', () => {
  it('mostra o gasto do mês como o relatório por categoria, com o sinal invertido', async () => {
    const c = await conta()
    const mercado = await despesa('Mercado')
    const lazer = await despesa('Lazer')
    await gasto({
      account_id: c.id,
      category_id: mercado.id,
      amount_cents: -12000,
      purchase_date: '2026-08-03',
    })
    await gasto({
      account_id: c.id,
      category_id: mercado.id,
      amount_cents: -8000,
      purchase_date: '2026-08-20',
    })
    await gasto({
      account_id: c.id,
      category_id: lazer.id,
      amount_cents: -5000,
      purchase_date: '2026-08-10',
    })
    await setBudget(db, '2026-08', mercado.id, 25000)

    const report = await budgetReport(db, '2026-08')
    const porCategoria = await byCategory(db, { competence: '2026-08' })

    for (const linha of porCategoria.rows) {
      const row = report.rows.find((r) => r.category_id === linha.category_id)
      expect(row?.spent_cents).toBe(-linha.total_cents)
    }
    const m = report.rows.find((r) => r.category_id === mercado.id)
    expect(m).toMatchObject({ budget_cents: 25000, spent_cents: 20000 })
    const l = report.rows.find((r) => r.category_id === lazer.id)
    expect(l).toMatchObject({ budget_cents: null, spent_cents: 5000 })
  })

  it('não conta transferência, filha de rateio, outro mês nem estorno', async () => {
    const c = await conta()
    const mercado = await despesa('Mercado')
    await setBudget(db, '2026-08', mercado.id, 10000)
    const pai = await gasto({
      account_id: c.id,
      category_id: mercado.id,
      amount_cents: -3000,
      purchase_date: '2026-08-05',
    })
    await gasto({
      account_id: c.id,
      category_id: mercado.id,
      amount_cents: -3000,
      purchase_date: '2026-08-05',
      parent_id: pai,
    })
    await gasto({
      account_id: c.id,
      category_id: mercado.id,
      amount_cents: -9000,
      purchase_date: '2026-08-06',
      transfer_id: 't1',
    })
    await gasto({
      account_id: c.id,
      category_id: mercado.id,
      amount_cents: -7000,
      purchase_date: '2026-07-31',
    })
    await gasto({
      account_id: c.id,
      category_id: mercado.id,
      amount_cents: -4000,
      purchase_date: '2026-09-01',
    })
    await gasto({
      account_id: c.id,
      category_id: mercado.id,
      amount_cents: 2000,
      purchase_date: '2026-08-07',
    })

    const report = await budgetReport(db, '2026-08')
    expect(
      report.rows.find((r) => r.category_id === mercado.id)?.spent_cents,
    ).toBe(3000)
  })

  it('lista categoria de despesa ativa sem gasto, e esconde receita e arquivada sem movimento', async () => {
    await despesa('Mercado')
    await createCategory(db, { name: 'Salário', kind: 'income' })
    const velha = await despesa('Antiga')
    await archiveCategory(db, velha.id)

    const nomes = (await budgetReport(db, '2026-08')).rows.map(
      (r) => r.category_name,
    )
    expect(nomes).toContain('Mercado')
    expect(nomes).not.toContain('Salário')
    expect(nomes).not.toContain('Antiga')
  })

  it('mantém categoria arquivada que tem orçamento ou gasto no mês', async () => {
    const c = await conta()
    const velha = await despesa('Antiga')
    await gasto({
      account_id: c.id,
      category_id: velha.id,
      amount_cents: -1500,
      purchase_date: '2026-08-02',
    })
    await archiveCategory(db, velha.id)
    const row = (await budgetReport(db, '2026-08')).rows.find(
      (r) => r.category_id === velha.id,
    )
    expect(row?.spent_cents).toBe(1500)
  })

  it('separa o gasto sem categoria e soma os totais só do que tem orçamento', async () => {
    const c = await conta()
    const mercado = await despesa('Mercado')
    const lazer = await despesa('Lazer')
    await setBudget(db, '2026-08', mercado.id, 20000)
    await gasto({
      account_id: c.id,
      category_id: mercado.id,
      amount_cents: -5000,
      purchase_date: '2026-08-02',
    })
    await gasto({
      account_id: c.id,
      category_id: lazer.id,
      amount_cents: -9000,
      purchase_date: '2026-08-02',
    })
    await gasto({
      account_id: c.id,
      category_id: null,
      amount_cents: -700,
      purchase_date: '2026-08-02',
    })

    const report = await budgetReport(db, '2026-08')
    expect(report.uncategorized_spent_cents).toBe(700)
    expect(report.total_budget_cents).toBe(20000)
    expect(report.budgeted_spent_cents).toBe(5000)
    expect(report.rows.some((r) => r.category_id === null)).toBe(false)
  })

  it('identifica a categoria mãe para a tela mostrar "Mãe › Filha"', async () => {
    const mae = await despesa('Casa')
    const filha = await createCategory(db, {
      name: 'Luz',
      kind: 'expense',
      parent_id: mae.id,
    })
    const row = (await budgetReport(db, '2026-08')).rows.find(
      (r) => r.category_id === filha.id,
    )
    expect(row?.parent_name).toBe('Casa')
  })

  it('recusa mês malformado', async () => {
    await expect(budgetReport(db, '2026-13')).rejects.toThrow(RangeError)
  })
})

describe('copyPreviousMonth', () => {
  it('copia os orçamentos do mês anterior', async () => {
    const a = await despesa('Mercado')
    const b = await despesa('Lazer')
    await setBudget(db, '2026-07', a.id, 30000)
    await setBudget(db, '2026-07', b.id, 10000)
    expect(await copyPreviousMonth(db, '2026-08')).toEqual({
      copied: 2,
      skipped: 0,
    })
    const r = await budgetReport(db, '2026-08')
    expect(r.rows.find((x) => x.category_id === a.id)?.budget_cents).toBe(30000)
  })

  it('não sobrescreve o que já existe no mês de destino', async () => {
    const a = await despesa('Mercado')
    const b = await despesa('Lazer')
    await setBudget(db, '2026-07', a.id, 30000)
    await setBudget(db, '2026-07', b.id, 10000)
    await setBudget(db, '2026-08', a.id, 99000)
    expect(await copyPreviousMonth(db, '2026-08')).toEqual({
      copied: 1,
      skipped: 1,
    })
    const r = await budgetReport(db, '2026-08')
    expect(r.rows.find((x) => x.category_id === a.id)?.budget_cents).toBe(99000)
  })

  it('pula categoria arquivada e conta como ignorada', async () => {
    const a = await despesa('Mercado')
    const velha = await despesa('Antiga')
    await setBudget(db, '2026-07', a.id, 30000)
    await setBudget(db, '2026-07', velha.id, 5000)
    await archiveCategory(db, velha.id)
    expect(await copyPreviousMonth(db, '2026-08')).toEqual({
      copied: 1,
      skipped: 1,
    })
  })

  it('mês anterior vazio devolve zero, sem erro', async () => {
    expect(await copyPreviousMonth(db, '2026-08')).toEqual({
      copied: 0,
      skipped: 0,
    })
  })

  it('em janeiro copia de dezembro do ano anterior', async () => {
    const a = await despesa('Mercado')
    await setBudget(db, '2025-12', a.id, 30000)
    expect(await copyPreviousMonth(db, '2026-01')).toEqual({
      copied: 1,
      skipped: 0,
    })
  })

  it('recusa mês malformado', async () => {
    await expect(copyPreviousMonth(db, 'ago')).rejects.toThrow(RangeError)
  })
})
