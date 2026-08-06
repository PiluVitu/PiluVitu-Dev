import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import {
  countVoters,
  getUserVotedMovieIds,
  listSessionVotesWithUsers,
  listVoteMovieIds,
  MovieNotInSessionError,
  replaceUserVotes,
} from './votes'

const DB = env.DB

// --------------------------------------------------------------------------
// Helpers de fixture — mesmo padrão de domain/sessions.test.ts: semeia o D1
// direto via INSERT. beforeEach global (test-setup.ts) já reseta o banco
// entre testes.
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

async function novaSessao(createdBy: number, title = 'Sessão de teste') {
  const row = await DB.prepare(
    `INSERT INTO voting_sessions (title, status, created_by) VALUES (?, 'open', ?) RETURNING id`,
  )
    .bind(title, createdBy)
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
    `INSERT INTO session_movies (session_id, category, title, type) VALUES (?, ?, ?, 'filme') RETURNING id`,
  )
    .bind(sessionId, category, title)
    .first<{ id: number }>()
  if (row === null) throw new Error('RETURNING id não devolveu linha')
  return row.id
}

async function votosDoUsuario(
  sessionId: number,
  userId: number,
): Promise<number[]> {
  const { results } = await DB.prepare(
    `SELECT movie_id FROM votes WHERE session_id = ? AND user_id = ? ORDER BY movie_id ASC`,
  )
    .bind(sessionId, userId)
    .all<{ movie_id: number }>()
  return results.map((r) => r.movie_id)
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

describe('replaceUserVotes', () => {
  it('happy path — grava as aprovações', async () => {
    const userId = await novoUsuario('sub-happy')
    const sessionId = await novaSessao(userId)
    const m1 = await novoFilme(sessionId, 'Ação')
    const m2 = await novoFilme(sessionId, 'Drama')

    const out = await replaceUserVotes(DB, sessionId, userId, [m1, m2])
    expect(out).toEqual([m1, m2])
    expect(await votosDoUsuario(sessionId, userId)).toEqual(
      [m1, m2].sort((a, b) => a - b),
    )
  })

  it('reenvio SUBSTITUI o conjunto inteiro — não faz merge', async () => {
    const userId = await novoUsuario('sub-substitui')
    const sessionId = await novaSessao(userId)
    const m1 = await novoFilme(sessionId, 'Ação')
    const m2 = await novoFilme(sessionId, 'Drama')
    const m3 = await novoFilme(sessionId, 'Comédia')

    await replaceUserVotes(DB, sessionId, userId, [m1, m2])
    expect(await votosDoUsuario(sessionId, userId)).toHaveLength(2)

    await replaceUserVotes(DB, sessionId, userId, [m3])
    expect(await votosDoUsuario(sessionId, userId)).toEqual([m3])
  })

  it('conjunto vazio LIMPA os votos — operação válida, não erro', async () => {
    const userId = await novoUsuario('sub-limpa')
    const sessionId = await novaSessao(userId)
    const m1 = await novoFilme(sessionId, 'Ação')

    await replaceUserVotes(DB, sessionId, userId, [m1])
    expect(await votosDoUsuario(sessionId, userId)).toHaveLength(1)

    const out = await replaceUserVotes(DB, sessionId, userId, [])
    expect(out).toEqual([])
    expect(await votosDoUsuario(sessionId, userId)).toEqual([])
  })

  it('filme fora da sessão ⇒ MovieNotInSessionError, sem tocar no banco (validado ANTES do SELECT id FROM session_movies)', async () => {
    const userId = await novoUsuario('sub-fora')
    const sessionId = await novaSessao(userId)
    const m1 = await novoFilme(sessionId, 'Ação')

    await expect(
      replaceUserVotes(DB, sessionId, userId, [m1, 999999]),
    ).rejects.toThrow(MovieNotInSessionError)
    // Nenhuma linha gravada — rejeição não é destrutiva.
    expect(await votosDoUsuario(sessionId, userId)).toEqual([])
  })

  it('rejeição é NÃO DESTRUTIVA — votos existentes sobrevivem a um replace rejeitado (paridade com TestReplaceUserVotesRejectionIsNonDestructive do Go)', async () => {
    const userId = await novoUsuario('sub-nao-destrutivo')
    const sessionId = await novaSessao(userId)
    const m1 = await novoFilme(sessionId, 'Ação')
    const m2 = await novoFilme(sessionId, 'Drama')

    await replaceUserVotes(DB, sessionId, userId, [m1, m2])
    expect(await votosDoUsuario(sessionId, userId)).toHaveLength(2)

    await expect(
      replaceUserVotes(DB, sessionId, userId, [m1, 999999]),
    ).rejects.toThrow(MovieNotInSessionError)

    expect(await votosDoUsuario(sessionId, userId)).toEqual(
      [m1, m2].sort((a, b) => a - b),
    )
  })

  it('ids repetidos no corpo são deduplicados — não vira 500 por violar UNIQUE(session_id, user_id, movie_id)', async () => {
    const userId = await novoUsuario('sub-dedupe')
    const sessionId = await novaSessao(userId)
    const m1 = await novoFilme(sessionId, 'Ação')

    const out = await replaceUserVotes(DB, sessionId, userId, [m1, m1, m1])
    expect(out).toEqual([m1])
    expect(await votosDoUsuario(sessionId, userId)).toEqual([m1])
  })

  it('dois usuários na mesma sessão votam de forma independente', async () => {
    const u1 = await novoUsuario('sub-u1')
    const u2 = await novoUsuario('sub-u2')
    const sessionId = await novaSessao(u1)
    const m1 = await novoFilme(sessionId, 'Ação')

    await replaceUserVotes(DB, sessionId, u1, [m1])
    await replaceUserVotes(DB, sessionId, u2, [m1])

    expect(await votosDoUsuario(sessionId, u1)).toEqual([m1])
    expect(await votosDoUsuario(sessionId, u2)).toEqual([m1])
  })

  it('lote acima do teto de 33 linhas/statement gera múltiplos statements num único batch (regressão do teto de 100 bound params)', async () => {
    const userId = await novoUsuario('sub-chunk')
    const sessionId = await novaSessao(userId)
    // 70 filmes -> ceil(70/33) = 3 statements de INSERT + 1 DELETE = 4.
    const movieIds: number[] = []
    for (let i = 0; i < 70; i++) {
      movieIds.push(await novoFilme(sessionId, `categoria-${i}`))
    }

    const batchSizes: number[] = []
    const spyDb = new Proxy(DB, {
      get(target, prop, receiver) {
        if (prop === 'batch') {
          return (statements: D1PreparedStatement[]) => {
            batchSizes.push(statements.length)
            return target.batch(statements)
          }
        }
        const value = Reflect.get(target, prop, receiver)
        return typeof value === 'function' ? value.bind(target) : value
      },
    }) as D1Database

    const out = await replaceUserVotes(spyDb, sessionId, userId, movieIds)
    expect(out).toHaveLength(70)
    // 1 DELETE + ceil(70/33)=3 INSERTs = 4 statements, num único batch().
    expect(batchSizes).toEqual([4])

    expect(await votosDoUsuario(sessionId, userId)).toEqual(
      [...movieIds].sort((a, b) => a - b),
    )
  })
})

// --------------------------------------------------------------------------
// getUserVotedMovieIds — movida de `domain/sessions.test.ts` na I3 (revisão
// final): a função LÊ `votes`, tabela da qual este arquivo é dono desde o
// corte por TABELA/AGREGADO (ver o cabeçalho de `domain/votes.ts`). Mesmo
// corpo de teste, só o `import` mudou.
// --------------------------------------------------------------------------

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

// --------------------------------------------------------------------------
// Apuração (Task 4, fatia2 T4) — listVoteMovieIds/countVoters, leitura pra
// GET /results. A escrita de POST /close (closeVotingSession/
// setSessionWinner) mora em `domain/sessions.test.ts` desde a I3 (revisão
// final) — escreve `voting_sessions`, não `votes`.
// --------------------------------------------------------------------------

describe('listVoteMovieIds', () => {
  it('sessão sem voto devolve array vazio', async () => {
    const userId = await novoUsuario('sub-tally-vazio')
    const sessionId = await novaSessao(userId)

    await expect(listVoteMovieIds(DB, sessionId)).resolves.toEqual([])
  })

  it('devolve um item por LINHA de votes — não deduplicado por movieId', async () => {
    const u1 = await novoUsuario('sub-tally-u1')
    const u2 = await novoUsuario('sub-tally-u2')
    const sessionId = await novaSessao(u1)
    const m1 = await novoFilme(sessionId, 'Ação')
    const m2 = await novoFilme(sessionId, 'Drama')

    await replaceUserVotes(DB, sessionId, u1, [m1, m2])
    await replaceUserVotes(DB, sessionId, u2, [m1])

    const votos = await listVoteMovieIds(DB, sessionId)
    // 3 linhas: (u1,m1) (u1,m2) (u2,m1) — não 2 (não é um DISTINCT movie_id).
    expect(votos).toHaveLength(3)
    expect(votos.map((v) => v.movieId).sort((a, b) => a - b)).toEqual(
      [m1, m1, m2].sort((a, b) => a - b),
    )
  })

  it('votos de outras sessões não vazam', async () => {
    const userId = await novoUsuario('sub-tally-isolado')
    const sessionA = await novaSessao(userId)
    const sessionB = await novaSessao(userId)
    const mA = await novoFilme(sessionA, 'Ação')
    const mB = await novoFilme(sessionB, 'Drama')

    await replaceUserVotes(DB, sessionA, userId, [mA])
    await replaceUserVotes(DB, sessionB, userId, [mB])

    expect(await listVoteMovieIds(DB, sessionA)).toEqual([{ movieId: mA }])
  })
})

describe('countVoters', () => {
  it('sessão sem voto devolve 0', async () => {
    const userId = await novoUsuario('sub-voters-vazio')
    const sessionId = await novaSessao(userId)

    await expect(countVoters(DB, sessionId)).resolves.toBe(0)
  })

  // ⚠️ O caso que PROVA que total_votes (linhas) e total_voters (usuários
  // distintos) medem coisas diferentes — 1 pessoa aprovando 3 filmes é
  // total_votes:3 mas total_voters:1. Um teste onde os dois números batem
  // (ex.: 1 voto por usuário) não discriminaria countVoters de
  // listVoteMovieIds(...).length.
  it('1 usuário votando em 3 filmes: countVoters=1, listVoteMovieIds tem 3 linhas — os dois números DIVERGEM de propósito', async () => {
    const userId = await novoUsuario('sub-voters-diverge')
    const sessionId = await novaSessao(userId)
    const m1 = await novoFilme(sessionId, 'Ação')
    const m2 = await novoFilme(sessionId, 'Drama')
    const m3 = await novoFilme(sessionId, 'Comédia')

    await replaceUserVotes(DB, sessionId, userId, [m1, m2, m3])

    await expect(countVoters(DB, sessionId)).resolves.toBe(1)
    await expect(listVoteMovieIds(DB, sessionId)).resolves.toHaveLength(3)
  })

  it('conta usuários DISTINTOS — 2 usuários votando no mesmo filme é countVoters=2', async () => {
    const u1 = await novoUsuario('sub-voters-u1')
    const u2 = await novoUsuario('sub-voters-u2')
    const sessionId = await novaSessao(u1)
    const m1 = await novoFilme(sessionId, 'Ação')

    await replaceUserVotes(DB, sessionId, u1, [m1])
    await replaceUserVotes(DB, sessionId, u2, [m1])

    await expect(countVoters(DB, sessionId)).resolves.toBe(2)
  })
})

// --------------------------------------------------------------------------
// `listSessionVotesWithUsers` (Task 6, fatia2 T6) — o JOIN admin-only que
// quebra o anonimato do voto. Porte de `Store.ListSessionVotesWithUsers`
// (`apps/api/internal/votacao/votes.go:99-127`). Este arquivo testa só o
// SELECT em si (I/O puro, sem guard nenhum — quem decide 403/404 é a rota);
// os testes de guard/status HTTP ficam em `routes/votacao.test.ts`.
// --------------------------------------------------------------------------

describe('listSessionVotesWithUsers', () => {
  it('sessão sem voto devolve array vazio', async () => {
    const userId = await novoUsuario('sub-votedetail-vazio')
    const sessionId = await novaSessao(userId)

    await expect(listSessionVotesWithUsers(DB, sessionId)).resolves.toEqual([])
  })

  it('sessão inexistente devolve array vazio — nunca lança (mesma família de listVoteMovieIds/results, que também não checa existência)', async () => {
    await expect(listSessionVotesWithUsers(DB, 999999)).resolves.toEqual([])
  })

  it('happy path — JOIN devolve user_id/user_name/user_email/movie_id/movie_title/category, snake_case; created_at ainda CRU (sem toIsoUtc — normalização é responsabilidade da ROTA, não deste SELECT)', async () => {
    const userId = await novoUsuario('sub-votedetail-happy') // email/name derivados do googleSub por novoUsuario
    const sessionId = await novaSessao(userId)
    const m1 = await novoFilme(sessionId, 'terror', 'Um Filme')
    await replaceUserVotes(DB, sessionId, userId, [m1])

    const details = await listSessionVotesWithUsers(DB, sessionId)
    expect(details).toHaveLength(1)
    const [d] = details
    expect(d).toMatchObject({
      user_id: userId,
      user_name: 'User sub-votedetail-happy',
      user_email: 'sub-votedetail-happy@example.com',
      movie_id: m1,
      movie_title: 'Um Filme',
      category: 'terror',
    })
    // CURRENT_TIMESTAMP do SQLite: espaço como separador, sem T nem Z — o
    // mesmo formato cru que lib/dates.ts#toIsoUtc normaliza NA ROTA.
    expect(d?.created_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })

  it('um item POR LINHA de votes — 1 pessoa aprovando 2 filmes gera 2 linhas (voto de aprovação, nunca colapsado por usuário)', async () => {
    const userId = await novoUsuario('sub-votedetail-aprovacao')
    const sessionId = await novaSessao(userId)
    const m1 = await novoFilme(sessionId, 'Ação')
    const m2 = await novoFilme(sessionId, 'Drama')
    await replaceUserVotes(DB, sessionId, userId, [m1, m2])

    const details = await listSessionVotesWithUsers(DB, sessionId)
    expect(details).toHaveLength(2)
    expect(details.map((d) => d.user_id)).toEqual([userId, userId])
    expect(details.map((d) => d.movie_id).sort((a, b) => a - b)).toEqual(
      [m1, m2].sort((a, b) => a - b),
    )
  })

  it('votos de outras sessões não vazam', async () => {
    const userId = await novoUsuario('sub-votedetail-isolado')
    const sessionA = await novaSessao(userId)
    const sessionB = await novaSessao(userId)
    const mA = await novoFilme(sessionA, 'Ação')
    const mB = await novoFilme(sessionB, 'Drama')
    await replaceUserVotes(DB, sessionA, userId, [mA])
    await replaceUserVotes(DB, sessionB, userId, [mB])

    const details = await listSessionVotesWithUsers(DB, sessionA)
    expect(details).toHaveLength(1)
    expect(details[0]?.movie_id).toBe(mA)
  })

  // ⚠️ Discrimina de verdade contra "ordem de leitura/inserção": o voto mais
  // NOVO por created_at é gravado com o id de LINHA menor (inserido
  // primeiro), o mais ANTIGO por created_at com o id maior (inserido
  // depois) — só passa se a query ordenar por `v.created_at ASC` de fato,
  // igual ao Go (`votes.go:108`), não por rowid/ordem de inserção.
  it('ordena por created_at ASC (oldest first) — porte do ORDER BY v.created_at ASC do Go', async () => {
    const userId = await novoUsuario('sub-votedetail-ordem')
    const sessionId = await novaSessao(userId)
    const maisNovo = await novoFilme(sessionId, 'Ação', 'Mais novo')
    const maisAntigo = await novoFilme(sessionId, 'Drama', 'Mais antigo')

    await DB.prepare(
      `INSERT INTO votes (session_id, user_id, movie_id, created_at) VALUES (?, ?, ?, ?)`,
    )
      .bind(sessionId, userId, maisNovo, '2026-06-01 00:00:00')
      .run()
    await DB.prepare(
      `INSERT INTO votes (session_id, user_id, movie_id, created_at) VALUES (?, ?, ?, ?)`,
    )
      .bind(sessionId, userId, maisAntigo, '2026-01-01 00:00:00')
      .run()

    const details = await listSessionVotesWithUsers(DB, sessionId)
    expect(details.map((d) => d.movie_id)).toEqual([maisAntigo, maisNovo])
  })
})
