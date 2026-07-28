import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { createAccount } from './accounts'
import { createTransaction } from './transactions'
import { byCategory } from './reports'
import {
  createInsight,
  insightNumbers,
  latestInsight,
  TOP_CATEGORIES_LIMIT,
} from './insights'

const db = env.DB

async function categoria(name: string, kind: string, slug: string) {
  const id = crypto.randomUUID()
  await db
    .prepare(
      `INSERT INTO categories (id, name, kind, slug, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(id, name, kind, slug, '2026-01-01T00:00:00Z')
    .run()
  return id
}

async function conta(name: string) {
  return createAccount(db, { name, scope: 'PF', kind: 'checking' })
}

async function gasto(
  account_id: string,
  purchase_date: string,
  cents: number,
  category_id?: string,
) {
  return createTransaction(db, {
    account_id,
    amount_cents: -cents,
    purchase_date,
    description: `gasto ${purchase_date}`,
    category_id,
    settled_at: purchase_date,
  })
}

describe('createInsight', () => {
  it('grava e devolve o insight, com id e generated_at gerados pelo servidor', async () => {
    const insight = await createInsight(db, {
      texto: 'Você gastou mais em Mercado este mês.',
      modelo: 'qwen2.5:7b-instruct',
      periodo: '2026-07',
    })

    expect(insight.id).toBeTruthy()
    expect(insight.texto).toBe('Você gastou mais em Mercado este mês.')
    expect(insight.modelo).toBe('qwen2.5:7b-instruct')
    expect(insight.periodo).toBe('2026-07')
    expect(insight.generated_at).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/,
    )

    const row = await db
      .prepare('SELECT * FROM insights WHERE id = ?')
      .bind(insight.id)
      .first()
    expect(row).not.toBeNull()
  })

  it('rejeita texto vazio (ou só espaço) com RangeError, antes de gravar', async () => {
    await expect(
      createInsight(db, { texto: '   ', modelo: 'm', periodo: '2026-07' }),
    ).rejects.toThrow(RangeError)

    const { results } = await db.prepare('SELECT * FROM insights').all()
    expect(results).toEqual([])
  })

  it('rejeita modelo vazio com RangeError', async () => {
    await expect(
      createInsight(db, { texto: 't', modelo: '', periodo: '2026-07' }),
    ).rejects.toThrow(RangeError)
  })

  it('rejeita periodo fora do formato YYYY-MM com RangeError', async () => {
    await expect(
      createInsight(db, { texto: 't', modelo: 'm', periodo: '2026-13' }),
    ).rejects.toThrow(RangeError)
  })

  it('rejeita periodo ausente/malformado com RangeError', async () => {
    await expect(
      createInsight(db, { texto: 't', modelo: 'm', periodo: 'julho' }),
    ).rejects.toThrow(RangeError)
  })
})

describe('latestInsight', () => {
  it('devolve null quando nenhum insight jamais foi gravado', async () => {
    expect(await latestInsight(db)).toBeNull()
  })

  it('devolve o insight recém-criado', async () => {
    const insight = await createInsight(db, {
      texto: 'Primeiro insight.',
      modelo: 'qwen2.5:7b-instruct',
      periodo: '2026-07',
    })
    expect(await latestInsight(db)).toEqual(insight)
  })

  it('devolve o de generated_at MAIS RECENTE, não o de INSERT mais recente', async () => {
    // Ids/generated_at gravados direto via SQL para controlar o timestamp
    // sem depender de intervalo real de relógio entre chamadas.
    await db
      .prepare(
        `INSERT INTO insights (id, texto, modelo, periodo, generated_at)
         VALUES ('i-antigo', 'Antigo', 'm', '2026-05', '2026-05-01T00:00:00Z')`,
      )
      .run()
    await db
      .prepare(
        `INSERT INTO insights (id, texto, modelo, periodo, generated_at)
         VALUES ('i-novo', 'Novo', 'm', '2026-07', '2026-07-20T00:00:00Z')`,
      )
      .run()
    // Inserido por ÚLTIMO mas com generated_at mais ANTIGO — se
    // latestInsight ordenasse por ordem de INSERT (rowid) em vez de
    // generated_at, este teste pegaria isso.
    await db
      .prepare(
        `INSERT INTO insights (id, texto, modelo, periodo, generated_at)
         VALUES ('i-inserido-por-ultimo-mas-velho', 'Inserido por último',
                 'm', '2026-01', '2026-01-01T00:00:00Z')`,
      )
      .run()

    const latest = await latestInsight(db)
    expect(latest?.id).toBe('i-novo')
  })

  // Mesma defesa (e mesmo motivo) já documentada/testada em
  // domain/settings.test.ts para getFixedNetCents (achado CRITICAL C2):
  // deploy do Worker rodando antes da migration 0007 aplicar em produção
  // não pode virar 500 sem envelope numa rota de sessão.
  it('tabela insights ausente: devolve null em vez de propagar o erro do D1', async () => {
    await db.prepare('DROP TABLE insights').run()
    await expect(latestInsight(db)).resolves.toBeNull()
  })
})

describe('insightNumbers', () => {
  it('funciona mesmo sem nenhum insight jamais ter sido gravado (separação: números não dependem de ingestão)', async () => {
    const c = await conta('Conta insightNumbers vazio')
    await gasto(c.id, '2026-07-05', 10000)

    expect(await latestInsight(db)).toBeNull()
    const numbers = await insightNumbers(db, { competence: '2026-07' })
    expect(numbers.total_cents).toBe(-10000)
  })

  it('top_categories bate EXATAMENTE com byCategory (reuso, nunca uma segunda regra)', async () => {
    const c = await conta('Conta insightNumbers reuso')
    const mercado = await categoria('Mercado', 'expense', 'mercado-insights')
    const lazer = await categoria('Lazer', 'expense', 'lazer-insights')
    await gasto(c.id, '2026-07-05', 15000, mercado)
    await gasto(c.id, '2026-07-10', 8000, lazer)

    const direto = await byCategory(db, { competence: '2026-07' })
    const numbers = await insightNumbers(db, { competence: '2026-07' })

    expect(numbers.top_categories).toEqual(
      direto.rows.slice(0, TOP_CATEGORIES_LIMIT),
    )
    expect(numbers.total_cents).toBe(direto.total_cents)
  })

  it('respeita TOP_CATEGORIES_LIMIT quando há mais categorias que o teto', async () => {
    const c = await conta('Conta insightNumbers limite')
    for (let i = 0; i < TOP_CATEGORIES_LIMIT + 3; i++) {
      const cat = await categoria(`Categoria ${i}`, 'expense', `cat-${i}-lim`)
      await gasto(c.id, '2026-07-05', 1000 * (i + 1), cat)
    }

    const numbers = await insightNumbers(db, { competence: '2026-07' })
    expect(numbers.top_categories.length).toBe(TOP_CATEGORIES_LIMIT)
  })

  it('variação contra o período anterior: total do mês vs total do mês anterior', async () => {
    const c = await conta('Conta insightNumbers variacao')
    await gasto(c.id, '2026-06-05', 10000) // período anterior: -10000
    await gasto(c.id, '2026-07-05', 25000) // período atual: -25000

    const numbers = await insightNumbers(db, { competence: '2026-07' })

    expect(numbers.previous_competence).toBe('2026-06')
    expect(numbers.total_cents).toBe(-25000)
    expect(numbers.previous_total_cents).toBe(-10000)
    // Cresceu de 10000 para 25000 => variação de +15000 (positivo = gastou
    // mais), 150% de aumento sobre o período anterior.
    expect(numbers.variation_cents).toBe(15000)
    expect(numbers.variation_pct).toBe(150)
  })

  it('período anterior sem nenhum gasto: variation_pct é null (divisão por zero evitada, nunca Infinity)', async () => {
    const c = await conta('Conta insightNumbers sem periodo anterior')
    await gasto(c.id, '2026-07-05', 10000)

    const numbers = await insightNumbers(db, { competence: '2026-07' })

    expect(numbers.previous_total_cents).toBe(0)
    expect(numbers.variation_pct).toBeNull()
  })

  it('o que mais cresceu: categoria com maior aumento de gasto entre os dois períodos', async () => {
    const c = await conta('Conta insightNumbers maior crescimento')
    const mercado = await categoria('Mercado', 'expense', 'mercado-crescimento')
    const lazer = await categoria('Lazer', 'expense', 'lazer-crescimento')

    // período anterior
    await gasto(c.id, '2026-06-05', 10000, mercado) // Mercado: -10000
    await gasto(c.id, '2026-06-06', 5000, lazer) // Lazer: -5000

    // período atual — Mercado cresce pouco (+2000), Lazer explode (+20000)
    await gasto(c.id, '2026-07-05', 12000, mercado) // Mercado: -12000 (delta -2000)
    await gasto(c.id, '2026-07-06', 25000, lazer) // Lazer: -25000 (delta -20000)

    const numbers = await insightNumbers(db, { competence: '2026-07' })

    expect(numbers.biggest_increase?.category_name).toBe('Lazer')
    expect(numbers.biggest_increase?.current_cents).toBe(-25000)
    expect(numbers.biggest_increase?.previous_cents).toBe(-5000)
    expect(numbers.biggest_increase?.delta_cents).toBe(20000)
  })

  it('categoria nova no período atual (0 no anterior) conta como crescimento total', async () => {
    const c = await conta('Conta insightNumbers categoria nova')
    const viagem = await categoria('Viagem', 'expense', 'viagem-nova')
    await gasto(c.id, '2026-07-05', 50000, viagem)

    const numbers = await insightNumbers(db, { competence: '2026-07' })

    expect(numbers.biggest_increase?.category_name).toBe('Viagem')
    expect(numbers.biggest_increase?.previous_cents).toBe(0)
    expect(numbers.biggest_increase?.delta_cents).toBe(50000)
  })

  it('mês atual sem nenhum gasto: biggest_increase é null (nada para reportar)', async () => {
    const numbers = await insightNumbers(db, { competence: '2100-01' })
    expect(numbers.biggest_increase).toBeNull()
    expect(numbers.top_categories).toEqual([])
  })

  it('rejeita competencia ausente/malformada com RangeError', async () => {
    await expect(insightNumbers(db, { competence: '' })).rejects.toThrow(
      RangeError,
    )
    await expect(insightNumbers(db, { competence: '2026-13' })).rejects.toThrow(
      RangeError,
    )
  })
})
