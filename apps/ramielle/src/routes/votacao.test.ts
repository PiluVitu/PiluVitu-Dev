/**
 * Testes de `GET /votacao/sessions` e `GET /votacao/sessions/{id}` contra o
 * app REAL (`../index`), mesmo padrão de `routes/auth.test.ts`: cookie de
 * sessão genuíno via uma segunda instância `betterAuth()` (emailAndPassword,
 * técnica de teste — produção é só Google), D1 semeado direto via INSERT
 * (esta fatia não tem `POST /sessions` ainda, ver o plano).
 */
import { env } from 'cloudflare:test'
import { betterAuth } from 'better-auth'
import { describe, expect, test } from 'vitest'
import app, { type Bindings } from '../index'
import type { Envelope } from '../lib/envelope'
import { sessionToWire, type VotingSessionRow } from '../lib/wire'
import goParity from './__fixtures__/go-parity.json'

const DB = env.DB
const BASE_URL_TESTE = 'http://localhost:8787'
const SECRET_TESTE = 'a'.repeat(32)

function testEnv(adminEmails = ''): Bindings {
  return {
    DB,
    BETTER_AUTH_URL: BASE_URL_TESTE,
    BETTER_AUTH_SECRET: SECRET_TESTE,
    GOOGLE_CLIENT_ID: 'client-id-de-teste',
    GOOGLE_CLIENT_SECRET: 'client-secret-de-teste',
    ADMIN_EMAILS: adminEmails,
  }
}

// Mesmo padrão de src/lib/session.test.ts e src/routes/auth.test.ts — chamada
// direta a auth.api.signUpEmail() não passa pelo onRequest do router, não é
// contada contra o rate limit.
async function cookieDeSessaoValido(
  email: string,
  name: string,
): Promise<string> {
  const authDeTeste = betterAuth({
    database: DB,
    baseURL: BASE_URL_TESTE,
    secret: SECRET_TESTE,
    emailAndPassword: { enabled: true },
  })

  const cadastro = await authDeTeste.api.signUpEmail({
    body: { email, password: 'senha-forte-123', name },
    asResponse: true,
  })
  const cookie = cadastro.headers.getSetCookie()[0]?.split(';')[0]
  if (!cookie) throw new Error('signUpEmail não devolveu cookie de sessão')
  return cookie
}

/**
 * Devolve o `id` da linha `users` (domínio da votação) correspondente ao
 * cookie — obtido via `GET /auth/me` (que já dispara `upsertVotacaoUser`),
 * em vez de adivinhar a PK. É o mesmo `id` que `requireAuth` põe em
 * `c.get('votacaoUser').id` durante as chamadas às rotas de votação.
 */
async function votacaoUserId(cookie: string): Promise<number> {
  const res = await app.request('/auth/me', { headers: { cookie } }, testEnv())
  const body = (await res.json()) as Envelope<{ id: number }>
  if (body.data === null) throw new Error('esperava /auth/me autenticado')
  return body.data.id
}

// --------------------------------------------------------------------------
// Helpers de fixture — semeiam o D1 direto via INSERT (mesmo padrão de
// domain/sessions.test.ts). `beforeEach` global (test-setup.ts) já reseta o
// banco entre testes.
// --------------------------------------------------------------------------

async function novoUsuario(googleSub: string): Promise<number> {
  const row = await DB.prepare(
    `INSERT INTO users (google_sub, email, name, is_admin) VALUES (?, ?, ?, 0) RETURNING id`,
  )
    .bind(googleSub, `${googleSub}@example.com`, `User ${googleSub}`)
    .first<{ id: number }>()
  if (row === null) throw new Error('RETURNING id não devolveu linha')
  return row.id
}

async function novaSessaoComId(row: {
  id: number
  title: string
  status: 'open' | 'closed'
  createdBy: number
  createdAt: string
  closedAt?: string | null
  winnerMovieId?: number | null
  winnerMethod?: string | null
  sortOptionsJson?: string
}): Promise<void> {
  await DB.prepare(
    `INSERT INTO voting_sessions
       (id, title, status, created_by, created_at, closed_at, winner_movie_id, winner_method, sort_options_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      row.id,
      row.title,
      row.status,
      row.createdBy,
      row.createdAt,
      row.closedAt ?? null,
      row.winnerMovieId ?? null,
      row.winnerMethod ?? null,
      row.sortOptionsJson ?? '{}',
    )
    .run()
}

async function novaSessao(
  createdBy: number,
  opts: { title?: string; createdAt?: string } = {},
): Promise<number> {
  const { title = 'Sessão de teste', createdAt = '2026-05-19 12:00:00' } = opts
  const r = await DB.prepare(
    `INSERT INTO voting_sessions (title, status, created_by, created_at)
     VALUES (?, 'open', ?, ?)
     RETURNING id`,
  )
    .bind(title, createdBy, createdAt)
    .first<{ id: number }>()
  if (r === null) throw new Error('RETURNING id não devolveu linha')
  return r.id
}

async function novoFilmeComId(row: {
  id: number
  sessionId: number
  category: string
  title: string
  type: 'filme' | 'serie'
  posterUrl?: string | null
  tmdbId?: number | null
  wasWatched?: boolean
  sheetNumber?: number | null
}): Promise<void> {
  await DB.prepare(
    `INSERT INTO session_movies
       (id, session_id, category, title, type, poster_url, tmdb_id, was_watched, sheet_number)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      row.id,
      row.sessionId,
      row.category,
      row.title,
      row.type,
      row.posterUrl ?? null,
      row.tmdbId ?? null,
      row.wasWatched ? 1 : 0,
      row.sheetNumber ?? null,
    )
    .run()
}

async function votar(
  sessionId: number,
  userId: number,
  movieId: number,
): Promise<void> {
  await DB.prepare(
    `INSERT INTO votes (session_id, user_id, movie_id) VALUES (?, ?, ?)`,
  )
    .bind(sessionId, userId, movieId)
    .run()
}

type SessionsListData = { sessions: unknown[] }

// --------------------------------------------------------------------------

describe('GET /votacao/sessions', () => {
  test('sem cookie responde 401 not_authenticated — prova que requireAuth está montado nesta rota, não o catch-all', async () => {
    const res = await app.request('/votacao/sessions', {}, testEnv())
    expect(res.status).toBe(401)
    const body = (await res.json()) as Envelope<null>
    // ⚠️ Discrimina de propósito contra o 404 `not_found` do catch-all
    // genérico (index.ts) — se a rota não estivesse montada, cairia lá, com
    // OUTRO código. Isto é a prova "por execução" pedida no brief.
    expect(body.notifications[0]?.code).toBe('not_authenticated')
  })

  test('happy path — 200, ordenada por id DESC, shape PascalCase via sessionToWire', async () => {
    const criador = await novoUsuario('sub-list-criador')
    // Inserido na mesma ordem cronológica do created_at — id e created_at
    // crescem juntos, então este teste sozinho não discrimina id DESC de
    // created_at DESC (quem discrimina é o teste seguinte, de propósito).
    const antiga = await novaSessao(criador, {
      title: 'Antiga',
      createdAt: '2026-01-01 00:00:00',
    })
    const nova = await novaSessao(criador, {
      title: 'Nova',
      createdAt: '2026-06-01 00:00:00',
    })

    const cookie = await cookieDeSessaoValido('lista@example.com', 'Quem Lista')
    const res = await app.request(
      '/votacao/sessions',
      { headers: { cookie } },
      testEnv(),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<SessionsListData>
    expect(body.ok).toBe(true)

    const SESSION_COLUMNS = `id, title, status, created_by, created_at, closed_at, winner_movie_id, winner_method, sort_options_json`
    const rowNova = await DB.prepare(
      `SELECT ${SESSION_COLUMNS} FROM voting_sessions WHERE id = ?`,
    )
      .bind(nova)
      .first<VotingSessionRow>()
    const rowAntiga = await DB.prepare(
      `SELECT ${SESSION_COLUMNS} FROM voting_sessions WHERE id = ?`,
    )
      .bind(antiga)
      .first<VotingSessionRow>()
    if (rowNova === null || rowAntiga === null) {
      throw new Error('semeadura não encontrada de volta no D1')
    }

    expect(body.data?.sessions).toEqual([
      sessionToWire(rowNova),
      sessionToWire(rowAntiga),
    ])
  })

  // ⚠️ Fix round 1 (Finding 1): prova PONTA A PONTA (via HTTP, não só no
  // domínio) que a ordenação é por `id DESC` — o teste acima não
  // discrimina entre `id DESC` e `created_at DESC` porque as duas colunas
  // crescem juntas ali. Aqui `created_at` é gravado EXPLICITAMENTE fora da
  // ordem do `id` (id=1 com data mais recente, id=2 com data mais antiga)
  // — o mesmo cenário que a fatia ④ (importação do histórico da Go) vai
  // produzir de verdade. Só passa se a rota usar `id DESC`.
  test('ordena por id DESC mesmo quando created_at diverge da ordem de id (paridade com sessions.go:52)', async () => {
    const criador = await novoUsuario('sub-list-ordem-diverge')
    await novaSessaoComId({
      id: 1,
      title: 'Id baixo, created_at recente',
      status: 'open',
      createdBy: criador,
      createdAt: '2026-06-01 00:00:00',
    })
    await novaSessaoComId({
      id: 2,
      title: 'Id alto, created_at antigo',
      status: 'open',
      createdBy: criador,
      createdAt: '2026-01-01 00:00:00',
    })

    const cookie = await cookieDeSessaoValido('diverge@example.com', 'Diverge')
    const res = await app.request(
      '/votacao/sessions',
      { headers: { cookie } },
      testEnv(),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<{ sessions: { ID: number }[] }>
    // id DESC ⇒ [2, 1]. Com created_at DESC (o bug corrigido) seria [1, 2].
    expect(body.data?.sessions.map((s) => s.ID)).toEqual([2, 1])
  })

  test('limit/offset funcionam (paginação)', async () => {
    const criador = await novoUsuario('sub-list-pag-criador')
    const ids: number[] = []
    for (let i = 0; i < 5; i++) {
      ids.push(
        await novaSessao(criador, {
          title: `S${i}`,
          createdAt: `2026-01-0${i + 1} 00:00:00`,
        }),
      )
    }
    // ids[4] tem o maior id (inserido por último).
    const cookie = await cookieDeSessaoValido('pag@example.com', 'Paginador')

    const res = await app.request(
      '/votacao/sessions?limit=2&offset=1',
      { headers: { cookie } },
      testEnv(),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<{
      sessions: { ID: number }[]
    }>
    expect(body.data?.sessions.map((s) => s.ID)).toEqual([ids[3], ids[2]])
  })

  test('limit/offset malformados caem no default (20/0) — não dá 400 (paridade com atoiOr do Go)', async () => {
    const criador = await novoUsuario('sub-list-malformado-criador')
    for (let i = 0; i < 3; i++) {
      await novaSessao(criador, {
        title: `M${i}`,
        createdAt: `2026-02-0${i + 1} 00:00:00`,
      })
    }
    const cookie = await cookieDeSessaoValido(
      'malformado@example.com',
      'Malformado',
    )

    const res = await app.request(
      '/votacao/sessions?limit=abc&offset=xyz',
      { headers: { cookie } },
      testEnv(),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<SessionsListData>
    expect(body.ok).toBe(true)
    expect(body.data?.sessions).toHaveLength(3)
  })
})

describe('GET /votacao/sessions/:id', () => {
  test('sem cookie responde 401 not_authenticated — prova que requireAuth está montado nesta rota', async () => {
    const res = await app.request('/votacao/sessions/1', {}, testEnv())
    expect(res.status).toBe(401)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('not_authenticated')
  })

  test('id não numérico responde 400 invalid_id', async () => {
    const cookie = await cookieDeSessaoValido(
      'invalido@example.com',
      'Inválido',
    )
    const res = await app.request(
      '/votacao/sessions/abc',
      { headers: { cookie } },
      testEnv(),
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('invalid_id')
  })

  test('id inexistente (mas numérico) responde 404 session_not_found', async () => {
    const cookie = await cookieDeSessaoValido(
      'inexistente@example.com',
      'Inexistente',
    )
    const res = await app.request(
      '/votacao/sessions/999999',
      { headers: { cookie } },
      testEnv(),
    )
    expect(res.status).toBe(404)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('session_not_found')
  })

  // ⚠️ O detalhe de paridade #2 do brief: GetSession do Go só faz ParseInt,
  // NÃO recusa id <= 0 (diferente de outras rotas, que usam parseID). id=0
  // tem que cair em 404, nunca em 400.
  test('id=0 responde 404 session_not_found, NUNCA 400 invalid_id (GetSession do Go não recusa id<=0)', async () => {
    const cookie = await cookieDeSessaoValido('zero@example.com', 'Zero')
    const res = await app.request(
      '/votacao/sessions/0',
      { headers: { cookie } },
      testEnv(),
    )
    expect(res.status).toBe(404)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('session_not_found')
  })

  test('id negativo também é aceito como formato válido e cai em 404 (mesma paridade)', async () => {
    const cookie = await cookieDeSessaoValido('negativo@example.com', 'Neg')
    const res = await app.request(
      '/votacao/sessions/-5',
      { headers: { cookie } },
      testEnv(),
    )
    expect(res.status).toBe(404)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('session_not_found')
  })

  test('happy path — session/movies batem EXATAMENTE com o vetor dourado da Task 1; has_voted:false, voted_movie_ids:[]', async () => {
    // Valores idênticos aos de wire.test.ts (linhaSessionAberta / linhaFilmeSemTmdb
    // / linhaFilmeComTmdb) — já provados iguais a goParity.sessionAberta /
    // filmeSemTmdb / filmeComTmdb naquele arquivo. Aqui a prova é PONTA A
    // PONTA: via HTTP real, não chamando sessionToWire/movieToWire direto.
    const criador = await novoUsuario('sub-golden-criador') // vira id=1 (DB fresco por teste)
    await novaSessaoComId({
      id: 7,
      title: 'Sessão de maio',
      status: 'open',
      createdBy: criador,
      createdAt: '2026-05-19 12:00:00',
    })
    await novoFilmeComId({
      id: 3,
      sessionId: 7,
      category: 'comedia',
      title: 'Um Filme Qualquer',
      type: 'filme',
      posterUrl: null,
      tmdbId: null,
      wasWatched: false,
      sheetNumber: null,
    })
    await novoFilmeComId({
      id: 4,
      sessionId: 7,
      category: 'terror',
      title: 'Outro Filme',
      type: 'serie',
      posterUrl: 'https://image.tmdb.org/t/p/w500/abc123.jpg',
      tmdbId: 603,
      wasWatched: true,
      sheetNumber: 12,
    })

    const cookie = await cookieDeSessaoValido('golden@example.com', 'Golden')
    const res = await app.request(
      '/votacao/sessions/7',
      { headers: { cookie } },
      testEnv(),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<{
      session: unknown
      movies: unknown[]
      has_voted: boolean
      voted_movie_ids: number[]
    }>
    expect(body.ok).toBe(true)
    // ⚠️ Só bate se createdBy === 1 (o vetor dourado fixa CreatedBy:1).
    expect(criador).toBe(1)

    expect(body.data?.session).toEqual(goParity.sessionAberta)
    expect(body.data?.movies).toEqual([
      goParity.filmeSemTmdb,
      goParity.filmeComTmdb,
    ])
    expect(body.data?.has_voted).toBe(false)
    expect(body.data?.voted_movie_ids).toEqual([])
  })

  test('has_voted:true e voted_movie_ids preenchido (ordenado asc) quando o usuário votou', async () => {
    const criador = await novoUsuario('sub-votou-criador')
    const sessionId = await novaSessao(criador)
    const m1Row = await DB.prepare(
      `INSERT INTO session_movies (session_id, category, title, type) VALUES (?, 'acao', 'A', 'filme') RETURNING id`,
    )
      .bind(sessionId)
      .first<{ id: number }>()
    const m2Row = await DB.prepare(
      `INSERT INTO session_movies (session_id, category, title, type) VALUES (?, 'comedia', 'B', 'filme') RETURNING id`,
    )
      .bind(sessionId)
      .first<{ id: number }>()
    if (m1Row === null || m2Row === null) {
      throw new Error('RETURNING id não devolveu linha')
    }

    const cookie = await cookieDeSessaoValido('votante@example.com', 'Votante')
    const userId = await votacaoUserId(cookie)
    // Vota em m2 antes de m1 — a ordem de resposta tem que ser asc por id.
    await votar(sessionId, userId, m2Row.id)
    await votar(sessionId, userId, m1Row.id)

    const res = await app.request(
      `/votacao/sessions/${sessionId}`,
      { headers: { cookie } },
      testEnv(),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<{
      has_voted: boolean
      voted_movie_ids: number[]
    }>
    expect(body.data?.has_voted).toBe(true)
    expect(body.data?.voted_movie_ids).toEqual([m1Row.id, m2Row.id])
  })

  test('erro ao ler os votos é ENGOLIDO — a sessão ainda é devolvida com voted_movie_ids:[] (paridade com o Go)', async () => {
    const criador = await novoUsuario('sub-engole-criador')
    const sessionId = await novaSessao(criador, { title: 'Sessão resiliente' })

    const cookie = await cookieDeSessaoValido('engole@example.com', 'Engole')

    // Shim que quebra SÓ a query de votos ("FROM votes") — todo o resto
    // (getSession, requireAuth: getSession/account/users) passa direto pro
    // D1 real. Prova que o try/catch de routes/votacao.ts engole o erro
    // deste SELECT específico, igual ao `if ids, err := ...; err == nil` do
    // Go — sem isto a rota devolveria 500 cru em vez de 200 com [].
    const dbComVotosQuebrados = {
      prepare: (sql: string) => {
        if (sql.includes('FROM votes')) {
          throw new Error('D1_ERROR: no such table: votes (simulado)')
        }
        return DB.prepare(sql)
      },
      batch: DB.batch.bind(DB),
      exec: DB.exec.bind(DB),
      withSession: DB.withSession.bind(DB),
      dump: DB.dump.bind(DB),
    } as unknown as D1Database

    const res = await app.request(
      `/votacao/sessions/${sessionId}`,
      { headers: { cookie } },
      { ...testEnv(), DB: dbComVotosQuebrados },
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<{
      session: { Title: string }
      has_voted: boolean
      voted_movie_ids: number[]
    }>
    expect(body.ok).toBe(true)
    expect(body.data?.session.Title).toBe('Sessão resiliente')
    expect(body.data?.has_voted).toBe(false)
    expect(body.data?.voted_movie_ids).toEqual([])
  })

  test('movies vazio quando a sessão não tem filme nenhum — array [], nunca ausente', async () => {
    const criador = await novoUsuario('sub-sem-filme-criador')
    const sessionId = await novaSessao(criador)
    const cookie = await cookieDeSessaoValido('semfilme@example.com', 'S/F')

    const res = await app.request(
      `/votacao/sessions/${sessionId}`,
      { headers: { cookie } },
      testEnv(),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<{ movies: unknown[] }>
    expect(body.data?.movies).toEqual([])
  })
})
