import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { newId } from '../lib/ids'
import { accountBalances, archiveAccount, createAccount } from './accounts'
import {
  createGoal,
  deleteGoal,
  goalProgress,
  listGoals,
  updateGoal,
} from './goals'
import { EMERGENCY_ACCOUNTS_KEY } from './reserve'
import { setSetting } from './settings'

const db = env.DB
const HOJE = '2026-08-15'

describe('goalProgress', () => {
  const base = { target_cents: 100000, today: HOJE }

  it('concluída quando o saldo é exatamente o alvo ou passa dele', () => {
    for (const balance_cents of [100000, 130000]) {
      const p = goalProgress({ ...base, balance_cents, target_date: null })
      expect(p.status).toBe('concluida')
      expect(p.missing_cents).toBe(0)
      expect(p.monthly_needed_cents).toBeNull()
    }
  })

  it('em andamento sem prazo: falta o resto, sem aporte mensal', () => {
    const p = goalProgress({ ...base, balance_cents: 25000, target_date: null })
    expect(p).toMatchObject({
      status: 'em_andamento',
      pct: 25,
      missing_cents: 75000,
      months_left: null,
      monthly_needed_cents: null,
    })
  })

  it('perto do alvo não mostra 100% enquanto falta dinheiro', () => {
    const p = goalProgress({ ...base, balance_cents: 99600, target_date: null })
    expect(p).toMatchObject({
      status: 'em_andamento',
      pct: 99,
      missing_cents: 400,
    })
    const terco = goalProgress({
      target_cents: 3,
      balance_cents: 1,
      target_date: null,
      today: HOJE,
    })
    expect(terco.pct).toBe(33)
  })

  it('saldo negativo zera o progresso sem inflar o que falta', () => {
    const p = goalProgress({ ...base, balance_cents: -5000, target_date: null })
    expect(p.pct).toBe(0)
    expect(p.missing_cents).toBe(100000)
  })

  it('prazo no mês corrente conta como 1 mês', () => {
    const p = goalProgress({
      ...base,
      balance_cents: 40000,
      target_date: '2026-08-31',
    })
    expect(p).toMatchObject({
      status: 'em_andamento',
      months_left: 1,
      monthly_needed_cents: 60000,
    })
  })

  it('prazo hoje ainda não está atrasado', () => {
    const p = goalProgress({ ...base, balance_cents: 0, target_date: HOJE })
    expect(p.status).toBe('em_andamento')
  })

  it('prazo vencido e meta não atingida é atrasada, sem aporte', () => {
    const p = goalProgress({
      ...base,
      balance_cents: 10000,
      target_date: '2026-08-14',
    })
    expect(p).toMatchObject({
      status: 'atrasada',
      months_left: null,
      monthly_needed_cents: null,
    })
  })

  it('prazo vencido mas meta atingida é concluída', () => {
    const p = goalProgress({
      ...base,
      balance_cents: 100000,
      target_date: '2026-01-01',
    })
    expect(p.status).toBe('concluida')
  })

  it('arredonda o aporte mensal para cima, em inteiro', () => {
    const p = goalProgress({
      target_cents: 1000,
      balance_cents: 0,
      target_date: '2026-10-20',
      today: HOJE,
    })
    expect(p.months_left).toBe(3)
    expect(p.monthly_needed_cents).toBe(334)
  })

  it('conta o mês atual e o do prazo, inclusive na virada de dezembro para janeiro', () => {
    const jan = goalProgress({
      ...base,
      balance_cents: 0,
      target_date: '2027-01-31',
      today: '2026-12-15',
    })
    expect(jan.months_left).toBe(2)
    const mar = goalProgress({
      ...base,
      balance_cents: 0,
      target_date: '2027-03-10',
      today: '2026-12-15',
    })
    expect(mar.months_left).toBe(4)
  })
})

async function conta(
  kind:
    | 'checking'
    | 'savings'
    | 'cash'
    | 'investment'
    | 'credit_card'
    | 'benefit' = 'savings',
  opening = 0,
  nome = 'Conta teste',
) {
  return createAccount(db, {
    name: nome,
    scope: 'PF',
    kind,
    opening_balance_cents: opening,
    ...(kind === 'credit_card' ? { closing_day: 10, due_day: 20 } : {}),
  })
}

async function lancamento(
  account_id: string,
  amount_cents: number,
  parent_id: string | null = null,
) {
  const id = newId()
  await db
    .prepare(
      `INSERT INTO transactions
        (id, account_id, amount_cents, currency, purchase_date, description,
         is_business, parent_id, created_at, updated_at)
       VALUES (?, ?, ?, 'BRL', '2026-08-01', 'aporte de teste', 0, ?, ?, ?)`,
    )
    .bind(
      id,
      account_id,
      amount_cents,
      parent_id,
      '2026-08-01T00:00:00Z',
      '2026-08-01T00:00:00Z',
    )
    .run()
  return id
}

const nova = (account_id: string, patch = {}) => ({
  name: 'Viagem',
  target_cents: 500000,
  account_id,
  target_date: null,
  ...patch,
})

describe('createGoal e listGoals', () => {
  it('o progresso é o saldo da conta, o mesmo de accountBalances', async () => {
    const c = await conta('savings', 30000)
    await lancamento(c.id, 20000)
    const pai = await lancamento(c.id, 5000)
    await lancamento(c.id, 99999, pai)
    await createGoal(db, nova(c.id))

    const [meta] = await listGoals(db, HOJE)
    const saldo = (await accountBalances(db)).find((b) => b.account_id === c.id)
    expect(meta.balance_cents).toBe(saldo?.balance_cents)
    expect(meta.balance_cents).toBe(55000)
    expect(meta.pct).toBe(11)
    expect(meta.account_name).toBe('Conta teste')
  })

  it('aceita conta corrente, dinheiro e investimento', async () => {
    for (const kind of ['checking', 'cash', 'investment'] as const) {
      const c = await conta(kind, 0, `Conta ${kind}`)
      await expect(createGoal(db, nova(c.id))).resolves.toMatchObject({
        account_id: c.id,
      })
    }
  })

  it.each(['credit_card', 'benefit'] as const)(
    'recusa conta do tipo %s',
    async (kind) => {
      const c = await conta(kind)
      await expect(createGoal(db, nova(c.id))).rejects.toThrow(RangeError)
    },
  )

  it('recusa conta inexistente, arquivada ou que já tem meta', async () => {
    const arquivada = await conta('savings', 0, 'Velha')
    await archiveAccount(db, arquivada.id)
    await expect(createGoal(db, nova('nao-existe'))).rejects.toThrow(/conta/i)
    await expect(createGoal(db, nova(arquivada.id))).rejects.toThrow(
      /arquivada/i,
    )
    const c = await conta()
    await createGoal(db, nova(c.id))
    await expect(createGoal(db, nova(c.id, { name: 'Outra' }))).rejects.toThrow(
      /já tem uma meta/i,
    )
  })

  it.each([
    [{ name: '' }],
    [{ name: '   ' }],
    [{ name: 'x'.repeat(81) }],
    [{ target_cents: 0 }],
    [{ target_cents: 1.5 }],
    [{ target_cents: '100' }],
    [{ target_cents: 100_000_000_000 }],
    [{ target_date: '2026-02-30' }],
    [{ target_date: '30/06/2027' }],
  ])('recusa entrada inválida %j', async (patch) => {
    const c = await conta()
    await expect(createGoal(db, nova(c.id, patch) as never)).rejects.toThrow(
      RangeError,
    )
  })

  it.each([
    ['omitido', undefined],
    ['nulo', null],
    ['objeto', { id: 'x' }],
    ['número', 42],
    ['vazio', ''],
    ['só espaços', '   '],
  ])('conta %s é RangeError, não erro de binding', async (_titulo, valor) => {
    const entrada = { name: 'Viagem', target_cents: 500000, account_id: valor }
    await expect(createGoal(db, entrada as never)).rejects.toThrow(RangeError)
    const c = await conta()
    const meta = await createGoal(db, nova(c.id))
    await expect(updateGoal(db, meta.id, entrada as never)).rejects.toThrow(
      RangeError,
    )
  })

  it('apara o nome', async () => {
    const c = await conta()
    expect(
      (await createGoal(db, nova(c.id, { name: '  Viagem  ' }))).name,
    ).toBe('Viagem')
  })

  it('avisa quando a conta também está na reserva de emergência', async () => {
    const c = await conta()
    const outra = await conta('savings', 0, 'Outra')
    await createGoal(db, nova(c.id))
    await createGoal(db, nova(outra.id, { name: 'Outra meta' }))
    await setSetting(db, EMERGENCY_ACCOUNTS_KEY, JSON.stringify([c.id]))
    const metas = await listGoals(db, HOJE)
    expect(metas.find((m) => m.account_id === c.id)?.reserve_overlap).toBe(true)
    expect(metas.find((m) => m.account_id === outra.id)?.reserve_overlap).toBe(
      false,
    )
  })

  it('meta cuja conta foi arquivada continua na lista, sem poder editar', async () => {
    const c = await conta()
    await createGoal(db, nova(c.id))
    await archiveAccount(db, c.id)
    const [meta] = await listGoals(db, HOJE)
    expect(meta.editable).toBe(false)
  })
})

describe('updateGoal e deleteGoal', () => {
  it('atualiza nome, alvo, prazo e conta', async () => {
    const a = await conta('savings', 0, 'A')
    const b = await conta('savings', 0, 'B')
    const g = await createGoal(db, nova(a.id))
    const novo = await updateGoal(
      db,
      g.id,
      nova(b.id, {
        name: 'Carro',
        target_cents: 900000,
        target_date: '2027-06-30',
      }),
    )
    expect(novo).toMatchObject({
      id: g.id,
      name: 'Carro',
      target_cents: 900000,
      target_date: '2027-06-30',
      account_id: b.id,
    })
  })

  it('mantém a própria conta e recusa a conta de outra meta', async () => {
    const a = await conta('savings', 0, 'A')
    const b = await conta('savings', 0, 'B')
    const ga = await createGoal(db, nova(a.id))
    await createGoal(db, nova(b.id, { name: 'Outra' }))
    await expect(
      updateGoal(db, ga.id, nova(a.id, { name: 'Renomeada' })),
    ).resolves.toMatchObject({ name: 'Renomeada' })
    await expect(updateGoal(db, ga.id, nova(b.id))).rejects.toThrow(
      /já tem uma meta/i,
    )
  })

  it('devolve null quando a meta não existe', async () => {
    const a = await conta()
    expect(await updateGoal(db, 'nao-existe', nova(a.id))).toBeNull()
  })

  it('apaga e depois devolve false', async () => {
    const a = await conta()
    const g = await createGoal(db, nova(a.id))
    expect(await deleteGoal(db, g.id)).toBe(true)
    expect(await deleteGoal(db, g.id)).toBe(false)
  })
})
