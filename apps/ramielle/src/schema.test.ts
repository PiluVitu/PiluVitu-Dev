import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

const DB = env.DB
const NOW = '2026-07-28T12:00:00Z'

// --------------------------------------------------------------------------
// Helpers de fixture — cada teste usa ids/emails próprios (o reset() do
// beforeEach global em src/test-setup.ts já limpa tudo entre testes, mas
// valores distintos deixam a falha legível se algo vazar mesmo assim).
// --------------------------------------------------------------------------

async function novoUsuario(googleSub: string): Promise<number> {
  const row = await DB.prepare(
    `INSERT INTO users (google_sub, email, name, is_admin, created_at)
     VALUES (?, ?, ?, 0, ?)
     RETURNING id`,
  )
    .bind(googleSub, `${googleSub}@example.com`, `User ${googleSub}`, NOW)
    .first<{ id: number }>()

  if (row === null) throw new Error('RETURNING id não devolveu linha')
  return row.id
}

async function novaSessao(
  createdBy: number,
  title = 'Sessão de teste',
): Promise<number> {
  const row = await DB.prepare(
    `INSERT INTO voting_sessions (title, status, created_by, created_at)
     VALUES (?, 'open', ?, ?)
     RETURNING id`,
  )
    .bind(title, createdBy, NOW)
    .first<{ id: number }>()

  if (row === null) throw new Error('RETURNING id não devolveu linha')
  return row.id
}

// --------------------------------------------------------------------------

describe('migration 0001 — tabelas e índices', () => {
  // ⚠️ 6 → 10 tabelas nesta task (T3): a 0002_better_auth.sql soma `user`,
  // `session`, `account`, `verification` (Better Auth) às 6 do domínio da
  // votação. Este teste conta TODAS as tabelas do banco (não filtra por
  // migration), então ele quebraria em silêncio assim que 0002 fosse
  // aplicada sem este ajuste — atualizado aqui de propósito, não uma
  // regressão da Task 3.
  it('cria exatamente as 10 tabelas (6 da votação + 4 do Better Auth)', async () => {
    const { results } = await DB.prepare(
      `SELECT name FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'
          AND name NOT LIKE '_cf_%'
          AND name <> 'd1_migrations'
        ORDER BY name`,
    ).all<{ name: string }>()

    expect(results.map((r) => r.name)).toEqual([
      'account',
      'backups',
      'session',
      'session_movies',
      'tiebreaks',
      'user',
      'users',
      'verification',
      'votes',
      'voting_sessions',
    ])
  })

  // ⚠️ 5 → 8 índices nesta task (T3): a 0002_better_auth.sql soma
  // account_userId_idx/session_userId_idx/verification_identifier_idx aos
  // 5 do domínio da votação — mesmo motivo do teste de tabelas acima.
  it('cria os 8 índices (5 da votação + 3 do Better Auth)', async () => {
    const { results } = await DB.prepare(
      `SELECT name FROM sqlite_master
        WHERE type = 'index'
          AND name NOT LIKE 'sqlite_autoindex_%'
        ORDER BY name`,
    ).all<{ name: string }>()

    expect(results.map((r) => r.name)).toEqual([
      'account_userId_idx',
      'idx_backups_created',
      'idx_session_movies_session',
      'idx_tiebreaks_session',
      'idx_votes_session',
      'idx_voting_sessions_created',
      'session_userId_idx',
      'verification_identifier_idx',
    ])
  })
})

describe('migration 0001 — STRICT', () => {
  // MEDIDO neste projeto (ver apps/financas/CLAUDE.md): coluna TEXT em
  // tabela STRICT NÃO rejeita INTEGER — ela CONVERTE (12345 vira '12345.0').
  // A direção que de fato rejeita é TEXT não-numérico dentro de coluna
  // INTEGER, com a mensagem real abaixo — é essa que o teste usa.
  it('STRICT recusa TEXT não-numérico em coluna INTEGER (users.is_admin)', async () => {
    await expect(
      DB.prepare(
        `INSERT INTO users (google_sub, email, name, is_admin, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
        .bind(
          'google-strict',
          'strict@example.com',
          'Strict User',
          'nao-e-numero',
          NOW,
        )
        .run(),
    ).rejects.toThrow(/cannot store TEXT value in INTEGER column/)
  })
})

describe('migration 0001 — CHECK', () => {
  it("CHECK de voting_sessions.status rejeita valor fora de ('open','closed')", async () => {
    const userId = await novoUsuario('google-check-status')

    await expect(
      DB.prepare(
        `INSERT INTO voting_sessions (title, status, created_by, created_at)
         VALUES (?, 'cancelado', ?, ?)`,
      )
        .bind('Sessão inválida', userId, NOW)
        .run(),
    ).rejects.toThrow(/CHECK constraint failed/)

    // controle positivo: 'open' e 'closed' são aceitos.
    const sessionId = await novaSessao(userId)
    const row = await DB.prepare(
      `SELECT status FROM voting_sessions WHERE id = ?`,
    )
      .bind(sessionId)
      .first<{ status: string }>()
    expect(row?.status).toBe('open')
  })

  it("CHECK de session_movies.type rejeita valor fora de ('filme','serie')", async () => {
    const userId = await novoUsuario('google-check-type')
    const sessionId = await novaSessao(userId)

    await expect(
      DB.prepare(
        `INSERT INTO session_movies (session_id, category, title, type)
         VALUES (?, 'categoria-a', 'Título', 'documentario')`,
      )
        .bind(sessionId)
        .run(),
    ).rejects.toThrow(/CHECK constraint failed/)
  })
})

describe('migration 0001 — UNIQUE', () => {
  it('UNIQUE (session_id, category) de session_movies rejeita a segunda linha', async () => {
    const userId = await novoUsuario('google-unique-category')
    const sessionId = await novaSessao(userId)

    await DB.prepare(
      `INSERT INTO session_movies (session_id, category, title, type)
       VALUES (?, 'acao', 'Filme A', 'filme')`,
    )
      .bind(sessionId)
      .run()

    await expect(
      DB.prepare(
        `INSERT INTO session_movies (session_id, category, title, type)
         VALUES (?, 'acao', 'Filme B', 'filme')`,
      )
        .bind(sessionId)
        .run(),
    ).rejects.toThrow(/UNIQUE constraint failed/)
  })

  it('UNIQUE (session_id, user_id, movie_id) de votes rejeita voto duplicado', async () => {
    const userId = await novoUsuario('google-unique-vote')
    const sessionId = await novaSessao(userId)
    const movie = await DB.prepare(
      `INSERT INTO session_movies (session_id, category, title, type)
       VALUES (?, 'acao', 'Filme A', 'filme')
       RETURNING id`,
    )
      .bind(sessionId)
      .first<{ id: number }>()
    if (movie === null) throw new Error('RETURNING id não devolveu linha')

    await DB.prepare(
      `INSERT INTO votes (session_id, user_id, movie_id, created_at) VALUES (?, ?, ?, ?)`,
    )
      .bind(sessionId, userId, movie.id, NOW)
      .run()

    await expect(
      DB.prepare(
        `INSERT INTO votes (session_id, user_id, movie_id, created_at) VALUES (?, ?, ?, ?)`,
      )
        .bind(sessionId, userId, movie.id, NOW)
        .run(),
    ).rejects.toThrow(/UNIQUE constraint failed/)
  })
})

describe('migration 0001 — foreign keys', () => {
  it('foreign_keys está ativo: voting_sessions.created_by órfão falha', async () => {
    await expect(
      DB.prepare(
        `INSERT INTO voting_sessions (title, status, created_by, created_at)
         VALUES (?, 'open', ?, ?)`,
      )
        .bind('Sessão órfã', 999999, NOW)
        .run(),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/)
  })
})

// --------------------------------------------------------------------------
// Step 5 do brief — a medição mais importante desta task: a premissa
// INTEIRA da decisão de manter PK INTEGER (em vez de trocar por UUID) é o
// D1 devolver o id gerado no MESMO statement via RETURNING. Se isso não
// funcionar, a saída é reportar BLOCKED — nunca contornar com
// last_insert_rowid() (medido no finanças como não confiável) nem trocar
// as PKs por conta própria.
// --------------------------------------------------------------------------

describe('migration 0001 — RETURNING id (Step 5, premissa da decisão de manter PK INTEGER)', () => {
  it('INSERT ... RETURNING id devolve um número maior que zero', async () => {
    const row = await DB.prepare(
      `INSERT INTO users (google_sub, email, name, is_admin, created_at)
       VALUES (?, ?, ?, 0, ?)
       RETURNING id`,
    )
      .bind(
        'google-returning-1',
        'returning1@example.com',
        'Returning One',
        NOW,
      )
      .first<{ id: number }>()

    expect(row).not.toBeNull()
    expect(typeof row?.id).toBe('number')
    expect(row?.id).toBeGreaterThan(0)
  })

  it('duas inserções sucessivas via RETURNING id devolvem ids diferentes', async () => {
    const primeiro = await DB.prepare(
      `INSERT INTO users (google_sub, email, name, is_admin, created_at)
       VALUES (?, ?, ?, 0, ?)
       RETURNING id`,
    )
      .bind(
        'google-returning-2a',
        'returning2a@example.com',
        'Returning 2A',
        NOW,
      )
      .first<{ id: number }>()

    const segundo = await DB.prepare(
      `INSERT INTO users (google_sub, email, name, is_admin, created_at)
       VALUES (?, ?, ?, 0, ?)
       RETURNING id`,
    )
      .bind(
        'google-returning-2b',
        'returning2b@example.com',
        'Returning 2B',
        NOW,
      )
      .first<{ id: number }>()

    expect(primeiro).not.toBeNull()
    expect(segundo).not.toBeNull()
    expect(primeiro?.id).toBeGreaterThan(0)
    expect(segundo?.id).toBeGreaterThan(0)
    expect(segundo?.id).not.toBe(primeiro?.id)
  })
})
