import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { newId } from '../lib/ids'
import { createAccount } from './accounts'
import {
  countRuleMatches,
  createRule,
  deleteRule,
  listRules,
  updateRule,
  type NewRule,
} from './rules'

const db = env.DB

function novaRegra(patch: Partial<NewRule> = {}): NewRule {
  return {
    name: 'Uber → Transporte',
    match_text: 'uber',
    set_category_id: null,
    set_is_business: 1,
    ...patch,
  }
}

async function contaCorrente(nome = 'Nubank PJ') {
  return createAccount(db, { name: nome, scope: 'PJ', kind: 'checking' })
}

async function seedTx(patch: {
  account_id: string
  description: string
  amount_cents: number
  purchase_date?: string
  transfer_id?: string | null
  parent_id?: string | null
}) {
  const id = newId()
  await db
    .prepare(
      `INSERT INTO transactions
        (id, account_id, amount_cents, currency, purchase_date, description,
         is_business, transfer_id, parent_id, created_at, updated_at)
       VALUES (?, ?, ?, 'BRL', ?, ?, 0, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      patch.account_id,
      patch.amount_cents,
      patch.purchase_date ?? '2026-08-10',
      patch.description,
      patch.transfer_id ?? null,
      patch.parent_id ?? null,
      '2026-08-10T00:00:00Z',
      '2026-08-10T00:00:00Z',
    )
    .run()
  return id
}

describe('createRule', () => {
  it('grava a regra e devolve a linha inteira', async () => {
    const r = await createRule(db, novaRegra())
    expect(r.id).toMatch(/[0-9a-f-]{36}/)
    expect(r.match_text).toBe('uber')
    expect(r.set_is_business).toBe(1)
    expect(r.priority).toBe(100)
    expect(r.active).toBe(1)

    const lida = await db
      .prepare('SELECT name, match_text, priority FROM rules WHERE id = ?')
      .bind(r.id)
      .first<{ name: string; match_text: string; priority: number }>()
    expect(lida).toEqual({
      name: 'Uber → Transporte',
      match_text: 'uber',
      priority: 100,
    })
  })

  it('string vazia vira NULL, nunca texto vazio no banco', async () => {
    // Um `<input>` não preenchido manda `''`. Gravado cru, o CHECK
    // `length(match_text) > 0` recusaria — e um `set_category_id: ''`
    // quebraria a FK. Normalizar é o que deixa a rota burra.
    const r = await createRule(
      db,
      novaRegra({ set_category_id: '', match_account_id: '' }),
    )
    expect(r.set_category_id).toBeNull()
    expect(r.match_account_id).toBeNull()
  })

  it('RECUSA regra sem NENHUMA condição — ela casaria com tudo', async () => {
    await expect(
      createRule(db, {
        name: 'catástrofe',
        set_category_id: null,
        set_is_business: 1,
      }),
    ).rejects.toThrow(/pelo menos uma condição/)
    expect(await listRules(db)).toHaveLength(0)
  })

  it('RECUSA regra sem nenhuma ação', async () => {
    await expect(
      createRule(db, { name: 'inerte', match_text: 'uber' }),
    ).rejects.toThrow(/pelo menos uma ação/)
  })

  it('RECUSA faixa invertida com mensagem legível, sem tocar o banco', async () => {
    await expect(
      createRule(
        db,
        novaRegra({ match_min_cents: 5000, match_max_cents: 100 }),
      ),
    ).rejects.toThrow(/match_max_cents precisa ser maior ou igual/)
    expect(await listRules(db)).toHaveLength(0)
  })

  it('RECUSA faixa com valor não-inteiro ou <= 0', async () => {
    await expect(
      createRule(db, novaRegra({ match_min_cents: 0 })),
    ).rejects.toThrow(/match_min_cents inválido/)
    await expect(
      createRule(db, novaRegra({ match_min_cents: 10.5 })),
    ).rejects.toThrow(/match_min_cents inválido/)
  })

  it('set_is_business = 0 é ação válida (marca PF), não "sem ação"', async () => {
    const r = await createRule(
      db,
      novaRegra({ set_is_business: 0, set_category_id: null }),
    )
    expect(r.set_is_business).toBe(0)
  })
})

describe('listRules', () => {
  it('devolve ativas E pausadas, na ordem de aplicação', async () => {
    const b = await createRule(db, novaRegra({ name: 'B', priority: 200 }))
    const a = await createRule(db, novaRegra({ name: 'A', priority: 50 }))
    const p = await createRule(
      db,
      novaRegra({ name: 'Pausada', priority: 300, active: 0 }),
    )
    expect((await listRules(db)).map((r) => r.id)).toEqual([a.id, b.id, p.id])
  })

  it('onlyActive esconde a pausada', async () => {
    await createRule(db, novaRegra({ name: 'ativa' }))
    await createRule(db, novaRegra({ name: 'pausada', active: 0 }))
    const ativas = await listRules(db, { onlyActive: true })
    expect(ativas.map((r) => r.name)).toEqual(['ativa'])
  })
})

describe('updateRule', () => {
  it('patch parcial muda só o campo mandado', async () => {
    const r = await createRule(db, novaRegra({ priority: 100 }))
    const atualizada = await updateRule(db, r.id, { priority: 10 })
    expect(atualizada?.priority).toBe(10)
    expect(atualizada?.match_text).toBe('uber')
    expect(atualizada?.name).toBe('Uber → Transporte')
  })

  it('toca updated_at', async () => {
    const r = await createRule(db, novaRegra())
    await db
      .prepare(
        "UPDATE rules SET updated_at = '2000-01-01T00:00:00Z' WHERE id = ?",
      )
      .bind(r.id)
      .run()
    const atualizada = await updateRule(db, r.id, { priority: 7 })
    expect(atualizada?.updated_at).not.toBe('2000-01-01T00:00:00Z')
  })

  it('id inexistente devolve null (a rota traduz em 404)', async () => {
    expect(await updateRule(db, newId(), { priority: 1 })).toBeNull()
  })

  it('patch vazio devolve a linha atual, não null', async () => {
    const r = await createRule(db, novaRegra())
    expect((await updateRule(db, r.id, {}))?.id).toBe(r.id)
  })

  it('⚠️ RECUSA o patch que apaga a ÚLTIMA condição', async () => {
    // O caso que a validação sobre a linha FUNDIDA existe pra pegar:
    // `{match_text: null}` é inofensivo isolado, e produziria uma regra que
    // casa TODO lançamento. Validar só o corpo do patch deixaria passar.
    const r = await createRule(db, novaRegra({ match_text: 'uber' }))
    await expect(updateRule(db, r.id, { match_text: null })).rejects.toThrow(
      /pelo menos uma condição/,
    )
    const lida = await db
      .prepare('SELECT match_text FROM rules WHERE id = ?')
      .bind(r.id)
      .first<{ match_text: string | null }>()
    expect(lida?.match_text).toBe('uber')
  })

  it('⚠️ RECUSA o patch que apaga a ÚLTIMA ação', async () => {
    const r = await createRule(
      db,
      novaRegra({ set_is_business: 1, set_category_id: null }),
    )
    await expect(
      updateRule(db, r.id, { set_is_business: null }),
    ).rejects.toThrow(/pelo menos uma ação/)
  })

  it('apagar UMA condição quando sobra outra passa', async () => {
    const conta = await contaCorrente()
    const r = await createRule(
      db,
      novaRegra({ match_text: 'uber', match_account_id: conta.id }),
    )
    const atualizada = await updateRule(db, r.id, { match_text: null })
    expect(atualizada?.match_text).toBeNull()
    expect(atualizada?.match_account_id).toBe(conta.id)
  })

  it('faixa fica coerente contra o valor ATUAL, não só contra o patch', async () => {
    const r = await createRule(
      db,
      novaRegra({ match_min_cents: 1000, match_max_cents: 5000 }),
    )
    // Sozinho, `max: 500` é um inteiro positivo válido — só fundido com o
    // `min: 1000` já gravado é que vira faixa invertida.
    await expect(
      updateRule(db, r.id, { match_max_cents: 500 }),
    ).rejects.toThrow(/maior ou igual/)
  })
})

describe('deleteRule', () => {
  it('apaga e devolve true; id inexistente devolve false', async () => {
    const r = await createRule(db, novaRegra())
    expect(await deleteRule(db, r.id)).toBe(true)
    expect(await listRules(db)).toHaveLength(0)
    expect(await deleteRule(db, newId())).toBe(false)
  })

  it('NÃO apaga lançamento nenhum — nada aponta pra rules', async () => {
    const conta = await contaCorrente()
    await seedTx({
      account_id: conta.id,
      description: 'UBER *TRIP',
      amount_cents: -2350,
    })
    const r = await createRule(db, novaRegra())
    await deleteRule(db, r.id)
    const n = await db
      .prepare('SELECT count(*) AS n FROM transactions')
      .first<{ n: number }>()
    expect(n?.n).toBe(1)
  })
})

describe('FKs da 0009', () => {
  it('CASCADE: apagar a conta apaga a regra que só valia naquela conta', async () => {
    // ⚠️ SET NULL aqui ALARGARIA a regra em silêncio ("só no cartão da PJ"
    // viraria "em qualquer conta") — a direção oposta da lição da 0006, e
    // de propósito: aqui o dependente é uma condição que ESTREITA, não um
    // fato de dinheiro.
    const conta = await contaCorrente()
    await createRule(db, novaRegra({ match_account_id: conta.id }))
    await db.prepare('DELETE FROM accounts WHERE id = ?').bind(conta.id).run()
    expect(await listRules(db)).toHaveLength(0)
  })

  it('conta inexistente em match_account_id sai como erro de FK do D1', async () => {
    await expect(
      createRule(db, novaRegra({ match_account_id: newId() })),
    ).rejects.toThrow(/FOREIGN KEY|SQLITE_CONSTRAINT/i)
  })
})

describe('countRuleMatches', () => {
  it('conta quantos lançamentos EXISTENTES cada regra casaria', async () => {
    const conta = await contaCorrente()
    await seedTx({
      account_id: conta.id,
      description: 'UBER *TRIP SAO PAULO',
      amount_cents: -2350,
    })
    await seedTx({
      account_id: conta.id,
      description: 'Uber *Trip',
      amount_cents: -1800,
    })
    await seedTx({
      account_id: conta.id,
      description: 'IFOOD PEDIDO',
      amount_cents: -4500,
    })

    const uber = await createRule(db, novaRegra({ name: 'Uber' }))
    const ifood = await createRule(
      db,
      novaRegra({ name: 'iFood', match_text: 'ifood' }),
    )
    const { scanned, counts } = await countRuleMatches(db, await listRules(db))
    expect(scanned).toBe(3)
    expect(counts[uber.id]).toBe(2) // pega os dois, apesar da caixa diferente
    expect(counts[ifood.id]).toBe(1)
  })

  it('regra que não casa nada volta 0 (chave presente, nunca ausente)', async () => {
    const conta = await contaCorrente()
    await seedTx({
      account_id: conta.id,
      description: 'MERCADO',
      amount_cents: -1000,
    })
    const r = await createRule(db, novaRegra({ match_text: 'netflix' }))
    const { counts } = await countRuleMatches(db, await listRules(db))
    expect(counts[r.id]).toBe(0)
  })

  it('IGNORA perna de transferência e filha de rateio', async () => {
    // Os mesmos dois filtros de v_cashflow/byCategory: as duas repetem o
    // valor de outra linha, e contá-las inflaria o número que o dono usa
    // pra decidir se confia na regra.
    const conta = await contaCorrente()
    await seedTx({
      account_id: conta.id,
      description: 'UBER real',
      amount_cents: -2000,
    })
    await seedTx({
      account_id: conta.id,
      description: 'UBER perna de transferência',
      amount_cents: -2000,
      transfer_id: newId(),
    })
    const pai = await seedTx({
      account_id: conta.id,
      description: 'UBER pai do rateio',
      amount_cents: -3000,
    })
    await seedTx({
      account_id: conta.id,
      description: 'UBER filha do rateio',
      amount_cents: -1000,
      parent_id: pai,
    })

    const r = await createRule(db, novaRegra())
    const { scanned, counts } = await countRuleMatches(db, await listRules(db))
    expect(scanned).toBe(2) // o real + o pai
    expect(counts[r.id]).toBe(2)
  })

  it('sem nenhuma regra, não varre nada', async () => {
    const conta = await contaCorrente()
    await seedTx({
      account_id: conta.id,
      description: 'qualquer',
      amount_cents: -100,
    })
    expect(await countRuleMatches(db, [])).toEqual({ scanned: 0, counts: {} })
  })

  it('a varredura respeita o teto e a janela é a MAIS RECENTE', async () => {
    const conta = await contaCorrente()
    await seedTx({
      account_id: conta.id,
      description: 'UBER antigo',
      amount_cents: -100,
      purchase_date: '2026-01-01',
    })
    await seedTx({
      account_id: conta.id,
      description: 'UBER recente',
      amount_cents: -100,
      purchase_date: '2026-08-01',
    })
    const r = await createRule(db, novaRegra())
    const { scanned, counts } = await countRuleMatches(
      db,
      await listRules(db),
      {
        limit: 1,
      },
    )
    expect(scanned).toBe(1)
    expect(counts[r.id]).toBe(1)
  })
})
