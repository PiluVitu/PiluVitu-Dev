import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import {
  getSessionMovies,
  getUserVotedMovieIds,
  getVotingSession,
  listVotingSessions,
} from './sessions'

const DB = env.DB

// --------------------------------------------------------------------------
// Helpers de fixture — semeiam o D1 direto via INSERT (mesmo padrão de
// schema.test.ts). Cada teste usa google_sub/emails próprios; o reset() do
// beforeEach global (test-setup.ts) já limpa tudo entre testes.
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

async function novaSessao(
  createdBy: number,
  opts: {
    title?: string
    createdAt?: string
    status?: 'open' | 'closed'
  } = {},
): Promise<number> {
  const {
    title = 'Sessão de teste',
    createdAt = '2026-05-19 12:00:00',
    status = 'open',
  } = opts
  const row = await DB.prepare(
    `INSERT INTO voting_sessions (title, status, created_by, created_at)
     VALUES (?, ?, ?, ?)
     RETURNING id`,
  )
    .bind(title, status, createdBy, createdAt)
    .first<{ id: number }>()
  if (row === null) throw new Error('RETURNING id não devolveu linha')
  return row.id
}

async function novoFilme(
  sessionId: number,
  category: string,
  title = 'Filme',
): Promise<number> {
  const row = await DB.prepare(
    `INSERT INTO session_movies (session_id, category, title, type)
     VALUES (?, ?, ?, 'filme')
     RETURNING id`,
  )
    .bind(sessionId, category, title)
    .first<{ id: number }>()
  if (row === null) throw new Error('RETURNING id não devolveu linha')
  return row.id
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

// --------------------------------------------------------------------------

describe('getVotingSession', () => {
  it('sessão inexistente devolve null — não lança', async () => {
    await expect(getVotingSession(DB, 999999)).resolves.toBeNull()
  })

  it('sessão existente devolve a row com as colunas esperadas', async () => {
    const userId = await novoUsuario('sub-get-existente')
    const sessionId = await novaSessao(userId, { title: 'Minha sessão' })

    const row = await getVotingSession(DB, sessionId)
    expect(row).not.toBeNull()
    expect(row?.id).toBe(sessionId)
    expect(row?.title).toBe('Minha sessão')
    expect(row?.status).toBe('open')
    expect(row?.created_by).toBe(userId)
    expect(row?.closed_at).toBeNull()
    expect(row?.winner_movie_id).toBeNull()
    expect(row?.winner_method).toBeNull()
  })
})

describe('listVotingSessions', () => {
  it('ordena por created_at DESC', async () => {
    const userId = await novoUsuario('sub-list-ordem')
    const antiga = await novaSessao(userId, {
      title: 'Antiga',
      createdAt: '2026-01-01 00:00:00',
    })
    const nova = await novaSessao(userId, {
      title: 'Nova',
      createdAt: '2026-06-01 00:00:00',
    })
    const media = await novaSessao(userId, {
      title: 'Média',
      createdAt: '2026-03-01 00:00:00',
    })

    const rows = await listVotingSessions(DB, { limit: 20, offset: 0 })
    expect(rows.map((r) => r.id)).toEqual([nova, media, antiga])
  })

  it('respeita limit e offset (paginação sobre a ordem created_at DESC)', async () => {
    const userId = await novoUsuario('sub-list-paginacao')
    const ids: number[] = []
    for (let i = 0; i < 5; i++) {
      ids.push(
        await novaSessao(userId, {
          title: `Sessão ${i}`,
          createdAt: `2026-01-0${i + 1} 00:00:00`,
        }),
      )
    }
    // ids[4] tem o created_at mais recente (2026-01-05), ids[0] o mais antigo.
    const pagina1 = await listVotingSessions(DB, { limit: 2, offset: 0 })
    expect(pagina1.map((r) => r.id)).toEqual([ids[4], ids[3]])

    const pagina2 = await listVotingSessions(DB, { limit: 2, offset: 2 })
    expect(pagina2.map((r) => r.id)).toEqual([ids[2], ids[1]])

    const pagina3 = await listVotingSessions(DB, { limit: 2, offset: 4 })
    expect(pagina3.map((r) => r.id)).toEqual([ids[0]])
  })

  it('limit fora de (0,100] cai pro default 20 — mesmo clamp do Store Go (sessions.go:45-51)', async () => {
    const userId = await novoUsuario('sub-list-clamp-limit')
    for (let i = 0; i < 3; i++) {
      await novaSessao(userId, {
        title: `S${i}`,
        createdAt: `2026-02-0${i + 1} 00:00:00`,
      })
    }

    await expect(
      listVotingSessions(DB, { limit: 0, offset: 0 }),
    ).resolves.toHaveLength(3)
    await expect(
      listVotingSessions(DB, { limit: -5, offset: 0 }),
    ).resolves.toHaveLength(3)
    // 200 > 100: NÃO vira 100, vira o default 20 — comportamento medido no Go.
    await expect(
      listVotingSessions(DB, { limit: 200, offset: 0 }),
    ).resolves.toHaveLength(3)
  })

  it('offset negativo cai pra 0', async () => {
    const userId = await novoUsuario('sub-list-clamp-offset')
    await novaSessao(userId)

    const rows = await listVotingSessions(DB, { limit: 20, offset: -10 })
    expect(rows).toHaveLength(1)
  })
})

describe('getSessionMovies', () => {
  it('sessão sem filmes devolve array vazio', async () => {
    const userId = await novoUsuario('sub-movies-vazio')
    const sessionId = await novaSessao(userId)

    await expect(getSessionMovies(DB, sessionId)).resolves.toEqual([])
  })

  it('filmes vêm ordenados de forma estável (id ASC)', async () => {
    const userId = await novoUsuario('sub-movies-ordem')
    const sessionId = await novaSessao(userId)
    const m1 = await novoFilme(sessionId, 'acao', 'Filme A')
    const m2 = await novoFilme(sessionId, 'comedia', 'Filme B')
    const m3 = await novoFilme(sessionId, 'terror', 'Filme C')

    const rows = await getSessionMovies(DB, sessionId)
    expect(rows.map((r) => r.id)).toEqual([m1, m2, m3])
  })
})

describe('getUserVotedMovieIds', () => {
  it('usuário sem voto devolve array vazio, não null', async () => {
    const userId = await novoUsuario('sub-votes-nenhum')
    const sessionId = await novaSessao(userId)

    await expect(getUserVotedMovieIds(DB, sessionId, userId)).resolves.toEqual(
      [],
    )
  })

  it('devolve os movie_ids ordenados asc, mesmo votados fora de ordem', async () => {
    const userId = await novoUsuario('sub-votes-alguns')
    const sessionId = await novaSessao(userId)
    const m1 = await novoFilme(sessionId, 'acao', 'A')
    const m2 = await novoFilme(sessionId, 'comedia', 'B')
    // Vota em m2 primeiro, m1 depois — a ordem de inserção não deve importar.
    await votar(sessionId, userId, m2)
    await votar(sessionId, userId, m1)

    await expect(getUserVotedMovieIds(DB, sessionId, userId)).resolves.toEqual([
      m1,
      m2,
    ])
  })

  it('votos de outro usuário na mesma sessão não vazam', async () => {
    const userId = await novoUsuario('sub-votes-isolado-a')
    const outroUserId = await novoUsuario('sub-votes-isolado-b')
    const sessionId = await novaSessao(userId)
    const m1 = await novoFilme(sessionId, 'acao', 'A')
    await votar(sessionId, outroUserId, m1)

    await expect(getUserVotedMovieIds(DB, sessionId, userId)).resolves.toEqual(
      [],
    )
  })
})
