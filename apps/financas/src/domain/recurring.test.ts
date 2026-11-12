import { applyD1Migrations, env } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import { nowIsoUtc } from '../lib/dates'
import { newId } from '../lib/ids'
import {
  createRecurring,
  deleteRecurring,
  listRecurring,
  occurrenceKey,
  occurrenceMatchWindow,
  occurrencesBetween,
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
//
// Desde a 0019 o ESTADO do vinculo importa para a supressao: so conta o
// lancamento liquidado (settled_at) ou de cartao (bill_competence). Por isso
// o helper deixa os dois explicitos — o default (os dois NULL) e o pendente
// de conta comum, que NAO suprime.
async function seedTxVinculada(
  accountId: string,
  recurringId: string,
  purchaseDate: string,
  opts: {
    amountCents?: number
    settledAt?: string | null
    billCompetence?: string | null
  } = {},
): Promise<void> {
  const now = nowIsoUtc()
  await DB.prepare(
    `INSERT INTO transactions
       (id, account_id, amount_cents, currency, purchase_date, settled_at,
        bill_competence, description, is_business, recurring_expense_id,
        created_at, updated_at)
     VALUES (?, ?, ?, 'BRL', ?, ?, ?, 'lancamento vinculado', 1, ?, ?, ?)`,
  )
    .bind(
      newId(),
      accountId,
      opts.amountCents ?? -18900,
      purchaseDate,
      opts.settledAt ?? null,
      opts.billCompetence ?? null,
      recurringId,
      now,
      now,
    )
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

  // Mudou na 0019 (recorrencia automatica): antes QUALQUER vinculo suprimia;
  // agora so o liquidado ou o de cartao. O lancamento daqui passou a ser
  // liquidado para continuar provando a supressao; o pendente de conta comum
  // tem teste proprio em 'supressao por estado do vinculo'.
  it('6. supressao: competencia com lancamento vinculado LIQUIDADO nao projeta — conta o total antes/depois de vincular', async () => {
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

    await seedTxVinculada(accountId, r.id, '2026-08-10', {
      settledAt: '2026-08-10',
    })

    const depois = await projectRecurring(DB, { from: '2026-08', months: 1 })
    expect(depois.has('2026-08')).toBe(false)
  })

  // Mudou na 0019: o vinculo daqui passou a ser liquidado (ver teste 6).
  it('7. supressao e POR COMPETENCIA — vincular (liquidado) agosto nao suprime setembro', async () => {
    const accountId = await novaConta()
    const r = await createRecurring(DB, {
      description: 'Starlink',
      scope: 'PJ',
      day_of_month: 10,
      amount_min_cents: 18900,
      amount_max_cents: 18900,
      starts_on: '2026-01-01',
    })
    await seedTxVinculada(accountId, r.id, '2026-08-10', {
      settledAt: '2026-08-10',
    })

    const map = await projectRecurring(DB, { from: '2026-08', months: 2 })
    expect(map.has('2026-08')).toBe(false)
    expect(map.get('2026-09')).toEqual({ min: 18900, max: 18900 })
  })

  // Isola ainda mais a garantia do teste 7: uma funcao que suprimisse TUDO
  // assim que QUALQUER vinculo existisse passaria no teste 6 (unica
  // recorrente, unica competencia) mas nao poderia distinguir "outra
  // recorrente, mesma competencia, sem vinculo proprio". Starlink some,
  // DAS continua inteiro na MESMA competencia.
  // Mudou na 0019: o vinculo daqui passou a ser liquidado (ver teste 6).
  it('7b. vinculo (liquidado) de UMA recorrente nao suprime OUTRA recorrente na mesma competencia', async () => {
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
    await seedTxVinculada(accountId, comVinculo.id, '2026-08-10', {
      settledAt: '2026-08-10',
    })

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

// --------------------------------------------------------------------------
// Recorrencia automatica (migration 0019): frequencias, projecao por
// ocorrencia e o CRUD de frequency/auto_generate.
// --------------------------------------------------------------------------

describe('occurrencesBetween — datas de vencimento por frequencia', () => {
  const base = { day_of_month: 10, starts_on: '2026-01-01', ends_on: null }

  it('mensal: uma por competencia, dia aparado (31 vira 28 em fevereiro)', () => {
    expect(
      occurrencesBetween(
        { ...base, frequency: 'monthly', day_of_month: 31 },
        '2027-01-15',
        '2027-03-31',
      ),
    ).toEqual(['2027-01-31', '2027-02-28', '2027-03-31'])
  })

  it('semanal: a cada 7 dias a partir de starts_on, mesmo com starts_on muito antes da janela', () => {
    // 2025-12-29 + 31 semanas = 2026-08-03: o primeiro passo dentro da
    // janela sai por conta, nao por um loop desde o inicio.
    expect(
      occurrencesBetween(
        { ...base, frequency: 'weekly', starts_on: '2025-12-29' },
        '2026-08-01',
        '2026-08-31',
      ),
    ).toEqual([
      '2026-08-03',
      '2026-08-10',
      '2026-08-17',
      '2026-08-24',
      '2026-08-31',
    ])
  })

  it('quinzenal: a cada 14 dias a partir de starts_on (nao dias 1 e 15)', () => {
    expect(
      occurrencesBetween(
        { ...base, frequency: 'biweekly', starts_on: '2026-08-01' },
        '2026-08-01',
        '2026-09-30',
      ),
    ).toEqual([
      '2026-08-01',
      '2026-08-15',
      '2026-08-29',
      '2026-09-12',
      '2026-09-26',
    ])
  })

  it('anual: so no mes de starts_on, dia aparado (29/02 vira 28 em ano comum)', () => {
    const anual = {
      ...base,
      frequency: 'annual' as const,
      day_of_month: 29,
      starts_on: '2024-02-29',
    }
    expect(occurrencesBetween(anual, '2026-01-01', '2028-12-31')).toEqual([
      '2026-02-28',
      '2027-02-28',
      '2028-02-29',
    ])
  })

  it('starts_on e ends_on cortam no nivel do dia, nas quatro frequencias', () => {
    expect(
      occurrencesBetween(
        {
          ...base,
          frequency: 'weekly',
          starts_on: '2026-08-03',
          ends_on: '2026-08-20',
        },
        '2026-07-01',
        '2026-09-30',
      ),
    ).toEqual(['2026-08-03', '2026-08-10', '2026-08-17'])
    // anual com dia ANTES do dia de inicio: o primeiro ano fica de fora
    expect(
      occurrencesBetween(
        {
          ...base,
          frequency: 'annual',
          day_of_month: 10,
          starts_on: '2026-03-25',
        },
        '2026-01-01',
        '2027-12-31',
      ),
    ).toEqual(['2027-03-10'])
    expect(
      occurrencesBetween(
        {
          ...base,
          frequency: 'monthly',
          starts_on: '2026-08-11',
          ends_on: '2026-10-10',
        },
        '2026-08-01',
        '2026-12-31',
      ),
    ).toEqual(['2026-09-10', '2026-10-10'])
  })

  it('janela vazia ou antes do inicio nao devolve nada', () => {
    expect(
      occurrencesBetween(
        { ...base, frequency: 'weekly', starts_on: '2026-09-01' },
        '2026-08-01',
        '2026-08-31',
      ),
    ).toEqual([])
    expect(
      occurrencesBetween(
        { ...base, frequency: 'monthly' },
        '2026-08-20',
        '2026-08-11',
      ),
    ).toEqual([])
  })
})

describe('occurrenceKey / occurrenceMatchWindow', () => {
  it('mensal e anual: chave e a competencia do vencimento; semanal e quinzenal: a data', () => {
    expect(occurrenceKey('monthly', '2026-08-10')).toBe('2026-08')
    expect(occurrenceKey('annual', '2027-02-28')).toBe('2027-02')
    expect(occurrenceKey('weekly', '2026-08-03')).toBe('2026-08-03')
    expect(occurrenceKey('biweekly', '2026-08-15')).toBe('2026-08-15')
  })

  it('janela de casamento: competencia inteira (mensal/anual) ou vencimento ±3 dias (semanal/quinzenal)', () => {
    expect(occurrenceMatchWindow('monthly', '2026-02-10')).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    })
    expect(occurrenceMatchWindow('annual', '2026-03-10')).toEqual({
      from: '2026-03-01',
      to: '2026-03-31',
    })
    expect(occurrenceMatchWindow('weekly', '2026-08-31')).toEqual({
      from: '2026-08-28',
      to: '2026-09-03',
    })
    expect(occurrenceMatchWindow('biweekly', '2026-01-01')).toEqual({
      from: '2025-12-29',
      to: '2026-01-04',
    })
  })
})

describe('projectRecurring — frequencias (a faixa vale POR OCORRENCIA)', () => {
  it('semanal projeta 5 ocorrencias em agosto e 4 em setembro', async () => {
    await createRecurring(DB, {
      description: 'Academia',
      scope: 'PF',
      frequency: 'weekly',
      amount_min_cents: 9990,
      amount_max_cents: 18900,
      starts_on: '2026-08-03',
    })

    const map = await projectRecurring(DB, { from: '2026-08', months: 2 })
    expect(map.get('2026-08')).toEqual({ min: 5 * 9990, max: 5 * 18900 })
    expect(map.get('2026-09')).toEqual({ min: 4 * 9990, max: 4 * 18900 })
  })

  it('quinzenal projeta 3 em agosto e 2 em setembro', async () => {
    await createRecurring(DB, {
      description: 'Academia',
      scope: 'PF',
      frequency: 'biweekly',
      amount_min_cents: 9990,
      amount_max_cents: 9990,
      starts_on: '2026-08-01',
    })

    const map = await projectRecurring(DB, { from: '2026-08', months: 2 })
    expect(map.get('2026-08')).toEqual({ min: 3 * 9990, max: 3 * 9990 })
    expect(map.get('2026-09')).toEqual({ min: 2 * 9990, max: 2 * 9990 })
  })

  it('anual so aparece no mes dela, uma vez', async () => {
    await createRecurring(DB, {
      description: 'Seguro do carro',
      scope: 'PF',
      frequency: 'annual',
      day_of_month: 20,
      amount_min_cents: 9990,
      amount_max_cents: 18900,
      starts_on: '2026-03-15',
    })

    const map = await projectRecurring(DB, { from: '2026-01', months: 24 })
    expect([...map.keys()]).toEqual(['2026-03', '2027-03'])
    expect(map.get('2026-03')).toEqual({ min: 9990, max: 18900 })
  })
})

describe('projectRecurring — supressao por estado do vinculo (0019)', () => {
  it('pendente de conta comum vinculado NAO suprime — senao o Comprometido perde a recorrente no dia do vencimento', async () => {
    const accountId = await novaConta()
    const r = await createRecurring(DB, {
      description: 'Internet fibra',
      scope: 'PJ',
      day_of_month: 10,
      amount_min_cents: 9990,
      amount_max_cents: 9990,
      starts_on: '2026-01-01',
    })
    await seedTxVinculada(accountId, r.id, '2026-08-10', { amountCents: -9990 })

    const map = await projectRecurring(DB, { from: '2026-08', months: 1 })
    expect(map.get('2026-08')).toEqual({ min: 9990, max: 9990 })
  })

  it('vinculo de cartao (bill_competence), mesmo sem liquidar, suprime', async () => {
    const accountId = await novaConta()
    const r = await createRecurring(DB, {
      description: 'Internet fibra',
      scope: 'PJ',
      day_of_month: 10,
      amount_min_cents: 9990,
      amount_max_cents: 9990,
      starts_on: '2026-01-01',
    })
    await seedTxVinculada(accountId, r.id, '2026-08-10', {
      amountCents: -9990,
      billCompetence: '2026-09',
    })

    const map = await projectRecurring(DB, { from: '2026-08', months: 1 })
    expect(map.has('2026-08')).toBe(false)
  })

  it('semanal: 2 vinculos liquidados em agosto deixam 3 das 5 ocorrencias projetadas', async () => {
    const accountId = await novaConta()
    const r = await createRecurring(DB, {
      description: 'Academia',
      scope: 'PF',
      frequency: 'weekly',
      amount_min_cents: 9990,
      amount_max_cents: 18900,
      starts_on: '2026-08-03',
    })
    await seedTxVinculada(accountId, r.id, '2026-08-03', {
      settledAt: '2026-08-03',
    })
    await seedTxVinculada(accountId, r.id, '2026-08-10', {
      settledAt: '2026-08-10',
    })

    const map = await projectRecurring(DB, { from: '2026-08', months: 2 })
    expect(map.get('2026-08')).toEqual({ min: 3 * 9990, max: 3 * 18900 })
    expect(map.get('2026-09')).toEqual({ min: 4 * 9990, max: 4 * 18900 })
  })

  it('mais vinculos que ocorrencias zera a recorrente, sem valor negativo nem mexer em outra', async () => {
    const accountId = await novaConta()
    const r = await createRecurring(DB, {
      description: 'Internet fibra',
      scope: 'PJ',
      day_of_month: 10,
      amount_min_cents: 9990,
      amount_max_cents: 9990,
      starts_on: '2026-01-01',
    })
    await createRecurring(DB, {
      description: 'Academia',
      scope: 'PF',
      day_of_month: 5,
      amount_min_cents: 18900,
      amount_max_cents: 18900,
      starts_on: '2026-01-01',
    })
    for (const dia of ['2026-08-10', '2026-08-11', '2026-08-12']) {
      await seedTxVinculada(accountId, r.id, dia, { settledAt: dia })
    }

    const map = await projectRecurring(DB, { from: '2026-08', months: 1 })
    expect(map.get('2026-08')).toEqual({ min: 18900, max: 18900 })
  })
})

describe('createRecurring / updateRecurring — frequency e auto_generate (0019)', () => {
  const base = {
    description: 'Internet fibra',
    scope: 'PF' as const,
    day_of_month: 10,
    amount_min_cents: 9990,
    amount_max_cents: 9990,
    starts_on: '2026-01-01',
  }

  it('default: mensal e sem geracao automatica', async () => {
    const r = await createRecurring(DB, base)
    expect(r.frequency).toBe('monthly')
    expect(r.generate_since).toBeNull()
    const [lida] = await listRecurring(DB)
    expect(lida.frequency).toBe('monthly')
    expect(lida.generate_since).toBeNull()
  })

  it('semanal sem day_of_month deriva o dia de starts_on', async () => {
    const { day_of_month: _omit, ...semDia } = base
    const r = await createRecurring(DB, {
      ...semDia,
      frequency: 'weekly',
      starts_on: '2026-08-03',
    })
    expect(r.frequency).toBe('weekly')
    expect(r.day_of_month).toBe(3)
  })

  it('mensal sem day_of_month continua recusado', async () => {
    const { day_of_month: _omit, ...semDia } = base
    await expect(createRecurring(DB, semDia)).rejects.toThrow(RangeError)
  })

  it('frequencia fora da lista e data de inicio inexistente sao recusadas antes do banco', async () => {
    await expect(
      createRecurring(DB, { ...base, frequency: 'daily' as never }),
    ).rejects.toThrow(RangeError)
    await expect(
      createRecurring(DB, { ...base, starts_on: '2026-02-30' }),
    ).rejects.toThrow(RangeError)
    expect(await listRecurring(DB, { includeInactive: true })).toHaveLength(0)
  })

  it('auto_generate com conta grava generate_since = hoje', async () => {
    const accountId = await novaConta()
    const r = await createRecurring(
      DB,
      { ...base, account_id: accountId, auto_generate: true },
      { today: '2026-08-15' },
    )
    expect(r.generate_since).toBe('2026-08-15')
    const row = await DB.prepare(
      'SELECT generate_since FROM recurring_expenses WHERE id = ?',
    )
      .bind(r.id)
      .first<{ generate_since: string | null }>()
    expect(row?.generate_since).toBe('2026-08-15')
  })

  it('auto_generate sem conta e recusado, sem gravar nada', async () => {
    await expect(
      createRecurring(
        DB,
        { ...base, auto_generate: true },
        { today: '2026-08-15' },
      ),
    ).rejects.toThrow(/precisa de uma conta/)
    expect(await listRecurring(DB, { includeInactive: true })).toHaveLength(0)
  })

  it('update: ligar grava hoje, religar mantem a data, desligar zera', async () => {
    const accountId = await novaConta()
    const r = await createRecurring(DB, { ...base, account_id: accountId })

    const ligada = await updateRecurring(
      DB,
      r.id,
      { auto_generate: true },
      { today: '2026-08-15' },
    )
    expect(ligada?.generate_since).toBe('2026-08-15')

    const religada = await updateRecurring(
      DB,
      r.id,
      { auto_generate: true },
      { today: '2026-09-20' },
    )
    expect(religada?.generate_since).toBe('2026-08-15')

    const desligada = await updateRecurring(DB, r.id, { auto_generate: false })
    expect(desligada?.generate_since).toBeNull()
  })

  it('update: ligar sem conta, ou tirar a conta com a geracao ligada, e recusado sem alterar a linha', async () => {
    const semConta = await createRecurring(DB, base)
    await expect(
      updateRecurring(
        DB,
        semConta.id,
        { auto_generate: true },
        { today: '2026-08-15' },
      ),
    ).rejects.toThrow(/precisa de uma conta/)

    const accountId = await novaConta()
    const ligada = await createRecurring(
      DB,
      { ...base, account_id: accountId, auto_generate: true },
      { today: '2026-08-15' },
    )
    await expect(
      updateRecurring(DB, ligada.id, { account_id: null }),
    ).rejects.toThrow(/precisa de uma conta/)

    const row = await DB.prepare(
      'SELECT account_id, generate_since FROM recurring_expenses WHERE id = ?',
    )
      .bind(ligada.id)
      .first()
    expect(row).toEqual({ account_id: accountId, generate_since: '2026-08-15' })

    // tirar a conta e desligar no mesmo patch e coerente
    const desligada = await updateRecurring(DB, ligada.id, {
      account_id: null,
      auto_generate: false,
    })
    expect(desligada).toMatchObject({ account_id: null, generate_since: null })
  })

  it('update: muda a frequencia; semanal com novo inicio e sem dia rederiva o dia', async () => {
    const r = await createRecurring(DB, base)
    const semanal = await updateRecurring(DB, r.id, {
      frequency: 'weekly',
      starts_on: '2026-08-04',
    })
    expect(semanal).toMatchObject({ frequency: 'weekly', day_of_month: 4 })

    const anual = await updateRecurring(DB, r.id, {
      frequency: 'annual',
      day_of_month: 20,
    })
    expect(anual).toMatchObject({ frequency: 'annual', day_of_month: 20 })

    await expect(
      updateRecurring(DB, r.id, { frequency: 'daily' as never }),
    ).rejects.toThrow(RangeError)
  })

  it('update de id inexistente com auto_generate continua devolvendo null', async () => {
    expect(
      await updateRecurring(
        DB,
        newId(),
        { auto_generate: true },
        { today: '2026-08-15' },
      ),
    ).toBeNull()
  })
})
