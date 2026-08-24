import { applyD1Migrations, env } from 'cloudflare:test'
import { Hono } from 'hono'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createAccount } from '../domain/accounts'
import { archiveCategory, createCategory } from '../domain/categories'
import { createInstallmentPlan } from '../domain/installments'
import { createRecurring } from '../domain/recurring'
import {
  buildListTransactionsQuery,
  createTransaction,
  createTransfer,
  type Transaction,
} from '../domain/transactions'
import { todayInTeresina } from '../lib/dates'
import { transactionsRoutes } from './transactions'

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
})

function app() {
  const hono = new Hono()
  hono.route('/api', transactionsRoutes)
  return hono
}

function post(path: string, body: unknown) {
  return app().request(
    path,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
    { DB: env.DB },
  )
}

function get(path: string) {
  return app().request(path, {}, { DB: env.DB })
}

function send(path: string, method: string, body?: unknown) {
  return app().request(
    path,
    {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    { DB: env.DB },
  )
}

type Envelope<T> = {
  ok: boolean
  data: T
  notifications: Array<{ code: string; message: string; field?: string }>
}

async function envelope<T>(res: Response): Promise<Envelope<T>> {
  return (await res.json()) as Envelope<T>
}

function contaCorrente(nome: string) {
  return createAccount(env.DB, { name: nome, scope: 'PJ', kind: 'checking' })
}

/** Página do extrato + o cursor que a própria linha entrega pra próxima. */
async function pagina(query: string) {
  const res = await get(`/api/transactions?${query}`)
  expect(res.status).toBe(200)
  const body = await envelope<Transaction[]>(res)
  const last = body.data[body.data.length - 1]
  return {
    linhas: body.data,
    cursor: last
      ? `${last.purchase_date}|${last.created_at}|${last.id}`
      : undefined,
  }
}

describe('rotas de lancamentos', () => {
  it('POST /api/transactions em cartao devolve 201 com a competencia derivada', async () => {
    const card = await createAccount(env.DB, {
      name: 'Cartao rota',
      scope: 'PF',
      kind: 'credit_card',
      closing_day: 25,
      due_day: 5,
    })
    const res = await post('/api/transactions', {
      account_id: card.id,
      amount_cents: -12990,
      purchase_date: '2026-07-28',
      description: 'Steam',
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as {
      ok: boolean
      data: { bill_competence: string }
    }
    expect(body.ok).toBe(true)
    expect(body.data.bill_competence).toBe('2026-08')
  })

  it('POST /api/transactions com amount_cents = 0 devolve 422 em vez de 500', async () => {
    const acc = await createAccount(env.DB, {
      name: 'Conta rota zero',
      scope: 'PF',
      kind: 'checking',
    })
    const res = await post('/api/transactions', {
      account_id: acc.id,
      amount_cents: 0,
      purchase_date: '2026-07-28',
      description: 'nada',
    })
    expect(res.status).toBe(422)
    const body = (await res.json()) as {
      ok: boolean
      notifications: Array<{ type: string; code: string }>
    }
    expect(body.ok).toBe(false)
    expect(body.notifications[0].code).toBe('constraint_violation')
    expect(body.notifications[0].type).toBe('error')
  })

  it('POST /api/transfers devolve as duas pernas com o mesmo transfer_id', async () => {
    const de = await createAccount(env.DB, {
      name: 'Origem rota',
      scope: 'PF',
      kind: 'checking',
      opening_balance_cents: 500000,
    })
    const para = await createAccount(env.DB, {
      name: 'Destino rota',
      scope: 'PF',
      kind: 'checking',
    })
    const res = await post('/api/transfers', {
      from_account_id: de.id,
      to_account_id: para.id,
      amount_cents: 150000,
      date: '2026-07-20',
      description: 'PIX interno',
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as {
      data: {
        transfer_id: string
        out: { amount_cents: number; transfer_id: string }
        inbound: { amount_cents: number; transfer_id: string }
      }
    }
    expect(body.data.out.amount_cents).toBe(-150000)
    expect(body.data.inbound.amount_cents).toBe(150000)
    expect(body.data.out.transfer_id).toBe(body.data.transfer_id)
    expect(body.data.inbound.transfer_id).toBe(body.data.transfer_id)
  })

  it('POST /api/transfers repassa category_id — so a perna de saida recebe', async () => {
    const de = await createAccount(env.DB, {
      name: 'Origem categoria rota',
      scope: 'PJ',
      kind: 'checking',
      opening_balance_cents: 900000,
    })
    const para = await createAccount(env.DB, {
      name: 'Destino categoria rota',
      scope: 'PF',
      kind: 'checking',
    })
    const cat = await env.DB.prepare(
      "SELECT id FROM categories WHERE slug = 'pro-labore'",
    ).first<{ id: string }>()

    const res = await post('/api/transfers', {
      from_account_id: de.id,
      to_account_id: para.id,
      amount_cents: 430000,
      date: '2026-08-05',
      description: 'Pro-labore agosto',
      category_id: cat?.id,
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as {
      data: {
        out: { category_id: string | null }
        inbound: { category_id: string | null }
      }
    }
    expect(body.data.out.category_id).toBe(cat?.id)
    expect(body.data.inbound.category_id).toBeNull()
  })

  it('POST /api/transfers com categoria ARQUIVADA devolve 422 invalid_transfer (contrato de erro intacto)', async () => {
    const de = await createAccount(env.DB, {
      name: 'Origem categoria arquivada rota',
      scope: 'PF',
      kind: 'checking',
      opening_balance_cents: 500000,
    })
    const para = await createAccount(env.DB, {
      name: 'Destino categoria arquivada rota',
      scope: 'PF',
      kind: 'checking',
    })
    const cat = await createCategory(env.DB, {
      name: 'Aporte antigo rota',
      kind: 'expense',
    })
    await archiveCategory(env.DB, cat.id)

    const res = await post('/api/transfers', {
      from_account_id: de.id,
      to_account_id: para.id,
      amount_cents: 1000,
      date: '2026-08-05',
      description: 'PIX com categoria morta',
      category_id: cat.id,
    })
    expect(res.status).toBe(422)
    const body = (await res.json()) as {
      ok: boolean
      notifications: Array<{ code: string; message: string }>
    }
    expect(body.ok).toBe(false)
    // RangeError => invalid_transfer, nunca constraint_violation: a recusa e
    // do dominio, nao do D1 (arquivar nao e DELETE, a FK nem chega a olhar).
    expect(body.notifications[0].code).toBe('invalid_transfer')
    expect(body.notifications[0].message).toMatch(/arquivada/)
    expect(body.notifications[0].message).not.toMatch(
      /D1_ERROR|SQLITE_CONSTRAINT/i,
    )
  })

  it('POST /api/transfers para conta inexistente devolve 422 com mensagem legivel, sem texto cru do D1', async () => {
    // createTransfer nao pre-valida existencia das contas — a FK do schema
    // e quem barra, e o D1 devolve algo como "D1_ERROR: FOREIGN KEY
    // constraint failed: SQLITE_CONSTRAINT_FOREIGNKEY". Isso nunca pode
    // chegar cru pro usuario (nem o "D1_ERROR:", nem o nome da constraint).
    const de = await createAccount(env.DB, {
      name: 'Origem transfer fantasma',
      scope: 'PF',
      kind: 'checking',
      opening_balance_cents: 500000,
    })
    const res = await post('/api/transfers', {
      from_account_id: de.id,
      to_account_id: 'conta-que-nao-existe',
      amount_cents: 1000,
      date: '2026-07-20',
      description: 'PIX pra ninguem',
    })
    expect(res.status).toBe(422)
    const body = (await res.json()) as {
      ok: boolean
      notifications: Array<{ code: string; message: string }>
    }
    expect(body.ok).toBe(false)
    expect(body.notifications[0].code).toBe('constraint_violation')
    const msg = body.notifications[0].message
    expect(msg).not.toMatch(/D1_ERROR|SQLITE_CONSTRAINT|FOREIGN KEY/i)
    expect(msg.length).toBeGreaterThan(0)
  })

  it('GET /api/transactions filtra por account_id e periodo', async () => {
    const acc = await createAccount(env.DB, {
      name: 'Conta rota extrato',
      scope: 'PF',
      kind: 'checking',
    })
    await post('/api/transactions', {
      account_id: acc.id,
      amount_cents: -1000,
      purchase_date: '2026-06-30',
      description: 'junho',
      settled_at: '2026-06-30',
    })
    await post('/api/transactions', {
      account_id: acc.id,
      amount_cents: -2000,
      purchase_date: '2026-07-15',
      description: 'julho',
      settled_at: '2026-07-15',
    })

    const res = await app().request(
      `/api/transactions?account_id=${acc.id}&from=2026-07-01&to=2026-07-31`,
      {},
      { DB: env.DB },
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Array<{ description: string }> }
    expect(body.data.map((t) => t.description)).toEqual(['julho'])
  })

  // Task 7 da fatia ⑥ (docs/superpowers/specs/2026-07-27-financas-recorrentes-design.md
  // §3.1): o vinculo explicito que a tela Lancar oferece ("este lancamento
  // e o Starlink de agosto").
  it('POST /api/transactions com recurring_expense_id valido devolve 201 com o vinculo gravado', async () => {
    const acc = await createAccount(env.DB, {
      name: 'Conta rota recorrente',
      scope: 'PJ',
      kind: 'checking',
    })
    const recorrente = await createRecurring(env.DB, {
      description: 'Starlink',
      scope: 'PJ',
      day_of_month: 10,
      amount_min_cents: 18900,
      amount_max_cents: 18900,
      starts_on: '2026-01-01',
    })

    const res = await post('/api/transactions', {
      account_id: acc.id,
      amount_cents: -18900,
      purchase_date: '2026-08-10',
      description: 'Starlink de agosto',
      settled_at: '2026-08-10',
      recurring_expense_id: recorrente.id,
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as {
      data: { recurring_expense_id: string | null }
    }
    expect(body.data.recurring_expense_id).toBe(recorrente.id)
  })

  it('POST /api/transactions com recurring_expense_id inexistente devolve 422 com mensagem legivel, sem texto cru do D1', async () => {
    // Mesmo caminho de erro do teste equivalente de to_account_id em
    // /api/transfers, acima: a FK do schema (migration 0006) e quem barra,
    // e o D1_ERROR cru (com "FOREIGN KEY"/"SQLITE_CONSTRAINT") nunca pode
    // vazar pro cliente — cozido por friendlyConstraintMessage, com o
    // original so no console via logConstraintError.
    const acc = await createAccount(env.DB, {
      name: 'Conta rota recorrente fantasma',
      scope: 'PJ',
      kind: 'checking',
    })
    const res = await post('/api/transactions', {
      account_id: acc.id,
      amount_cents: -1000,
      purchase_date: '2026-08-10',
      description: 'vinculo invalido',
      recurring_expense_id: 'recorrente-que-nao-existe',
    })
    expect(res.status).toBe(422)
    const body = (await res.json()) as {
      ok: boolean
      notifications: Array<{ code: string; message: string }>
    }
    expect(body.ok).toBe(false)
    expect(body.notifications[0].code).toBe('constraint_violation')
    const msg = body.notifications[0].message
    expect(msg).not.toMatch(/D1_ERROR|SQLITE_CONSTRAINT|FOREIGN KEY/i)
    expect(msg.length).toBeGreaterThan(0)

    const { results } = await env.DB.prepare(
      'SELECT id FROM transactions WHERE account_id = ?',
    )
      .bind(acc.id)
      .all()
    expect(results).toHaveLength(0)
  })

  it('GET /api/transactions com limit invalido devolve 422', async () => {
    const res = await app().request(
      '/api/transactions?limit=abc',
      {},
      { DB: env.DB },
    )
    expect(res.status).toBe(422)
    const body = (await res.json()) as {
      notifications: Array<{ code: string }>
    }
    expect(body.notifications[0].code).toBe('invalid_limit')
  })
})

// ===========================================================================
// EXTRATO PAGINADO (keyset) + filtro settled
// ===========================================================================
describe('GET /api/transactions — paginacao por keyset', () => {
  it('tres paginas de 2 percorrem as 5 linhas, sem repetir nem pular', async () => {
    const acc = await contaCorrente('Conta keyset')
    const datas = [
      '2026-07-01',
      '2026-07-02',
      '2026-07-03',
      '2026-07-04',
      '2026-07-05',
    ]
    for (const d of datas) {
      await createTransaction(env.DB, {
        account_id: acc.id,
        amount_cents: -1000,
        purchase_date: d,
        description: `compra ${d}`,
      })
    }

    const vistos: string[] = []
    let cursor: string | undefined
    for (let i = 0; i < 3; i++) {
      const q = `account_id=${acc.id}&limit=2${cursor ? `&before=${encodeURIComponent(cursor)}` : ''}`
      const p = await pagina(q)
      vistos.push(...p.linhas.map((l) => l.purchase_date))
      cursor = p.cursor
    }

    // DESC: da mais recente pra mais antiga, cada linha exatamente uma vez.
    expect(vistos).toEqual([...datas].reverse())
    expect(new Set(vistos).size).toBe(5)
  })

  it('⚠️ paginar um PARCELAMENTO (N linhas com o MESMO purchase_date e o MESMO created_at) nao perde parcela', async () => {
    // createInstallmentPlan grava as 6 parcelas num batch so: mesmo
    // `purchase_date` (o da compra) e mesmo `created_at` (um nowIsoUtc()
    // para o batch inteiro). Um cursor de duas partes
    // (purchase_date|created_at) pediria a pagina seguinte a partir de um par
    // que TODAS as 6 tem — e o `<` estrito jogaria fora as irmas: parcela
    // sumindo do extrato, sem erro nenhum. E o `id` no cursor que impede.
    const card = await createAccount(env.DB, {
      name: 'Cartao keyset parcelas',
      scope: 'PF',
      kind: 'credit_card',
      closing_day: 25,
      due_day: 5,
    })
    await createInstallmentPlan(env.DB, {
      account_id: card.id,
      description: 'Notebook',
      total_cents: 600000,
      installments_count: 6,
      purchase_date: '2026-07-10',
    })

    const iguais = await env.DB.prepare(
      'SELECT COUNT(DISTINCT purchase_date || created_at) AS pares, COUNT(*) AS n FROM transactions WHERE account_id = ?',
    )
      .bind(card.id)
      .first<{ pares: number; n: number }>()
    // A premissa do teste, medida e nao suposta: 6 linhas, UM par distinto.
    expect(iguais).toEqual({ pares: 1, n: 6 })

    const vistos: string[] = []
    let cursor: string | undefined
    for (let i = 0; i < 3; i++) {
      const q = `account_id=${card.id}&limit=2${cursor ? `&before=${encodeURIComponent(cursor)}` : ''}`
      const p = await pagina(q)
      vistos.push(...p.linhas.map((l) => l.id))
      cursor = p.cursor
    }

    expect(vistos).toHaveLength(6)
    expect(new Set(vistos).size).toBe(6)
  })

  it('?settled=0 devolve so o que falta marcar como pago; ?settled=1 so o liquidado', async () => {
    const acc = await contaCorrente('Conta settled filtro')
    await createTransaction(env.DB, {
      account_id: acc.id,
      amount_cents: -1000,
      purchase_date: '2026-07-10',
      description: 'previsto',
    })
    await createTransaction(env.DB, {
      account_id: acc.id,
      amount_cents: -2000,
      purchase_date: '2026-07-11',
      description: 'pago',
      settled_at: '2026-07-11',
    })

    const abertos = await pagina(`account_id=${acc.id}&settled=0`)
    expect(abertos.linhas.map((l) => l.description)).toEqual(['previsto'])
    const pagos = await pagina(`account_id=${acc.id}&settled=1`)
    expect(pagos.linhas.map((l) => l.description)).toEqual(['pago'])
  })

  it('o filtro settled SOBREVIVE ao cursor (pagina 2 nao volta a mostrar liquidado)', async () => {
    const acc = await contaCorrente('Conta settled + cursor')
    await createTransaction(env.DB, {
      account_id: acc.id,
      amount_cents: -1000,
      purchase_date: '2026-07-01',
      description: 'aberto 1',
    })
    await createTransaction(env.DB, {
      account_id: acc.id,
      amount_cents: -1000,
      purchase_date: '2026-07-02',
      description: 'pago',
      settled_at: '2026-07-02',
    })
    await createTransaction(env.DB, {
      account_id: acc.id,
      amount_cents: -1000,
      purchase_date: '2026-07-03',
      description: 'aberto 2',
    })

    const p1 = await pagina(`account_id=${acc.id}&settled=0&limit=1`)
    expect(p1.linhas.map((l) => l.description)).toEqual(['aberto 2'])
    const p2 = await pagina(
      `account_id=${acc.id}&settled=0&limit=1&before=${encodeURIComponent(p1.cursor as string)}`,
    )
    expect(p2.linhas.map((l) => l.description)).toEqual(['aberto 1'])
  })

  it('a visao TODAS AS CONTAS junta as contas numa ordem so', async () => {
    const a = await contaCorrente('Conta A todas')
    const b = await contaCorrente('Conta B todas')
    await createTransaction(env.DB, {
      account_id: a.id,
      amount_cents: -1000,
      purchase_date: '2026-06-01',
      description: 'de A',
    })
    await createTransaction(env.DB, {
      account_id: b.id,
      amount_cents: -1000,
      purchase_date: '2026-06-02',
      description: 'de B',
    })

    const p = await pagina('from=2026-06-01&to=2026-06-30')
    expect(p.linhas.map((l) => l.description)).toEqual(['de B', 'de A'])
  })

  it('?settled invalido devolve 422 invalid_settled nomeando o parametro', async () => {
    const res = await get('/api/transactions?settled=talvez')
    expect(res.status).toBe(422)
    const body = await envelope<null>(res)
    expect(body.notifications[0].code).toBe('invalid_settled')
    expect(body.notifications[0].field).toBe('settled')
  })

  it.each([
    ['duas partes só', '2026-07-28|2026-07-28T13:05:00Z'],
    ['data que nao existe no calendario', '2026-02-30|2026-07-28T13:05:00Z|x'],
    ['timestamp fora do formato', '2026-07-28|ontem|x'],
    ['id vazio', '2026-07-28|2026-07-28T13:05:00Z|'],
  ])('?before com %s devolve 422 invalid_cursor', async (_caso, cursor) => {
    const res = await get(
      `/api/transactions?before=${encodeURIComponent(cursor)}`,
    )
    expect(res.status).toBe(422)
    const body = await envelope<null>(res)
    expect(body.notifications[0].code).toBe('invalid_cursor')
    expect(body.notifications[0].field).toBe('before')
  })

  it('⚠️ o SQL REAL do extrato usa idx_tx_purchase_date e nao ordena em TEMP B-TREE (guard da migration 0008)', async () => {
    // Plano medido sobre a query que `listTransactions` de fato emite (por
    // isso `buildListTransactionsQuery` e exportada): uma copia do SQL aqui
    // deixaria de valer no dia em que a funcao mudasse.
    const { sql, binds } = buildListTransactionsQuery({
      before: {
        purchase_date: '2026-07-28',
        created_at: '2026-07-28T13:05:00Z',
        id: 'x',
      },
      limit: 50,
    })
    const plano = await env.DB.prepare(`EXPLAIN QUERY PLAN ${sql}`)
      .bind(...binds)
      .all<{ detail: string }>()
    const detalhe = plano.results.map((r) => r.detail).join(' | ')

    expect(detalhe).toContain('idx_tx_purchase_date')
    // Sem o indice, o mesmo plano e "SCAN transactions | USE TEMP B-TREE FOR
    // ORDER BY" — MEDIDO removendo a 0008: varre a tabela inteira e ordena
    // tudo, a cada abertura do extrato.
    expect(detalhe).not.toContain('TEMP B-TREE')
  })
})

// ===========================================================================
// PATCH
// ===========================================================================
describe('PATCH /api/transactions/:id', () => {
  it('corrige rotulo em linha livre e devolve a linha inteira', async () => {
    const acc = await contaCorrente('Conta patch')
    const tx = await createTransaction(env.DB, {
      account_id: acc.id,
      amount_cents: -1000,
      purchase_date: '2026-07-10',
      description: 'Mercadinho',
    })

    const res = await send(`/api/transactions/${tx.id}`, 'PATCH', {
      description: 'Mercado do bairro',
      is_business: true,
    })
    expect(res.status).toBe(200)
    const body = await envelope<Transaction>(res)
    expect(body.data.description).toBe('Mercado do bairro')
    // is_business booleano e normalizado pra 1 (licao de routes/installments).
    expect(body.data.is_business).toBe(1)

    // A resposta e a LINHA, nao um eco do corpo: confere contra o banco.
    const linha = await env.DB.prepare(
      'SELECT description, is_business FROM transactions WHERE id = ?',
    )
      .bind(tx.id)
      .first<{ description: string; is_business: number }>()
    expect(linha).toEqual({
      description: 'Mercado do bairro',
      is_business: 1,
    })
  })

  it('mudar purchase_date num cartao RE-DERIVA bill_competence', async () => {
    const card = await createAccount(env.DB, {
      name: 'Cartao patch',
      scope: 'PF',
      kind: 'credit_card',
      closing_day: 25,
      due_day: 5,
    })
    const tx = await createTransaction(env.DB, {
      account_id: card.id,
      amount_cents: -5000,
      purchase_date: '2026-07-28',
      description: 'Steam',
    })
    expect(tx.bill_competence).toBe('2026-08')

    const res = await send(`/api/transactions/${tx.id}`, 'PATCH', {
      purchase_date: '2026-07-10',
    })
    expect(res.status).toBe(200)
    const body = await envelope<Transaction>(res)
    expect(body.data.bill_competence).toBe('2026-07')
  })

  it('campo com rota propria (settled_at) devolve 422 protected_field apontando a rota certa', async () => {
    const acc = await contaCorrente('Conta patch settled')
    const tx = await createTransaction(env.DB, {
      account_id: acc.id,
      amount_cents: -1000,
      purchase_date: '2026-07-10',
      description: 'Padaria',
    })

    const res = await send(`/api/transactions/${tx.id}`, 'PATCH', {
      settled_at: '2026-07-10',
    })
    expect(res.status).toBe(422)
    const body = await envelope<null>(res)
    expect(body.notifications[0].code).toBe('protected_field')
    expect(body.notifications[0].field).toBe('settled_at')
    expect(body.notifications[0].message).toMatch(/settle/)
  })

  it('campo derivado (bill_competence) devolve 422 protected_field', async () => {
    const acc = await contaCorrente('Conta patch competencia')
    const tx = await createTransaction(env.DB, {
      account_id: acc.id,
      amount_cents: -1000,
      purchase_date: '2026-07-10',
      description: 'Farmacia',
    })

    const res = await send(`/api/transactions/${tx.id}`, 'PATCH', {
      bill_competence: '2027-01',
    })
    expect(res.status).toBe(422)
    const body = await envelope<null>(res)
    expect(body.notifications[0].code).toBe('protected_field')
    expect(body.notifications[0].field).toBe('bill_competence')
  })

  it('⚠️ corpo MISTO (campo valido + campo protegido) nao grava NADA', async () => {
    // Aceitar a metade valida responderia 200 pra uma requisicao que fez
    // metade do pedido — falha silenciosa. A recusa roda antes da escrita.
    const acc = await contaCorrente('Conta patch misto')
    const tx = await createTransaction(env.DB, {
      account_id: acc.id,
      amount_cents: -1000,
      purchase_date: '2026-07-10',
      description: 'Descricao original',
    })

    const res = await send(`/api/transactions/${tx.id}`, 'PATCH', {
      description: 'Descricao nova',
      settled_at: '2026-07-10',
    })
    expect(res.status).toBe(422)

    const depois = await env.DB.prepare(
      'SELECT description FROM transactions WHERE id = ?',
    )
      .bind(tx.id)
      .first<{ description: string }>()
    expect(depois?.description).toBe('Descricao original')
  })

  it('editar VALOR de uma parcela devolve 422 protected_field com a mensagem do dominio, sem texto cru do D1', async () => {
    const card = await createAccount(env.DB, {
      name: 'Cartao patch parcela',
      scope: 'PF',
      kind: 'credit_card',
      closing_day: 25,
      due_day: 5,
    })
    const { installments } = await createInstallmentPlan(env.DB, {
      account_id: card.id,
      description: 'Geladeira',
      total_cents: 300000,
      installments_count: 3,
      purchase_date: '2026-07-10',
    })

    const res = await send(
      `/api/transactions/${installments[0].transaction_id}`,
      'PATCH',
      { amount_cents: -1 },
    )
    expect(res.status).toBe(422)
    const body = await envelope<null>(res)
    expect(body.notifications[0].code).toBe('protected_field')
    expect(body.notifications[0].field).toBe('amount_cents')
    expect(body.notifications[0].message).toMatch(/parcela/i)
    expect(body.notifications[0].message).not.toMatch(
      /D1_ERROR|SQLITE|FOREIGN KEY/i,
    )
  })

  it('ROTULO de uma parcela continua editavel (a recusa e so do nivel estrutural)', async () => {
    const card = await createAccount(env.DB, {
      name: 'Cartao patch parcela rotulo',
      scope: 'PF',
      kind: 'credit_card',
      closing_day: 25,
      due_day: 5,
    })
    const { installments } = await createInstallmentPlan(env.DB, {
      account_id: card.id,
      description: 'Fogao',
      total_cents: 300000,
      installments_count: 3,
      purchase_date: '2026-07-10',
    })

    const res = await send(
      `/api/transactions/${installments[1].transaction_id}`,
      'PATCH',
      { description: 'Fogao (corrigido)' },
    )
    expect(res.status).toBe(200)
    const body = await envelope<Transaction>(res)
    expect(body.data.description).toBe('Fogao (corrigido)')
  })

  it('categoria inexistente devolve 422 constraint_violation cozido, sem texto cru do D1', async () => {
    const acc = await contaCorrente('Conta patch fk')
    const tx = await createTransaction(env.DB, {
      account_id: acc.id,
      amount_cents: -1000,
      purchase_date: '2026-07-10',
      description: 'Feira',
    })

    const res = await send(`/api/transactions/${tx.id}`, 'PATCH', {
      category_id: 'categoria-que-nao-existe',
    })
    expect(res.status).toBe(422)
    const body = await envelope<null>(res)
    expect(body.notifications[0].code).toBe('constraint_violation')
    expect(body.notifications[0].message).not.toMatch(
      /D1_ERROR|SQLITE_CONSTRAINT|FOREIGN KEY/i,
    )
  })

  it('purchase_date que nao existe no calendario devolve 422 antes de tocar o banco', async () => {
    const acc = await contaCorrente('Conta patch data')
    const tx = await createTransaction(env.DB, {
      account_id: acc.id,
      amount_cents: -1000,
      purchase_date: '2026-07-10',
      description: 'Uber',
    })

    const res = await send(`/api/transactions/${tx.id}`, 'PATCH', {
      purchase_date: '2026-02-30',
    })
    expect(res.status).toBe(422)
    const body = await envelope<null>(res)
    expect(body.notifications[0].field).toBe('purchase_date')

    const depois = await env.DB.prepare(
      'SELECT purchase_date FROM transactions WHERE id = ?',
    )
      .bind(tx.id)
      .first<{ purchase_date: string }>()
    expect(depois?.purchase_date).toBe('2026-07-10')
  })

  it('id inexistente devolve 404 e corpo nao-JSON devolve 400', async () => {
    const res404 = await send('/api/transactions/nao-existe', 'PATCH', {
      description: 'x',
    })
    expect(res404.status).toBe(404)
    expect((await envelope<null>(res404)).notifications[0].code).toBe(
      'not_found',
    )

    const res400 = await app().request(
      '/api/transactions/qualquer',
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: '{isso nao e json',
      },
      { DB: env.DB },
    )
    expect(res400.status).toBe(400)
    expect((await envelope<null>(res400)).notifications[0].code).toBe(
      'invalid_json',
    )
  })
})

// ===========================================================================
// SETTLE / UNSETTLE
// ===========================================================================
describe('POST /api/transactions/:id/settle e /unsettle', () => {
  it('liquida com a data escolhida e devolve a data usada', async () => {
    const acc = await contaCorrente('Conta settle')
    const tx = await createTransaction(env.DB, {
      account_id: acc.id,
      amount_cents: -1000,
      purchase_date: '2026-07-10',
      description: 'Conta de luz',
    })

    const res = await post(`/api/transactions/${tx.id}/settle`, {
      settled_at: '2026-07-15',
    })
    expect(res.status).toBe(200)
    const body = await envelope<{ id: string; settled_at: string }>(res)
    expect(body.data).toEqual({
      id: tx.id,
      settled: true,
      settled_at: '2026-07-15',
    })

    const linha = await env.DB.prepare(
      'SELECT settled_at FROM transactions WHERE id = ?',
    )
      .bind(tx.id)
      .first<{ settled_at: string }>()
    expect(linha?.settled_at).toBe('2026-07-15')
  })

  it('sem corpo nenhum usa a data de HOJE em Teresina (nunca o UTC cru)', async () => {
    const acc = await contaCorrente('Conta settle hoje')
    const tx = await createTransaction(env.DB, {
      account_id: acc.id,
      amount_cents: -1000,
      purchase_date: '2026-07-10',
      description: 'Internet',
    })

    const res = await app().request(
      `/api/transactions/${tx.id}/settle`,
      { method: 'POST' },
      { DB: env.DB },
    )
    expect(res.status).toBe(200)
    const body = await envelope<{ settled_at: string }>(res)
    const hoje = new Date(Date.now() - 3 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)
    expect(body.data.settled_at).toBe(hoje)
  })

  it('liquidar de novo devolve 404 e NAO sobrescreve a data escolhida', async () => {
    const acc = await contaCorrente('Conta settle 2x')
    const tx = await createTransaction(env.DB, {
      account_id: acc.id,
      amount_cents: -1000,
      purchase_date: '2026-07-10',
      description: 'Agua',
    })
    await post(`/api/transactions/${tx.id}/settle`, {
      settled_at: '2026-07-15',
    })

    const res = await post(`/api/transactions/${tx.id}/settle`, {
      settled_at: '2026-07-20',
    })
    expect(res.status).toBe(404)

    const linha = await env.DB.prepare(
      'SELECT settled_at FROM transactions WHERE id = ?',
    )
      .bind(tx.id)
      .first<{ settled_at: string }>()
    expect(linha?.settled_at).toBe('2026-07-15')
  })

  it('settled_at com timestamp devolve 422 (data pura, nunca instante do clique)', async () => {
    const acc = await contaCorrente('Conta settle timestamp')
    const tx = await createTransaction(env.DB, {
      account_id: acc.id,
      amount_cents: -1000,
      purchase_date: '2026-07-10',
      description: 'Gas',
    })

    const res = await post(`/api/transactions/${tx.id}/settle`, {
      settled_at: '2026-07-15T10:00:00Z',
    })
    expect(res.status).toBe(422)
    const body = await envelope<null>(res)
    expect(body.notifications[0].code).toBe('constraint_violation')
    expect(body.notifications[0].field).toBe('settled_at')
  })

  it('unsettle devolve a linha pra prevista; a segunda vez e 404', async () => {
    const acc = await contaCorrente('Conta unsettle')
    const tx = await createTransaction(env.DB, {
      account_id: acc.id,
      amount_cents: -1000,
      purchase_date: '2026-07-10',
      description: 'Assinatura',
      settled_at: '2026-07-10',
    })

    const res = await post(`/api/transactions/${tx.id}/unsettle`, {})
    expect(res.status).toBe(200)
    expect((await envelope<{ unsettled: boolean }>(res)).data).toEqual({
      id: tx.id,
      unsettled: true,
    })

    const linha = await env.DB.prepare(
      'SELECT settled_at FROM transactions WHERE id = ?',
    )
      .bind(tx.id)
      .first<{ settled_at: string | null }>()
    expect(linha?.settled_at).toBeNull()

    const denovo = await post(`/api/transactions/${tx.id}/unsettle`, {})
    expect(denovo.status).toBe(404)
  })

  it('liquidar id inexistente devolve 404', async () => {
    const res = await post('/api/transactions/nao-existe/settle', {})
    expect(res.status).toBe(404)
  })
})

// ===========================================================================
// DELETE
// ===========================================================================
describe('DELETE /api/transactions/:id', () => {
  it('linha livre: 200 { id, deleted: true } e a linha some', async () => {
    const acc = await contaCorrente('Conta delete livre')
    const tx = await createTransaction(env.DB, {
      account_id: acc.id,
      amount_cents: -1000,
      purchase_date: '2026-07-10',
      description: 'Erro de digitacao',
    })

    const res = await send(`/api/transactions/${tx.id}`, 'DELETE')
    expect(res.status).toBe(200)
    expect((await envelope<{ deleted: boolean }>(res)).data).toEqual({
      id: tx.id,
      deleted: true,
    })

    const restam = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM transactions WHERE id = ?',
    )
      .bind(tx.id)
      .first<{ n: number }>()
    expect(restam?.n).toBe(0)
  })

  it('transferencia: devolve transfer_id + os DOIS ids, e as duas pernas somem', async () => {
    const de = await createAccount(env.DB, {
      name: 'Origem delete',
      scope: 'PF',
      kind: 'checking',
      opening_balance_cents: 500000,
    })
    const para = await contaCorrente('Destino delete')
    const t = await createTransfer(env.DB, {
      from_account_id: de.id,
      to_account_id: para.id,
      amount_cents: 150000,
      date: '2026-07-20',
      description: 'PIX interno',
    })

    const res = await send(`/api/transactions/${t.out.id}`, 'DELETE')
    expect(res.status).toBe(200)
    const body = await envelope<{
      transfer_id: string
      deleted_ids: string[]
    }>(res)
    expect(body.data.transfer_id).toBe(t.transfer_id)
    // saida (negativa) primeiro, mesma convencao de createTransfer.
    expect(body.data.deleted_ids).toEqual([t.out.id, t.inbound.id])

    const restam = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM transactions WHERE transfer_id = ?',
    )
      .bind(t.transfer_id)
      .first<{ n: number }>()
    expect(restam?.n).toBe(0)
  })

  it('parcela: 422 transaction_has_owner com a CLASSE em field, e a parcela CONTINUA la', async () => {
    const card = await createAccount(env.DB, {
      name: 'Cartao delete parcela',
      scope: 'PF',
      kind: 'credit_card',
      closing_day: 25,
      due_day: 5,
    })
    const { plan, installments } = await createInstallmentPlan(env.DB, {
      account_id: card.id,
      description: 'TV',
      total_cents: 300000,
      installments_count: 3,
      purchase_date: '2026-07-10',
    })

    const res = await send(
      `/api/transactions/${installments[1].transaction_id}`,
      'DELETE',
    )
    expect(res.status).toBe(422)
    const body = await envelope<null>(res)
    expect(body.notifications[0].code).toBe('transaction_has_owner')
    expect(body.notifications[0].field).toBe('installment_line')
    expect(body.notifications[0].message).not.toMatch(
      /D1_ERROR|SQLITE|FOREIGN KEY/i,
    )

    // O CASCADE de installments.transaction_id apagaria em SILENCIO — o
    // teste conta as parcelas do plano, nao so o status HTTP.
    const parcelas = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM installments WHERE plan_id = ?',
    )
      .bind(plan.id)
      .first<{ n: number }>()
    expect(parcelas?.n).toBe(3)
  })

  it('id inexistente devolve 404', async () => {
    const res = await send('/api/transactions/nao-existe', 'DELETE')
    expect(res.status).toBe(404)
    expect((await envelope<null>(res)).notifications[0].code).toBe('not_found')
  })
})

// ---------------------------------------------------------------------------
// POST /api/bills/pay — pagar a fatura do cartão.
// ---------------------------------------------------------------------------
describe('POST /api/bills/pay', () => {
  async function cenario() {
    const card = await createAccount(env.DB, {
      name: 'Cartao rota fatura',
      scope: 'PF',
      kind: 'credit_card',
      closing_day: 25,
      due_day: 5,
    })
    const conta = await createAccount(env.DB, {
      name: 'Corrente rota fatura',
      scope: 'PF',
      kind: 'checking',
      opening_balance_cents: 500000,
    })
    await createTransaction(env.DB, {
      account_id: card.id,
      amount_cents: -12000,
      purchase_date: '2026-07-28',
      description: 'Mercado',
    })
    await createTransaction(env.DB, {
      account_id: card.id,
      amount_cents: -8000,
      purchase_date: '2026-07-29',
      description: 'Posto',
    })
    return { card, conta }
  }

  const corpo = (card: { id: string }, conta: { id: string }) => ({
    card_account_id: card.id,
    competence: '2026-08',
    paid_on: '2026-09-05',
    from_account_id: conta.id,
  })

  it('201 com envelope, as duas pernas e a contagem de linhas liquidadas', async () => {
    const { card, conta } = await cenario()
    const res = await post('/api/bills/pay', corpo(card, conta))
    expect(res.status).toBe(201)

    const json = await res.json<{
      ok: boolean
      data: {
        transfer_id: string
        amount_cents: number
        settled_count: number
        competence: string
        out: Transaction
        inbound: Transaction
      }
      notifications: unknown[]
    }>()
    expect(json.ok).toBe(true)
    expect(json.notifications).toEqual([])
    expect(json.data.amount_cents).toBe(20000)
    expect(json.data.settled_count).toBe(2)
    expect(json.data.competence).toBe('2026-08')
    expect(json.data.out.account_id).toBe(conta.id)
    expect(json.data.out.amount_cents).toBe(-20000)
    expect(json.data.inbound.account_id).toBe(card.id)
    expect(json.data.inbound.amount_cents).toBe(20000)

    // As linhas da fatura de fato ficaram liquidadas na data escolhida.
    const abertas = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM transactions WHERE account_id = ? AND bill_competence = '2026-08' AND settled_at IS NULL",
    )
      .bind(card.id)
      .first<{ n: number }>()
    expect(abertas?.n).toBe(0)
  })

  /**
   * ⚠️ Relógio FIXADO em 01:00 UTC = 22h do dia ANTERIOR em Teresina (UTC-3).
   * Sem fixar, a data UTC e a de Teresina coincidem na maior parte do dia e o
   * teste passaria com `new Date().toISOString().slice(0,10)` no lugar de
   * `todayInTeresina()` — MEDIDO: a mutação para UTC cru não matava nada.
   * Com o relógio fixo ela mata, que é o ponto: às 22h o UTC já virou o dia
   * seguinte, e o pagamento cairia no mês errado do fluxo de caixa.
   */
  it('sem paid_on usa a data de HOJE em Teresina, nunca o UTC cru', async () => {
    const { card, conta } = await cenario()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-06T01:00:00Z'))
    try {
      const res = await post('/api/bills/pay', {
        card_account_id: card.id,
        competence: '2026-08',
        from_account_id: conta.id,
      })
      expect(res.status).toBe(201)
      const json = await res.json<{ data: { out: Transaction } }>()
      expect(json.data.out.settled_at).toBe('2026-09-05')
      expect(json.data.out.settled_at).toBe(todayInTeresina())
    } finally {
      vi.useRealTimers()
    }
  })

  it('422 invalid_bill com o motivo em `field` quando a fatura já foi paga', async () => {
    const { card, conta } = await cenario()
    expect((await post('/api/bills/pay', corpo(card, conta))).status).toBe(201)

    const res = await post('/api/bills/pay', corpo(card, conta))
    expect(res.status).toBe(422)
    const json = await res.json<{
      notifications: Array<{ code: string; message: string; field?: string }>
    }>()
    expect(json.notifications[0].code).toBe('invalid_bill')
    expect(json.notifications[0].field).toBe('already_paid')
    expect(json.notifications[0].message).not.toMatch(/SQLITE|D1_ERROR/i)
  })

  it('422 invalid_bill / no_lines para competência sem nenhuma linha', async () => {
    const { card, conta } = await cenario()
    const res = await post('/api/bills/pay', {
      ...corpo(card, conta),
      competence: '2027-04',
    })
    expect(res.status).toBe(422)
    const json = await res.json<{
      notifications: Array<{ code: string; field?: string }>
    }>()
    expect(json.notifications[0].code).toBe('invalid_bill')
    expect(json.notifications[0].field).toBe('no_lines')
  })

  it('422 invalid_account para conta que não é cartão', async () => {
    const { conta } = await cenario()
    const outra = await createAccount(env.DB, {
      name: 'Outra rota',
      scope: 'PF',
      kind: 'checking',
    })
    const res = await post('/api/bills/pay', {
      card_account_id: conta.id,
      competence: '2026-08',
      paid_on: '2026-09-05',
      from_account_id: outra.id,
    })
    expect(res.status).toBe(422)
    const json = await res.json<{ notifications: Array<{ code: string }> }>()
    expect(json.notifications[0].code).toBe('invalid_account')
  })

  it('422 invalid_account quando a origem é o próprio cartão', async () => {
    const { card } = await cenario()
    const res = await post('/api/bills/pay', {
      card_account_id: card.id,
      competence: '2026-08',
      paid_on: '2026-09-05',
      from_account_id: card.id,
    })
    expect(res.status).toBe(422)
    const json = await res.json<{ notifications: Array<{ code: string }> }>()
    expect(json.notifications[0].code).toBe('invalid_account')
  })

  it('422 invalid_bill / amount_mismatch quando o valor informado não bate', async () => {
    const { card, conta } = await cenario()
    const res = await post('/api/bills/pay', {
      ...corpo(card, conta),
      expected_amount_cents: 999,
    })
    expect(res.status).toBe(422)
    const json = await res.json<{
      notifications: Array<{ code: string; field?: string }>
    }>()
    expect(json.notifications[0].code).toBe('invalid_bill')
    expect(json.notifications[0].field).toBe('amount_mismatch')
  })

  it('422 constraint_violation para competência malformada', async () => {
    const { card, conta } = await cenario()
    const res = await post('/api/bills/pay', {
      ...corpo(card, conta),
      competence: '2026-13',
    })
    expect(res.status).toBe(422)
    const json = await res.json<{ notifications: Array<{ code: string }> }>()
    expect(json.notifications[0].code).toBe('constraint_violation')
  })

  it('400 invalid_json para corpo malformado e para campo obrigatório ausente', async () => {
    const { card } = await cenario()
    const cru = await app().request(
      '/api/bills/pay',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      },
      { DB: env.DB },
    )
    expect(cru.status).toBe(400)

    const semConta = await post('/api/bills/pay', {
      card_account_id: card.id,
      competence: '2026-08',
    })
    expect(semConta.status).toBe(400)
    const json = await semConta.json<{
      notifications: Array<{ code: string }>
    }>()
    expect(json.notifications[0].code).toBe('invalid_json')
  })
})
