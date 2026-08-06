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

/**
 * Semeia com `id` EXPLÍCITO (SQLite aceita atribuir qualquer inteiro a uma
 * coluna `INTEGER PRIMARY KEY`, mesmo fora da sequência de autoincremento)
 * — necessário pro teste que prova `id DESC` mesmo quando `created_at` está
 * fora de ordem em relação ao `id` (Fix round 1, Finding 1).
 */
async function novaSessaoComId(row: {
  id: number
  title: string
  status: 'open' | 'closed'
  createdBy: number
  createdAt: string
}): Promise<void> {
  await DB.prepare(
    `INSERT INTO voting_sessions (id, title, status, created_by, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(row.id, row.title, row.status, row.createdBy, row.createdAt)
    .run()
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
  it('ordena por id DESC — caso normal (inserido em ordem, id e created_at crescem juntos)', async () => {
    const userId = await novoUsuario('sub-list-ordem')
    // Inserido na MESMA ordem cronológica do created_at — id ascende junto
    // com a data, então id DESC e created_at DESC dão o mesmo resultado
    // aqui (este teste sozinho NÃO discrimina entre os dois critérios; quem
    // discrimina é o teste seguinte, de propósito).
    const antiga = await novaSessao(userId, {
      title: 'Antiga',
      createdAt: '2026-01-01 00:00:00',
    })
    const media = await novaSessao(userId, {
      title: 'Média',
      createdAt: '2026-03-01 00:00:00',
    })
    const nova = await novaSessao(userId, {
      title: 'Nova',
      createdAt: '2026-06-01 00:00:00',
    })

    const rows = await listVotingSessions(DB, { limit: 20, offset: 0 })
    expect(rows.map((r) => r.id)).toEqual([nova, media, antiga])
  })

  // ⚠️ Fix round 1 (Finding 1): este é o caso que SÓ passa com `ORDER BY id
  // DESC` — com `created_at DESC` (a versão original, errada, desta
  // função) o resultado seria [id 1, id 2], o INVERSO do esperado. Sem
  // este teste, `created_at DESC` e `id DESC` são indistinguíveis (todo
  // outro teste deste arquivo insere em ordem crescente nos dois campos ao
  // mesmo tempo) e a suíte não prova a paridade de verdade — só que ALGUMA
  // ordenação por data/id crescente funciona.
  it('ordena por id DESC mesmo quando created_at diverge da ordem de id — só passa com id DESC (sessions.go:52, não usa created_at)', async () => {
    const userId = await novoUsuario('sub-list-ordem-id-diverge')
    // id=1 tem o created_at MAIS RECENTE; id=2 tem o MAIS ANTIGO — invertido
    // de propósito.
    await novaSessaoComId({
      id: 1,
      title: 'Id baixo, created_at recente',
      status: 'open',
      createdBy: userId,
      createdAt: '2026-06-01 00:00:00',
    })
    await novaSessaoComId({
      id: 2,
      title: 'Id alto, created_at antigo',
      status: 'open',
      createdBy: userId,
      createdAt: '2026-01-01 00:00:00',
    })

    const rows = await listVotingSessions(DB, { limit: 20, offset: 0 })
    // id DESC ⇒ [2, 1]. Se a implementação voltasse a ordenar por
    // created_at DESC, isto falharia com [1, 2].
    expect(rows.map((r) => r.id)).toEqual([2, 1])
  })

  it('respeita limit e offset (paginação sobre a ordem id DESC)', async () => {
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
    // ids[4] tem o maior id (inserido por último).
    const pagina1 = await listVotingSessions(DB, { limit: 2, offset: 0 })
    expect(pagina1.map((r) => r.id)).toEqual([ids[4], ids[3]])

    const pagina2 = await listVotingSessions(DB, { limit: 2, offset: 2 })
    expect(pagina2.map((r) => r.id)).toEqual([ids[2], ids[1]])

    const pagina3 = await listVotingSessions(DB, { limit: 2, offset: 4 })
    expect(pagina3.map((r) => r.id)).toEqual([ids[0]])
  })

  // ⚠️ Fix round 1 (Finding 2): reforçado para provar o VALOR EFETIVO do
  // clamp, não só "devolveu resultado nenhum a mais que o esperado". Com
  // só 3 linhas semeadas, `toHaveLength(3)` passaria pra QUALQUER limit
  // efetivo >= 3 (20, 50, 100...) — não discrimina o clamp de verdade.
  // Semeando 25 linhas (mais que os 20 do default), `toHaveLength(20)`
  // só passa se o clamp caiu EXATAMENTE no default, nunca em 100 (o teto
  // documentado) nem nas 25 linhas reais.
  it('limit fora de (0,100] cai pro default 20 EXATO — mesmo clamp do Store Go (sessions.go:45-51)', async () => {
    const userId = await novoUsuario('sub-list-clamp-limit')
    for (let i = 0; i < 25; i++) {
      await novaSessao(userId, {
        title: `S${i}`,
        createdAt: `2026-02-${String(i + 1).padStart(2, '0')} 00:00:00`,
      })
    }

    await expect(
      listVotingSessions(DB, { limit: 0, offset: 0 }),
    ).resolves.toHaveLength(20)
    await expect(
      listVotingSessions(DB, { limit: -5, offset: 0 }),
    ).resolves.toHaveLength(20)
    // 200 > 100: NÃO vira 100 (haveria 25 disponíveis pra confirmar um teto
    // em 100 se fosse o caso), vira o default 20 — comportamento medido no
    // Go, onde limit>100 reseta pro default em vez de ser truncado.
    await expect(
      listVotingSessions(DB, { limit: 200, offset: 0 }),
    ).resolves.toHaveLength(20)
    // Controle positivo: um limit válido dentro de (0,100] passa direto,
    // sem cair no clamp — prova que o clamp é sobre a FAIXA, não um teto
    // silencioso escondendo todo valor grande.
    await expect(
      listVotingSessions(DB, { limit: 25, offset: 0 }),
    ).resolves.toHaveLength(25)
  })

  it('offset negativo cai pra 0 EXATO — mesmo resultado de offset:0, não um valor arbitrário', async () => {
    const userId = await novoUsuario('sub-list-clamp-offset')
    const ids: number[] = []
    for (let i = 0; i < 5; i++) {
      ids.push(
        await novaSessao(userId, {
          title: `O${i}`,
          createdAt: `2026-03-0${i + 1} 00:00:00`,
        }),
      )
    }

    const comOffsetNegativo = await listVotingSessions(DB, {
      limit: 3,
      offset: -10,
    })
    const comOffsetZero = await listVotingSessions(DB, {
      limit: 3,
      offset: 0,
    })
    // Mesma página exata — não só "algum resultado", o valor efetivo é 0.
    expect(comOffsetNegativo.map((r) => r.id)).toEqual(
      comOffsetZero.map((r) => r.id),
    )
    expect(comOffsetNegativo.map((r) => r.id)).toEqual([ids[4], ids[3], ids[2]])
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
