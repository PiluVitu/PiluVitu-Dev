import { applyD1Migrations, env } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  accountBalances,
  archiveAccount,
  createAccount,
  listAccounts,
} from './accounts'
import { newId } from '../lib/ids'
import { nowIsoUtc } from '../lib/dates'

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
})

// Lançamento cru: a Task 7 é que cria createTransaction. Aqui só interessa
// que accountBalances some o que existe na tabela.
async function seedTx(account_id: string, amount_cents: number) {
  const now = nowIsoUtc()
  await env.DB.prepare(
    `INSERT INTO transactions
       (id, account_id, amount_cents, currency, purchase_date, description,
        is_business, created_at, updated_at)
     VALUES (?, ?, ?, 'BRL', '2026-07-10', 'seed', 0, ?, ?)`,
  )
    .bind(newId(), account_id, amount_cents, now, now)
    .run()
}

describe('accounts', () => {
  it('cria conta PF com moeda default e sem arquivamento', async () => {
    const acc = await createAccount(env.DB, {
      name: 'Nubank',
      scope: 'PF',
      kind: 'checking',
      institution: 'Nubank',
      opening_balance_cents: 234012,
      opening_date: '2026-07-01',
    })
    expect(acc.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(acc.currency).toBe('BRL')
    expect(acc.archived_at).toBeNull()
    expect(acc.opening_balance_cents).toBe(234012)
    expect(acc.created_at).toBe(acc.updated_at)
  })

  it('cria conta PJ de cartao com fechamento e vencimento', async () => {
    const acc = await createAccount(env.DB, {
      name: 'Inter PJ cartao',
      scope: 'PJ',
      kind: 'credit_card',
      institution: 'Inter',
      closing_day: 25,
      due_day: 5,
      credit_limit_cents: 900000,
    })
    expect(acc.scope).toBe('PJ')
    expect(acc.closing_day).toBe(25)
    expect(acc.due_day).toBe(5)
    expect(acc.credit_limit_cents).toBe(900000)
  })

  it('recusa cartao de credito sem closing_day/due_day antes de tocar o banco', async () => {
    await expect(
      createAccount(env.DB, {
        name: 'Cartao torto',
        scope: 'PF',
        kind: 'credit_card',
      }),
    ).rejects.toThrow('cartao de credito exige closing_day e due_day')

    const { results } = await env.DB.prepare(
      "SELECT id FROM accounts WHERE name = 'Cartao torto'",
    ).all()
    expect(results).toHaveLength(0)
  })

  it('lista filtrando por scope', async () => {
    await createAccount(env.DB, {
      name: 'Inter PF',
      scope: 'PF',
      kind: 'checking',
    })
    await createAccount(env.DB, {
      name: 'Inter PJ',
      scope: 'PJ',
      kind: 'checking',
    })

    const pj = await listAccounts(env.DB, { scope: 'PJ' })
    expect(pj.map((a) => a.name)).toEqual(['Inter PJ'])
  })

  it('conta arquivada some da listagem default e volta com includeArchived', async () => {
    const acc = await createAccount(env.DB, {
      name: 'Conta velha',
      scope: 'PF',
      kind: 'savings',
    })
    const arquivou = await archiveAccount(env.DB, acc.id)
    expect(arquivou).toBe(true)

    const ativas = await listAccounts(env.DB)
    expect(ativas.map((a) => a.id)).not.toContain(acc.id)

    const todas = await listAccounts(env.DB, { includeArchived: true })
    expect(todas.find((a) => a.id === acc.id)?.archived_at).not.toBeNull()
  })

  it('archiveAccount devolve false para id inexistente', async () => {
    const arquivou = await archiveAccount(env.DB, 'id-que-nao-existe')
    expect(arquivou).toBe(false)
  })

  it('archiveAccount devolve false ao tentar arquivar conta ja arquivada', async () => {
    const acc = await createAccount(env.DB, {
      name: 'Conta duas vezes arquivada',
      scope: 'PF',
      kind: 'savings',
    })
    expect(await archiveAccount(env.DB, acc.id)).toBe(true)
    expect(await archiveAccount(env.DB, acc.id)).toBe(false)
  })

  it('saldo = opening_balance + soma dos lancamentos', async () => {
    const acc = await createAccount(env.DB, {
      name: 'Conta com movimento',
      scope: 'PF',
      kind: 'checking',
      opening_balance_cents: 100000,
    })
    await seedTx(acc.id, -25000)
    await seedTx(acc.id, -1500)
    await seedTx(acc.id, 40000)

    const saldos = await accountBalances(env.DB)
    expect(saldos.find((s) => s.account_id === acc.id)?.balance_cents).toBe(
      113500,
    )
  })

  it('saldo de conta sem lancamento nenhum e o proprio opening_balance', async () => {
    const acc = await createAccount(env.DB, {
      name: 'Conta parada',
      scope: 'PF',
      kind: 'cash',
      opening_balance_cents: 5000,
    })
    const saldos = await accountBalances(env.DB)
    expect(saldos.find((s) => s.account_id === acc.id)?.balance_cents).toBe(
      5000,
    )
  })
})
