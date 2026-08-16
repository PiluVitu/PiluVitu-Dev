import { applyD1Migrations, env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import app from '../index'
import { categoriesRoutes } from './categories'

type Categoria = { id: string; name: string; kind: string; slug: string | null }

beforeEach(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
})

describe('categoriesRoutes', () => {
  it('esta montado ACIMA do catch-all /api/*', () => {
    const primeiro = app.routes.findIndex((r) =>
      r.path.startsWith('/api/categories'),
    )
    // Ver nota em routes/payees.test.ts: '/api/*' aparece 2x (middleware do
    // Access + catch-all) — pega a ÚLTIMA ocorrência, que é o catch-all real.
    const catchAll = app.routes.reduce(
      (last, r, i) => (r.path === '/api/*' ? i : last),
      -1,
    )
    expect(primeiro).toBeGreaterThanOrEqual(0)
    expect(catchAll).toBeGreaterThanOrEqual(0)
    expect(primeiro).toBeLessThan(catchAll)
  })

  it('devolve as categorias semeadas, incluindo os 4 slugs do gap da PJ', async () => {
    const res = await categoriesRoutes.request('/', undefined, env)
    expect(res.status).toBe(200)

    const body = await res.json<{
      ok: boolean
      data: Categoria[]
      notifications: unknown[]
    }>()
    expect(body.ok).toBe(true)
    expect(body.notifications).toEqual([])
    expect(body.data.length).toBeGreaterThan(0)

    const slugs = body.data.map((c) => c.slug)
    for (const slug of ['das', 'contador', 'inss', 'pro-labore']) {
      expect(slugs).toContain(slug)
    }

    const quitacao = body.data.find((c) => c.slug === 'quitacao-divida')
    expect(quitacao?.kind).toBe('debt_settlement')
  })

  it('filtra por kind e rejeita kind invalido com 400 invalid_query', async () => {
    const ok = await categoriesRoutes.request(
      '/?kind=debt_settlement',
      undefined,
      env,
    )
    const body = await ok.json<{ data: Categoria[] }>()
    expect(body.data.every((c) => c.kind === 'debt_settlement')).toBe(true)

    const ruim = await categoriesRoutes.request('/?kind=lucro', undefined, env)
    expect(ruim.status).toBe(400)
    const erro = await ruim.json<{ notifications: { code?: string }[] }>()
    expect(erro.notifications[0].code).toBe('invalid_query')
  })
})

type Notificacao = { code?: string; message: string; field?: string }

function jsonInit(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }
}

async function notificacao(res: Response): Promise<Notificacao> {
  const body = await res.json<{ ok: boolean; notifications: Notificacao[] }>()
  expect(body.ok).toBe(false)
  return body.notifications[0]
}

// Ids semeados pela migration 0001 (0001:486-497): 'Custos da PJ' é raiz e
// mãe de DAS/Contador/INSS.
const CUSTOS_PJ = '00000000-0000-4000-8000-000000000001'
const DAS = '00000000-0000-4000-8000-000000000002'

describe('POST /api/categories', () => {
  it('cria e devolve 201 com a linha inteira', async () => {
    const res = await categoriesRoutes.request(
      '/',
      jsonInit('POST', { name: 'Mercado', kind: 'expense' }),
      env,
    )
    expect(res.status).toBe(201)
    const body = await res.json<{
      ok: boolean
      data: Categoria & { parent_id: string | null }
      notifications: unknown[]
    }>()
    expect(body.ok).toBe(true)
    expect(body.notifications).toEqual([])
    expect(body.data.name).toBe('Mercado')

    // A oitava categoria existe de verdade no banco — o problema medido em
    // produção era exatamente não conseguir criá-la.
    const row = await env.DB.prepare(
      'SELECT name, kind FROM categories WHERE id = ?',
    )
      .bind(body.data.id)
      .first<{ name: string; kind: string }>()
    expect(row).toEqual({ name: 'Mercado', kind: 'expense' })
  })

  it('IGNORA slug mandado pelo cliente — a linha nasce com slug NULL', async () => {
    const res = await categoriesRoutes.request(
      '/',
      jsonInit('POST', { name: 'Mercado', kind: 'expense', slug: 'das' }),
      env,
    )
    expect(res.status).toBe(201)
    const { data } = await res.json<{ data: Categoria }>()
    expect(data.slug).toBeNull()

    const row = await env.DB.prepare('SELECT slug FROM categories WHERE id = ?')
      .bind(data.id)
      .first<{ slug: string | null }>()
    expect(row?.slug).toBeNull()

    // E o slug 'das' continua onde a migration o semeou — sequestrar a
    // identidade que payDebt()/o gap da PJ procuram era exatamente o risco.
    const dono = await env.DB.prepare(
      'SELECT id FROM categories WHERE slug = ?',
    )
      .bind('das')
      .first<{ id: string }>()
    expect(dono?.id).toBe(DAS)
  })

  it('cria filha de uma raiz e recusa neta com 422', async () => {
    const filha = await categoriesRoutes.request(
      '/',
      jsonInit('POST', {
        name: 'Certificado digital',
        kind: 'expense',
        parent_id: CUSTOS_PJ,
      }),
      env,
    )
    expect(filha.status).toBe(201)

    const neta = await categoriesRoutes.request(
      '/',
      jsonInit('POST', { name: 'Neta', kind: 'expense', parent_id: DAS }),
      env,
    )
    expect(neta.status).toBe(422)
    const n = await notificacao(neta)
    expect(n.code).toBe('constraint_violation')
    expect(n.message).toMatch(/2 níveis/)
    expect(n.message).not.toMatch(/SQLITE|D1_ERROR|FOREIGN KEY/i)
  })

  it('rejeita corpo nao-JSON com 400 invalid_json', async () => {
    const res = await categoriesRoutes.request(
      '/',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      },
      env,
    )
    expect(res.status).toBe(400)
    expect((await notificacao(res)).code).toBe('invalid_json')
  })

  it('rejeita name vazio e kind fora do enum com 422', async () => {
    const semNome = await categoriesRoutes.request(
      '/',
      jsonInit('POST', { name: '   ', kind: 'expense' }),
      env,
    )
    expect(semNome.status).toBe(422)
    expect((await notificacao(semNome)).code).toBe('constraint_violation')

    const kindRuim = await categoriesRoutes.request(
      '/',
      jsonInit('POST', { name: 'X', kind: 'lucro' }),
      env,
    )
    expect(kindRuim.status).toBe(422)
    expect((await notificacao(kindRuim)).field).toBe('kind')
  })

  it('mãe inexistente vira 422 cozido, nunca erro cru do D1', async () => {
    const res = await categoriesRoutes.request(
      '/',
      jsonInit('POST', { name: 'X', kind: 'expense', parent_id: 'nao-existe' }),
      env,
    )
    expect(res.status).toBe(422)
    const n = await notificacao(res)
    expect(n.message).not.toMatch(/SQLITE|D1_ERROR|FOREIGN KEY/i)
  })
})

describe('PUT /api/categories/:id', () => {
  async function criar(nome: string, extra: Record<string, unknown> = {}) {
    const res = await categoriesRoutes.request(
      '/',
      jsonInit('POST', { name: nome, kind: 'expense', ...extra }),
      env,
    )
    const { data } = await res.json<{ data: Categoria }>()
    return data
  }

  it('renomeia com 200', async () => {
    const c = await criar('Mercado')
    const res = await categoriesRoutes.request(
      `/${c.id}`,
      jsonInit('PUT', { name: 'Supermercado', default_scope: 'PF' }),
      env,
    )
    expect(res.status).toBe(200)
    const { data } = await res.json<{
      data: Categoria & { default_scope: string | null }
    }>()
    expect(data.name).toBe('Supermercado')
    expect(data.default_scope).toBe('PF')
  })

  it('id inexistente vira 404 not_found', async () => {
    const res = await categoriesRoutes.request(
      '/nao-existe',
      jsonInit('PUT', { name: 'X' }),
      env,
    )
    expect(res.status).toBe(404)
    expect((await notificacao(res)).code).toBe('not_found')
  })

  it('RECUSA kind com 422 protected_field — e nada é gravado', async () => {
    const c = await criar('Mercado')
    const res = await categoriesRoutes.request(
      `/${c.id}`,
      jsonInit('PUT', { name: 'Renomeada', kind: 'income' }),
      env,
    )
    expect(res.status).toBe(422)
    const n = await notificacao(res)
    expect(n.code).toBe('protected_field')
    expect(n.field).toBe('kind')

    // A recusa vale pro corpo INTEIRO: o `name` que veio junto também não
    // entrou. 200 com metade do pedido feito seria a falha silenciosa.
    const row = await env.DB.prepare(
      'SELECT name, kind FROM categories WHERE id = ?',
    )
      .bind(c.id)
      .first<{ name: string; kind: string }>()
    expect(row).toEqual({ name: 'Mercado', kind: 'expense' })
  })

  it('RECUSA slug e archived_at com 422 protected_field', async () => {
    const c = await criar('Mercado')

    const comSlug = await categoriesRoutes.request(
      `/${c.id}`,
      jsonInit('PUT', { slug: 'das' }),
      env,
    )
    expect(comSlug.status).toBe(422)
    expect((await notificacao(comSlug)).field).toBe('slug')

    const comArquivo = await categoriesRoutes.request(
      `/${c.id}`,
      jsonInit('PUT', { archived_at: null }),
      env,
    )
    expect(comArquivo.status).toBe(422)
    expect((await notificacao(comArquivo)).field).toBe('archived_at')
  })

  it('RECUSA hierarquia de 3 níveis e o ciclo A→B→A com 422', async () => {
    const solta = await criar('Solta')
    const tresNiveis = await categoriesRoutes.request(
      `/${solta.id}`,
      jsonInit('PUT', { parent_id: DAS }),
      env,
    )
    expect(tresNiveis.status).toBe(422)
    expect((await notificacao(tresNiveis)).message).toMatch(/2 níveis/)

    const a = await criar('A')
    await criar('B', { parent_id: a.id })
    const b = await env.DB.prepare('SELECT id FROM categories WHERE name = ?')
      .bind('B')
      .first<{ id: string }>()

    const ciclo = await categoriesRoutes.request(
      `/${a.id}`,
      jsonInit('PUT', { parent_id: b!.id }),
      env,
    )
    expect(ciclo.status).toBe(422)
    expect((await notificacao(ciclo)).message).toMatch(/3º nível/)
  })

  it('rejeita corpo nao-JSON com 400 invalid_json', async () => {
    const c = await criar('Mercado')
    const res = await categoriesRoutes.request(
      `/${c.id}`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: '{',
      },
      env,
    )
    expect(res.status).toBe(400)
    expect((await notificacao(res)).code).toBe('invalid_json')
  })
})

describe('POST /api/categories/:id/archive', () => {
  it('arquiva com 200 e some do GET; a segunda vez é 404', async () => {
    const criada = await categoriesRoutes.request(
      '/',
      jsonInit('POST', { name: 'Mercado', kind: 'expense' }),
      env,
    )
    const { data } = await criada.json<{ data: Categoria }>()

    const res = await categoriesRoutes.request(
      `/${data.id}/archive`,
      { method: 'POST' },
      env,
    )
    expect(res.status).toBe(200)
    const body = await res.json<{ data: { id: string; archived: boolean } }>()
    expect(body.data).toEqual({ id: data.id, archived: true })

    const lista = await categoriesRoutes.request('/', undefined, env)
    const { data: rows } = await lista.json<{ data: Categoria[] }>()
    expect(rows.map((r) => r.name)).not.toContain('Mercado')

    const denovo = await categoriesRoutes.request(
      `/${data.id}/archive`,
      { method: 'POST' },
      env,
    )
    expect(denovo.status).toBe(404)
    expect((await notificacao(denovo)).code).toBe('not_found')
  })

  it('id inexistente vira 404', async () => {
    const res = await categoriesRoutes.request(
      '/nao-existe/archive',
      { method: 'POST' },
      env,
    )
    expect(res.status).toBe(404)
  })

  it('RECUSA mãe com filha ativa com 422 — e a mãe continua ativa', async () => {
    const res = await categoriesRoutes.request(
      `/${CUSTOS_PJ}/archive`,
      { method: 'POST' },
      env,
    )
    expect(res.status).toBe(422)
    const n = await notificacao(res)
    expect(n.code).toBe('constraint_violation')
    expect(n.message).toMatch(/filhas primeiro/)

    const row = await env.DB.prepare(
      'SELECT archived_at FROM categories WHERE id = ?',
    )
      .bind(CUSTOS_PJ)
      .first<{ archived_at: string | null }>()
    expect(row?.archived_at).toBeNull()
  })

  it('NUNCA apaga: a linha segue no banco, só carimbada', async () => {
    const criada = await categoriesRoutes.request(
      '/',
      jsonInit('POST', { name: 'Mercado', kind: 'expense' }),
      env,
    )
    const { data } = await criada.json<{ data: Categoria }>()
    await categoriesRoutes.request(
      `/${data.id}/archive`,
      { method: 'POST' },
      env,
    )

    // Um DELETE aqui teria SUCESSO e descategorizado o histórico
    // (transactions.category_id é ON DELETE SET NULL) sem erro nenhum.
    const row = await env.DB.prepare(
      'SELECT id, archived_at FROM categories WHERE id = ?',
    )
      .bind(data.id)
      .first<{ id: string; archived_at: string | null }>()
    expect(row?.id).toBe(data.id)
    expect(row?.archived_at).toEqual(expect.any(String))
  })
})
