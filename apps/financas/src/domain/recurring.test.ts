import { applyD1Migrations, env } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import { nowIsoUtc } from '../lib/dates'
import { newId } from '../lib/ids'
import {
  createRecurring,
  deleteRecurring,
  listRecurring,
  projectRecurring,
  updateRecurring,
} from './recurring'

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
})

const DB = env.DB

// --------------------------------------------------------------------------
// Helpers de fixture. Ids proprios por teste: o reset() do beforeEach global
// (src/test-setup.ts) ja limpa tudo entre testes, mas ids distintos deixam
// a falha legivel se algo vazar mesmo assim.
// --------------------------------------------------------------------------

async function novaConta(): Promise<string> {
  const id = newId()
  const now = nowIsoUtc()
  await DB.prepare(
    `INSERT INTO accounts
       (id, name, scope, kind, currency, opening_balance_cents, created_at, updated_at)
     VALUES (?, 'Conta de teste', 'PJ', 'checking', 'BRL', 0, ?, ?)`,
  )
    .bind(id, now, now)
    .run()
  return id
}

// O VINCULO em si (a tela "Lancar" oferecendo "este e o Starlink de
// agosto") e trabalho de fatia futura (routes/UI, Tasks 4-7) — aqui so
// interessa que projectRecurring RESPEITA um vinculo ja existente na
// tabela, entao o fixture escreve direto na tabela `transactions`, igual
// ao padrao ja usado em schema.test.ts para o mesmo cenario.
async function seedTxVinculada(
  accountId: string,
  recurringId: string,
  purchaseDate: string,
  amountCents = -18900,
): Promise<void> {
  const now = nowIsoUtc()
  await DB.prepare(
    `INSERT INTO transactions
       (id, account_id, amount_cents, currency, purchase_date, description,
        is_business, recurring_expense_id, created_at, updated_at)
     VALUES (?, ?, ?, 'BRL', ?, 'lancamento vinculado', 1, ?, ?, ?)`,
  )
    .bind(newId(), accountId, amountCents, purchaseDate, recurringId, now, now)
    .run()
}

describe('createRecurring / listRecurring / updateRecurring / deleteRecurring', () => {
  it('cria uma recorrente fixa (Starlink, min = max) com defaults', async () => {
    const r = await createRecurring(DB, {
      description: 'Starlink',
      scope: 'PJ',
      day_of_month: 10,
      amount_min_cents: 18900,
      amount_max_cents: 18900,
      starts_on: '2026-01-01',
    })
    expect(r.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(r.active).toBe(1)
    expect(r.ends_on).toBeNull()
    expect(r.category_id).toBeNull()
    expect(r.account_id).toBeNull()
    expect(r.created_at).toBe(r.updated_at)
  })

  it('recusa amount_max_cents < amount_min_cents antes de tocar o banco', async () => {
    await expect(
      createRecurring(DB, {
        description: 'Faixa invertida',
        scope: 'PJ',
        day_of_month: 10,
        amount_min_cents: 60000,
        amount_max_cents: 1200,
        starts_on: '2026-01-01',
      }),
    ).rejects.toThrow(RangeError)

    const { results } = await DB.prepare(
      `SELECT id FROM recurring_expenses WHERE description = 'Faixa invertida'`,
    ).all()
    expect(results).toHaveLength(0)
  })

  it('recusa day_of_month fora de 1..31 antes de tocar o banco', async () => {
    await expect(
      createRecurring(DB, {
        description: 'Dia invalido',
        scope: 'PJ',
        day_of_month: 32,
        amount_min_cents: 1000,
        amount_max_cents: 1000,
        starts_on: '2026-01-01',
      }),
    ).rejects.toThrow(RangeError)
  })

  it('lista so ativas por default, inclui inativas com includeInactive', async () => {
    await createRecurring(DB, {
      description: 'DAS',
      scope: 'PJ',
      day_of_month: 20,
      amount_min_cents: 1200,
      amount_max_cents: 60000,
      starts_on: '2026-01-01',
    })
    const inativa = await createRecurring(DB, {
      description: 'Cancelada',
      scope: 'PJ',
      day_of_month: 5,
      amount_min_cents: 1000,
      amount_max_cents: 1000,
      starts_on: '2026-01-01',
      active: 0,
    })

    const ativas = await listRecurring(DB)
    expect(ativas.map((r) => r.description)).not.toContain('Cancelada')

    const todas = await listRecurring(DB, { includeInactive: true })
    expect(todas.find((r) => r.id === inativa.id)).toBeTruthy()
  })

  it('lista filtrando por scope', async () => {
    await createRecurring(DB, {
      description: 'PJ',
      scope: 'PJ',
      day_of_month: 5,
      amount_min_cents: 1000,
      amount_max_cents: 1000,
      starts_on: '2026-01-01',
    })
    await createRecurring(DB, {
      description: 'PF',
      scope: 'PF',
      day_of_month: 5,
      amount_min_cents: 1000,
      amount_max_cents: 1000,
      starts_on: '2026-01-01',
    })

    const pj = await listRecurring(DB, { scope: 'PJ' })
    expect(pj.map((r) => r.description)).toEqual(['PJ'])
  })

  it('updateRecurring altera campos pedidos e preserva o resto', async () => {
    const r = await createRecurring(DB, {
      description: 'Contador',
      scope: 'PJ',
      day_of_month: 5,
      amount_min_cents: 27500,
      amount_max_cents: 27500,
      starts_on: '2026-01-01',
    })
    const atualizado = await updateRecurring(DB, r.id, {
      amount_min_cents: 30000,
      amount_max_cents: 30000,
    })
    expect(atualizado?.amount_min_cents).toBe(30000)
    expect(atualizado?.amount_max_cents).toBe(30000)
    expect(atualizado?.description).toBe('Contador')
    expect(atualizado?.day_of_month).toBe(5)
  })

  it('updateRecurring devolve null para id inexistente', async () => {
    expect(
      await updateRecurring(DB, 'id-que-nao-existe', { active: 0 }),
    ).toBeNull()
  })

  it('deleteRecurring devolve true e some da listagem', async () => {
    const r = await createRecurring(DB, {
      description: 'Descartavel',
      scope: 'PJ',
      day_of_month: 5,
      amount_min_cents: 1000,
      amount_max_cents: 1000,
      starts_on: '2026-01-01',
    })
    expect(await deleteRecurring(DB, r.id)).toBe(true)
    expect(await listRecurring(DB, { includeInactive: true })).toHaveLength(0)
  })

  it('deleteRecurring devolve false para id inexistente', async () => {
    expect(await deleteRecurring(DB, 'id-que-nao-existe')).toBe(false)
  })

  // Teste 9 do brief, na camada de CRUD: apagar a DEFINICAO nunca apaga um
  // `transaction` real — a FK e ON DELETE SET NULL (migration 0006), nunca
  // CASCADE. Provado CONTANDO `transactions` antes/depois do DELETE, nao so
  // pela ausencia de erro.
  it('apagar recorrente NAO apaga lancamento vinculado — prova contando transactions antes/depois', async () => {
    const accountId = await novaConta()
    const r = await createRecurring(DB, {
      description: 'Starlink',
      scope: 'PJ',
      day_of_month: 10,
      amount_min_cents: 18900,
      amount_max_cents: 18900,
      starts_on: '2026-01-01',
    })
    await seedTxVinculada(accountId, r.id, '2026-08-10')

    const antes = await DB.prepare(
      'SELECT count(*) AS n FROM transactions',
    ).first<{ n: number }>()
    expect(antes?.n).toBe(1)

    expect(await deleteRecurring(DB, r.id)).toBe(true)

    const depois = await DB.prepare(
      'SELECT count(*) AS n FROM transactions',
    ).first<{ n: number }>()
    expect(depois?.n).toBe(1)

    const linked = await DB.prepare(
      'SELECT recurring_expense_id FROM transactions',
    ).first<{ recurring_expense_id: string | null }>()
    expect(linked?.recurring_expense_id).toBeNull()
  })
})

describe('projectRecurring', () => {
  it('1. Starlink fixo (min = max = 189) projeta 189..189 em toda competencia da janela', async () => {
    await createRecurring(DB, {
      description: 'Starlink',
      scope: 'PJ',
      day_of_month: 10,
      amount_min_cents: 18900,
      amount_max_cents: 18900,
      starts_on: '2026-01-01',
    })

    const map = await projectRecurring(DB, { from: '2026-08', months: 3 })
    expect([...map.keys()]).toEqual(['2026-08', '2026-09', '2026-10'])
    for (const c of ['2026-08', '2026-09', '2026-10']) {
      expect(map.get(c)).toEqual({ min: 18900, max: 18900 })
    }
  })

  it('2. DAS (12..600) projeta a faixa inteira, nunca uma media', async () => {
    await createRecurring(DB, {
      description: 'DAS',
      scope: 'PJ',
      day_of_month: 20,
      amount_min_cents: 1200,
      amount_max_cents: 60000,
      starts_on: '2026-01-01',
    })

    const map = await projectRecurring(DB, { from: '2026-08', months: 1 })
    expect(map.get('2026-08')).toEqual({ min: 1200, max: 60000 })
  })

  it('3. ends_on no meio da janela para de projetar depois', async () => {
    await createRecurring(DB, {
      description: 'Contrato temporario',
      scope: 'PJ',
      day_of_month: 15,
      amount_min_cents: 50000,
      amount_max_cents: 50000,
      starts_on: '2026-01-01',
      ends_on: '2026-08-31',
    })

    const map = await projectRecurring(DB, { from: '2026-08', months: 3 })
    expect(map.get('2026-08')).toEqual({ min: 50000, max: 50000 })
    expect(map.has('2026-09')).toBe(false)
    expect(map.has('2026-10')).toBe(false)
  })

  it('4. active = 0 nao projeta', async () => {
    await createRecurring(DB, {
      description: 'Cancelada',
      scope: 'PJ',
      day_of_month: 10,
      amount_min_cents: 10000,
      amount_max_cents: 10000,
      starts_on: '2026-01-01',
      active: 0,
    })

    const map = await projectRecurring(DB, { from: '2026-08', months: 3 })
    expect(map.size).toBe(0)
  })

  it('5. starts_on no futuro so projeta a partir dali', async () => {
    await createRecurring(DB, {
      description: 'Novo contrato',
      scope: 'PJ',
      day_of_month: 10,
      amount_min_cents: 20000,
      amount_max_cents: 20000,
      starts_on: '2026-09-05',
    })

    const map = await projectRecurring(DB, { from: '2026-08', months: 3 })
    expect(map.has('2026-08')).toBe(false)
    expect(map.get('2026-09')).toEqual({ min: 20000, max: 20000 })
    expect(map.get('2026-10')).toEqual({ min: 20000, max: 20000 })
  })

  it('6. supressao: competencia com lancamento vinculado nao projeta — conta o total antes/depois de vincular', async () => {
    const accountId = await novaConta()
    const r = await createRecurring(DB, {
      description: 'Starlink',
      scope: 'PJ',
      day_of_month: 10,
      amount_min_cents: 18900,
      amount_max_cents: 18900,
      starts_on: '2026-01-01',
    })

    const antes = await projectRecurring(DB, { from: '2026-08', months: 1 })
    expect(antes.get('2026-08')).toEqual({ min: 18900, max: 18900 })

    await seedTxVinculada(accountId, r.id, '2026-08-10')

    const depois = await projectRecurring(DB, { from: '2026-08', months: 1 })
    expect(depois.has('2026-08')).toBe(false)
  })

  it('7. supressao e POR COMPETENCIA — vincular agosto nao suprime setembro', async () => {
    const accountId = await novaConta()
    const r = await createRecurring(DB, {
      description: 'Starlink',
      scope: 'PJ',
      day_of_month: 10,
      amount_min_cents: 18900,
      amount_max_cents: 18900,
      starts_on: '2026-01-01',
    })
    await seedTxVinculada(accountId, r.id, '2026-08-10')

    const map = await projectRecurring(DB, { from: '2026-08', months: 2 })
    expect(map.has('2026-08')).toBe(false)
    expect(map.get('2026-09')).toEqual({ min: 18900, max: 18900 })
  })

  // Isola ainda mais a garantia do teste 7: uma funcao que suprimisse TUDO
  // assim que QUALQUER vinculo existisse passaria no teste 6 (unica
  // recorrente, unica competencia) mas nao poderia distinguir "outra
  // recorrente, mesma competencia, sem vinculo proprio". Starlink some,
  // DAS continua inteiro na MESMA competencia.
  it('7b. vinculo de UMA recorrente nao suprime OUTRA recorrente na mesma competencia', async () => {
    const accountId = await novaConta()
    const comVinculo = await createRecurring(DB, {
      description: 'Starlink',
      scope: 'PJ',
      day_of_month: 10,
      amount_min_cents: 18900,
      amount_max_cents: 18900,
      starts_on: '2026-01-01',
    })
    await createRecurring(DB, {
      description: 'DAS',
      scope: 'PJ',
      day_of_month: 20,
      amount_min_cents: 1200,
      amount_max_cents: 60000,
      starts_on: '2026-01-01',
    })
    await seedTxVinculada(accountId, comVinculo.id, '2026-08-10')

    const map = await projectRecurring(DB, { from: '2026-08', months: 1 })
    expect(map.get('2026-08')).toEqual({ min: 1200, max: 60000 })
  })

  it('8. dia 31 cai no ultimo dia de fevereiro (aparado por competenceDueDate, sem reimplementar aritmetica)', async () => {
    await createRecurring(DB, {
      description: 'Vencimento dia 31',
      scope: 'PJ',
      day_of_month: 31,
      amount_min_cents: 5000,
      amount_max_cents: 5000,
      starts_on: '2026-01-01',
    })

    // 2027 nao e bissexto (nao divisivel por 4) -> fevereiro tem 28 dias.
    const map = await projectRecurring(DB, { from: '2027-02', months: 1 })
    expect(map.get('2027-02')).toEqual({ min: 5000, max: 5000 })
  })

  it('9. apagar recorrente nao apaga lancamento — conta transactions antes/depois do DELETE', async () => {
    const accountId = await novaConta()
    const r = await createRecurring(DB, {
      description: 'Starlink',
      scope: 'PJ',
      day_of_month: 10,
      amount_min_cents: 18900,
      amount_max_cents: 18900,
      starts_on: '2026-01-01',
    })
    await seedTxVinculada(accountId, r.id, '2026-08-10')

    const antes = await DB.prepare(
      'SELECT count(*) AS n FROM transactions',
    ).first<{ n: number }>()

    await deleteRecurring(DB, r.id)

    const depois = await DB.prepare(
      'SELECT count(*) AS n FROM transactions',
    ).first<{ n: number }>()
    expect(depois?.n).toBe(antes?.n)
  })

  it('soma DUAS recorrentes ativas na mesma competencia (min e max somam independentemente)', async () => {
    await createRecurring(DB, {
      description: 'Starlink',
      scope: 'PJ',
      day_of_month: 10,
      amount_min_cents: 18900,
      amount_max_cents: 18900,
      starts_on: '2026-01-01',
    })
    await createRecurring(DB, {
      description: 'DAS',
      scope: 'PJ',
      day_of_month: 20,
      amount_min_cents: 1200,
      amount_max_cents: 60000,
      starts_on: '2026-01-01',
    })

    const map = await projectRecurring(DB, { from: '2026-08', months: 1 })
    expect(map.get('2026-08')).toEqual({ min: 20100, max: 78900 })
  })

  it('rejeita competencia malformada e months fora de 1..24', async () => {
    await expect(
      projectRecurring(DB, { from: '2026-13', months: 1 }),
    ).rejects.toThrow(RangeError)
    await expect(
      projectRecurring(DB, { from: '2026-08', months: 0 }),
    ).rejects.toThrow(RangeError)
    await expect(
      projectRecurring(DB, { from: '2026-08', months: 25 }),
    ).rejects.toThrow(RangeError)
  })
})
