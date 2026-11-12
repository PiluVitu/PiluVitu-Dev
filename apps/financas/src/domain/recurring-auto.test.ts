/**
 * Recorrência que "lança sozinha" (migration 0019, item 3): no dia do
 * vencimento o Cron diário cria o lançamento PENDENTE na conta da recorrente,
 * com o teto da faixa (o pior caso, o mesmo que o alerta do Comprometido
 * olha). A chave (recorrente, ocorrência) em `recurring_occurrences` é a
 * idempotência: rodar de novo não duplica, e apagar o pendente não o recria.
 */
import { env } from 'cloudflare:test'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nowIsoUtc } from '../lib/dates'
import { newId } from '../lib/ids'
import { importTransactions } from './import'
import { createRecurring, updateRecurring } from './recurring'
import { generateRecurringOccurrences } from './recurring-auto'
import { setNomesProprios } from './transfer-pairing'

const DB = env.DB

afterEach(() => {
  vi.restoreAllMocks()
})

async function novaConta(
  opts: {
    kind?: 'checking' | 'credit_card'
    scope?: 'PF' | 'PJ'
    closingDay?: number | null
  } = {},
): Promise<string> {
  const id = newId()
  const now = nowIsoUtc()
  const kind = opts.kind ?? 'checking'
  await DB.prepare(
    `INSERT INTO accounts
       (id, name, scope, kind, currency, closing_day, due_day,
        opening_balance_cents, created_at, updated_at)
     VALUES (?, 'Conta de teste', ?, ?, 'BRL', ?, ?, 0, ?, ?)`,
  )
    .bind(
      id,
      opts.scope ?? 'PF',
      kind,
      kind === 'credit_card' ? (opts.closingDay ?? 25) : null,
      kind === 'credit_card' ? 5 : null,
      now,
      now,
    )
    .run()
  return id
}

async function novaCategoria(arquivada = false): Promise<string> {
  const id = newId()
  await DB.prepare(
    `INSERT INTO categories (id, name, kind, created_at, archived_at)
     VALUES (?, 'Casa', 'expense', '2026-01-01T00:00:00Z', ?)`,
  )
    .bind(id, arquivada ? '2026-02-01T00:00:00Z' : null)
    .run()
  return id
}

type Recorrente = {
  description: string
  category_id: string | null
  account_id: string | null
  scope: 'PF' | 'PJ'
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'annual'
  day_of_month: number
  amount_min_cents: number
  amount_max_cents: number
  starts_on: string
  ends_on: string | null
  active: 0 | 1
  generate_since: string | null
}

// INSERT direto (não createRecurring): a regra "lançar sozinha exige conta"
// é da escrita pela rota; aqui o teste precisa montar inclusive o estado que
// a rota recusa, para provar que a geração também se defende dele.
async function novaRecorrente(over: Partial<Recorrente> = {}): Promise<string> {
  const id = newId()
  const now = nowIsoUtc()
  const r: Recorrente = {
    description: 'Internet fibra',
    category_id: null,
    account_id: null,
    scope: 'PF',
    frequency: 'monthly',
    day_of_month: 10,
    amount_min_cents: 9990,
    amount_max_cents: 12990,
    starts_on: '2026-01-10',
    ends_on: null,
    active: 1,
    generate_since: '2026-08-01',
    ...over,
  }
  await DB.prepare(
    `INSERT INTO recurring_expenses
       (id, description, category_id, account_id, scope, frequency,
        day_of_month, amount_min_cents, amount_max_cents, starts_on, ends_on,
        active, notes, generate_since, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
  )
    .bind(
      id,
      r.description,
      r.category_id,
      r.account_id,
      r.scope,
      r.frequency,
      r.day_of_month,
      r.amount_min_cents,
      r.amount_max_cents,
      r.starts_on,
      r.ends_on,
      r.active,
      r.generate_since,
      now,
      now,
    )
    .run()
  return id
}

async function lancamentoVinculado(
  accountId: string,
  recurringId: string,
  purchaseDate: string,
  createdAt: string,
  settledAt: string | null = null,
): Promise<string> {
  const id = newId()
  await DB.prepare(
    `INSERT INTO transactions
       (id, account_id, amount_cents, currency, purchase_date, settled_at,
        description, is_business, recurring_expense_id, created_at, updated_at)
     VALUES (?, ?, -11990, 'BRL', ?, ?, 'Internet fibra', 0, ?, ?, ?)`,
  )
    .bind(
      id,
      accountId,
      purchaseDate,
      settledAt,
      recurringId,
      createdAt,
      createdAt,
    )
    .run()
  return id
}

async function saidaImportada(
  accountId: string,
  over: {
    purchase_date?: string
    amount_cents?: number
    description?: string
    transfer_id?: string | null
    recurring_expense_id?: string | null
  } = {},
): Promise<string> {
  const id = newId()
  const now = nowIsoUtc()
  const purchaseDate = over.purchase_date ?? '2026-08-08'
  await DB.prepare(
    `INSERT INTO transactions
       (id, account_id, amount_cents, currency, purchase_date, settled_at,
        description, is_business, transfer_id, recurring_expense_id,
        imported_id, import_source, created_at, updated_at)
     VALUES (?, ?, ?, 'BRL', ?, ?, ?, 0, ?, ?, ?, 'ofx', ?, ?)`,
  )
    .bind(
      id,
      accountId,
      over.amount_cents ?? -11990,
      purchaseDate,
      purchaseDate,
      over.description ?? 'Internet fibra',
      over.transfer_id ?? null,
      over.recurring_expense_id ?? null,
      `fitid-${id}`,
      now,
      now,
    )
    .run()
  return id
}

async function vinculoDe(txId: string): Promise<string | null> {
  const row = await DB.prepare(
    'SELECT recurring_expense_id FROM transactions WHERE id = ?',
  )
    .bind(txId)
    .first<{ recurring_expense_id: string | null }>()
  return row?.recurring_expense_id ?? null
}

type TxGerada = {
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
  transfer_id: string | null
  imported_id: string | null
  import_source: string | null
  recurring_expense_id: string | null
}

async function lancamentos(recurringId: string): Promise<TxGerada[]> {
  const res = await DB.prepare(
    `SELECT id, account_id, amount_cents, purchase_date, bill_competence,
            settled_at, description, payee_id, category_id, is_business,
            transfer_id, imported_id, import_source, recurring_expense_id
       FROM transactions
      WHERE recurring_expense_id = ?
      ORDER BY purchase_date`,
  )
    .bind(recurringId)
    .all<TxGerada>()
  return res.results
}

async function ocorrencias(recurringId: string) {
  const res = await DB.prepare(
    `SELECT occurrence_key, due_date, transaction_id, origin
       FROM recurring_occurrences
      WHERE recurring_expense_id = ?
      ORDER BY occurrence_key`,
  )
    .bind(recurringId)
    .all<{
      occurrence_key: string
      due_date: string
      transaction_id: string | null
      origin: string
    }>()
  return res.results
}

async function contarLancamentos(): Promise<number> {
  const row = await DB.prepare('SELECT COUNT(*) AS n FROM transactions').first<{
    n: number
  }>()
  return row?.n ?? 0
}

const NADA = { gerados: 0, vinculados: 0, sem_conta: 0, falhas: 0 }

describe('generateRecurringOccurrences — mensal', () => {
  it('no dia do vencimento cria o pendente com o teto da faixa na conta da recorrente, e grava a ocorrência gerada', async () => {
    const conta = await novaConta()
    const categoria = await novaCategoria()
    const r = await novaRecorrente({
      account_id: conta,
      category_id: categoria,
    })

    const resultado = await generateRecurringOccurrences(DB, {
      today: '2026-08-10',
    })

    expect(resultado).toEqual({ ...NADA, gerados: 1 })
    const [tx, ...resto] = await lancamentos(r)
    expect(resto).toEqual([])
    expect(tx).toMatchObject({
      account_id: conta,
      amount_cents: -12990,
      purchase_date: '2026-08-10',
      bill_competence: null,
      settled_at: null,
      description: 'Internet fibra',
      payee_id: null,
      category_id: categoria,
      is_business: 0,
      transfer_id: null,
      imported_id: null,
      import_source: null,
      recurring_expense_id: r,
    })
    expect(await ocorrencias(r)).toEqual([
      {
        occurrence_key: '2026-08',
        due_date: '2026-08-10',
        transaction_id: tx.id,
        origin: 'gerado',
      },
    ])
  })

  it('antes do vencimento não gera nada', async () => {
    const conta = await novaConta()
    const r = await novaRecorrente({ account_id: conta })

    expect(
      await generateRecurringOccurrences(DB, { today: '2026-08-09' }),
    ).toEqual(NADA)
    expect(await lancamentos(r)).toEqual([])
    expect(await ocorrencias(r)).toEqual([])
  })

  it('duas rodadas no mesmo dia, e as dos dias seguintes, geram um lançamento só', async () => {
    const conta = await novaConta()
    const r = await novaRecorrente({ account_id: conta })

    await generateRecurringOccurrences(DB, { today: '2026-08-10' })
    const segunda = await generateRecurringOccurrences(DB, {
      today: '2026-08-10',
    })
    const diaSeguinte = await generateRecurringOccurrences(DB, {
      today: '2026-08-11',
    })

    expect(segunda).toEqual(NADA)
    expect(diaSeguinte).toEqual(NADA)
    expect(await lancamentos(r)).toHaveLength(1)
  })

  it('apagar o pendente gerado não o faz voltar: a ocorrência fica, sem lançamento', async () => {
    const conta = await novaConta()
    const r = await novaRecorrente({ account_id: conta })
    await generateRecurringOccurrences(DB, { today: '2026-08-10' })
    const [tx] = await lancamentos(r)

    await DB.prepare('DELETE FROM transactions WHERE id = ?').bind(tx.id).run()
    const depois = await generateRecurringOccurrences(DB, {
      today: '2026-08-11',
    })

    expect(depois).toEqual(NADA)
    expect(await lancamentos(r)).toEqual([])
    expect(await ocorrencias(r)).toEqual([
      expect.objectContaining({
        occurrence_key: '2026-08',
        transaction_id: null,
        origin: 'gerado',
      }),
    ])
  })

  it('sem generate_since, ou pausada, não gera', async () => {
    const conta = await novaConta()
    const desligada = await novaRecorrente({
      account_id: conta,
      generate_since: null,
    })
    const pausada = await novaRecorrente({ account_id: conta, active: 0 })

    expect(
      await generateRecurringOccurrences(DB, { today: '2026-08-10' }),
    ).toEqual(NADA)
    expect(await lancamentos(desligada)).toEqual([])
    expect(await lancamentos(pausada)).toEqual([])
  })

  it('sem conta não gera e conta em sem_conta', async () => {
    const r = await novaRecorrente({ account_id: null })

    expect(
      await generateRecurringOccurrences(DB, { today: '2026-08-10' }),
    ).toEqual({ ...NADA, sem_conta: 1 })
    expect(await lancamentos(r)).toEqual([])
    expect(await ocorrencias(r)).toEqual([])
  })

  it('olha no máximo 31 dias para trás: com generate_since antigo, só a ocorrência dentro da janela', async () => {
    const conta = await novaConta()
    const r = await novaRecorrente({
      account_id: conta,
      generate_since: '2026-01-01',
    })

    // 2026-08-15 − 31 dias = 2026-07-15: o vencimento de 10/07 fica de fora.
    await generateRecurringOccurrences(DB, { today: '2026-08-15' })

    expect((await lancamentos(r)).map((t) => t.purchase_date)).toEqual([
      '2026-08-10',
    ])
  })

  it('nunca gera vencimento anterior a generate_since (ligar hoje não lança o que venceu antes)', async () => {
    const conta = await novaConta()
    const r = await novaRecorrente({
      account_id: conta,
      generate_since: '2026-08-12',
    })

    expect(
      await generateRecurringOccurrences(DB, { today: '2026-08-15' }),
    ).toEqual(NADA)
    expect(await lancamentos(r)).toEqual([])
  })

  it('starts_on e ends_on cortam no nível do dia', async () => {
    const conta = await novaConta()
    const encerrada = await novaRecorrente({
      account_id: conta,
      ends_on: '2026-08-09',
    })
    const futura = await novaRecorrente({
      account_id: conta,
      starts_on: '2026-08-11',
    })

    await generateRecurringOccurrences(DB, { today: '2026-08-10' })

    expect(await lancamentos(encerrada)).toEqual([])
    expect(await lancamentos(futura)).toEqual([])
  })

  it('lançamento já vinculado à ocorrência, em qualquer estado, vira ocorrência vinculada ao mais antigo, sem gerar', async () => {
    const conta = await novaConta()
    const r = await novaRecorrente({ account_id: conta })
    const antigo = await lancamentoVinculado(
      conta,
      r,
      '2026-08-08',
      '2026-08-08T12:00:00Z',
    )
    await lancamentoVinculado(
      conta,
      r,
      '2026-08-02',
      '2026-08-09T12:00:00Z',
      '2026-08-02',
    )
    const antes = await contarLancamentos()

    const resultado = await generateRecurringOccurrences(DB, {
      today: '2026-08-10',
    })
    const outraRodada = await generateRecurringOccurrences(DB, {
      today: '2026-08-11',
    })

    expect(resultado).toEqual({ ...NADA, vinculados: 1 })
    expect(outraRodada).toEqual(NADA)
    expect(await contarLancamentos()).toBe(antes)
    expect(await ocorrencias(r)).toEqual([
      {
        occurrence_key: '2026-08',
        due_date: '2026-08-10',
        transaction_id: antigo,
        origin: 'vinculado',
      },
    ])
  })

  it('vínculo de outra competência não conta para esta ocorrência', async () => {
    const conta = await novaConta()
    const r = await novaRecorrente({
      account_id: conta,
      generate_since: '2026-07-01',
    })
    await lancamentoVinculado(conta, r, '2026-07-30', '2026-07-30T12:00:00Z')

    expect(
      await generateRecurringOccurrences(DB, { today: '2026-08-10' }),
    ).toEqual({ ...NADA, gerados: 1, vinculados: 1 })
    expect(
      (await ocorrencias(r)).map((o) => [o.occurrence_key, o.origin]),
    ).toEqual([
      ['2026-07', 'vinculado'],
      ['2026-08', 'gerado'],
    ])
  })
})

describe('generateRecurringOccurrences — outras frequências', () => {
  it('semanal: uma ocorrência por data, chave = data; vínculo casa com o vencimento ±3 dias', async () => {
    const conta = await novaConta()
    const r = await novaRecorrente({
      account_id: conta,
      frequency: 'weekly',
      day_of_month: 3,
      starts_on: '2026-08-03',
      generate_since: '2026-08-01',
    })
    const vinculado = await lancamentoVinculado(
      conta,
      r,
      '2026-08-13',
      '2026-08-13T12:00:00Z',
    )

    const resultado = await generateRecurringOccurrences(DB, {
      today: '2026-08-20',
    })

    expect(resultado).toEqual({ ...NADA, gerados: 2, vinculados: 1 })
    expect(
      (await ocorrencias(r)).map((o) => [
        o.occurrence_key,
        o.origin,
        o.transaction_id === vinculado,
      ]),
    ).toEqual([
      ['2026-08-03', 'gerado', false],
      ['2026-08-10', 'vinculado', true],
      ['2026-08-17', 'gerado', false],
    ])
    expect(
      (await lancamentos(r))
        .filter((t) => t.id !== vinculado)
        .map((t) => [t.purchase_date, t.amount_cents]),
    ).toEqual([
      ['2026-08-03', -12990],
      ['2026-08-17', -12990],
    ])
  })

  it('semanal: lançamento 4 dias depois do vencimento não é desta ocorrência', async () => {
    const conta = await novaConta()
    const r = await novaRecorrente({
      account_id: conta,
      frequency: 'weekly',
      day_of_month: 10,
      starts_on: '2026-08-10',
      generate_since: '2026-08-01',
    })
    await lancamentoVinculado(conta, r, '2026-08-06', '2026-08-06T12:00:00Z')

    expect(
      await generateRecurringOccurrences(DB, { today: '2026-08-10' }),
    ).toEqual({ ...NADA, gerados: 1 })
  })

  it('quinzenal: a cada 14 dias a partir do início, dentro dos 31 dias', async () => {
    const conta = await novaConta()
    const r = await novaRecorrente({
      account_id: conta,
      frequency: 'biweekly',
      day_of_month: 29,
      starts_on: '2026-06-29',
      generate_since: '2026-06-01',
    })

    // 2026-08-24 − 31 = 2026-07-24: 13/07 fica de fora.
    await generateRecurringOccurrences(DB, { today: '2026-08-24' })

    expect((await ocorrencias(r)).map((o) => o.occurrence_key)).toEqual([
      '2026-07-27',
      '2026-08-10',
      '2026-08-24',
    ])
  })

  it('anual: só no mês do início, dia aparado (29/02 vira 28 em ano comum), chave = competência', async () => {
    const conta = await novaConta()
    const r = await novaRecorrente({
      account_id: conta,
      frequency: 'annual',
      day_of_month: 29,
      starts_on: '2024-02-29',
      generate_since: '2026-01-01',
    })

    await generateRecurringOccurrences(DB, { today: '2026-08-15' })
    expect(await lancamentos(r)).toEqual([])

    await generateRecurringOccurrences(DB, { today: '2027-02-28' })
    await generateRecurringOccurrences(DB, { today: '2027-03-01' })

    expect(await ocorrencias(r)).toEqual([
      expect.objectContaining({
        occurrence_key: '2027-02',
        due_date: '2027-02-28',
        origin: 'gerado',
      }),
    ])
  })
})

// A ordem inversa da conciliação da importação: o extrato chegou ANTES do
// vencimento (boleto pago adiantado, débito antecipado por causa do fim de
// semana). A linha importada não tem o vínculo com a recorrente, e sem esta
// regra o Cron gerava um segundo lançamento do mesmo pagamento, com o teto da
// faixa, contado em dobro no saldo e no orçamento. Casamento só quando é
// único dos dois lados, como na importação.
describe('generateRecurringOccurrences — saída importada antes do vencimento', () => {
  it('mensal: a importada antes do vencimento vira a ocorrência vinculada e ganha o vínculo, sem pendente novo', async () => {
    const conta = await novaConta()
    const r = await novaRecorrente({ account_id: conta })
    const importacao = await importTransactions(DB, {
      account_id: conta,
      import_source: 'ofx',
      rows: [
        {
          imported_id: 'fitid-a',
          purchase_date: '2026-08-08',
          amount_cents: -11990,
          description: 'Internet fibra',
        },
      ],
    })
    expect(importacao).toMatchObject({ imported: 1, reconciled: 0 })

    const resultado = await generateRecurringOccurrences(DB, {
      today: '2026-08-10',
    })
    const outraRodada = await generateRecurringOccurrences(DB, {
      today: '2026-08-11',
    })

    expect(resultado).toEqual({ ...NADA, vinculados: 1 })
    expect(outraRodada).toEqual(NADA)
    expect(await contarLancamentos()).toBe(1)
    const [tx] = await lancamentos(r)
    expect(tx).toMatchObject({
      amount_cents: -11990,
      purchase_date: '2026-08-08',
      settled_at: '2026-08-08',
      imported_id: 'fitid-a',
    })
    expect(await ocorrencias(r)).toEqual([
      {
        occurrence_key: '2026-08',
        due_date: '2026-08-10',
        transaction_id: tx.id,
        origin: 'vinculado',
      },
    ])
  })

  it('semanal: a importada 2 dias antes vira a ocorrência daquela semana; a semana sem importação gera', async () => {
    const conta = await novaConta()
    const r = await novaRecorrente({
      account_id: conta,
      frequency: 'weekly',
      day_of_month: 3,
      starts_on: '2026-08-03',
      generate_since: '2026-08-01',
    })
    const importada = await saidaImportada(conta, {
      purchase_date: '2026-08-08',
    })

    const resultado = await generateRecurringOccurrences(DB, {
      today: '2026-08-10',
    })

    expect(resultado).toEqual({ ...NADA, gerados: 1, vinculados: 1 })
    expect(
      (await ocorrencias(r)).map((o) => [
        o.occurrence_key,
        o.origin,
        o.transaction_id === importada,
      ]),
    ).toEqual([
      ['2026-08-03', 'gerado', false],
      ['2026-08-10', 'vinculado', true],
    ])
    expect(await vinculoDe(importada)).toBe(r)
  })

  it.each([
    ['valor acima da faixa', { amount_cents: -13000 }],
    ['valor abaixo da faixa', { amount_cents: -9989 }],
    ['entrada, não saída', { amount_cents: 11990 }],
    ['outra competência', { purchase_date: '2026-07-31' }],
    ['perna de transferência pareada', { transfer_id: 'transf-1' }],
  ])('%s: não vincula, e o pendente é gerado', async (_caso, over) => {
    const conta = await novaConta()
    const r = await novaRecorrente({ account_id: conta })
    const importada = await saidaImportada(conta, over)

    expect(
      await generateRecurringOccurrences(DB, { today: '2026-08-10' }),
    ).toEqual({ ...NADA, gerados: 1 })
    expect(await vinculoDe(importada)).toBeNull()
    expect((await ocorrencias(r))[0].origin).toBe('gerado')
  })

  it('importada em outra conta não vincula', async () => {
    const daRecorrente = await novaConta()
    const outra = await novaConta()
    await novaRecorrente({ account_id: daRecorrente })
    const importada = await saidaImportada(outra)

    expect(
      await generateRecurringOccurrences(DB, { today: '2026-08-10' }),
    ).toEqual({ ...NADA, gerados: 1 })
    expect(await vinculoDe(importada)).toBeNull()
  })

  it('importada que cita nome próprio (perna de transferência ainda sem par) não vincula', async () => {
    await setNomesProprios(DB, ['Fulano de Teste'])
    const conta = await novaConta()
    await novaRecorrente({ account_id: conta })
    const importada = await saidaImportada(conta, {
      description: 'Pix enviado - Fulano de Teste',
    })

    expect(
      await generateRecurringOccurrences(DB, { today: '2026-08-10' }),
    ).toEqual({ ...NADA, gerados: 1 })
    expect(await vinculoDe(importada)).toBeNull()
  })

  it('importada já vinculada a outra recorrente não conta', async () => {
    const conta = await novaConta()
    const outra = await novaRecorrente({
      account_id: conta,
      description: 'Academia',
      generate_since: null,
    })
    await novaRecorrente({ account_id: conta })
    const importada = await saidaImportada(conta, {
      recurring_expense_id: outra,
    })

    expect(
      await generateRecurringOccurrences(DB, { today: '2026-08-10' }),
    ).toEqual({ ...NADA, gerados: 1 })
    expect(await vinculoDe(importada)).toBe(outra)
  })

  it('duas importadas candidatas para a mesma ocorrência: não vincula nenhuma, e o pendente é gerado', async () => {
    const conta = await novaConta()
    await novaRecorrente({ account_id: conta })
    const a = await saidaImportada(conta, { purchase_date: '2026-08-03' })
    const b = await saidaImportada(conta, { purchase_date: '2026-08-08' })

    expect(
      await generateRecurringOccurrences(DB, { today: '2026-08-10' }),
    ).toEqual({ ...NADA, gerados: 1 })
    expect(await vinculoDe(a)).toBeNull()
    expect(await vinculoDe(b)).toBeNull()
  })

  it('uma importada candidata de duas ocorrências (duas recorrentes na mesma conta): não vincula, e as duas geram', async () => {
    const conta = await novaConta()
    await novaRecorrente({ account_id: conta })
    await novaRecorrente({
      account_id: conta,
      description: 'Academia',
      day_of_month: 9,
    })
    const importada = await saidaImportada(conta)

    expect(
      await generateRecurringOccurrences(DB, { today: '2026-08-10' }),
    ).toEqual({ ...NADA, gerados: 2 })
    expect(await vinculoDe(importada)).toBeNull()
  })
})

describe('generateRecurringOccurrences — borda dos 31 dias', () => {
  it('vencimento exatamente 31 dias antes de hoje gera; 32 dias antes, não', async () => {
    const conta = await novaConta()
    const dia10 = await novaRecorrente({
      account_id: conta,
      generate_since: '2026-01-01',
    })
    const dia9 = await novaRecorrente({
      account_id: conta,
      description: 'Academia',
      day_of_month: 9,
      generate_since: '2026-01-01',
    })

    // 2026-08-10 − 31 dias = 2026-07-10.
    await generateRecurringOccurrences(DB, { today: '2026-08-10' })

    expect((await lancamentos(dia10)).map((t) => t.purchase_date)).toEqual([
      '2026-07-10',
      '2026-08-10',
    ])
    expect((await lancamentos(dia9)).map((t) => t.purchase_date)).toEqual([
      '2026-08-09',
    ])
  })
})

// A Ajuda da tela promete: "Vale a partir do dia em que você liga, e só
// enquanto a recorrente estiver ativa". Reativar não repõe o que venceu
// durante a pausa; sem isto, a geração olhava até 31 dias para trás e
// criava o pendente de uma ocorrência da pausa, com o teto da faixa.
describe('generateRecurringOccurrences — pausa e reativação', () => {
  async function recorrentePausada() {
    const conta = await novaConta()
    const r = await createRecurring(
      DB,
      {
        description: 'Academia',
        scope: 'PF',
        account_id: conta,
        day_of_month: 5,
        amount_min_cents: 9990,
        amount_max_cents: 9990,
        starts_on: '2026-01-05',
        auto_generate: true,
      },
      { today: '2026-07-20' },
    )
    await updateRecurring(DB, r.id, { active: 0 }, { today: '2026-07-25' })
    expect(
      await generateRecurringOccurrences(DB, { today: '2026-08-06' }),
    ).toEqual(NADA)
    return r.id
  }

  it.each([
    [
      'com auto_generate no corpo (o que a tela manda)',
      { active: 1 as const, auto_generate: true },
    ],
    ['só com active', { active: 1 as const }],
  ])(
    'reativar %s não lança o que venceu na pausa, e volta a lançar dali em diante',
    async (_caso, patch) => {
      const id = await recorrentePausada()

      const reativada = await updateRecurring(DB, id, patch, {
        today: '2026-08-20',
      })

      expect(reativada?.generate_since).toBe('2026-08-20')
      expect(
        await generateRecurringOccurrences(DB, { today: '2026-08-20' }),
      ).toEqual(NADA)
      expect(await lancamentos(id)).toEqual([])
      expect(
        await generateRecurringOccurrences(DB, { today: '2026-09-05' }),
      ).toEqual({ ...NADA, gerados: 1 })
      expect((await lancamentos(id)).map((t) => t.purchase_date)).toEqual([
        '2026-09-05',
      ])
    },
  )

  it('editar a recorrente já ativa, ou pausá-la, mantém o generate_since', async () => {
    const conta = await novaConta()
    const r = await createRecurring(
      DB,
      {
        description: 'Academia',
        scope: 'PF',
        account_id: conta,
        day_of_month: 5,
        amount_min_cents: 9990,
        amount_max_cents: 9990,
        starts_on: '2026-01-05',
        auto_generate: true,
      },
      { today: '2026-07-20' },
    )

    const editada = await updateRecurring(
      DB,
      r.id,
      { description: 'Academia nova', active: 1, auto_generate: true },
      { today: '2026-08-20' },
    )
    const pausada = await updateRecurring(
      DB,
      r.id,
      { active: 0, auto_generate: true },
      { today: '2026-08-21' },
    )

    expect(editada?.generate_since).toBe('2026-07-20')
    expect(pausada?.generate_since).toBe('2026-07-20')
  })
})

describe('generateRecurringOccurrences — o lançamento gerado', () => {
  it('cartão: bill_competence derivada do fechamento, e a recorrente PJ marca is_business', async () => {
    const cartao = await novaConta({
      kind: 'credit_card',
      scope: 'PJ',
      closingDay: 25,
    })
    const r = await novaRecorrente({
      account_id: cartao,
      scope: 'PJ',
      day_of_month: 28,
      amount_min_cents: 18900,
      amount_max_cents: 18900,
    })

    await generateRecurringOccurrences(DB, { today: '2026-08-28' })

    const [tx] = await lancamentos(r)
    expect(tx).toMatchObject({
      amount_cents: -18900,
      bill_competence: '2026-09',
      settled_at: null,
      is_business: 1,
    })
  })

  it('categoria arquivada vira NULL, sem quebrar', async () => {
    const conta = await novaConta()
    const categoria = await novaCategoria(true)
    const r = await novaRecorrente({
      account_id: conta,
      category_id: categoria,
    })

    expect(
      await generateRecurringOccurrences(DB, { today: '2026-08-10' }),
    ).toEqual({ ...NADA, gerados: 1 })
    const [tx] = await lancamentos(r)
    expect(tx.category_id).toBeNull()
  })

  it('today que não é data real é recusado antes do banco', async () => {
    await expect(
      generateRecurringOccurrences(DB, { today: '2026-02-30' }),
    ).rejects.toThrow(RangeError)
  })
})

describe('generateRecurringOccurrences — concorrência e falhas', () => {
  it('corrida: se outra execução gravou a ocorrência entre a leitura e a escrita, o batch inteiro volta e conta como já gerado', async () => {
    const conta = await novaConta()
    const r = await novaRecorrente({ account_id: conta })
    // A "outra execução": a ocorrência já está gravada, mas a leitura desta
    // rodada não a vê (o Proxy esconde o SELECT), então ela tenta gerar.
    await DB.prepare(
      `INSERT INTO recurring_occurrences
         (recurring_expense_id, occurrence_key, due_date, transaction_id, origin, created_at)
       VALUES (?, '2026-08', '2026-08-10', NULL, 'gerado', '2026-08-10T09:00:00Z')`,
    )
      .bind(r)
      .run()
    const cego = new Proxy(DB, {
      get(alvo, prop) {
        if (prop === 'prepare') {
          return (sql: string) =>
            alvo.prepare(
              /^\s*SELECT[\s\S]*FROM recurring_occurrences/.test(sql)
                ? sql.replace('WHERE', 'WHERE 0 AND')
                : sql,
            )
        }
        const valor = Reflect.get(alvo, prop)
        return typeof valor === 'function' ? valor.bind(alvo) : valor
      },
    })

    const resultado = await generateRecurringOccurrences(cego, {
      today: '2026-08-10',
    })

    expect(resultado).toEqual(NADA)
    expect(await contarLancamentos()).toBe(0)
  })

  it('erro numa recorrente não para as outras, e o log não leva descrição nem valor', async () => {
    const conta = await novaConta()
    const a = await novaRecorrente({
      account_id: conta,
      description: 'Academia',
    })
    const b = await novaRecorrente({
      account_id: conta,
      description: 'Academia',
    })
    const saidas: unknown[][] = []
    vi.spyOn(console, 'error').mockImplementation((...args) => {
      saidas.push(args)
    })
    vi.spyOn(console, 'log').mockImplementation((...args) => {
      saidas.push(args)
    })
    let falhou = false
    const instavel = new Proxy(DB, {
      get(alvo, prop) {
        if (prop === 'batch') {
          return async (stmts: D1PreparedStatement[]) => {
            if (!falhou) {
              falhou = true
              throw new Error('D1_ERROR: falha simulada: SQLITE_IOERR')
            }
            return alvo.batch(stmts)
          }
        }
        const valor = Reflect.get(alvo, prop)
        return typeof valor === 'function' ? valor.bind(alvo) : valor
      },
    })

    const resultado = await generateRecurringOccurrences(instavel, {
      today: '2026-08-10',
    })

    expect(resultado).toEqual({ ...NADA, gerados: 1, falhas: 1 })
    expect((await lancamentos(a)).length + (await lancamentos(b)).length).toBe(
      1,
    )
    const texto = saidas.map((args) => args.map(String).join(' ')).join('\n')
    expect(texto).toMatch(/SQLITE_IOERR/)
    expect(texto).not.toMatch(/Academia|12990|129,90/)
  })
})
