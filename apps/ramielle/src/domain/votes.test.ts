import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { MovieNotInSessionError, replaceUserVotes } from './votes'

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
