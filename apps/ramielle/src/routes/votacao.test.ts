/**
 * Testes de `GET /votacao/sessions` e `GET /votacao/sessions/{id}` contra o
 * app REAL (`../index`), mesmo padrão de `routes/auth.test.ts`: cookie de
 * sessão genuíno via uma segunda instância `betterAuth()` (emailAndPassword,
 * técnica de teste — produção é só Google), D1 semeado direto via INSERT
 * (esta fatia não tem `POST /sessions` ainda, ver o plano).
 */
import { env } from 'cloudflare:test'
import { betterAuth } from 'better-auth'
import { describe, expect, test, vi } from 'vitest'
import app, { type Bindings } from '../index'
import { hexToBytes } from '../domain/tiebreak'
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

  // ⚠️ M3 (revisão final): um `offset` de 20 dígitos — fora da faixa do
  // int64 — tem que cair no DEFAULT, exatamente como uma string
  // não-numérica, não virar um `number` JS impreciso usado como offset
  // real. `atoiOr` do Go usa `strconv.Atoi` (`sessions.go:199-208`), que
  // em plataformas 64-bit falha com `ErrRange` pro mesmo cenário — a MESMA
  // falha de parse de uma string "xyz". Sem o teto de faixa em
  // `parseInt64`, este offset passava no regex `\d+`, virava um número
  // impreciso, e produzia uma página (quase certamente) vazia em vez do
  // default.
  test('offset fora da faixa do int64 cai no default (0), não num offset impreciso (M3)', async () => {
    const criador = await novoUsuario('sub-list-offset-gigante-criador')
    for (let i = 0; i < 3; i++) {
      await novaSessao(criador, {
        title: `G${i}`,
        createdAt: `2026-04-0${i + 1} 00:00:00`,
      })
    }
    const cookie = await cookieDeSessaoValido(
      'offsetgigante@example.com',
      'Offset Gigante',
    )

    const res = await app.request(
      '/votacao/sessions?offset=99999999999999999999',
      { headers: { cookie } },
      testEnv(),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<SessionsListData>
    expect(body.ok).toBe(true)
    // offset:0 (default) devolve a página inteira das 3 sessões — um
    // offset gigante usado cru devolveria uma página vazia.
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

  // ⚠️ M3 (revisão final): esta rota aceita `id <= 0` (ver o teste "id=0"
  // abaixo), mas AINDA recusa um id fora da faixa do int64 — `strconv.
  // ParseInt(idStr, 10, 64)` do Go falha com `ErrRange` pra um id de 20
  // dígitos, a MESMA falha de parse de uma string não-numérica, não um
  // `number` válido só "grande". Sem o teto de faixa em `parseInt64`, isto
  // passava no regex `\d+`, virava um `number` JS impreciso, e caía em 404
  // `session_not_found` (não bate nenhuma linha) em vez do 400 `invalid_id`
  // que o Go devolve de verdade.
  test('id fora da faixa do int64 (20 dígitos) responde 400 invalid_id, NUNCA 404 (M3 — strconv.ParseInt falha com ErrRange)', async () => {
    const cookie = await cookieDeSessaoValido(
      'idgigante@example.com',
      'Id Gigante',
    )
    const res = await app.request(
      '/votacao/sessions/99999999999999999999',
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

  // ⚠️ M1 (revisão final): o Go TAMBÉM engole este erro — `movies, _ :=
  // h.deps.Store.GetSessionMovies(...)` (sessions.go:182) ignora o `error`
  // e segue com `movies` no zero value de slice Go (`nil`), que
  // `json.Marshal` serializa como `null`. Antes desta task, `routes/
  // votacao.ts` não tinha `try/catch` nenhum em volta deste SELECT — uma
  // falha aqui devolvia 500 cru em vez do 200 com `movies:null` que o Go
  // devolve de verdade. Shim que quebra SÓ a query de filmes ("FROM
  // session_movies") — todo o resto (getSession, votos) passa direto pro
  // D1 real.
  test('erro ao ler os filmes é ENGOLIDO — a sessão ainda é devolvida com movies:null (M1 — paridade com o Go)', async () => {
    const criador = await novoUsuario('sub-m1-criador')
    const sessionId = await novaSessao(criador, {
      title: 'Sessão resiliente M1',
    })

    const cookie = await cookieDeSessaoValido('m1-movies@example.com', 'M1')

    const dbComMoviesQuebrado = {
      prepare: (sql: string) => {
        if (sql.includes('FROM session_movies')) {
          throw new Error('D1_ERROR: no such table: session_movies (simulado)')
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
      { ...testEnv(), DB: dbComMoviesQuebrado },
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<{
      session: { Title: string }
      movies: unknown
      has_voted: boolean
      voted_movie_ids: number[]
    }>
    expect(body.ok).toBe(true)
    expect(body.data?.session.Title).toBe('Sessão resiliente M1')
    // NULL, não [] — o zero value de slice do Go serializa `null`; diferente
    // de `voted_movie_ids` (o Go inicializa `[]int64{}` ANTES do try, ver o
    // teste "erro ao ler os votos" acima — os dois campos engolem o erro,
    // mas com resultados DIFERENTES no JSON, de propósito).
    expect(body.data?.movies).toBeNull()
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

async function novoFilmeAuto(
  sessionId: number,
  category: string,
  title = 'Filme',
): Promise<number> {
  const row = await DB.prepare(
    `INSERT INTO session_movies (session_id, category, title, type) VALUES (?, ?, ?, 'filme') RETURNING id`,
  )
    .bind(sessionId, category, title)
    .first<{ id: number }>()
  if (row === null) throw new Error('RETURNING id não devolveu linha')
  return row.id
}

async function postVoto(
  path: string,
  cookie: string | null,
  body: unknown,
): Promise<Response> {
  return await app.request(
    path,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(cookie === null ? {} : { cookie }),
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    },
    testEnv(),
  )
}

describe('POST /votacao/sessions/:id/votes', () => {
  test('sem cookie responde 401 not_authenticated MESMO com id inválido no path — prova que requireAuth (middleware) roda ANTES do parseID interno do handler (mesma topologia do router.go: RequireAuth envolve CreateVote)', async () => {
    const res = await postVoto('/votacao/sessions/abc/votes', null, {
      movie_ids: [],
    })
    expect(res.status).toBe(401)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('not_authenticated')
  })

  test('id não numérico responde 400 invalid_id (com cookie válido)', async () => {
    const cookie = await cookieDeSessaoValido(
      'voto-idinvalido@example.com',
      'Id Inválido',
    )
    const res = await postVoto('/votacao/sessions/abc/votes', cookie, {
      movie_ids: [],
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('invalid_id')
  })

  // ⚠️ Diferença deliberada de GET /sessions/{id} (T2), que NÃO recusa
  // id<=0: esta rota usa o parseID do Go (CreateVote), que recusa. Não
  // uniformizar as duas rotas.
  test('id=0 responde 400 invalid_id — diferente de GET /sessions/{id} (esta rota usa parseID, que recusa id<=0)', async () => {
    const cookie = await cookieDeSessaoValido(
      'voto-idzero@example.com',
      'Id Zero',
    )
    const res = await postVoto('/votacao/sessions/0/votes', cookie, {
      movie_ids: [],
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('invalid_id')
  })

  test('id negativo também responde 400 invalid_id', async () => {
    const cookie = await cookieDeSessaoValido(
      'voto-idneg@example.com',
      'Id Neg',
    )
    const res = await postVoto('/votacao/sessions/-5/votes', cookie, {
      movie_ids: [],
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('invalid_id')
  })

  // ⚠️ M3 (revisão final): prova o mesmo teto de faixa em `parseIdDaRota`
  // (usada por esta rota desde o fix do M2), não só em `parseInt64`
  // isolado — um id de 20 dígitos tem que cair em 400 `invalid_id`, a MESMA
  // falha de parse de `strconv.ParseInt` com `ErrRange` no Go.
  test('id fora da faixa do int64 (20 dígitos) responde 400 invalid_id (M3 — mesmo teto em parseIdDaRota)', async () => {
    const cookie = await cookieDeSessaoValido(
      'voto-idgigante@example.com',
      'Id Gigante',
    )
    const res = await postVoto(
      '/votacao/sessions/99999999999999999999/votes',
      cookie,
      { movie_ids: [] },
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('invalid_id')
  })

  test('sessão inexistente responde 404 session_not_found', async () => {
    const cookie = await cookieDeSessaoValido(
      'voto-inexistente@example.com',
      'Inexistente',
    )
    const res = await postVoto('/votacao/sessions/999999/votes', cookie, {
      movie_ids: [],
    })
    expect(res.status).toBe(404)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('session_not_found')
  })

  test('sessão fechada responde 409 session_closed', async () => {
    const criador = await novoUsuario('sub-voto-fechada-criador')
    await novaSessaoComId({
      id: 1,
      title: 'Fechada',
      status: 'closed',
      createdBy: criador,
      createdAt: '2026-01-01 00:00:00',
    })
    const cookie = await cookieDeSessaoValido(
      'voto-fechada@example.com',
      'Fechada',
    )
    const res = await postVoto('/votacao/sessions/1/votes', cookie, {
      movie_ids: [],
    })
    expect(res.status).toBe(409)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('session_closed')
  })

  // ⚠️ O teste que FIXA a ordem entre as checagens 3 (closed) e 4 (corpo).
  // O Go carrega a sessão, checa `Status == "closed"`, e SÓ ENTÃO decodifica
  // `r.Body` — corpo inválido numa sessão fechada tem que responder 409,
  // NUNCA 400 invalid_json. Se a ordem fosse invertida (ler o corpo antes
  // de checar closed — a mutação obrigatória desta task), este teste iria
  // observar 400 em vez de 409 e falharia.
  test('corpo inválido em sessão FECHADA responde 409 session_closed, NUNCA 400 invalid_json (a checagem de closed vem ANTES de ler o corpo)', async () => {
    const criador = await novoUsuario('sub-voto-fechada-corpo-criador')
    await novaSessaoComId({
      id: 1,
      title: 'Fechada',
      status: 'closed',
      createdBy: criador,
      createdAt: '2026-01-01 00:00:00',
    })
    const cookie = await cookieDeSessaoValido(
      'voto-fechada-corpo@example.com',
      'Fechada Corpo',
    )
    const res = await postVoto(
      '/votacao/sessions/1/votes',
      cookie,
      'isto não é JSON',
    )
    expect(res.status).toBe(409)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('session_closed')
  })

  test('corpo não-JSON numa sessão ABERTA responde 400 invalid_json', async () => {
    const criador = await novoUsuario('sub-voto-invalidjson-criador')
    const sessionId = await novaSessao(criador)
    const cookie = await cookieDeSessaoValido(
      'voto-invalidjson@example.com',
      'Invalid JSON',
    )
    const res = await postVoto(
      `/votacao/sessions/${sessionId}/votes`,
      cookie,
      'isto não é JSON',
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('invalid_json')
  })

  test('movie_ids com tipo errado (não-array) responde 400 invalid_json — mesma família de erro de decode do Go (json.Decoder não distingue sintaxe de tipo)', async () => {
    const criador = await novoUsuario('sub-voto-tipoerrado-criador')
    const sessionId = await novaSessao(criador)
    const cookie = await cookieDeSessaoValido(
      'voto-tipoerrado@example.com',
      'Tipo Errado',
    )
    const res = await postVoto(`/votacao/sessions/${sessionId}/votes`, cookie, {
      movie_ids: 'nao-array',
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('invalid_json')
  })

  // ⚠️ Comentário corrigido (revisão final): o nome antigo deste teste
  // afirmava "paridade com o zero value nil de []int64 no Go", mas isso não
  // é exato. O Go decodifica `{}` com `body.MovieIDs` no zero value `nil`
  // e ECOA esse mesmo valor na resposta (`httpx.DataMsg(...,
  // map[string]any{"voted_movie_ids": body.MovieIDs}, ...)`), que
  // `json.Marshal` serializa como `"voted_movie_ids":null`. Aqui
  // `parseMovieIds` trata AUSENTE como `[]`, e `replaceUserVotes` devolve o
  // array deduplicado (vazio) que gravou — a resposta sai
  // `"voted_movie_ids":[]`, NUNCA `null`. Divergência INTENCIONAL e
  // inócua: `apps/web` sempre manda `{movie_ids:[...]}` explícito, nunca
  // um corpo `{}` sem a chave. O que de fato tem paridade é só o outro
  // metade — corpo AUSENTE/`{}` não é erro (`invalid_json`), igual ao Go.
  test('movie_ids AUSENTE do corpo é tratado como conjunto vazio — não é invalid_json (o Go também aceita, mas ECOA null; aqui devolvemos [] — divergência intencional e inócua)', async () => {
    const criador = await novoUsuario('sub-voto-ausente-criador')
    const sessionId = await novaSessao(criador)
    const cookie = await cookieDeSessaoValido(
      'voto-ausente@example.com',
      'Ausente',
    )
    const res = await postVoto(
      `/votacao/sessions/${sessionId}/votes`,
      cookie,
      {},
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<{ voted_movie_ids: number[] }>
    expect(body.data?.voted_movie_ids).toEqual([])
  })

  test('filme fora da sessão responde 400 movie_not_in_session (validado ANTES de tocar em votes — FK nunca estoura)', async () => {
    const criador = await novoUsuario('sub-voto-fora-criador')
    const sessionId = await novaSessao(criador)
    await novoFilmeAuto(sessionId, 'Ação')
    const cookie = await cookieDeSessaoValido('voto-fora@example.com', 'Fora')
    const res = await postVoto(`/votacao/sessions/${sessionId}/votes`, cookie, {
      movie_ids: [999999],
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('movie_not_in_session')
  })

  test('happy path — 200, voted_movie_ids, notification de sucesso, votos gravados no D1', async () => {
    const criador = await novoUsuario('sub-voto-happy-criador')
    const sessionId = await novaSessao(criador)
    const m1 = await novoFilmeAuto(sessionId, 'Ação')
    const m2 = await novoFilmeAuto(sessionId, 'Drama')
    const cookie = await cookieDeSessaoValido('voto-happy@example.com', 'Happy')
    const userId = await votacaoUserId(cookie)

    const res = await postVoto(`/votacao/sessions/${sessionId}/votes`, cookie, {
      movie_ids: [m1, m2],
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<{ voted_movie_ids: number[] }>
    expect(body.ok).toBe(true)
    expect(body.data?.voted_movie_ids).toEqual([m1, m2])
    // Paridade de CONTRATO byte a byte com httpx.DataMsg(...,
    // httpx.Success("Voto registrado.")) — mensagem idêntica, SEM `code`
    // (I2, revisão final: antes saía `code:'vote_registered'` inventado e
    // a mensagem em minúscula). Não é comportamento de tela, `apps/web`
    // descarta notifications no caminho feliz (ver lib/envelope.ts).
    expect(body.notifications).toEqual([
      { type: 'success', message: 'Voto registrado.' },
    ])

    const { results } = await DB.prepare(
      `SELECT movie_id FROM votes WHERE session_id = ? AND user_id = ? ORDER BY movie_id ASC`,
    )
      .bind(sessionId, userId)
      .all<{ movie_id: number }>()
    expect(results.map((r) => r.movie_id)).toEqual(
      [m1, m2].sort((a, b) => a - b),
    )
  })

  test('reenvio SUBSTITUI o conjunto inteiro — voto anterior some, só o novo permanece (nunca um merge)', async () => {
    const criador = await novoUsuario('sub-voto-substitui-criador')
    const sessionId = await novaSessao(criador)
    const m1 = await novoFilmeAuto(sessionId, 'Ação')
    const m2 = await novoFilmeAuto(sessionId, 'Drama')
    const cookie = await cookieDeSessaoValido(
      'voto-substitui@example.com',
      'Substitui',
    )

    await postVoto(`/votacao/sessions/${sessionId}/votes`, cookie, {
      movie_ids: [m1],
    })
    const res = await postVoto(`/votacao/sessions/${sessionId}/votes`, cookie, {
      movie_ids: [m2],
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<{ voted_movie_ids: number[] }>
    expect(body.data?.voted_movie_ids).toEqual([m2])
  })

  test('conjunto vazio LIMPA os votos — 200, voted_movie_ids: [] (operação válida, não erro)', async () => {
    const criador = await novoUsuario('sub-voto-limpa-criador')
    const sessionId = await novaSessao(criador)
    const m1 = await novoFilmeAuto(sessionId, 'Ação')
    const cookie = await cookieDeSessaoValido('voto-limpa@example.com', 'Limpa')

    await postVoto(`/votacao/sessions/${sessionId}/votes`, cookie, {
      movie_ids: [m1],
    })
    const res = await postVoto(`/votacao/sessions/${sessionId}/votes`, cookie, {
      movie_ids: [],
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<{ voted_movie_ids: number[] }>
    expect(body.data?.voted_movie_ids).toEqual([])
  })

  test('ids repetidos no corpo são deduplicados — 200, sem 500 por violar UNIQUE(session_id,user_id,movie_id)', async () => {
    const criador = await novoUsuario('sub-voto-dedupe-criador')
    const sessionId = await novaSessao(criador)
    const m1 = await novoFilmeAuto(sessionId, 'Ação')
    const cookie = await cookieDeSessaoValido(
      'voto-dedupe@example.com',
      'Dedupe',
    )

    const res = await postVoto(`/votacao/sessions/${sessionId}/votes`, cookie, {
      movie_ids: [m1, m1, m1],
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<{ voted_movie_ids: number[] }>
    expect(body.data?.voted_movie_ids).toEqual([m1])
  })
})

// --------------------------------------------------------------------------
// GET /votacao/sessions/:id/results e POST /votacao/sessions/:id/close
// (Task 4, fatia2 T4) — apuração. Fonte de verdade:
// apps/api/internal/handlers/votacao/votes.go (GetResults ~122, CloseSession
// ~71) + apps/api/internal/votacao/results.go (TallyVotes/ComputeTopMovies).
// --------------------------------------------------------------------------

type ResultsData = {
  results: { movie_id: number; count: number }[]
  total_votes: number
  total_voters: number
}

type CloseData = { winner_movie_id: number | null }

type SessaoRow = {
  status: 'open' | 'closed'
  closed_at: string | null
  winner_movie_id: number | null
  winner_method: string | null
}

async function sessaoRow(sessionId: number): Promise<SessaoRow> {
  const row = await DB.prepare(
    `SELECT status, closed_at, winner_movie_id, winner_method
       FROM voting_sessions WHERE id = ?`,
  )
    .bind(sessionId)
    .first<SessaoRow>()
  if (row === null) throw new Error('sessão não encontrada')
  return row
}

describe('GET /votacao/sessions/:id/results', () => {
  test('sem cookie responde 401 not_authenticated', async () => {
    const res = await app.request('/votacao/sessions/1/results', {}, testEnv())
    expect(res.status).toBe(401)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('not_authenticated')
  })

  test('id não numérico responde 400 invalid_id', async () => {
    const cookie = await cookieDeSessaoValido(
      'results-idinvalido@example.com',
      'Id Inválido',
    )
    const res = await app.request(
      '/votacao/sessions/abc/results',
      { headers: { cookie } },
      testEnv(),
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('invalid_id')
  })

  // ⚠️ Diferente de GET /sessions/{id} (T2, que aceita id<=0 e cai em 404):
  // GetResults usa parseID (compartilhado com CloseSession), que RECUSA
  // id<=0 com 400 — mesma família de validação que POST /votes (T3).
  test('id=0 responde 400 invalid_id (GetResults usa parseID, que recusa id<=0 — diferente de GET /sessions/{id})', async () => {
    const cookie = await cookieDeSessaoValido(
      'results-idzero@example.com',
      'Id Zero',
    )
    const res = await app.request(
      '/votacao/sessions/0/results',
      { headers: { cookie } },
      testEnv(),
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('invalid_id')
  })

  test('id negativo responde 400 invalid_id', async () => {
    const cookie = await cookieDeSessaoValido(
      'results-idneg@example.com',
      'Id Neg',
    )
    const res = await app.request(
      '/votacao/sessions/-5/results',
      { headers: { cookie } },
      testEnv(),
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('invalid_id')
  })

  // ⚠️ O detalhe de paridade #3 do brief: GetResults NÃO checa se a sessão
  // existe — um id positivo mas inexistente devolve 200 com zeros, NUNCA
  // 404. Reproduzido de propósito.
  test('sessão inexistente (mas id positivo) responde 200 com zeros — NUNCA 404 (GetResults não checa existência)', async () => {
    const cookie = await cookieDeSessaoValido(
      'results-inexistente@example.com',
      'Inexistente',
    )
    const res = await app.request(
      '/votacao/sessions/999999/results',
      { headers: { cookie } },
      testEnv(),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<ResultsData>
    expect(body.data).toEqual({
      results: [],
      total_votes: 0,
      total_voters: 0,
    })
  })

  // ⚠️ O teste que só passa com as DUAS chaves de ordenação certas — count
  // DESC, DEPOIS movie_id ASC. m3 tem a maior contagem (prova a chave
  // primária); m1/m2 empatam (prova a secundária). Votado com o filme de
  // MAIOR id primeiro (m2 antes de m1) — se a ordenação não aplicasse a
  // chave secundária de verdade (ex.: só reordenasse por count e deixasse a
  // ordem de leitura/inserção decidir o empate), o resultado sairia
  // [m3, m2, m1] em vez de [m3, m1, m2].
  test('ordena por count DESC, depois movie_id ASC — só passa com as duas chaves certas', async () => {
    const criador = await novoUsuario('sub-results-ordem-criador')
    const sessionId = await novaSessao(criador)
    const m1 = await novoFilmeAuto(sessionId, 'Ação')
    const m2 = await novoFilmeAuto(sessionId, 'Drama')
    const m3 = await novoFilmeAuto(sessionId, 'Comédia')

    const u1 = await novoUsuario('sub-results-ordem-u1')
    const u2 = await novoUsuario('sub-results-ordem-u2')
    const u3 = await novoUsuario('sub-results-ordem-u3')
    const u4 = await novoUsuario('sub-results-ordem-u4')
    const u5 = await novoUsuario('sub-results-ordem-u5')
    const u6 = await novoUsuario('sub-results-ordem-u6')
    const u7 = await novoUsuario('sub-results-ordem-u7')

    // m3: 3 votos (topo, sem ambiguidade). m2 (maior id, votado PRIMEIRO) e
    // m1 (menor id, votado DEPOIS) empatam com 2 votos cada — 7 usuários
    // distintos, nenhum vota duas vezes no mesmo filme nem em dois filmes
    // (evita qualquer contagem cruzada por engano).
    await votar(sessionId, u1, m3)
    await votar(sessionId, u2, m3)
    await votar(sessionId, u3, m3)
    await votar(sessionId, u4, m2)
    await votar(sessionId, u5, m2)
    await votar(sessionId, u6, m1)
    await votar(sessionId, u7, m1)

    const cookie = await cookieDeSessaoValido(
      'results-ordem@example.com',
      'Ordem',
    )
    const res = await app.request(
      `/votacao/sessions/${sessionId}/results`,
      { headers: { cookie } },
      testEnv(),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<ResultsData>
    expect(body.data?.results).toEqual([
      { movie_id: m3, count: 3 },
      { movie_id: m1, count: 2 },
      { movie_id: m2, count: 2 },
    ])
  })

  // ⚠️ O detalhe de paridade #2 do brief: total_votes conta LINHAS de
  // `votes` (não eleitores); total_voters conta usuários DISTINTOS. 1
  // pessoa aprovando 3 filmes é total_votes:3, total_voters:1 — um teste
  // onde os dois batem não prova nada.
  test('total_votes (linhas) e total_voters (usuários distintos) DIVERGEM quando 1 pessoa vota em vários filmes', async () => {
    const criador = await novoUsuario('sub-results-diverge-criador')
    const sessionId = await novaSessao(criador)
    const m1 = await novoFilmeAuto(sessionId, 'Ação')
    const m2 = await novoFilmeAuto(sessionId, 'Drama')
    const m3 = await novoFilmeAuto(sessionId, 'Comédia')

    const cookie = await cookieDeSessaoValido(
      'results-diverge@example.com',
      'Diverge',
    )
    const userId = await votacaoUserId(cookie)
    await votar(sessionId, userId, m1)
    await votar(sessionId, userId, m2)
    await votar(sessionId, userId, m3)

    const res = await app.request(
      `/votacao/sessions/${sessionId}/results`,
      { headers: { cookie } },
      testEnv(),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<ResultsData>
    expect(body.data?.total_votes).toBe(3)
    expect(body.data?.total_voters).toBe(1)
  })
})

describe('POST /votacao/sessions/:id/close', () => {
  // ⚠️ Prova a ordem do guard (middleware) sobre a validação interna do
  // handler — mesma lição da T3: sem cookie NENHUM, mesmo com um id
  // inválido no path, responde 401 (não 400) — o middleware roda ANTES do
  // handler em qualquer request real.
  test('sem cookie responde 401 not_authenticated MESMO com id inválido no path (requireAdmin roda ANTES do parseID interno)', async () => {
    const res = await app.request(
      '/votacao/sessions/abc/close',
      { method: 'POST' },
      testEnv(),
    )
    expect(res.status).toBe(401)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('not_authenticated')
  })

  test('conta autenticada mas não-admin responde 403 admin_only', async () => {
    const criador = await novoUsuario('sub-close-naoadmin-criador')
    const sessionId = await novaSessao(criador)
    const cookie = await cookieDeSessaoValido(
      'close-naoadmin@example.com',
      'Não Admin',
    )
    const res = await app.request(
      `/votacao/sessions/${sessionId}/close`,
      { method: 'POST', headers: { cookie } },
      testEnv(), // ADMIN_EMAILS vazio — ninguém é admin
    )
    expect(res.status).toBe(403)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('admin_only')
  })

  test('id não numérico (admin) responde 400 invalid_id', async () => {
    const cookie = await cookieDeSessaoValido(
      'close-idinvalido@example.com',
      'Id Inválido',
    )
    const res = await app.request(
      '/votacao/sessions/abc/close',
      { method: 'POST', headers: { cookie } },
      testEnv('close-idinvalido@example.com'),
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('invalid_id')
  })

  test('id=0 (admin) responde 400 invalid_id', async () => {
    const cookie = await cookieDeSessaoValido(
      'close-idzero@example.com',
      'Id Zero',
    )
    const res = await app.request(
      '/votacao/sessions/0/close',
      { method: 'POST', headers: { cookie } },
      testEnv('close-idzero@example.com'),
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('invalid_id')
  })

  // ⚠️ O detalhe de paridade #4 do brief: a MESMA resposta 404
  // session_not_open cobre id inexistente, sessão já fechada, e id válido
  // sem sessão — a ambiguidade é intencional, herdada do Go
  // (`UPDATE ... WHERE id=? AND status='open'`, 0 linhas afetadas).
  test('sessão inexistente responde 404 session_not_open (mesmo código de "já fechada" — ambiguidade intencional)', async () => {
    const cookie = await cookieDeSessaoValido(
      'close-inexistente@example.com',
      'Inexistente',
    )
    const res = await app.request(
      '/votacao/sessions/999999/close',
      { method: 'POST', headers: { cookie } },
      testEnv('close-inexistente@example.com'),
    )
    expect(res.status).toBe(404)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('session_not_open')
  })

  test('sessão já fechada responde 404 session_not_open', async () => {
    const criador = await novoUsuario('sub-close-jafechada-criador')
    await novaSessaoComId({
      id: 1,
      title: 'Já fechada',
      status: 'closed',
      createdBy: criador,
      createdAt: '2026-01-01 00:00:00',
    })
    const cookie = await cookieDeSessaoValido(
      'close-jafechada@example.com',
      'Já Fechada',
    )
    const res = await app.request(
      '/votacao/sessions/1/close',
      { method: 'POST', headers: { cookie } },
      testEnv('close-jafechada@example.com'),
    )
    expect(res.status).toBe(404)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('session_not_open')
  })

  test('happy path — vencedor claro: 200 {winner_movie_id}, sessão fechada com winner_method=votes', async () => {
    const criador = await novoUsuario('sub-close-vencedor-criador')
    const sessionId = await novaSessao(criador)
    const m1 = await novoFilmeAuto(sessionId, 'Ação')
    const votante = await novoUsuario('sub-close-vencedor-votante')
    await votar(sessionId, votante, m1)

    const cookie = await cookieDeSessaoValido(
      'close-vencedor@example.com',
      'Vencedor',
    )
    const res = await app.request(
      `/votacao/sessions/${sessionId}/close`,
      { method: 'POST', headers: { cookie } },
      testEnv('close-vencedor@example.com'),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<CloseData>
    expect(body.data?.winner_movie_id).toBe(m1)

    const row = await sessaoRow(sessionId)
    expect(row.status).toBe('closed')
    expect(row.closed_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
    expect(row.winner_movie_id).toBe(m1)
    expect(row.winner_method).toBe('votes')
  })

  // ⚠️ I1 (revisão final): o Go ENGOLE o erro do SEGUNDO UPDATE
  // (`SetSessionWinner`, `votes.go:99-103` — `if err != nil { log }`,
  // sem `return`) e responde 200 mesmo assim; só `winner_method` fica sem
  // gravar. Shim que quebra SÓ esse UPDATE — o texto "winner_method = ?"
  // só aparece no statement de `setSessionWinner` (nunca no primeiro
  // UPDATE de `closeVotingSession`, nem em nenhum SELECT) — todo o resto
  // (login, requireAdmin, listVoteMovieIds, o PRIMEIRO UPDATE) passa
  // direto pro D1 real. Sem o `try/catch` em `routes/votacao.ts`, esta
  // chamada devolveria 500 em vez de 200 — e um retry subsequente bateria
  // 404 `session_not_open` (a sessão já fechou no primeiro UPDATE),
  // fazendo parecer que o close falhou quando não falhou.
  test('setSessionWinner falhando NÃO impede o 200 nem o winner_movie_id correto (I1 — o Go também engole este erro)', async () => {
    const criador = await novoUsuario('sub-close-i1-criador')
    const sessionId = await novaSessao(criador)
    const m1 = await novoFilmeAuto(sessionId, 'Ação')
    const votante = await novoUsuario('sub-close-i1-votante')
    await votar(sessionId, votante, m1)

    const cookie = await cookieDeSessaoValido('close-i1@example.com', 'I1')

    const dbComSetWinnerQuebrado = {
      prepare: (sql: string) => {
        if (sql.includes('winner_method = ?')) {
          throw new Error('D1_ERROR: disk I/O error (simulado)')
        }
        return DB.prepare(sql)
      },
      batch: DB.batch.bind(DB),
      exec: DB.exec.bind(DB),
      withSession: DB.withSession.bind(DB),
      dump: DB.dump.bind(DB),
    } as unknown as D1Database

    const res = await app.request(
      `/votacao/sessions/${sessionId}/close`,
      { method: 'POST', headers: { cookie } },
      { ...testEnv('close-i1@example.com'), DB: dbComSetWinnerQuebrado },
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<CloseData>
    expect(body.data?.winner_movie_id).toBe(m1)

    // A sessão FECHOU e winner_movie_id foi gravado pelo PRIMEIRO UPDATE
    // (closeVotingSession, que já embute winner_movie_id) — só
    // winner_method fica NULL, porque foi o SEGUNDO UPDATE que quebrou.
    const row = await sessaoRow(sessionId)
    expect(row.status).toBe('closed')
    expect(row.winner_movie_id).toBe(m1)
    expect(row.winner_method).toBeNull()
  })

  // ⚠️ O detalhe de paridade #5 do brief: empate deixa winner_movie_id NULL
  // — sem critério de desempate determinístico (a roleta é a T5). Este é o
  // teste que a MUTAÇÃO obrigatória desta task (fazer close escolher o
  // menor id no empate) precisa quebrar.
  test('empate — 200 {winner_movie_id: null}, sessão fechada MESMO ASSIM, winner_method continua null', async () => {
    const criador = await novoUsuario('sub-close-empate-criador')
    const sessionId = await novaSessao(criador)
    const m1 = await novoFilmeAuto(sessionId, 'Ação')
    const m2 = await novoFilmeAuto(sessionId, 'Drama')
    const v1 = await novoUsuario('sub-close-empate-v1')
    const v2 = await novoUsuario('sub-close-empate-v2')
    await votar(sessionId, v1, m1)
    await votar(sessionId, v2, m2)

    const cookie = await cookieDeSessaoValido(
      'close-empate@example.com',
      'Empate',
    )
    const res = await app.request(
      `/votacao/sessions/${sessionId}/close`,
      { method: 'POST', headers: { cookie } },
      testEnv('close-empate@example.com'),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<CloseData>
    expect(body.data?.winner_movie_id).toBeNull()

    const row = await sessaoRow(sessionId)
    expect(row.status).toBe('closed')
    expect(row.winner_movie_id).toBeNull()
    expect(row.winner_method).toBeNull()
  })

  test('sessão sem voto nenhum — fecha sem vencedor (nenhum topo pra computar)', async () => {
    const criador = await novoUsuario('sub-close-semvoto-criador')
    const sessionId = await novaSessao(criador)
    const cookie = await cookieDeSessaoValido(
      'close-semvoto@example.com',
      'Sem Voto',
    )
    const res = await app.request(
      `/votacao/sessions/${sessionId}/close`,
      { method: 'POST', headers: { cookie } },
      testEnv('close-semvoto@example.com'),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<CloseData>
    expect(body.data?.winner_movie_id).toBeNull()

    const row = await sessaoRow(sessionId)
    expect(row.status).toBe('closed')
  })
})

// --------------------------------------------------------------------------
// POST /votacao/sessions/:id/tiebreak (admin) — porte de `Tiebreak`
// (apps/api/internal/handlers/votacao/votes.go:172-270). O sorteio é
// AUDITÁVEL/RECOMPUTÁVEL: ver domain/tiebreak.ts pro cálculo puro (já provado bit a
// bit contra o Go em domain/tiebreak.test.ts) — aqui só a fiação HTTP:
// ordem das checagens, e o teste que prova a auditoria de ponta a ponta
// (entropia fixa + serverNonce mockado com o valor exato do segundo vetor
// dourado, `go-parity.json#tiebreak.routeScenario` — gerado com um
// serverNonce de 32 bytes, o tamanho real que a rota gera).
// --------------------------------------------------------------------------

type TiebreakData = {
  winner_movie_id: number
  tied_movie_ids: number[]
  server_nonce: string
}

type TiebreakAuditRow = {
  session_id: number
  triggered_by: number
  tied_ids_json: string
  client_entropy: string
  server_nonce: string
  winner_movie_id: number
}

async function tiebreakAuditRow(
  sessionId: number,
): Promise<TiebreakAuditRow | null> {
  return await DB.prepare(
    `SELECT session_id, triggered_by, tied_ids_json, client_entropy, server_nonce, winner_movie_id
       FROM tiebreaks WHERE session_id = ? ORDER BY id DESC LIMIT 1`,
  )
    .bind(sessionId)
    .first<TiebreakAuditRow>()
}

async function postTiebreak(
  path: string,
  cookie: string | null,
  body: unknown,
  adminEmails = '',
): Promise<Response> {
  return await app.request(
    path,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(cookie === null ? {} : { cookie }),
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    },
    testEnv(adminEmails),
  )
}

describe('POST /votacao/sessions/:id/tiebreak', () => {
  // 32 hex chars = 16 bytes — o mínimo aceito por `invalid_entropy`.
  const ENTROPIA_VALIDA = '00112233445566778899aabbccddeeff'

  test('sem cookie responde 401 not_authenticated MESMO com id inválido no path (requireAdmin roda ANTES do parseID interno)', async () => {
    const res = await postTiebreak('/votacao/sessions/abc/tiebreak', null, {
      entropy: ENTROPIA_VALIDA,
    })
    expect(res.status).toBe(401)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('not_authenticated')
  })

  test('conta autenticada mas não-admin responde 403 admin_only', async () => {
    const criador = await novoUsuario('sub-tiebreak-naoadmin-criador')
    const sessionId = await novaSessao(criador)
    const cookie = await cookieDeSessaoValido(
      'tiebreak-naoadmin@example.com',
      'Não Admin',
    )
    const res = await postTiebreak(
      `/votacao/sessions/${sessionId}/tiebreak`,
      cookie,
      { entropy: ENTROPIA_VALIDA },
      // sem adminEmails — ninguém é admin
    )
    expect(res.status).toBe(403)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('admin_only')
  })

  test('id não numérico (admin) responde 400 invalid_id', async () => {
    const cookie = await cookieDeSessaoValido(
      'tiebreak-idinvalido@example.com',
      'Id Inválido',
    )
    const res = await postTiebreak(
      '/votacao/sessions/abc/tiebreak',
      cookie,
      { entropy: ENTROPIA_VALIDA },
      'tiebreak-idinvalido@example.com',
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('invalid_id')
  })

  test('id=0 (admin) responde 400 invalid_id', async () => {
    const cookie = await cookieDeSessaoValido(
      'tiebreak-idzero@example.com',
      'Id Zero',
    )
    const res = await postTiebreak(
      '/votacao/sessions/0/tiebreak',
      cookie,
      { entropy: ENTROPIA_VALIDA },
      'tiebreak-idzero@example.com',
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('invalid_id')
  })

  // Id arbitrário/inexistente de propósito nos três testes abaixo — a
  // checagem de corpo/entropia (2-3) vem ANTES da existência da sessão (4),
  // então nenhum deles precisa (nem deve) de uma sessão semeada de verdade.
  test('corpo não-JSON responde 400 invalid_json (checado antes de a sessão existir)', async () => {
    const cookie = await cookieDeSessaoValido(
      'tiebreak-corpoinvalido@example.com',
      'Corpo Inválido',
    )
    const res = await postTiebreak(
      '/votacao/sessions/999999/tiebreak',
      cookie,
      '{corpo nao e json valido',
      'tiebreak-corpoinvalido@example.com',
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('invalid_json')
  })

  test('entropy com caractere fora do alfabeto hex responde 400 invalid_entropy', async () => {
    const cookie = await cookieDeSessaoValido(
      'tiebreak-entropianaohex@example.com',
      'Entropia Não-Hex',
    )
    const res = await postTiebreak(
      '/votacao/sessions/999999/tiebreak',
      cookie,
      { entropy: 'zz' },
      'tiebreak-entropianaohex@example.com',
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('invalid_entropy')
  })

  test('entropy hex válido mas com menos de 16 bytes responde 400 invalid_entropy', async () => {
    const cookie = await cookieDeSessaoValido(
      'tiebreak-entropiacurta@example.com',
      'Entropia Curta',
    )
    const res = await postTiebreak(
      '/votacao/sessions/999999/tiebreak',
      cookie,
      { entropy: '00112233445566' }, // 7 bytes, < 16
      'tiebreak-entropiacurta@example.com',
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('invalid_entropy')
  })

  test('sessão inexistente responde 404 session_not_found', async () => {
    const cookie = await cookieDeSessaoValido(
      'tiebreak-inexistente@example.com',
      'Inexistente',
    )
    const res = await postTiebreak(
      '/votacao/sessions/999999/tiebreak',
      cookie,
      { entropy: ENTROPIA_VALIDA },
      'tiebreak-inexistente@example.com',
    )
    expect(res.status).toBe(404)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('session_not_found')
  })

  test('sessão ainda ABERTA responde 409 session_not_closed', async () => {
    const criador = await novoUsuario('sub-tiebreak-aberta-criador')
    const sessionId = await novaSessao(criador)
    const cookie = await cookieDeSessaoValido(
      'tiebreak-aberta@example.com',
      'Aberta',
    )
    const res = await postTiebreak(
      `/votacao/sessions/${sessionId}/tiebreak`,
      cookie,
      { entropy: ENTROPIA_VALIDA },
      'tiebreak-aberta@example.com',
    )
    expect(res.status).toBe(409)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('session_not_closed')
  })

  test('sessão fechada mas com vencedor claro (sem empate) responde 422 no_tie', async () => {
    const criador = await novoUsuario('sub-tiebreak-semempate-criador')
    const sessionId = await novaSessao(criador)
    const m1 = await novoFilmeAuto(sessionId, 'Ação')
    const votante = await novoUsuario('sub-tiebreak-semempate-votante')
    await votar(sessionId, votante, m1)

    const cookie = await cookieDeSessaoValido(
      'tiebreak-semempate@example.com',
      'Sem Empate',
    )
    // Fecha via a rota já provada (T4) — 1 filme votado, vencedor claro.
    await app.request(
      `/votacao/sessions/${sessionId}/close`,
      { method: 'POST', headers: { cookie } },
      testEnv('tiebreak-semempate@example.com'),
    )

    const res = await postTiebreak(
      `/votacao/sessions/${sessionId}/tiebreak`,
      cookie,
      { entropy: ENTROPIA_VALIDA },
      'tiebreak-semempate@example.com',
    )
    expect(res.status).toBe(422)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('no_tie')
  })

  // ⚠️ A checagem 7 (winner_already_set) só é alcançável DEPOIS da checagem
  // 6 (no_tie) — então este teste precisa de um empate de verdade nos
  // votos ATUAIS, com winner_movie_id já gravado por fora (simulando um
  // sorteio anterior). Prova que a rota não usa `winner_movie_id` como
  // atalho pra pular o recomputo do empate — a MESMA topologia do Go
  // (`votes.go:225-233`: tied é computado ANTES do check de winner).
  test('sessão já tem vencedor responde 409 winner_already_set (mesmo com empate nos votos atuais)', async () => {
    const criador = await novoUsuario('sub-tiebreak-jatemvencedor-criador')
    const sessionId = await novaSessao(criador)
    const m1 = await novoFilmeAuto(sessionId, 'Ação')
    const m2 = await novoFilmeAuto(sessionId, 'Drama')
    const v1 = await novoUsuario('sub-tiebreak-jatemvencedor-v1')
    const v2 = await novoUsuario('sub-tiebreak-jatemvencedor-v2')
    await votar(sessionId, v1, m1)
    await votar(sessionId, v2, m2)

    const cookie = await cookieDeSessaoValido(
      'tiebreak-jatemvencedor@example.com',
      'Já Tem Vencedor',
    )
    // Fecha (empate -> winner_movie_id fica null) e então grava um
    // vencedor manualmente — reproduz "um sorteio já rodou antes" sem
    // depender desta própria rota pra chegar lá.
    await app.request(
      `/votacao/sessions/${sessionId}/close`,
      { method: 'POST', headers: { cookie } },
      testEnv('tiebreak-jatemvencedor@example.com'),
    )
    await DB.prepare(
      `UPDATE voting_sessions SET winner_movie_id = ?, winner_method = 'roulette' WHERE id = ?`,
    )
      .bind(m1, sessionId)
      .run()

    const res = await postTiebreak(
      `/votacao/sessions/${sessionId}/tiebreak`,
      cookie,
      { entropy: ENTROPIA_VALIDA },
      'tiebreak-jatemvencedor@example.com',
    )
    expect(res.status).toBe(409)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('winner_already_set')
  })

  // ⚠️ O teste que fecha o círculo de auditabilidade. `crypto.getRandomValues`
  // é mockado pra devolver EXATAMENTE o serverNonce do segundo vetor dourado
  // (`go-parity.json#tiebreak.routeScenario`, gerado rodando o Go de
  // verdade com um nonce de 32 bytes — o tamanho real que a rota usa). Com
  // entropy/sessionId/tiedIds também fixos no cenário, o `winner_movie_id`
  // devolvido tem que bater EXATAMENTE com o que o Go calculou pra essa
  // combinação — não "um sorteio plausível qualquer".
  test('happy path — vetor dourado: winner bate com o Go, server_nonce é o mockado, auditoria gravada com o MESMO nonce da resposta', async () => {
    const cenario = goParity.tiebreak.routeScenario

    const criador = await novoUsuario('sub-tiebreak-happy-criador')
    // sessionId FIXO em 7 pra bater com o cenário — entra no hash via
    // tiebreakSeed(..., sessionId, ...).
    await novaSessaoComId({
      id: cenario.sessionId,
      title: 'Sessão do vetor dourado',
      status: 'closed',
      createdBy: criador,
      createdAt: '2026-05-19 12:00:00',
    })
    // tiedIds do cenário: [42, 7, 19] — 3 filmes com EXATAMENTE estes ids,
    // cada um recebendo o MESMO número de votos, pra empatar no topo com
    // este conjunto exato (a ordem de inserção não importa: tiebreakSeed e
    // computeTopMovies ordenam ascendente internamente).
    for (const movieId of cenario.tiedIds) {
      await novoFilmeComId({
        id: movieId,
        sessionId: cenario.sessionId,
        category: `categoria-${movieId}`,
        title: `Filme ${movieId}`,
        type: 'filme',
      })
    }
    const votantes: number[] = []
    for (let i = 0; i < cenario.tiedIds.length * 2; i++) {
      votantes.push(await novoUsuario(`sub-tiebreak-happy-votante-${i}`))
    }
    // 2 votos por filme empatado — 6 eleitores distintos, sem cruzar votos.
    for (let i = 0; i < cenario.tiedIds.length; i++) {
      const movieId = cenario.tiedIds[i]
      if (movieId === undefined) throw new Error('cenário mal formado')
      await votar(cenario.sessionId, votantes[i * 2] as number, movieId)
      await votar(cenario.sessionId, votantes[i * 2 + 1] as number, movieId)
    }

    // Login ANTES de instalar o mock — o próprio Better Auth chama
    // `crypto.getRandomValues` internamente (hash de senha, geração de
    // token de sessão), com tamanhos de buffer diferentes de 32. Instalar
    // o mock só depois do login evita qualquer interferência ali, e o
    // guard por TAMANHO abaixo (só intercepta arrays de exatamente 32
    // bytes — o que a rota pede) é uma segunda camada de segurança pro
    // resto do request (requireAdmin resolve a sessão de novo).
    const cookie = await cookieDeSessaoValido(
      'tiebreak-happy@example.com',
      'Happy',
    )
    const adminUserId = await votacaoUserId(cookie)

    const nonceEsperado = hexToBytes(cenario.serverNonceHex)
    if (nonceEsperado === null) throw new Error('fixture com hex inválido')
    const getRandomValuesOriginal = globalThis.crypto.getRandomValues.bind(
      globalThis.crypto,
    )
    const spy = vi
      .spyOn(globalThis.crypto, 'getRandomValues')
      .mockImplementation((array) => {
        if (
          array instanceof Uint8Array &&
          array.length === nonceEsperado.length
        ) {
          array.set(nonceEsperado)
          return array
        }
        return getRandomValuesOriginal(array)
      })

    try {
      const res = await postTiebreak(
        `/votacao/sessions/${cenario.sessionId}/tiebreak`,
        cookie,
        { entropy: cenario.clientEntropyHex },
        'tiebreak-happy@example.com',
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as Envelope<TiebreakData>
      expect(body.ok).toBe(true)
      expect(body.data?.server_nonce).toBe(cenario.serverNonceHex)
      expect(body.data?.winner_movie_id).toBe(cenario.winnerMovieId)
      expect(body.data?.tied_movie_ids).toEqual(
        [...cenario.tiedIds].sort((a, b) => a - b),
      )
      // Paridade de CONTRATO byte a byte com httpx.DataMsg(...,
      // httpx.Success("Desempate concluído.")) do Go — mensagem idêntica,
      // SEM `code` (I2, revisão final: antes saía `code:'tiebreak_done'`
      // inventado e a mensagem em minúscula). Mesmo padrão de POST /votes
      // (T3).
      expect(body.notifications).toEqual([
        { type: 'success', message: 'Desempate concluído.' },
      ])

      // ⚠️ M5 (revisão final): endurece o mock — afirma que o spy
      // interceptou EXATAMENTE UMA chamada de 32 bytes (a que a rota faz
      // pra gerar o `serverNonce`). Antes o teste só checava o RESULTADO
      // final (`server_nonce`/`winner_movie_id` batem com o vetor
      // dourado) — uma chamada EXTRA de 32 bytes vinda de algum refactor
      // futuro (ex.: gerar o nonce duas vezes, ou uma segunda leitura de
      // entropia em outro ponto do request) passaria batida, porque
      // `array.set(nonceEsperado)` é idempotente pra chamadas repetidas
      // com o mesmo array. Uma chamada a mais agora é falha EXPLÍCITA, não
      // risco silencioso.
      const chamadasDe32Bytes = spy.mock.calls.filter(
        ([array]) => array instanceof Uint8Array && array.length === 32,
      )
      expect(chamadasDe32Bytes).toHaveLength(1)

      // Sessão gravada com o vencedor + winner_method='roulette'.
      const row = await sessaoRow(cenario.sessionId)
      expect(row.winner_movie_id).toBe(cenario.winnerMovieId)
      expect(row.winner_method).toBe('roulette')

      // ⚠️ Auditoria gravada com o MESMO nonce que a resposta devolveu —
      // senão a auditoria não fecha: quem tentasse recomputar o sorteio a
      // partir do que a API devolveu chegaria num seed diferente do que
      // gerou o vencedor de fato gravado.
      const auditoria = await tiebreakAuditRow(cenario.sessionId)
      if (auditoria === null) {
        throw new Error('linha de auditoria não gravada em tiebreaks')
      }
      expect(auditoria.server_nonce).toBe(body.data?.server_nonce)
      expect(auditoria.client_entropy).toBe(cenario.clientEntropyHex)
      expect(auditoria.winner_movie_id).toBe(cenario.winnerMovieId)
      expect(auditoria.triggered_by).toBe(adminUserId)
      expect(JSON.parse(auditoria.tied_ids_json)).toEqual(
        [...cenario.tiedIds].sort((a, b) => a - b),
      )
    } finally {
      spy.mockRestore()
    }
  })
})

// --------------------------------------------------------------------------
// GET /votacao/sessions/:id/votes (admin) — Task 6 (fatia2 T6). Fonte de
// verdade: apps/api/internal/handlers/votacao/votes.go#ListSessionVotes
// (~272) + apps/api/internal/votacao/votes.go#ListSessionVotesWithUsers
// (~99). O SELECT em si já é testado em domain/votes.test.ts; aqui só a
// fiação HTTP: guard (401/403), validação de id, e o shape snake_case final.
//
// ⚠️ ESTA ROTA QUEBRA O ANONIMATO DO VOTO — é a única da API que liga e-mail
// de pessoa a voto. O teste de 403 (não-admin) vem ANTES do caminho feliz DE
// PROPÓSITO (brief da T6): é a única coisa entre o e-mail de quem votou e
// qualquer sessão válida.
// --------------------------------------------------------------------------

type VoteDetailData = {
  votes: {
    user_id: number
    user_name: string
    user_email: string
    movie_id: number
    movie_title: string
    category: string
    created_at: string
  }[]
  total: number
}

describe('GET /votacao/sessions/:id/votes', () => {
  test('sem cookie responde 401 not_authenticated MESMO com id inválido no path (requireAdmin roda ANTES do parseIdDaRota interno)', async () => {
    const res = await app.request('/votacao/sessions/abc/votes', {}, testEnv())
    expect(res.status).toBe(401)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('not_authenticated')
  })

  // ⚠️ Escrito ANTES do caminho feliz, de propósito (brief da T6): esta rota
  // quebra o anonimato do voto (JOIN com `users`, expõe e-mail/nome de quem
  // votou) — `requireAdmin` não é um detalhe de implementação aqui, é a
  // ÚNICA barreira entre o e-mail de quem votou e qualquer sessão válida.
  // É este o teste que a mutação obrigatória desta task (trocar
  // `requireAdmin` por `requireAuth` na rota) tem que quebrar.
  test('conta autenticada mas NÃO-ADMIN responde 403 admin_only — esta rota quebra o anonimato do voto, só admin pode chamá-la', async () => {
    const criador = await novoUsuario('sub-votedetail-naoadmin-criador')
    const sessionId = await novaSessao(criador)
    const cookie = await cookieDeSessaoValido(
      'votedetail-naoadmin@example.com',
      'Não Admin',
    )
    const res = await app.request(
      `/votacao/sessions/${sessionId}/votes`,
      { headers: { cookie } },
      testEnv(), // ADMIN_EMAILS vazio — ninguém é admin
    )
    expect(res.status).toBe(403)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('admin_only')
  })

  test('id não numérico (admin) responde 400 invalid_id', async () => {
    const cookie = await cookieDeSessaoValido(
      'votedetail-idinvalido@example.com',
      'Id Inválido',
    )
    const res = await app.request(
      '/votacao/sessions/abc/votes',
      { headers: { cookie } },
      testEnv('votedetail-idinvalido@example.com'),
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('invalid_id')
  })

  test('id=0 (admin) responde 400 invalid_id', async () => {
    const cookie = await cookieDeSessaoValido(
      'votedetail-idzero@example.com',
      'Id Zero',
    )
    const res = await app.request(
      '/votacao/sessions/0/votes',
      { headers: { cookie } },
      testEnv('votedetail-idzero@example.com'),
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('invalid_id')
  })

  test('id negativo (admin) responde 400 invalid_id', async () => {
    const cookie = await cookieDeSessaoValido(
      'votedetail-idneg@example.com',
      'Id Neg',
    )
    const res = await app.request(
      '/votacao/sessions/-5/votes',
      { headers: { cookie } },
      testEnv('votedetail-idneg@example.com'),
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('invalid_id')
  })

  // ⚠️ Mesma família de /results (T4): ListSessionVotes do Go só faz
  // parseID, nunca checa se a sessão existe — um id positivo mas inexistente
  // não bate nenhuma linha no JOIN e devolve 200 com zeros, nunca 404.
  test('sessão inexistente (mas id positivo) responde 200 com array vazio e total:0 — NUNCA 404 (ListSessionVotes não checa existência, mesma família de /results)', async () => {
    const cookie = await cookieDeSessaoValido(
      'votedetail-inexistente@example.com',
      'Inexistente',
    )
    const res = await app.request(
      '/votacao/sessions/999999/votes',
      { headers: { cookie } },
      testEnv('votedetail-inexistente@example.com'),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<VoteDetailData>
    expect(body.data).toEqual({ votes: [], total: 0 })
  })

  test('happy path — 200, shape snake_case exato (user_id/user_name/user_email/movie_id/movie_title/category/created_at), created_at normalizado por toIsoUtc, total bate com o length', async () => {
    const criador = await novoUsuario('sub-votedetail-happy-criador')
    const sessionId = await novaSessao(criador, { title: 'Sessão votada' })
    const m1 = await novoFilmeAuto(sessionId, 'terror', 'Um Filme')

    const cookieVotante = await cookieDeSessaoValido(
      'votedetail-votante@example.com',
      'Quem Votou',
    )
    const votanteId = await votacaoUserId(cookieVotante)
    await postVoto(`/votacao/sessions/${sessionId}/votes`, cookieVotante, {
      movie_ids: [m1],
    })

    const cookieAdmin = await cookieDeSessaoValido(
      'votedetail-admin@example.com',
      'Admin',
    )
    const res = await app.request(
      `/votacao/sessions/${sessionId}/votes`,
      { headers: { cookie: cookieAdmin } },
      testEnv('votedetail-admin@example.com'),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<VoteDetailData>
    expect(body.ok).toBe(true)
    expect(body.data?.total).toBe(1)
    expect(body.data?.votes).toEqual([
      {
        user_id: votanteId,
        user_name: 'Quem Votou',
        user_email: 'votedetail-votante@example.com',
        movie_id: m1,
        movie_title: 'Um Filme',
        category: 'terror',
        // ⚠️ toIsoUtc — nunca o formato cru "YYYY-MM-DD HH:MM:SS" do
        // CURRENT_TIMESTAMP do SQLite (que o Safari rejeita como data).
        created_at: expect.stringMatching(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/,
        ) as unknown as string,
      },
    ])
  })

  test('voto de aprovação — 1 pessoa votando em 2 filmes gera 2 LINHAS na resposta, nunca colapsado por usuário', async () => {
    const criador = await novoUsuario('sub-votedetail-aprovacao-criador')
    const sessionId = await novaSessao(criador)
    const m1 = await novoFilmeAuto(sessionId, 'Ação')
    const m2 = await novoFilmeAuto(sessionId, 'Drama')

    const cookieVotante = await cookieDeSessaoValido(
      'votedetail-aprovacao@example.com',
      'Aprovador',
    )
    await postVoto(`/votacao/sessions/${sessionId}/votes`, cookieVotante, {
      movie_ids: [m1, m2],
    })

    const cookieAdmin = await cookieDeSessaoValido(
      'votedetail-aprovacao-admin@example.com',
      'Admin',
    )
    const res = await app.request(
      `/votacao/sessions/${sessionId}/votes`,
      { headers: { cookie: cookieAdmin } },
      testEnv('votedetail-aprovacao-admin@example.com'),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<VoteDetailData>
    expect(body.data?.total).toBe(2)
    expect(
      body.data?.votes.map((v) => v.movie_id).sort((a, b) => a - b),
    ).toEqual([m1, m2].sort((a, b) => a - b))
  })
})

// --------------------------------------------------------------------------
// I2 (revisão final) — paridade das MENSAGENS com o Go, medida de verdade,
// não só o `code`. Todo `errJson`/`okJson` desta fatia foi escrito com uma
// string PRÓPRIA (minúscula, sem ponto final) — 10 de 10 mensagens de erro
// divergiam do Go byte a byte, e as duas notifications de sucesso tinham um
// `code` INVENTADO que o Go nunca emite (`httpx.Success` não preenche
// `Code`, `json:"code,omitempty"` remove a chave inteira). `apps/web/lib/
// votacao/api-client.ts:44` usa `primary.message` como `.message` do
// `ApiError`, e os componentes de UI fazem `toast.error(errorMessage(err))`
// — depois do cutover (fatia ④), É esse texto que o usuário vê. Este bloco
// fecha 3 dos 5 exemplos medidos no achado (`invalid_id`, `session_not_
// found`, `session_closed`); os outros 2 (`not_authenticated`, `admin_only`)
// são testados na fonte, `lib/session.test.ts` (guards compartilhados por
// toda rota protegida, não só votação) — e as duas notifications de
// SUCESSO (`Voto registrado.`/`Desempate concluído.`, sem `code`) já são
// verificadas byte a byte nos testes de happy path de `POST /votes` e
// `POST /tiebreak` acima.
// --------------------------------------------------------------------------

describe('I2 — mensagens de erro EXATAS, iguais ao Go (não só o code)', () => {
  test('invalid_id — "Identificador inválido."', async () => {
    const cookie = await cookieDeSessaoValido('i2-invalidid@example.com', 'I2')
    const res = await app.request(
      '/votacao/sessions/abc',
      { headers: { cookie } },
      testEnv(),
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.message).toBe('Identificador inválido.')
  })

  test('session_not_found — "Sessão não encontrada."', async () => {
    const cookie = await cookieDeSessaoValido(
      'i2-sessionnotfound@example.com',
      'I2',
    )
    const res = await app.request(
      '/votacao/sessions/999999',
      { headers: { cookie } },
      testEnv(),
    )
    expect(res.status).toBe(404)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.message).toBe('Sessão não encontrada.')
  })

  test('session_closed — "Sessão encerrada — votação fechada."', async () => {
    const criador = await novoUsuario('sub-i2-closed-criador')
    await novaSessaoComId({
      id: 1,
      title: 'Fechada',
      status: 'closed',
      createdBy: criador,
      createdAt: '2026-01-01 00:00:00',
    })
    const cookie = await cookieDeSessaoValido(
      'i2-sessionclosed@example.com',
      'I2',
    )
    const res = await postVoto('/votacao/sessions/1/votes', cookie, {
      movie_ids: [],
    })
    expect(res.status).toBe(409)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.message).toBe(
      'Sessão encerrada — votação fechada.',
    )
  })
})

// --------------------------------------------------------------------------
// GET /votacao/categorias (fatia ③, Task 2) — porte de GetCategorias
// (handlers/votacao/categorias.go). NUNCA chama o Google de verdade: mocka
// globalThis.fetch pro token endpoint (SA de teste gerada com uma chave RSA
// real) + pro endpoint de values do Sheets, delegando o resto pro fetch
// original, restaurado num `finally` — mesmo padrão de lib/auth.test.ts e
// lib/google-auth.test.ts (o fetchMock do cloudflare:test não existe na
// versão instalada).
// --------------------------------------------------------------------------

async function gerarServiceAccountDeTesteCategorias(
  clientEmail: string,
): Promise<{
  client_email: string
  private_key: string
  token_uri: string
}> {
  const par = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', par.privateKey)
  const bytes = new Uint8Array(pkcs8)
  let binario = ''
  for (let i = 0; i < bytes.length; i++)
    binario += String.fromCharCode(bytes[i])
  const base64 = btoa(binario)
  const linhas = base64.match(/.{1,64}/g) ?? [base64]
  const pem = `-----BEGIN PRIVATE KEY-----\n${linhas.join('\n')}\n-----END PRIVATE KEY-----\n`
  return {
    client_email: clientEmail,
    private_key: pem,
    token_uri: 'https://oauth2.googleapis.com/token',
  }
}

function instalarMockGoogleSheetsCategorias(
  tokenUri: string,
  spreadsheetId: string,
  range: string,
  valuesOuStatus: unknown[][] | number,
): { restaurar: () => void } {
  const fetchOriginal = globalThis.fetch
  const valuesUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlTexto =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url
    if (urlTexto === tokenUri) {
      return new Response(
        JSON.stringify({
          access_token: 'token-de-teste-categorias-rota',
          token_type: 'Bearer',
          expires_in: 3599,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }
    if (urlTexto === valuesUrl) {
      if (typeof valuesOuStatus === 'number') {
        return new Response('erro simulado', { status: valuesOuStatus })
      }
      return new Response(JSON.stringify({ values: valuesOuStatus }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    return fetchOriginal(input as Parameters<typeof fetch>[0], init)
  }) as typeof fetch
  return {
    restaurar: () => {
      globalThis.fetch = fetchOriginal
    },
  }
}

describe('GET /votacao/categorias', () => {
  test('sem cookie -> 401 not_authenticated (guard roda ANTES de checar config)', async () => {
    const res = await app.request('/votacao/categorias', {}, testEnv())
    expect(res.status).toBe(401)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('not_authenticated')
  })

  test('GOOGLE_SA_JSON ausente -> 503 sheets_disabled, mensagem exata do Go', async () => {
    const cookie = await cookieDeSessaoValido(
      'cat-sem-sa@example.com',
      'Sem SA',
    )
    const res = await app.request(
      '/votacao/categorias',
      { headers: { cookie } },
      { ...testEnv(), GSHEETS_MOVIES_SPREADSHEET_ID: 'planilha-1' },
    )
    expect(res.status).toBe(503)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]).toEqual({
      type: 'error',
      code: 'sheets_disabled',
      message: 'Integração com a planilha está desativada.',
    })
  })

  test('GSHEETS_MOVIES_SPREADSHEET_ID ausente -> 503 sheets_disabled', async () => {
    const cookie = await cookieDeSessaoValido(
      'cat-sem-id@example.com',
      'Sem ID',
    )
    const res = await app.request(
      '/votacao/categorias',
      { headers: { cookie } },
      {
        ...testEnv(),
        GOOGLE_SA_JSON: JSON.stringify({
          client_email: 'a@b.c',
          private_key: 'x',
          token_uri: 'https://oauth2.googleapis.com/token',
        }),
      },
    )
    expect(res.status).toBe(503)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('sheets_disabled')
  })

  // ⚠️ Achado além do brief (ver o comentário na rota, routes/votacao.ts):
  // GOOGLE_SA_JSON presente mas malformado é o equivalente de
  // gsheets.NewClient falhar no Go — 503, NÃO 502.
  test('GOOGLE_SA_JSON malformado -> 503 sheets_disabled (paridade com NewClient falhando no Go, não 502)', async () => {
    const cookie = await cookieDeSessaoValido(
      'cat-sa-malformado@example.com',
      'SA Ruim',
    )
    const res = await app.request(
      '/votacao/categorias',
      { headers: { cookie } },
      {
        ...testEnv(),
        GOOGLE_SA_JSON: '{ isto nao e json valido',
        GSHEETS_MOVIES_SPREADSHEET_ID: 'planilha-1',
      },
    )
    expect(res.status).toBe(503)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('sheets_disabled')
  })

  test('planilha falha (resposta não-ok do Sheets) -> 502 sheets_read_failed, mensagem exata do Go', async () => {
    const sa = await gerarServiceAccountDeTesteCategorias(
      'cat-falha@projeto-de-teste.iam.gserviceaccount.com',
    )
    const spreadsheetId = 'planilha-falha'
    const mock = instalarMockGoogleSheetsCategorias(
      sa.token_uri,
      spreadsheetId,
      'A2:F',
      500,
    )
    try {
      const cookie = await cookieDeSessaoValido(
        'cat-falha-user@example.com',
        'Falha',
      )
      const res = await app.request(
        '/votacao/categorias',
        { headers: { cookie } },
        {
          ...testEnv(),
          GOOGLE_SA_JSON: JSON.stringify(sa),
          GSHEETS_MOVIES_SPREADSHEET_ID: spreadsheetId,
        },
      )
      expect(res.status).toBe(502)
      const body = (await res.json()) as Envelope<null>
      expect(body.notifications[0]).toEqual({
        type: 'error',
        code: 'sheets_read_failed',
        message: 'Falha ao ler a planilha de filmes.',
      })
    } finally {
      mock.restaurar()
    }
  })

  test('happy path — 200 {categories: [...]}, dedupe + ordenado, usa GSHEETS_MOVIES_RANGE quando setado', async () => {
    const sa = await gerarServiceAccountDeTesteCategorias(
      'cat-ok@projeto-de-teste.iam.gserviceaccount.com',
    )
    const spreadsheetId = 'planilha-ok'
    const range = 'A2:F'
    const mock = instalarMockGoogleSheetsCategorias(
      sa.token_uri,
      spreadsheetId,
      range,
      [
        ['1', 'Filme A', 'Filme', 'Terror', 'sim'],
        ['2', 'Filme B', 'Filme', 'Romance', 'sim'],
        ['3', 'Filme C', 'Filme', 'Terror', 'sim'], // duplicata proposital
      ],
    )
    try {
      const cookie = await cookieDeSessaoValido('cat-ok-user@example.com', 'OK')
      const res = await app.request(
        '/votacao/categorias',
        { headers: { cookie } },
        {
          ...testEnv(),
          GOOGLE_SA_JSON: JSON.stringify(sa),
          GSHEETS_MOVIES_SPREADSHEET_ID: spreadsheetId,
          GSHEETS_MOVIES_RANGE: range,
        },
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as Envelope<{ categories: string[] }>
      expect(body.data).toEqual({ categories: ['romance', 'terror'] })
    } finally {
      mock.restaurar()
    }
  })

  test('sem GSHEETS_MOVIES_RANGE -> usa o default A2:F (mesmo fallback do Go, cmd/api/main.go:63-65)', async () => {
    const sa = await gerarServiceAccountDeTesteCategorias(
      'cat-default-range@projeto-de-teste.iam.gserviceaccount.com',
    )
    const spreadsheetId = 'planilha-default-range'
    const mock = instalarMockGoogleSheetsCategorias(
      sa.token_uri,
      spreadsheetId,
      'A2:F',
      [['1', 'Filme A', 'Filme', 'Drama', 'sim']],
    )
    try {
      const cookie = await cookieDeSessaoValido(
        'cat-default-range-user@example.com',
        'Default',
      )
      const res = await app.request(
        '/votacao/categorias',
        { headers: { cookie } },
        {
          ...testEnv(),
          GOOGLE_SA_JSON: JSON.stringify(sa),
          GSHEETS_MOVIES_SPREADSHEET_ID: spreadsheetId,
          // GSHEETS_MOVIES_RANGE ausente de propósito
        },
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as Envelope<{ categories: string[] }>
      expect(body.data).toEqual({ categories: ['drama'] })
    } finally {
      mock.restaurar()
    }
  })
})

// --------------------------------------------------------------------------
// Fix round 1, Finding 1 (Important) — rede de segurança automatizada contra
// vazamento de segredo em GET /votacao/categorias. A implementação já estava
// correta POR INSPEÇÃO (as mensagens de google-auth.ts/gsheets.ts são
// construídas pra nunca incluir conteúdo bruto), mas nenhum teste provava
// isso — mesmo padrão de index.test.ts, describe `app.onError global`, que
// já faz asserção NEGATIVA de que D1_ERROR/disk I/O não aparecem no JSON
// serializado. Aqui os dados são objetivamente mais críticos (chave privada
// RSA, access token OAuth2) do que um erro de SQL.
//
// ⚠️ Pra chave privada, NÃO uso um marcador artificial tipo
// "MARCADOR-CHAVE-..." dentro do PEM — um PEM com texto arbitrário misturado
// no corpo base64 quebra o parse (atob lança ANTES de qualquer chamada de
// rede), o que impediria os dois cenários abaixo (falha DEPOIS da
// assinatura ter funcionado) de sequer acontecer. Uso a chave REAL gerada em
// runtime como o próprio "marcador" — um valor único, improvável de aparecer
// por acaso, e estritamente mais forte que um marcador inventado (é o
// segredo de verdade, não um substituto que poderia deixar passar uma forma
// diferente do mesmo vazamento).
//
// ⚠️ NÃO testo o JWT assinado byte a byte aqui (diferente de
// lib/google-auth.test.ts) — a rota não expõe hook de relógio pra
// `readMovies`/`getCategories` (chamados sem `deps` em `routes/votacao.ts`),
// então recomputar o JWT exato exigiria correr contra o `new Date()` interno
// da chamada real — risco de flakiness perto de uma virada de segundo
// (`iat` muda, o JWT inteiro muda), exatamente o defeito que o CLAUDE.md da
// raiz chama de mais recorrente do projeto ("teste que não pode falhar").
// O JWT já é coberto byte a byte, com relógio INJETADO, em
// lib/google-auth.test.ts — não duplicado aqui.
// --------------------------------------------------------------------------

describe('GET /votacao/categorias — segredo NUNCA vaza (fix round 1, Finding 1)', () => {
  async function gerarServiceAccountSegura(clientEmail: string): Promise<{
    client_email: string
    private_key: string
    token_uri: string
  }> {
    const par = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify'],
    )
    const pkcs8 = await crypto.subtle.exportKey('pkcs8', par.privateKey)
    const bytes = new Uint8Array(pkcs8)
    let binario = ''
    for (let i = 0; i < bytes.length; i++)
      binario += String.fromCharCode(bytes[i])
    const base64 = btoa(binario)
    const linhas = base64.match(/.{1,64}/g) ?? [base64]
    const pem = `-----BEGIN PRIVATE KEY-----\n${linhas.join('\n')}\n-----END PRIVATE KEY-----\n`
    return {
      client_email: clientEmail,
      private_key: pem,
      token_uri: 'https://oauth2.googleapis.com/token',
    }
  }

  /**
   * ⚠️ MEDIDO durante a mutação desta fix round: `JSON.stringify(sa)`
   * ESCAPA as quebras de linha do PEM (`\n` real vira os DOIS caracteres
   * `\` + `n` no texto serializado) — então `texto.includes(sa.private_key)`
   * (o PEM MULTI-LINHA inteiro, com quebras reais) é `false` mesmo quando
   * `JSON.stringify(sa)` está DENTRO do texto, um FALSO NEGATIVO que a
   * primeira versão deste teste tinha (confirmado reproduzindo:
   * `JSON.stringify({private_key: pem}).includes(pem)` → `false`, mas
   * `.includes(primeiraLinhaBase64)` → `true`). Uma linha do corpo base64
   * (sem quebra nenhuma) sobrevive ao escaping inalterada — é o trecho que
   * as asserções abaixo usam de verdade, o PEM inteiro fica só como
   * checagem adicional (não decisiva sozinha).
   */
  function trechoChaveSemQuebras(sa: { private_key: string }): string {
    const linha = sa.private_key.split('\n')[1]
    if (!linha)
      throw new Error(
        'PEM de teste sem linha de base64 — gerarServiceAccountSegura mudou de formato?',
      )
    return linha
  }

  /**
   * Mocka o token endpoint SEMPRE, e o endpoint de values do Sheets só
   * quando `sheetsResposta` é passado — permite simular "token falha antes
   * de chegar no Sheets" (sem `sheetsResposta`) e "token OK, Sheets falha
   * depois" (com `sheetsResposta`).
   */
  function instalarMockComCorpo(
    tokenUri: string,
    spreadsheetId: string,
    range: string,
    tokenResposta: { status: number; body: unknown },
    sheetsResposta?: { status: number; body: unknown },
  ): { restaurar: () => void } {
    const fetchOriginal = globalThis.fetch
    const valuesUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`
    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const urlTexto =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
      if (urlTexto === tokenUri) {
        return new Response(JSON.stringify(tokenResposta.body), {
          status: tokenResposta.status,
          headers: { 'content-type': 'application/json' },
        })
      }
      if (urlTexto === valuesUrl && sheetsResposta) {
        return new Response(JSON.stringify(sheetsResposta.body), {
          status: sheetsResposta.status,
          headers: { 'content-type': 'application/json' },
        })
      }
      return fetchOriginal(input as Parameters<typeof fetch>[0], init)
    }) as typeof fetch
    return {
      restaurar: () => {
        globalThis.fetch = fetchOriginal
      },
    }
  }

  /** Achata os args de TODAS as chamadas de console.error num texto só pesquisável. */
  function textoDosLogs(spy: ReturnType<typeof vi.spyOn>): string {
    return spy.mock.calls
      .flat()
      .map((arg: unknown) =>
        arg instanceof Error
          ? `${arg.message} ${arg.stack ?? ''}`
          : String(arg),
      )
      .join('\n')
  }

  test('token endpoint falha com corpo sensível — nem a chave privada nem o corpo do token aparecem na resposta OU no console.error', async () => {
    const sa = await gerarServiceAccountSegura(
      'seg-token-falha@projeto-de-teste.iam.gserviceaccount.com',
    )
    const spreadsheetId = 'planilha-seguranca-token'
    const marcadorCorpoToken = 'MARCADOR-CORPO-TOKEN-NAO-PODE-VAZAR'
    const mock = instalarMockComCorpo(sa.token_uri, spreadsheetId, 'A2:F', {
      status: 400,
      body: { error: 'invalid_grant', error_description: marcadorCorpoToken },
    })
    const spyConsole = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const cookie = await cookieDeSessaoValido(
        'seg-token-falha-user@example.com',
        'Seg Token',
      )
      const res = await app.request(
        '/votacao/categorias',
        { headers: { cookie } },
        {
          ...testEnv(),
          GOOGLE_SA_JSON: JSON.stringify(sa),
          GSHEETS_MOVIES_SPREADSHEET_ID: spreadsheetId,
        },
      )
      expect(res.status).toBe(502)

      const trechoChave = trechoChaveSemQuebras(sa)
      const textoResposta = await res.text()
      expect(textoResposta).not.toContain(sa.private_key)
      expect(textoResposta).not.toContain(trechoChave)
      expect(textoResposta).not.toContain(marcadorCorpoToken)

      const textoConsole = textoDosLogs(spyConsole)
      expect(textoConsole).not.toContain(sa.private_key)
      expect(textoConsole).not.toContain(trechoChave)
      expect(textoConsole).not.toContain(marcadorCorpoToken)
    } finally {
      spyConsole.mockRestore()
      mock.restaurar()
    }
  })

  test('leitura do range falha com corpo sensível (token OK antes) — nem a chave privada, nem o access token, nem o corpo do Sheets aparecem na resposta OU no console.error', async () => {
    const sa = await gerarServiceAccountSegura(
      'seg-sheets-falha@projeto-de-teste.iam.gserviceaccount.com',
    )
    const spreadsheetId = 'planilha-seguranca-sheets'
    const marcadorAccessToken = 'MARCADOR-ACCESS-TOKEN-NAO-PODE-VAZAR'
    const marcadorCorpoSheets = 'MARCADOR-CORPO-SHEETS-NAO-PODE-VAZAR'
    const mock = instalarMockComCorpo(
      sa.token_uri,
      spreadsheetId,
      'A2:F',
      {
        status: 200,
        body: {
          access_token: marcadorAccessToken,
          token_type: 'Bearer',
          expires_in: 3599,
        },
      },
      {
        status: 500,
        body: { error: { message: marcadorCorpoSheets } },
      },
    )
    const spyConsole = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const cookie = await cookieDeSessaoValido(
        'seg-sheets-falha-user@example.com',
        'Seg Sheets',
      )
      const res = await app.request(
        '/votacao/categorias',
        { headers: { cookie } },
        {
          ...testEnv(),
          GOOGLE_SA_JSON: JSON.stringify(sa),
          GSHEETS_MOVIES_SPREADSHEET_ID: spreadsheetId,
        },
      )
      expect(res.status).toBe(502)

      const trechoChave = trechoChaveSemQuebras(sa)
      const textoResposta = await res.text()
      expect(textoResposta).not.toContain(sa.private_key)
      expect(textoResposta).not.toContain(trechoChave)
      expect(textoResposta).not.toContain(marcadorAccessToken)
      expect(textoResposta).not.toContain(marcadorCorpoSheets)

      const textoConsole = textoDosLogs(spyConsole)
      expect(textoConsole).not.toContain(sa.private_key)
      expect(textoConsole).not.toContain(trechoChave)
      expect(textoConsole).not.toContain(marcadorAccessToken)
      expect(textoConsole).not.toContain(marcadorCorpoSheets)
    } finally {
      spyConsole.mockRestore()
      mock.restaurar()
    }
  })
})
