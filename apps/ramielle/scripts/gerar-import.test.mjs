// Testes do gerador do arquivo de import (fatia ④, Task 3). Roda sob
// `vitest.scripts.config.ts` (environment: 'node', SEM o pool do
// Miniflare/cloudflareTest do resto do Worker) — este script é Node puro,
// fora do Worker de propósito (lê SQLite local via `node:sqlite`, nunca
// toca o D1 diretamente). Rodar: pnpm --filter @piluvitu/ramielle run test
// (o script `test` encadeia os dois configs — ver package.json).
//
// Zero dado real do dono aqui: todo fixture é sintético, mas no MESMO
// FORMATO do banco real (ids buracados, sessão aberta/fechada, poster/tmdb
// NULL) — ver "Fatos medidos" em
// docs/superpowers/plans/2026-08-12-ramielle-fatia4-cutover.md.

import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, test } from 'vitest'
import {
  COLUNAS,
  lerBancoOrigem,
  gerarImport,
  gerarImportDeDados,
  sqlLiteral,
  parseArgs,
  defaultOutputPath,
  run,
} from './gerar-import.mjs'

// -------------------------------------------------------------------------
// Fixture: schema da Go, com a MESMA armadilha de ordem física do banco
// real — `winner_method` entra por ALTER TABLE (vai pro FIM fisicamente),
// nunca reescrito na posição "lógica" que schema.sql mostra hoje. Todo
// teste deste arquivo lê esta fixture, então a resiliência a essa ordem
// física é exercitada por TODA a suíte, não só por um teste isolado.
// -------------------------------------------------------------------------

const GO_SCHEMA = `
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  google_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  picture TEXT,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE voting_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  created_by INTEGER NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at DATETIME,
  winner_movie_id INTEGER,
  sort_options_json TEXT NOT NULL DEFAULT '{}'
);
-- winner_method entra por ALTER TABLE, DE PROPÓSITO — reproduz a ordem
-- FÍSICA real de produção: as 3 últimas colunas na Go são winner_movie_id,
-- sort_options_json, winner_method NESSA ORDEM FÍSICA (medido no plano),
-- não a ordem em que o schema.sql atual as escreve.
ALTER TABLE voting_sessions ADD COLUMN winner_method TEXT;

CREATE TABLE session_movies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  poster_url TEXT,
  tmdb_id INTEGER,
  was_watched INTEGER NOT NULL DEFAULT 0,
  sheet_number INTEGER,
  UNIQUE (session_id, category)
);

CREATE TABLE votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  movie_id INTEGER NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (session_id, user_id, movie_id)
);

CREATE TABLE backups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  drive_file_id TEXT NOT NULL,
  drive_file_name TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  trigger_type TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tiebreaks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  triggered_by INTEGER NOT NULL,
  tied_ids_json TEXT NOT NULL,
  client_entropy TEXT NOT NULL,
  server_nonce TEXT NOT NULL,
  winner_movie_id INTEGER NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`

const diretoriosTemp = []
function novoDirTemp() {
  const dir = mkdtempSync(path.join(tmpdir(), 'ramielle-import-'))
  diretoriosTemp.push(dir)
  return dir
}
afterEach(() => {
  while (diretoriosTemp.length > 0) {
    rmSync(diretoriosTemp.pop(), { recursive: true, force: true })
  }
})

function inserirLinha(db, tabela, colunas, valores) {
  const placeholders = colunas.map(() => '?').join(', ')
  db.prepare(`INSERT INTO ${tabela} (${colunas.join(', ')}) VALUES (${placeholders})`).run(
    ...valores,
  )
}

/**
 * Monta o SQLite de fixture no formato da Go — mesmas características do
 * banco real (ver "Fatos medidos"): ids buracados em `votes` (1,2,4,7 —
 * pula 3,5,6), uma sessão aberta (winner NULL) e uma fechada (winner
 * preenchido, com `winner_method`/`sort_options_json` DISTINGUÍVEIS — é
 * exatamente o par que o `.dump` trocaria em silêncio, reproduzido aqui do
 * jeito que o plano documentou: `winner_method='votes'`,
 * `sort_options_json='{"title":"Segundou"}'`), `poster_url`/`tmdb_id` NULL
 * em alguns filmes, e título/nome livres com aspas simples, acento e
 * emoji.
 */
function criarFixtureGo() {
  const dir = novoDirTemp()
  const dbPath = path.join(dir, 'votacao.db')
  const db = new DatabaseSync(dbPath)
  db.exec(GO_SCHEMA)

  inserirLinha(
    db,
    'users',
    ['id', 'google_sub', 'email', 'name', 'picture', 'is_admin', 'created_at'],
    [1, 'sub-ana', 'ana@example.com', "Ana D'Ávila", null, 1, '2026-05-01 10:00:00'],
  )
  inserirLinha(
    db,
    'users',
    ['id', 'google_sub', 'email', 'name', 'picture', 'is_admin', 'created_at'],
    [2, 'sub-joao', 'joao@example.com', 'João 😀', 'https://img/joao.jpg', 0, '2026-05-02 11:00:00'],
  )

  const colunasSessao = [
    'id',
    'title',
    'status',
    'created_by',
    'created_at',
    'closed_at',
    'winner_movie_id',
    'sort_options_json',
    'winner_method',
  ]
  inserirLinha(db, 'voting_sessions', colunasSessao, [
    1,
    'Sessão Aberta',
    'open',
    1,
    '2026-05-03 09:00:00',
    null,
    null,
    '{}',
    null,
  ])
  inserirLinha(db, 'voting_sessions', colunasSessao, [
    2,
    'Sessão de Sexta — "Terror"',
    'closed',
    1,
    '2026-05-04 09:00:00',
    '2026-05-04 22:00:00',
    5,
    '{"title":"Segundou"}',
    'votes',
  ])

  const colunasFilme = [
    'id',
    'session_id',
    'category',
    'title',
    'type',
    'poster_url',
    'tmdb_id',
    'was_watched',
    'sheet_number',
  ]
  inserirLinha(db, 'session_movies', colunasFilme, [
    1,
    1,
    'ação',
    "O Enigma d'O Sol",
    'filme',
    null,
    null,
    0,
    1,
  ])
  inserirLinha(db, 'session_movies', colunasFilme, [
    2,
    1,
    'comédia',
    'Se Beber, Não Case! 🍻',
    'filme',
    'https://img/2.jpg',
    555,
    0,
    2,
  ])
  inserirLinha(db, 'session_movies', colunasFilme, [
    5,
    2,
    'terror',
    'A Freira',
    'filme',
    'https://img/5.jpg',
    777,
    1,
    3,
  ])
  inserirLinha(db, 'session_movies', colunasFilme, [
    6,
    2,
    'suspense',
    'Corra!',
    'filme',
    null,
    null,
    0,
    4,
  ])

  const colunasVoto = ['id', 'session_id', 'user_id', 'movie_id', 'created_at']
  // ids buracados de propósito: 1,2,4,7 — pula 3,5,6 (desvotos, igual ao
  // banco real: 54 linhas, max id 81).
  inserirLinha(db, 'votes', colunasVoto, [1, 1, 1, 1, '2026-05-03 09:05:00'])
  inserirLinha(db, 'votes', colunasVoto, [2, 1, 2, 1, '2026-05-03 09:06:00'])
  inserirLinha(db, 'votes', colunasVoto, [4, 1, 1, 2, '2026-05-03 09:07:00'])
  inserirLinha(db, 'votes', colunasVoto, [7, 2, 2, 5, '2026-05-04 21:00:00'])

  const colunasTiebreak = [
    'id',
    'session_id',
    'triggered_by',
    'tied_ids_json',
    'client_entropy',
    'server_nonce',
    'winner_movie_id',
    'created_at',
  ]
  inserirLinha(db, 'tiebreaks', colunasTiebreak, [
    1,
    2,
    1,
    '[5,6]',
    'abc123',
    'def456ghi789',
    5,
    '2026-05-04 21:55:00',
  ])

  const colunasBackup = [
    'id',
    'drive_file_id',
    'drive_file_name',
    'size_bytes',
    'trigger_type',
    'created_at',
  ]
  inserirLinha(db, 'backups', colunasBackup, [
    1,
    'file-1',
    'backup-2026-05-04.sql',
    2048,
    'session_close',
    '2026-05-04 22:00:01',
  ])

  db.close()
  return dbPath
}

/**
 * Fixture GENUINAMENTE em WAL (`PRAGMA journal_mode = WAL`) — achado I2 do
 * fix round 1: nenhum outro teste deste arquivo tinha exercitado o formato
 * de journal que o banco REAL de produção usa (`criarFixtureGo` usa o
 * journal mode default, rollback). Medido (fix round 1): mesmo depois de
 * `close()` fazer checkpoint automático pro `.db` principal, REABRIR pra
 * LEITURA um banco marcado `journal_mode=WAL` recria `.db-shm`/`.db-wal` —
 * a leitura em si só funciona com o diretório GRAVÁVEL, não só com o `.db`
 * intacto (ver docstring de `lerBancoOrigem`).
 */
function criarFixtureGoWAL() {
  const dir = novoDirTemp()
  const dbPath = path.join(dir, 'votacao-wal.db')
  const db = new DatabaseSync(dbPath)
  db.exec('PRAGMA journal_mode = WAL;')
  db.exec(GO_SCHEMA)
  inserirLinha(
    db,
    'users',
    ['id', 'google_sub', 'email', 'name', 'picture', 'is_admin', 'created_at'],
    [1, 'sub-wal', 'wal@example.com', 'Usuário WAL', null, 0, '2026-05-01 10:00:00'],
  )
  db.close()
  return dbPath
}

/**
 * Banco SQLite válido mas TOTALMENTE sem schema — reproduz o pior caso do
 * achado I1 (fix round 1): copiar só o `.db` quando o schema INTEIRO
 * (não só as linhas) mora no `.db-wal` não copiado. A primeira `SELECT`
 * estoura `no such table`, ANTES de chegar no branch de "0 linhas" que
 * exige schema presente.
 */
function criarDbSemSchema() {
  const dir = novoDirTemp()
  const dbPath = path.join(dir, 'votacao-sem-schema.db')
  const db = new DatabaseSync(dbPath)
  db.close()
  return dbPath
}

/**
 * Banco SQLite com o schema real da Go, mas as 6 tabelas genuinamente
 * VAZIAS (0 linhas cada) — achado I1 (fix round 1): o teste anterior desse
 * cenário usava um `lerBancoOrigemImpl` MOCKADO devolvendo 6 arrays
 * vazios, um estado fabricado que `lerBancoOrigem` de verdade nunca
 * devolveria sozinho sem uma fonte real. Este helper produz o estado
 * genuíno via `node:sqlite`.
 */
function criarFixtureGoVazia() {
  const dir = novoDirTemp()
  const dbPath = path.join(dir, 'votacao-vazia.db')
  const db = new DatabaseSync(dbPath)
  db.exec(GO_SCHEMA)
  db.close()
  return dbPath
}

const MIGRATION_0001 = readFileSync(
  fileURLToPath(new URL('../migrations/0001_votacao.sql', import.meta.url)),
  'utf8',
)

/** Abre um SQLite em memória com o schema REAL do ramielle (migration
 * 0001) e FK ligada — mesma garantia que o D1 aplica (`PRAGMA foreign_keys
 * = 1`). Usado pra validar o SQL gerado ponta a ponta, offline, sem
 * depender de `wrangler`/rede. */
function abrirD1Sintetico() {
  const db = new DatabaseSync(':memory:')
  db.exec(MIGRATION_0001)
  db.exec('PRAGMA foreign_keys = ON;')
  return db
}

function contarLinha(db, tabela) {
  return db.prepare(`SELECT count(*) AS n FROM ${tabela}`).get().n
}

// =========================================================================
// gerarImport / gerarImportDeDados — geração do SQL
// =========================================================================

describe('gerarImport — lista explícita de colunas, ordem FK-safe', () => {
  test('todo INSERT tem lista explícita de colunas — nunca posicional', () => {
    const sql = gerarImport(criarFixtureGo())
    const inserts = sql.match(/INSERT INTO \w+/g) ?? []
    expect(inserts.length).toBeGreaterThan(0)
    // Nenhum `INSERT INTO tabela VALUES` (sem parênteses de colunas) —
    // regex exige uma lista `(coluna, coluna, ...)` logo após o nome da
    // tabela, antes de VALUES.
    expect(sql).not.toMatch(/INSERT INTO \w+\s+VALUES/i)
    expect(sql).toMatch(/INSERT INTO users \(id, google_sub, email, name, picture, is_admin, created_at\)/)
  })

  test('voting_sessions entra com winner_movie_id NULL e recebe UPDATE no fim (FK circular)', () => {
    const sql = gerarImport(criarFixtureGo())
    const idxInsertSessions = sql.indexOf('INSERT INTO voting_sessions')
    const idxInsertMovies = sql.indexOf('INSERT INTO session_movies')
    const idxUpdate = sql.indexOf('UPDATE voting_sessions')

    expect(idxInsertSessions).toBeGreaterThan(-1)
    expect(idxInsertMovies).toBeGreaterThan(-1)
    expect(idxUpdate).toBeGreaterThan(-1)
    expect(idxInsertSessions).toBeLessThan(idxInsertMovies) // sessão antes do filme
    expect(idxInsertMovies).toBeLessThan(idxUpdate) // UPDATE do vencedor por último

    // Nenhum INSERT INTO voting_sessions carrega um winner_movie_id
    // não-nulo — mesmo a sessão 2, que tem vencedor de verdade (id 5).
    const blocoInserts = sql.slice(idxInsertSessions, sql.indexOf('INSERT INTO session_movies'))
    const linhasInsert = blocoInserts
      .split('\n')
      .filter((l) => l.startsWith('INSERT INTO voting_sessions'))
    expect(linhasInsert).toHaveLength(2)
    for (const linha of linhasInsert) {
      // a lista de colunas termina com winner_movie_id, winner_method,
      // sort_options_json — os valores vêm na mesma ordem logo após
      // VALUES(. O valor de winner_movie_id (7º valor) é sempre NULL.
      const valores = linha.match(/VALUES \((.+)\);$/)[1]
      // separa respeitando aspas simples (nenhum valor deste fixture tem
      // vírgula dentro de string, então split simples basta aqui)
      const partes = valores.split(', ')
      const idxWinnerMovieId = COLUNAS.voting_sessions.indexOf('winner_movie_id')
      expect(partes[idxWinnerMovieId]).toBe('NULL')
    }

    // E o UPDATE existe só pra sessão 2 (a que tinha vencedor na origem).
    expect(sql).toMatch(/UPDATE voting_sessions SET winner_movie_id = 5 WHERE id = 2;/)
    expect(sql.match(/UPDATE voting_sessions/g)).toHaveLength(1)
  })

  test('preserva ids buracados de votes (1,2,4,7 — nada é renumerado)', () => {
    const sql = gerarImport(criarFixtureGo())
    const idxVotes = sql.indexOf('INSERT INTO votes')
    const idxTiebreaks = sql.indexOf('INSERT INTO tiebreaks')
    const blocoVotes = sql.slice(idxVotes, idxTiebreaks)
    const linhas = blocoVotes.split('\n').filter((l) => l.startsWith('INSERT INTO votes'))

    expect(linhas).toHaveLength(4)
    expect(linhas[0]).toContain('(id, session_id, user_id, movie_id, created_at) VALUES (1, ')
    expect(linhas[1]).toContain('VALUES (2, ')
    expect(linhas[2]).toContain('VALUES (4, ') // pula o 3 — desvoto
    expect(linhas[3]).toContain('VALUES (7, ') // pula 5 e 6

    // nenhum id de voto foi "corrigido" pra sequência contígua 1..4
    expect(sql).not.toMatch(/INSERT INTO votes \(id,.*VALUES \(3, /)
  })

  test('sessão sem vencedor (aberta) não gera UPDATE nenhum pra ela', () => {
    // M2 (fix round 1): a asserção negativa sozinha passa até com
    // `gerarImportDeDados` mutado pra `return ''` — precisa de uma
    // asserção POSITIVA que ancore que o SQL de fato tem conteúdo real.
    const sql = gerarImport(criarFixtureGo())
    expect(sql).toContain("INSERT INTO voting_sessions")
    expect(sql).toMatch(/VALUES \(1, 'Sess.o Aberta', 'open'/)
    // só existe UM UPDATE no arquivo inteiro — o da sessão 2 (que TEM
    // vencedor). Com `return ''`, o match abaixo dá `[]`, tamanho 0 ≠ 1.
    expect(sql.match(/UPDATE voting_sessions/g) ?? []).toHaveLength(1)
    expect(sql).not.toMatch(/UPDATE voting_sessions SET winner_movie_id = \d+ WHERE id = 1;/)
  })

  test('nunca lê nem escreve sqlite_sequence', () => {
    // M2 (fix round 1): idem — sem uma asserção positiva, `return ''`
    // passaria por vacuidade (string vazia também "não contém"
    // sqlite_sequence).
    const sql = gerarImport(criarFixtureGo())
    expect(sql).toContain('INSERT INTO users')
    expect(sql.match(/INSERT INTO \w+/g)?.length ?? 0).toBeGreaterThan(10)
    // nenhum statement (INSERT/UPDATE/DELETE) toca a tabela de controle do
    // AUTOINCREMENT — nem sequer a palavra aparece no SQL gerado.
    expect(sql.toLowerCase()).not.toContain('sqlite_sequence')
  })

  test('ordem completa das 6 tabelas + UPDATE final, na sequência FK-safe', () => {
    const sql = gerarImport(criarFixtureGo())
    const indices = [
      'INSERT INTO users',
      'INSERT INTO voting_sessions',
      'INSERT INTO session_movies',
      'INSERT INTO votes',
      'INSERT INTO tiebreaks',
      'INSERT INTO backups',
      'UPDATE voting_sessions',
    ].map((marcador) => sql.indexOf(marcador))

    for (let i = 1; i < indices.length; i++) {
      expect(indices[i - 1]).toBeLessThan(indices[i])
    }
  })
})

// =========================================================================
// Escaping — aspas simples, acento, emoji, tentativa de injeção
// =========================================================================

describe('sqlLiteral — escaping', () => {
  test('null e undefined viram NULL', () => {
    expect(sqlLiteral(null)).toBe('NULL')
    expect(sqlLiteral(undefined)).toBe('NULL')
  })

  test('number e bigint saem sem aspas', () => {
    expect(sqlLiteral(42)).toBe('42')
    expect(sqlLiteral(0)).toBe('0')
    expect(sqlLiteral(-1)).toBe('-1')
    expect(sqlLiteral(9007199254740993n)).toBe('9007199254740993')
  })

  test('string com uma aspa simples dobra a aspa', () => {
    expect(sqlLiteral("D'Ávila")).toBe("'D''Ávila'")
  })

  test('string com várias aspas simples dobra todas', () => {
    expect(sqlLiteral("''")).toBe("''''''")
  })

  test('acento e emoji sobrevivem literalmente (UTF-8 puro, sem escaping especial)', () => {
    expect(sqlLiteral('João 😀')).toBe("'João 😀'")
    expect(sqlLiteral('ação')).toBe("'ação'")
  })

  test('tentativa de injeção não escapa da string — vira dado, não comando', () => {
    const malicioso = "'); DROP TABLE users; --"
    const literal = sqlLiteral(malicioso)
    // a única aspa do payload (a primeira, que "fecharia" a string se não
    // fosse escapada) foi dobrada — abre com a aspa do gerador + a aspa
    // dobrada do payload, nunca fecha a string antes do ponto que o
    // atacante queria.
    expect(literal).toBe("'''); DROP TABLE users; --'")
    expect(literal.startsWith("'")).toBe(true)
    expect(literal.endsWith("'")).toBe(true)
  })

  test('lança em tipo inesperado (boolean/object) em vez de gerar SQL silenciosamente errado', () => {
    expect(() => sqlLiteral(true)).toThrow()
    expect(() => sqlLiteral({})).toThrow()
    expect(() => sqlLiteral([])).toThrow()
  })

  test('lança em número não finito', () => {
    expect(() => sqlLiteral(Infinity)).toThrow()
    expect(() => sqlLiteral(NaN)).toThrow()
  })
})

describe('gerarImportDeDados — escaping ponta a ponta, com dado hostil', () => {
  function dadosMinimosComTitulo(titulo) {
    return {
      users: [
        {
          id: 1,
          google_sub: 'sub-1',
          email: 'x@example.com',
          name: 'X',
          picture: null,
          is_admin: 0,
          created_at: '2026-05-01 10:00:00',
        },
      ],
      votingSessions: [
        {
          id: 1,
          title: titulo,
          status: 'open',
          created_by: 1,
          created_at: '2026-05-01 10:00:00',
          closed_at: null,
          winner_movie_id: null,
          winner_method: null,
          sort_options_json: '{}',
        },
      ],
      sessionMovies: [],
      votes: [],
      tiebreaks: [],
      backups: [],
    }
  }

  test('título com aspa simples, acento e emoji gera SQL válido e recuperável', () => {
    const titulo = `Sessão da "Galera" — O que a gente vê? 🍿🎬 D'noite`
    const sql = gerarImportDeDados(dadosMinimosComTitulo(titulo))

    const db = abrirD1Sintetico()
    try {
      db.exec(sql)
      const linha = db.prepare('SELECT title FROM voting_sessions WHERE id = 1').get()
      expect(linha.title).toBe(titulo)
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    } finally {
      db.close()
    }
  })

  test('tentativa de injeção no título não altera o schema nem outras tabelas', () => {
    const titulo = "'); DROP TABLE users; --"
    const sql = gerarImportDeDados(dadosMinimosComTitulo(titulo))

    const db = abrirD1Sintetico()
    try {
      db.exec(sql)
      // users sobreviveu — a injeção não executou
      expect(contarLinha(db, 'users')).toBe(1)
      expect(contarLinha(db, 'voting_sessions')).toBe(1)
      const linha = db.prepare('SELECT title FROM voting_sessions WHERE id = 1').get()
      expect(linha.title).toBe(titulo)
    } finally {
      db.close()
    }
  })
})

// =========================================================================
// Validação ponta a ponta contra o schema REAL do ramielle (offline, sem
// wrangler) — equivalente ao Step 5 do brief, automatizado.
// =========================================================================

describe('validação ponta a ponta contra migrations/0001_votacao.sql', () => {
  test('roda sem erro, FK check vazio, contagens batem com a origem', () => {
    const origem = lerBancoOrigem(criarFixtureGo())
    const sql = gerarImportDeDados(origem)

    const db = abrirD1Sintetico()
    try {
      db.exec(sql)

      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
      expect(contarLinha(db, 'users')).toBe(origem.users.length)
      expect(contarLinha(db, 'voting_sessions')).toBe(origem.votingSessions.length)
      expect(contarLinha(db, 'session_movies')).toBe(origem.sessionMovies.length)
      expect(contarLinha(db, 'votes')).toBe(origem.votes.length)
      expect(contarLinha(db, 'tiebreaks')).toBe(origem.tiebreaks.length)
      expect(contarLinha(db, 'backups')).toBe(origem.backups.length)
    } finally {
      db.close()
    }
  })

  test('winner_method e sort_options_json NÃO trocam de lugar (a armadilha #1)', () => {
    const origem = lerBancoOrigem(criarFixtureGo())
    const sql = gerarImportDeDados(origem)

    const db = abrirD1Sintetico()
    try {
      db.exec(sql)
      const sessao2 = db
        .prepare('SELECT winner_method, sort_options_json, winner_movie_id FROM voting_sessions WHERE id = 2')
        .get()
      // valores exatos da fixture — se tivessem trocado (bug do .dump
      // posicional), winner_method sairia '{"title":"Segundou"}' e
      // sort_options_json sairia 'votes'.
      expect(sessao2.winner_method).toBe('votes')
      expect(sessao2.sort_options_json).toBe('{"title":"Segundou"}')
      expect(sessao2.winner_movie_id).toBe(5)

      const sessao1 = db
        .prepare('SELECT winner_method, sort_options_json, winner_movie_id FROM voting_sessions WHERE id = 1')
        .get()
      expect(sessao1.winner_method).toBeNull()
      expect(sessao1.sort_options_json).toBe('{}')
      expect(sessao1.winner_movie_id).toBeNull()
    } finally {
      db.close()
    }
  })

  test('preserva ids: votes.id chega em 7 no destino (o max da fixture), não renumerado pra 1..4', () => {
    const origem = lerBancoOrigem(criarFixtureGo())
    const sql = gerarImportDeDados(origem)

    const db = abrirD1Sintetico()
    try {
      db.exec(sql)
      const ids = db
        .prepare('SELECT id FROM votes ORDER BY id')
        .all()
        .map((l) => l.id)
      expect(ids).toEqual([1, 2, 4, 7])
    } finally {
      db.close()
    }
  })

  test('poster_url e tmdb_id NULL sobrevivem como NULL (não viram string "null"/0)', () => {
    const origem = lerBancoOrigem(criarFixtureGo())
    const sql = gerarImportDeDados(origem)

    const db = abrirD1Sintetico()
    try {
      db.exec(sql)
      const filme = db
        .prepare('SELECT poster_url, tmdb_id FROM session_movies WHERE id = 1')
        .get()
      expect(filme.poster_url).toBeNull()
      expect(filme.tmdb_id).toBeNull()
    } finally {
      db.close()
    }
  })
})

// =========================================================================
// lerBancoOrigem / gerarImport — leitura de verdade via node:sqlite
// =========================================================================

describe('lerBancoOrigem', () => {
  test('lê as 6 tabelas, na ordem de colunas declarada em COLUNAS', () => {
    const dados = lerBancoOrigem(criarFixtureGo())
    expect(dados.users).toHaveLength(2)
    expect(dados.votingSessions).toHaveLength(2)
    expect(dados.sessionMovies).toHaveLength(4)
    expect(dados.votes).toHaveLength(4)
    expect(dados.tiebreaks).toHaveLength(1)
    expect(dados.backups).toHaveLength(1)

    expect(Object.keys(dados.users[0])).toEqual(COLUNAS.users)
    expect(Object.keys(dados.votingSessions[0])).toEqual(COLUNAS.voting_sessions)
  })

  test('lê corretamente mesmo com a ordem física alterada por ALTER TABLE (winner_method no fim)', () => {
    const dados = lerBancoOrigem(criarFixtureGo())
    const sessaoFechada = dados.votingSessions.find((s) => s.id === 2)
    // se a leitura fosse posicional (SELECT *), estes dois valores
    // sairiam trocados — a leitura por NOME não se importa com a ordem
    // física da tabela de origem.
    expect(sessaoFechada.winner_method).toBe('votes')
    expect(sessaoFechada.sort_options_json).toBe('{"title":"Segundou"}')
  })

  test('erro claro quando o arquivo de origem não existe', () => {
    expect(() => lerBancoOrigem('/definitivamente/nao/existe.db')).toThrow()
  })

  test('lê corretamente uma origem GENUINAMENTE em WAL (journal_mode=WAL, diretório gravável)', () => {
    const dados = lerBancoOrigem(criarFixtureGoWAL())
    expect(dados.users).toHaveLength(1)
    expect(dados.users[0].name).toBe('Usuário WAL')
    expect(dados.users[0].google_sub).toBe('sub-wal')
  })
})

describe('gerarImport — atalho leitura+geração', () => {
  // M2 (fix round 1): a versão anterior comparava gerarImport(caminho) com
  // gerarImportDeDados(lerBancoOrigem(caminho)) — como gerarImport É
  // literalmente essa composição (uma linha só), a asserção é uma
  // TAUTOLOGIA: se gerarImportDeDados fosse mutado pra `return ''`, os
  // dois lados dariam '' e o teste continuaria verde, sem detectar nada.
  // Substituída por conteúdo REAL esperado — prova que o atalho lê o
  // banco de verdade e gera o SQL certo, não só que devolve o que quer
  // que a composição interna devolva.
  test('lê o SQLite de origem e gera o SQL final, com os dados reais da fixture', () => {
    const sql = gerarImport(criarFixtureGo())
    expect(sql).toContain(
      "INSERT INTO users (id, google_sub, email, name, picture, is_admin, created_at) VALUES (1, 'sub-ana', 'ana@example.com', 'Ana D''Ávila', NULL, 1, '2026-05-01 10:00:00');",
    )
    expect(sql).toContain('UPDATE voting_sessions SET winner_movie_id = 5 WHERE id = 2;')
  })
})

// =========================================================================
// CLI — parseArgs, defaultOutputPath, run()
// =========================================================================

describe('parseArgs', () => {
  test('caminho posicional + --saida', () => {
    const args = parseArgs(['votacao.db', '--saida', 'saida.sql'])
    expect(args.caminhoDb).toBe('votacao.db')
    expect(args.saida).toBe('saida.sql')
    expect(args.help).toBe(false)
    expect(args.error).toBeNull()
  })

  test('--help / -h', () => {
    expect(parseArgs(['--help']).help).toBe(true)
    expect(parseArgs(['-h']).help).toBe(true)
  })

  test('--saida sem valor é erro', () => {
    const args = parseArgs(['votacao.db', '--saida'])
    expect(args.error).toMatch(/precisa de um valor/)
  })

  test('sem nenhum argumento: caminhoDb undefined', () => {
    expect(parseArgs([]).caminhoDb).toBeUndefined()
  })

  test('--esperado com 6 números válidos', () => {
    const args = parseArgs(['votacao.db', '--esperado', '4,4,42,54,2,0'])
    expect(args.error).toBeNull()
    expect(args.esperado).toEqual({
      users: 4,
      voting_sessions: 4,
      session_movies: 42,
      votes: 54,
      tiebreaks: 2,
      backups: 0,
    })
  })

  test('--esperado com número de campos errado é erro', () => {
    const args = parseArgs(['votacao.db', '--esperado', '4,4,42'])
    expect(args.error).toMatch(/--esperado/)
  })

  test('--esperado com valor não-numérico é erro', () => {
    const args = parseArgs(['votacao.db', '--esperado', '4,4,42,54,2,abc'])
    expect(args.error).toMatch(/--esperado/)
  })

  test('--esperado sem valor é erro', () => {
    const args = parseArgs(['votacao.db', '--esperado'])
    expect(args.error).toMatch(/precisa de um valor/)
  })
})

describe('defaultOutputPath', () => {
  test('troca a extensão por .import.sql no mesmo diretório', () => {
    expect(defaultOutputPath('/tmp/foo/votacao.db')).toBe(
      path.join('/tmp/foo', 'votacao.import.sql'),
    )
  })

  test('caminho sem diretório usa "." ', () => {
    expect(defaultOutputPath('votacao.db')).toBe(path.join('.', 'votacao.import.sql'))
  })
})

describe('run — CLI', () => {
  function coletores() {
    const logs = []
    const erros = []
    return {
      log: (msg) => logs.push(msg),
      logError: (msg) => erros.push(msg),
      logs,
      erros,
    }
  }

  test('--help mostra o uso e sai com 0, sem tocar em nada', async () => {
    const { log, logError, logs } = coletores()
    const codigo = await run(['--help'], { log, logError })
    expect(codigo).toBe(0)
    expect(logs.join('\n')).toMatch(/Uso: node scripts\/gerar-import\.mjs/)
  })

  test('sem argumento nenhum: erro claro, código 2', async () => {
    const { log, logError, erros } = coletores()
    const codigo = await run([], { log, logError })
    expect(codigo).toBe(2)
    expect(erros.join('\n')).toMatch(/informe o caminho/)
  })

  test('arquivo de origem inexistente: erro claro, código 1', async () => {
    const { log, logError, erros } = coletores()
    const codigo = await run(['/nao/existe.db'], { log, logError })
    expect(codigo).toBe(1)
    expect(erros.join('\n')).toMatch(/não consegui ler/)
  })

  test('banco de origem com schema presente mas as 6 tabelas genuinamente vazias: recusa com dica sobre o -wal', async () => {
    // Achado I1 (fix round 1): antes este teste usava um lerBancoOrigemImpl
    // MOCKADO devolvendo 6 arrays vazios — um estado fabricado pelo mock,
    // não alcançável de verdade. Agora parte de um SQLite real com schema
    // aplicado e 0 linhas (criarFixtureGoVazia) — o cenário que
    // `lerBancoOrigem` de verdade devolve sozinho, sem injeção nenhuma.
    const { log, logError, erros } = coletores()
    const codigo = await run([criarFixtureGoVazia()], { log, logError })
    expect(codigo).toBe(1)
    expect(erros.join('\n')).toMatch(/nenhuma linha/i)
    expect(erros.join('\n')).toMatch(/wal/i)
  })

  test('banco de origem SEM SCHEMA NENHUM (schema inteiro morava no -wal não copiado): erro cita o WAL, não só "no such table"', async () => {
    // Achado I1 (fix round 1): o cenário REAL medido contra o plano —
    // copiar só o .db quando o schema inteiro estava no -wal não
    // checkpointado — faz a PRIMEIRA leitura estourar "no such table" ANTES
    // do branch de "0 linhas" (que exige schema presente). Sem este teste,
    // o usuário real bateria numa mensagem genérica sem menção a WAL.
    const { log, logError, erros } = coletores()
    const codigo = await run([criarDbSemSchema()], { log, logError })
    expect(codigo).toBe(1)
    const mensagem = erros.join('\n')
    expect(mensagem).toMatch(/no such table/i)
    expect(mensagem).toMatch(/wal/i)
    expect(mensagem).toMatch(/schema/i)
  })

  test('caminho feliz: escreve o .sql via writeFile injetado e reporta contagens', async () => {
    const { log, logError, logs } = coletores()
    const caminhoDb = criarFixtureGo()
    let arquivoEscrito
    let conteudoEscrito
    const writeFile = (caminho, conteudo) => {
      arquivoEscrito = caminho
      conteudoEscrito = conteudo
    }

    const codigo = await run([caminhoDb, '--saida', '/tmp/saida-teste.sql'], {
      log,
      logError,
      writeFile,
    })

    expect(codigo).toBe(0)
    expect(arquivoEscrito).toBe('/tmp/saida-teste.sql')
    expect(conteudoEscrito).toBe(gerarImport(caminhoDb))
    expect(logs.join('\n')).toMatch(/users: 2/)
    expect(logs.join('\n')).toMatch(/votes: 4/)
    expect(logs.join('\n')).toMatch(/wrangler d1 execute piluvitu-ramielle --remote/)
  })

  test('saída default (sem --saida) usa defaultOutputPath', async () => {
    const { log, logError } = coletores()
    const caminhoDb = criarFixtureGo()
    let arquivoEscrito
    const writeFile = (caminho) => {
      arquivoEscrito = caminho
    }

    await run([caminhoDb], { log, logError, writeFile })
    expect(arquivoEscrito).toBe(defaultOutputPath(caminhoDb))
  })

  test('erro ao escrever a saída: código 1, mensagem clara', async () => {
    const { log, logError, erros } = coletores()
    const caminhoDb = criarFixtureGo()
    const writeFile = () => {
      throw new Error('disco cheio (simulado)')
    }

    const codigo = await run([caminhoDb], { log, logError, writeFile })
    expect(codigo).toBe(1)
    expect(erros.join('\n')).toMatch(/não consegui escrever/)
  })

  test('--esperado batendo com a contagem real: gera o .sql normalmente', async () => {
    // M3 (fix round 1): a fixture de gerar-import.test.mjs tem
    // 2 users, 2 voting_sessions, 4 session_movies, 4 votes, 1 tiebreak,
    // 1 backup — os números exatos que --esperado precisa bater.
    const { log, logError, erros } = coletores()
    const caminhoDb = criarFixtureGo()
    let escreveu = false
    const writeFile = () => {
      escreveu = true
    }

    const codigo = await run([caminhoDb, '--esperado', '2,2,4,4,1,1'], {
      log,
      logError,
      writeFile,
    })
    expect(codigo).toBe(0)
    expect(escreveu).toBe(true)
    expect(erros).toEqual([])
  })

  test('--esperado divergindo da contagem real: recusa (código 1), NADA é escrito — defesa contra import parcial silencioso', async () => {
    const { log, logError, erros } = coletores()
    const caminhoDb = criarFixtureGo()
    let escreveu = false
    const writeFile = () => {
      escreveu = true
    }

    // votes real é 4; --esperado pede 54 (o número real de produção,
    // citado no plano) — simula uma origem PARCIALMENTE checkpointada.
    const codigo = await run([caminhoDb, '--esperado', '2,2,4,54,1,1'], {
      log,
      logError,
      writeFile,
    })
    expect(codigo).toBe(1)
    expect(escreveu).toBe(false)
    const mensagem = erros.join('\n')
    expect(mensagem).toMatch(/não bate com --esperado/)
    expect(mensagem).toMatch(/votes: lido 4, esperado 54/)
  })
})
