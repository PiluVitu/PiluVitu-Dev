import { applyD1Migrations, env } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import { nowIsoUtc } from '../lib/dates'
import { newId } from '../lib/ids'
import { setSetting } from './settings'
import { emergencyStatus, monthlyFixedCost } from './reserve'

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
})

const DB = env.DB

// --------------------------------------------------------------------------
// Helpers de fixture — mesmo padrão de domain/recurring.test.ts. Ids
// próprios por teste: o reset() do beforeEach global (src/test-setup.ts)
// já limpa tudo entre testes, mas ids distintos deixam a falha legível se
// algo vazar mesmo assim.
// --------------------------------------------------------------------------

async function novaConta(
  openingBalanceCents = 0,
  archived = false,
): Promise<string> {
  const id = newId()
  const now = nowIsoUtc()
  await DB.prepare(
    `INSERT INTO accounts
       (id, name, scope, kind, currency, opening_balance_cents, archived_at, created_at, updated_at)
     VALUES (?, 'Conta de teste', 'PJ', 'checking', 'BRL', ?, ?, ?, ?)`,
  )
    .bind(id, openingBalanceCents, archived ? now : null, now, now)
    .run()
  return id
}

async function novaRecorrente(opts: {
  minCents: number
  maxCents: number
  active?: 0 | 1
  startsOn?: string
  endsOn?: string | null
}): Promise<string> {
  const id = newId()
  const now = nowIsoUtc()
  await DB.prepare(
    `INSERT INTO recurring_expenses
       (id, description, scope, day_of_month, amount_min_cents, amount_max_cents,
        starts_on, ends_on, active, created_at, updated_at)
     VALUES (?, 'Recorrente de teste', 'PJ', 10, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      opts.minCents,
      opts.maxCents,
      opts.startsOn ?? '2020-01-01',
      opts.endsOn ?? null,
      opts.active ?? 1,
      now,
      now,
    )
    .run()
  return id
}

async function designarContas(ids: string[]): Promise<void> {
  await setSetting(DB, 'emergency_accounts', JSON.stringify(ids))
}

// Starlink 189 fixo + DAS 12–600: a faixa ABERTA que o brief exige (⚠️ "um
// teste que use faixa degenerada (min = max) passaria com a inversão
// errada — use faixa aberta").
async function seedStarlinkEDas(): Promise<void> {
  await novaRecorrente({ minCents: 18900, maxCents: 18900 }) // Starlink, fixo
  await novaRecorrente({ minCents: 1200, maxCents: 60000 }) // DAS, R$12–600
}

describe('monthlyFixedCost', () => {
  it('1. soma as recorrentes ativas — Starlink 189 fixo + DAS 12–600 ⇒ {min: 20100, max: 78900}', async () => {
    await seedStarlinkEDas()
    const custo = await monthlyFixedCost(DB)
    expect(custo).toEqual({ min: 20100, max: 78900 })
  })

  it('2. recorrente inativa ou encerrada não entra', async () => {
    await seedStarlinkEDas() // {min: 20100, max: 78900} — a base "boa"
    await novaRecorrente({ minCents: 5000, maxCents: 5000, active: 0 }) // inativa
    await novaRecorrente({
      minCents: 7000,
      maxCents: 7000,
      startsOn: '2020-01-01',
      endsOn: '2020-12-31', // encerrada, bem no passado
    })

    const custo = await monthlyFixedCost(DB)
    expect(custo).toEqual({ min: 20100, max: 78900 })
  })

  it('sem nenhuma recorrente registrada, devolve {min: 0, max: 0}', async () => {
    expect(await monthlyFixedCost(DB)).toEqual({ min: 0, max: 0 })
  })
})

describe('emergencyStatus', () => {
  it('3. saldo é a soma das contas designadas, e só delas', async () => {
    const a = await novaConta(100000) // designada
    const b = await novaConta(50000) // designada
    await novaConta(999999) // NÃO designada — não pode entrar na soma
    await designarContas([a, b])
    await seedStarlinkEDas()

    const status = await emergencyStatus(DB, { goal_months: 3 })
    expect(status.saldo_cents).toBe(150000)
  })

  it('4. meses = saldo ÷ custo, e a faixa INVERTE (custo max ⇒ meses min)', async () => {
    await seedStarlinkEDas() // {min: 20100, max: 78900} — faixa ABERTA, não degenerada
    const a = await novaConta(100000) // R$ 1.000,00
    await designarContas([a])

    const status = await emergencyStatus(DB, { goal_months: 3 })

    // Divisão pelo custo MÁXIMO (78900) dá a sobrevivência MÍNIMA.
    expect(status.meses).not.toBeNull()
    expect(status.meses!.min).toBeCloseTo(100000 / 78900, 10)
    // Divisão pelo custo MÍNIMO (20100) dá a sobrevivência MÁXIMA.
    expect(status.meses!.max).toBeCloseTo(100000 / 20100, 10)
    // A faixa é de verdade aberta — min < max, prova de que não é o
    // resultado degenerado de min===max invertido "por acaso".
    expect(status.meses!.min).toBeLessThan(status.meses!.max)

    // meta_cents = custo * goal_months, sem arredondar.
    expect(status.meta_cents).toEqual({ min: 20100 * 3, max: 78900 * 3 })
  })

  it('5. sem custo fixo cadastrado ⇒ meses: null (nunca Infinity, nunca 0)', async () => {
    const a = await novaConta(500000)
    await designarContas([a])
    // nenhuma recorrente cadastrada nesta run

    const status = await emergencyStatus(DB, { goal_months: 3 })
    expect(status.meses).toBeNull()
    expect(status.meses).not.toBe(Infinity)
  })

  it('6. sem conta designada ⇒ saldo_cents: 0 e contas: []', async () => {
    await novaConta(300000) // existe, mas não foi designada
    await seedStarlinkEDas()

    const status = await emergencyStatus(DB, { goal_months: 3 })
    expect(status.saldo_cents).toBe(0)
    expect(status.contas).toEqual([])
  })

  it('7. conta arquivada designada não conta pro saldo', async () => {
    const ativa = await novaConta(200000)
    const arquivada = await novaConta(9999999, true)
    await designarContas([ativa, arquivada])
    await seedStarlinkEDas()

    const status = await emergencyStatus(DB, { goal_months: 3 })
    expect(status.saldo_cents).toBe(200000)
  })

  it('sem nenhuma configuração feita, devolve o mesmo shape vazio de "sem conta designada"', async () => {
    const status = await emergencyStatus(DB, { goal_months: 3 })
    expect(status.saldo_cents).toBe(0)
    expect(status.contas).toEqual([])
    expect(status.meses).toBeNull()
  })
})
