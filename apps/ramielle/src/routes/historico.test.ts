/**
 * Histórico público do Votaí (`GET /votacao/historico[/:id]`) contra o app
 * real: sem login, só sessões encerradas, sem nenhum dado pessoal, com cache
 * compartilhável e sem escrever nada no D1.
 */
import {
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from 'cloudflare:test'
import { describe, expect, test } from 'vitest'
import app, { type Bindings } from '../index'
import type { HistoricoPagina, HistoricoSessao } from '../domain/historico'
import type { Envelope } from '../lib/envelope'

const DB = env.DB
const VOTAI_PROD = 'https://votai.piluvitu.com.br'
const VOTAI_DEV = 'http://votai.localhost:3333'
const EMAIL_ELEITOR = 'eleitora.secreta@example.com'
const NOME_ELEITOR = 'Eleitora Secreta'
const EMAIL_ADMIN = 'admin.dono@example.com'

function testEnv(extra: Partial<Bindings> = {}): Bindings {
  return {
    DB,
    BETTER_AUTH_URL: 'http://localhost:8787',
    BETTER_AUTH_SECRET: 'a'.repeat(32),
    GOOGLE_CLIENT_ID: 'client-id-de-teste',
    GOOGLE_CLIENT_SECRET: 'client-secret-de-teste',
    ADMIN_EMAILS: EMAIL_ADMIN,
    CORS_ALLOWED_ORIGINS:
      'https://piluvitu.com.br,https://votai.piluvitu.com.br',
    ...extra,
  }
}

function pedir(
  caminho: string,
  headers: Record<string, string> = {},
  e = testEnv(),
) {
  return app.request(caminho, { headers }, e)
}

async function criarUsuario(email: string, name: string): Promise<number> {
  const row = await DB.prepare(
    `INSERT INTO users (google_sub, email, name, picture)
     VALUES (?, ?, ?, 'https://example.com/foto-secreta.png') RETURNING id`,
  )
    .bind(`sub-${email}`, email, name)
    .first<{ id: number }>()
  return row!.id
}

type SessaoSemente = {
  title: string
  status?: 'open' | 'closed'
  createdAt?: string
  closedAt?: string | null
  sortOptions?: Record<string, unknown>
  filmes: string[]
}

async function criarSessao(
  criador: number,
  s: SessaoSemente,
): Promise<{ id: number; filmes: number[] }> {
  const status = s.status ?? 'closed'
  const sessao = await DB.prepare(
    `INSERT INTO voting_sessions
       (title, status, created_by, created_at, closed_at, sort_options_json)
     VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
  )
    .bind(
      s.title,
      status,
      criador,
      s.createdAt ?? '2026-10-01 20:00:00',
      status === 'closed' ? (s.closedAt ?? '2026-10-01T22:00:00Z') : null,
      JSON.stringify(s.sortOptions ?? {}),
    )
    .first<{ id: number }>()
  const filmes: number[] = []
  for (const [i, titulo] of s.filmes.entries()) {
    const f = await DB.prepare(
      `INSERT INTO session_movies (session_id, category, title, type, poster_url, tmdb_id)
       VALUES (?, ?, ?, ?, ?, 1) RETURNING id`,
    )
      .bind(
        sessao!.id,
        i % 2 === 0 ? 'Terror' : 'Comédia',
        titulo,
        i === 1 ? 'serie' : 'filme',
        i === 2 ? null : `https://image.tmdb.org/t/p/w500/${i}.jpg`,
      )
      .first<{ id: number }>()
    filmes.push(f!.id)
  }
  return { id: sessao!.id, filmes }
}

async function votar(sessao: number, user: number, filme: number) {
  await DB.prepare(
    'INSERT INTO votes (session_id, user_id, movie_id) VALUES (?, ?, ?)',
  )
    .bind(sessao, user, filme)
    .run()
}

async function vencedor(sessao: number, filme: number, metodo: string) {
  await DB.prepare(
    'UPDATE voting_sessions SET winner_movie_id = ?, winner_method = ? WHERE id = ?',
  )
    .bind(filme, metodo, sessao)
    .run()
}

async function contar(tabela: string): Promise<number> {
  const r = await DB.prepare(`SELECT COUNT(*) AS n FROM "${tabela}"`).first<{
    n: number
  }>()
  return r?.n ?? 0
}

const CHAVES_PROIBIDAS =
  /^(user.*|.*email.*|.*name|picture|created_by|google_sub|voters?)$/i

function chavesProibidas(valor: unknown, caminho = '$'): string[] {
  if (Array.isArray(valor)) {
    return valor.flatMap((v, i) => chavesProibidas(v, `${caminho}[${i}]`))
  }
  if (valor && typeof valor === 'object') {
    return Object.entries(valor).flatMap(([k, v]) => [
      ...(CHAVES_PROIBIDAS.test(k) ? [`${caminho}.${k}`] : []),
      ...chavesProibidas(v, `${caminho}.${k}`),
    ])
  }
  return []
}

/** Uma sessão de votos e uma roleta de Halloween encerradas, e uma aberta. */
async function semearCenario() {
  const admin = await criarUsuario(EMAIL_ADMIN, 'Admin Dono')
  const eleitora = await criarUsuario(EMAIL_ELEITOR, NOME_ELEITOR)
  const outro = await criarUsuario('outro.eleitor@example.com', 'Outro Eleitor')

  const votos = await criarSessao(admin, {
    title: 'Sexta do filme',
    closedAt: '2026-10-10T23:00:00Z',
    filmes: ['Alien', 'Dark', 'Tubarão'],
  })
  const [alien, dark, tubarao] = votos.filmes as [number, number, number]
  await votar(votos.id, eleitora, dark)
  await votar(votos.id, eleitora, tubarao)
  await votar(votos.id, outro, dark)
  await vencedor(votos.id, dark, 'votes')

  const roleta = await criarSessao(admin, {
    title: 'Halloween 2026',
    closedAt: '2026-10-31 23:30:00',
    sortOptions: { theme: 'halloween', mode: 'roleta' },
    filmes: ['Hereditário', 'Babadook'],
  })
  await vencedor(roleta.id, roleta.filmes[1]!, 'roulette')

  const aberta = await criarSessao(admin, {
    title: 'Ainda votando',
    status: 'open',
    filmes: ['Aberto 1'],
  })
  await votar(aberta.id, eleitora, aberta.filmes[0]!)

  return { votos, roleta, aberta, alien, dark, tubarao }
}

describe('GET /votacao/historico — lista pública', () => {
  test('sem login: só encerradas, mais recente primeiro, com placar e vencedor', async () => {
    const c = await semearCenario()
    const res = await pedir('/votacao/historico')
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<HistoricoPagina>
    expect(body.ok).toBe(true)
    expect(body.notifications).toEqual([])
    const data = body.data!
    expect(data).toMatchObject({
      page: 1,
      page_size: 10,
      total: 2,
      has_more: false,
    })
    expect(data.sessions.map((s) => s.id)).toEqual([c.roleta.id, c.votos.id])
    expect(data.sessions.some((s) => s.id === c.aberta.id)).toBe(false)

    const roleta = data.sessions[0]!
    expect(roleta).toMatchObject({
      title: 'Halloween 2026',
      theme: 'halloween',
      mode: 'roleta',
      winner_movie_id: c.roleta.filmes[1],
      winner_method: 'roulette',
      total_voters: 0,
      total_votes: 0,
      closed_at: '2026-10-31T23:30:00Z',
      created_at: '2026-10-01T20:00:00Z',
    })

    const votos = data.sessions[1]!
    expect(votos).toEqual({
      id: c.votos.id,
      title: 'Sexta do filme',
      created_at: '2026-10-01T20:00:00Z',
      closed_at: '2026-10-10T23:00:00Z',
      theme: null,
      mode: 'votacao',
      winner_movie_id: c.dark,
      winner_method: 'votes',
      total_voters: 2,
      total_votes: 3,
      movies: [
        {
          id: c.dark,
          title: 'Dark',
          type: 'serie',
          category: 'Comédia',
          poster_url: 'https://image.tmdb.org/t/p/w500/1.jpg',
          votes: 2,
        },
        {
          id: c.tubarao,
          title: 'Tubarão',
          type: 'filme',
          category: 'Terror',
          poster_url: '',
          votes: 1,
        },
        {
          id: c.alien,
          title: 'Alien',
          type: 'filme',
          category: 'Terror',
          poster_url: 'https://image.tmdb.org/t/p/w500/0.jpg',
          votes: 0,
        },
      ],
    } satisfies HistoricoSessao)
  })

  test('empate de votos ordena os filmes por id ascendente', async () => {
    const admin = await criarUsuario(EMAIL_ADMIN, 'Admin')
    const s = await criarSessao(admin, {
      title: 'Sem votos',
      filmes: ['B', 'A', 'C'],
    })
    const data = (
      (await (
        await pedir(`/votacao/historico/${s.id}`)
      ).json()) as Envelope<HistoricoSessao>
    ).data!
    expect(data.movies.map((m) => m.id)).toEqual(s.filmes)
    expect(data.winner_movie_id).toBeNull()
    expect(data.winner_method).toBeNull()
  })

  test('ordena por data de encerramento mesmo com formatos misturados (Go x ISO) e desempata por id', async () => {
    const admin = await criarUsuario(EMAIL_ADMIN, 'Admin')
    const manhaIso = await criarSessao(admin, {
      title: 'manhã',
      closedAt: '2026-05-19T09:00:00Z',
      filmes: [],
    })
    const noiteGo = await criarSessao(admin, {
      title: 'noite',
      closedAt: '2026-05-19 21:00:00',
      filmes: [],
    })
    const mesmaHoraA = await criarSessao(admin, {
      title: 'A',
      closedAt: '2026-05-18T10:00:00Z',
      filmes: [],
    })
    const mesmaHoraB = await criarSessao(admin, {
      title: 'B',
      closedAt: '2026-05-18 10:00:00',
      filmes: [],
    })
    const body = (await (
      await pedir('/votacao/historico')
    ).json()) as Envelope<HistoricoPagina>
    expect(body.data!.sessions.map((s) => s.id)).toEqual([
      noiteGo.id,
      manhaIso.id,
      mesmaHoraB.id,
      mesmaHoraA.id,
    ])
  })

  test('pagina de 10 em 10 com total e has_more', async () => {
    const admin = await criarUsuario(EMAIL_ADMIN, 'Admin')
    const ids: number[] = []
    for (let i = 0; i < 12; i++) {
      const dia = String(i + 1).padStart(2, '0')
      ids.push(
        (
          await criarSessao(admin, {
            title: `S${i}`,
            closedAt: `2026-09-${dia}T12:00:00Z`,
            filmes: [],
          })
        ).id,
      )
    }
    await criarSessao(admin, { title: 'aberta', status: 'open', filmes: [] })
    const maisRecentes = [...ids].reverse()

    const p1 = (
      (await (
        await pedir('/votacao/historico?page=1')
      ).json()) as Envelope<HistoricoPagina>
    ).data!
    expect(p1).toMatchObject({
      page: 1,
      page_size: 10,
      total: 12,
      has_more: true,
    })
    expect(p1.sessions.map((s) => s.id)).toEqual(maisRecentes.slice(0, 10))

    const p2 = (
      (await (
        await pedir('/votacao/historico?page=2')
      ).json()) as Envelope<HistoricoPagina>
    ).data!
    expect(p2).toMatchObject({ page: 2, total: 12, has_more: false })
    expect(p2.sessions.map((s) => s.id)).toEqual(maisRecentes.slice(10))

    const p3 = (
      (await (
        await pedir('/votacao/historico?page=3')
      ).json()) as Envelope<HistoricoPagina>
    ).data!
    expect(p3).toMatchObject({
      page: 3,
      total: 12,
      has_more: false,
      sessions: [],
    })
  })

  test('banco vazio: lista vazia, total 0', async () => {
    const body = (await (
      await pedir('/votacao/historico')
    ).json()) as Envelope<HistoricoPagina>
    expect(body.data).toEqual({
      sessions: [],
      page: 1,
      page_size: 10,
      total: 0,
      has_more: false,
    })
  })

  test.each([
    '0',
    '-1',
    'abc',
    '1.5',
    '',
    '01',
    '1e3',
    '1000000',
    '99999999999999999999',
  ])('page=%p é 400 invalid_page', async (page) => {
    const res = await pedir(
      `/votacao/historico?page=${encodeURIComponent(page)}`,
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body).toEqual({
      ok: false,
      data: null,
      notifications: [
        {
          type: 'error',
          code: 'invalid_page',
          message: 'Página inválida.',
          field: 'page',
        },
      ],
    })
    expect(res.headers.get('cache-control')).toBeNull()
  })
})

describe('GET /votacao/historico/:id — uma votação encerrada', () => {
  test('devolve a sessão encerrada no mesmo shape da lista', async () => {
    const c = await semearCenario()
    const lista = (
      (await (
        await pedir('/votacao/historico')
      ).json()) as Envelope<HistoricoPagina>
    ).data!
    const res = await pedir(`/votacao/historico/${c.votos.id}`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<HistoricoSessao>
    expect(body.data).toEqual(lista.sessions.find((s) => s.id === c.votos.id))
  })

  test('sessão aberta é 404 not_found (não vaza placar parcial)', async () => {
    const c = await semearCenario()
    const res = await pedir(`/votacao/historico/${c.aberta.id}`)
    expect(res.status).toBe(404)
    const body = (await res.json()) as Envelope<null>
    expect(body.data).toBeNull()
    expect(body.notifications[0]?.code).toBe('not_found')
    expect(JSON.stringify(body)).not.toContain('Ainda votando')
    expect(res.headers.get('cache-control')).toBeNull()
  })

  test('sessão inexistente é 404 not_found', async () => {
    const res = await pedir('/votacao/historico/999999')
    expect(res.status).toBe(404)
    expect(((await res.json()) as Envelope<null>).notifications[0]?.code).toBe(
      'not_found',
    )
  })

  test.each(['0', '-3', 'abc', '1.5', '01', '99999999999999999999'])(
    'id %p é 400 invalid_id',
    async (id) => {
      const res = await pedir(`/votacao/historico/${id}`)
      expect(res.status).toBe(400)
      expect(
        ((await res.json()) as Envelope<null>).notifications[0]?.code,
      ).toBe('invalid_id')
    },
  )
})

describe('privacidade — nenhum dado pessoal, nada escrito no D1', () => {
  test('lista e detalhe não trazem chave pessoal nem o nome/e-mail/foto de quem votou', async () => {
    const c = await semearCenario()
    for (const caminho of [
      '/votacao/historico',
      `/votacao/historico/${c.votos.id}`,
    ]) {
      const res = await pedir(caminho)
      const texto = await res.text()
      const json = JSON.parse(texto) as unknown
      expect(chavesProibidas(json)).toEqual([])
      for (const segredo of [
        EMAIL_ELEITOR,
        NOME_ELEITOR,
        EMAIL_ADMIN,
        'Admin Dono',
        'foto-secreta',
        'sub-',
      ]) {
        expect(texto).not.toContain(segredo)
      }
    }
  })

  test('mesmo com cookie de sessão no pedido, a rota não cria linha em users/user/session nem devolve Set-Cookie', async () => {
    await semearCenario()
    const antes = await Promise.all(
      ['users', 'user', 'session', 'account'].map(contar),
    )
    for (const caminho of [
      '/votacao/historico',
      '/votacao/historico/1',
      '/votacao/historico?page=x',
    ]) {
      const res = await pedir(caminho, {
        cookie: 'better-auth.session_token=qualquer.coisa',
        origin: VOTAI_PROD,
      })
      expect(res.headers.getSetCookie()).toEqual([])
      await res.arrayBuffer()
    }
    const depois = await Promise.all(
      ['users', 'user', 'session', 'account'].map(contar),
    )
    expect(depois).toEqual(antes)
  })
})

describe('cache e CORS do histórico', () => {
  test('200 sai com Cache-Control público e Vary: Origin', async () => {
    const res = await pedir('/votacao/historico')
    expect(res.headers.get('cache-control')).toBe(
      'public, max-age=60, s-maxage=300',
    )
    expect(res.headers.get('vary')).toContain('Origin')
  })

  test('GET a partir do Votaí de produção: ACAO exato + credentials', async () => {
    const res = await pedir('/votacao/historico', { origin: VOTAI_PROD })
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe(VOTAI_PROD)
    expect(res.headers.get('access-control-allow-credentials')).toBe('true')
  })

  test('preflight a partir do Votaí de produção é aceito', async () => {
    const res = await app.request(
      '/votacao/historico',
      {
        method: 'OPTIONS',
        headers: { origin: VOTAI_PROD, 'access-control-request-method': 'GET' },
      },
      testEnv(),
    )
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe(VOTAI_PROD)
    expect(res.headers.get('access-control-allow-credentials')).toBe('true')
  })

  test('em dev (sem CORS_ALLOWED_ORIGINS) o Votaí local é aceito', async () => {
    const res = await pedir(
      '/votacao/historico',
      { origin: VOTAI_DEV },
      testEnv({ CORS_ALLOWED_ORIGINS: undefined }),
    )
    expect(res.headers.get('access-control-allow-origin')).toBe(VOTAI_DEV)
  })

  test.each([
    'https://votai.piluvitu.com.br.evil.com',
    'https://evil-votai.piluvitu.com.br',
    'http://votai.piluvitu.com.br',
    'https://votai.pilutech.com.br',
  ])(
    'Origin forjado %s não recebe ACAO (a resposta continua pública, mas o browser não a entrega com credenciais)',
    async (origin) => {
      const res = await pedir('/votacao/historico', { origin })
      expect(res.headers.get('access-control-allow-origin')).toBeNull()
    },
  )
})

// Custom Domain: o Worker é a origem e o CDN não guarda o que ele devolve; o
// `s-maxage` só vale pela Cache API. Sem ela, cada pedido anônimo lia o D1.
describe('Cache API e limite do histórico', () => {
  async function pedirComCtx(
    caminho: string,
    headers: Record<string, string> = {},
    e: Bindings = testEnv(),
  ) {
    const ctx = createExecutionContext()
    const res = await app.request(caminho, { headers }, e, ctx)
    const corpo = await res.text()
    await waitOnExecutionContext(ctx)
    return { res, corpo }
  }

  function dbQueConta(): { db: D1Database; consultas: string[] } {
    const consultas: string[] = []
    const db = new Proxy(DB, {
      get(alvo, prop, receptor) {
        if (prop === 'prepare')
          return (sql: string) => {
            consultas.push(sql)
            return alvo.prepare(sql)
          }
        const v = Reflect.get(alvo, prop, receptor) as unknown
        return typeof v === 'function' ? v.bind(alvo) : v
      },
    })
    return { db, consultas }
  }

  test('o 2º pedido da mesma página sai da Cache API, sem ler o D1, mesmo com outro cookie', async () => {
    const admin = await criarUsuario(EMAIL_ADMIN, 'Admin')
    await criarSessao(admin, { title: 'Primeira', filmes: ['X'] })
    const primeiro = await pedirComCtx('/votacao/historico?page=1')
    expect(primeiro.res.status).toBe(200)

    await criarSessao(admin, { title: 'Depois do cache', filmes: [] })
    const { db, consultas } = dbQueConta()
    const segundo = await pedirComCtx(
      '/votacao/historico?page=1',
      { cookie: 'better-auth.session_token=outro', origin: VOTAI_PROD },
      testEnv({ DB: db }),
    )
    expect(segundo.res.status).toBe(200)
    expect(segundo.corpo).toBe(primeiro.corpo)
    expect(consultas).toEqual([])
    expect(segundo.res.headers.get('cache-control')).toBe(
      'public, max-age=60, s-maxage=300',
    )
    expect(segundo.res.headers.get('access-control-allow-origin')).toBe(
      VOTAI_PROD,
    )
    expect(segundo.res.headers.getSetCookie()).toEqual([])
  })

  test('sem `page` e com `page=1` são a mesma entrada do cache', async () => {
    await pedirComCtx('/votacao/historico')
    const { db, consultas } = dbQueConta()
    await pedirComCtx('/votacao/historico?page=1', {}, testEnv({ DB: db }))
    expect(consultas).toEqual([])
  })

  test('o detalhe também sai do cache; o 404 não é guardado', async () => {
    const c = await semearCenario()
    await pedirComCtx(`/votacao/historico/${c.votos.id}`)
    await pedirComCtx(`/votacao/historico/${c.aberta.id}`)
    const { db, consultas } = dbQueConta()
    const e = testEnv({ DB: db })
    expect(
      (await pedirComCtx(`/votacao/historico/${c.votos.id}`, {}, e)).res.status,
    ).toBe(200)
    expect(consultas).toEqual([])
    expect(
      (await pedirComCtx(`/votacao/historico/${c.aberta.id}`, {}, e)).res
        .status,
    ).toBe(404)
    expect(consultas.length).toBeGreaterThan(0)
  })

  test('página além do fim não roda a consulta da página (só a contagem)', async () => {
    const admin = await criarUsuario(EMAIL_ADMIN, 'Admin')
    await criarSessao(admin, { title: 'Única', filmes: [] })
    const { db, consultas } = dbQueConta()
    const res = await pedir(
      '/votacao/historico?page=999999',
      {},
      testEnv({ DB: db }),
    )
    expect(res.status).toBe(200)
    expect(((await res.json()) as Envelope<HistoricoPagina>).data).toEqual({
      sessions: [],
      page: 999999,
      page_size: 10,
      total: 1,
      has_more: false,
    })
    expect(consultas).toHaveLength(1)
    expect(consultas[0]).toMatch(/COUNT\(\*\)/)
  })

  test('sem vaga no limite por IP: 429 rate_limited, sem ler o D1 e sem cache', async () => {
    const chaves: string[] = []
    const { db, consultas } = dbQueConta()
    const res = await pedir(
      '/votacao/historico/1',
      { 'cf-connecting-ip': '203.0.113.7' },
      testEnv({
        DB: db,
        HISTORICO_LIMITE: {
          limit: async ({ key }: { key: string }) => {
            chaves.push(key)
            return { success: false }
          },
        },
      }),
    )
    expect(res.status).toBe(429)
    expect(((await res.json()) as Envelope<null>).notifications[0]?.code).toBe(
      'rate_limited',
    )
    expect(res.headers.get('cache-control')).toBeNull()
    expect(chaves).toEqual(['203.0.113.7'])
    expect(consultas).toEqual([])
  })

  test('com vaga no limite, segue normal', async () => {
    const res = await pedir(
      '/votacao/historico',
      { 'cf-connecting-ip': '203.0.113.8' },
      testEnv({
        HISTORICO_LIMITE: { limit: async () => ({ success: true }) },
      }),
    )
    expect(res.status).toBe(200)
  })
})
