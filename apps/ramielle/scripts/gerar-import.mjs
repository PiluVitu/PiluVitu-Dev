#!/usr/bin/env node
//
// Gerador do arquivo de import — histórico real de votação (SQLite da API Go)
// -> D1 do ramielle (fatia ④, Task 3).
//
// Spec: docs/superpowers/plans/2026-08-12-ramielle-fatia4-cutover.md, seção
// "Fatos medidos" (linhas 13-167) — os números e as duas armadilhas abaixo
// vêm de MEDIÇÃO contra o banco real, não de suposição.
//
// ⚠️ POR QUE NÃO `sqlite3 .dump`: o dump emite `INSERT INTO tabela VALUES
// (...)` POSICIONAL. A ordem física de `voting_sessions` diverge entre os
// dois schemas — na Go `winner_method` entrou por `ALTER TABLE` (foi pro
// FIM da tabela); na migration do ramielle ele foi escrito no MEIO. Um dump
// cru trocaria `winner_method` com `sort_options_json` EM SILÊNCIO (as duas
// são TEXT, o STRICT não pega). Por isso: toda leitura daqui usa `SELECT
// <colunas>` explícito (a ordem física da ORIGEM nunca importa) e todo
// INSERT gerado usa lista de colunas explícita (a ordem física do DESTINO
// nunca importa).
//
// ⚠️ ORDEM DE IMPORT — forçada pela FK circular entre `voting_sessions.
// winner_movie_id` e `session_movies.session_id`:
//   users -> voting_sessions (winner_movie_id NULL) -> session_movies ->
//   votes -> tiebreaks -> backups -> UPDATE voting_sessions (vencedor)
// Inserir uma sessão FECHADA já com winner_movie_id preenchido falha com
// FOREIGN KEY constraint failed, porque o filme daquela sessão ainda não
// existe em session_movies nesse ponto do arquivo.
//
// ⚠️ IDS SÃO PRESERVADOS, NUNCA RENUMERADOS. `votes` do banco real tem ids
// buracados (54 linhas, max id 81) por causa de desvotos — todo INSERT usa
// o id de origem literalmente. `sqlite_sequence` NUNCA é lido nem escrito
// aqui: inserir com id explícito numa tabela AUTOINCREMENT já avança o
// `seq` sozinho (medido contra o D1 real).
//
// Zero dependência nova: leitura via `node:sqlite` (nativo, experimental —
// o aviso do Node no stderr é esperado e inofensivo).

import { DatabaseSync } from 'node:sqlite'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

// -------------------------------------------------------------------------
// 1. Colunas por tabela — a MESMA lista serve pro SELECT (leitura, ordem da
//    ORIGEM é irrelevante) e pro INSERT (escrita, ordem do DESTINO é
//    irrelevante). Um único lugar por tabela, nunca duas listas que possam
//    divergir.
// -------------------------------------------------------------------------

export const COLUNAS = {
  users: ['id', 'google_sub', 'email', 'name', 'picture', 'is_admin', 'created_at'],
  voting_sessions: [
    'id',
    'title',
    'status',
    'created_by',
    'created_at',
    'closed_at',
    'winner_movie_id',
    'winner_method',
    'sort_options_json',
  ],
  session_movies: [
    'id',
    'session_id',
    'category',
    'title',
    'type',
    'poster_url',
    'tmdb_id',
    'was_watched',
    'sheet_number',
  ],
  votes: ['id', 'session_id', 'user_id', 'movie_id', 'created_at'],
  tiebreaks: [
    'id',
    'session_id',
    'triggered_by',
    'tied_ids_json',
    'client_entropy',
    'server_nonce',
    'winner_movie_id',
    'created_at',
  ],
  backups: [
    'id',
    'drive_file_id',
    'drive_file_name',
    'size_bytes',
    'trigger_type',
    'created_at',
  ],
}

// -------------------------------------------------------------------------
// 2. Leitura do SQLite de origem (Go) — sempre read-only, sempre por nome
//    de coluna (nunca `SELECT *`, que devolveria posicional na ordem FÍSICA
//    da origem).
// -------------------------------------------------------------------------

function lerTabela(db, tabela, colunas) {
  const sql = `SELECT ${colunas.join(', ')} FROM ${tabela} ORDER BY id`
  return db.prepare(sql).all()
}

/**
 * Lê as 6 tabelas do domínio de votação do SQLite de origem (schema da Go)
 * e devolve um objeto plano — nunca toca `sqlite_sequence`, nunca lê
 * `sessions`/`distribution_targets` (não têm equivalente no ramielle e
 * estão com 0 linhas em produção, ver "Fatos medidos").
 *
 * `caminhoDb` é sempre aberto `readOnly: true` — este script NUNCA escreve
 * no banco de origem. Se o arquivo `.db` estiver vazio mas o `.db-wal`
 * existir ao lado (mesmo diretório, mesmo nome-base), o SQLite lê os dois
 * juntos sozinho — não é preciso passar o `-wal` explicitamente.
 */
export function lerBancoOrigem(caminhoDb) {
  const db = new DatabaseSync(caminhoDb, { readOnly: true })
  try {
    return {
      users: lerTabela(db, 'users', COLUNAS.users),
      votingSessions: lerTabela(db, 'voting_sessions', COLUNAS.voting_sessions),
      sessionMovies: lerTabela(db, 'session_movies', COLUNAS.session_movies),
      votes: lerTabela(db, 'votes', COLUNAS.votes),
      tiebreaks: lerTabela(db, 'tiebreaks', COLUNAS.tiebreaks),
      backups: lerTabela(db, 'backups', COLUNAS.backups),
    }
  } finally {
    db.close()
  }
}

// -------------------------------------------------------------------------
// 3. Escaping — onde este tipo de gerador mais erra. Título de filme/sessão
//    é texto livre do dono: aspas simples, acento, emoji. `node:sqlite`
//    devolve INTEGER como `number` (ou `bigint` fora da faixa segura de 53
//    bits), TEXT como `string`, NULL como `null` — qualquer outro `typeof`
//    (BLOB, boolean) é inesperado neste domínio (auditado no plano: só
//    text/integer/null nas 25 colunas não-PK) e FALHA ALTO em vez de
//    silenciosamente virar lixo no SQL.
// -------------------------------------------------------------------------

export function sqlLiteral(valor) {
  if (valor === null || valor === undefined) return 'NULL'

  if (typeof valor === 'bigint') return valor.toString()

  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) {
      throw new Error(`valor numérico não finito, não dá pra representar em SQL: ${valor}`)
    }
    return String(valor)
  }

  if (typeof valor !== 'string') {
    throw new Error(
      `tipo inesperado para literal SQL (esperado string/number/bigint/null): ${typeof valor}`,
    )
  }

  // A única regra de escaping de string do SQLite: toda aspa simples
  // literal vira DUAS aspas simples. Nada de sanitização "esperta" além
  // disso — é exatamente essa esperteza extra que costuma abrir brecha de
  // injeção em vez de fechar.
  return `'${valor.replace(/'/g, "''")}'`
}

function montarInsert(tabela, colunas, linha) {
  const valores = colunas.map((coluna) => sqlLiteral(linha[coluna])).join(', ')
  return `INSERT INTO ${tabela} (${colunas.join(', ')}) VALUES (${valores});`
}

// -------------------------------------------------------------------------
// 4. Geração do SQL — ordem FK-safe fixa, nunca reordenada por conveniência.
// -------------------------------------------------------------------------

/**
 * Recebe os dados já lidos (`lerBancoOrigem`) e devolve o `.sql` completo,
 * pronto pra `wrangler d1 execute --file`. Função pura — não toca disco,
 * não abre conexão nenhuma; é o que permite testar exaustivamente casos de
 * escaping/ordem sem precisar montar um SQLite de fixture pra cada um.
 */
export function gerarImportDeDados(dados) {
  const partes = []

  partes.push(
    '-- Import gerado por scripts/gerar-import.mjs (apps/ramielle) — NAO editar a mao.',
    '-- Ordem FK-safe: users, depois voting_sessions (winner NULL), depois',
    '-- session_movies, depois votes, depois tiebreaks, depois backups; o vencedor',
    '-- de cada sessao fechada e gravado por ultimo, num UPDATE em separado.',
    '-- Todo INSERT tem lista de colunas explicita — a ordem fisica das tabelas,',
    '-- na origem OU no destino, e irrelevante. A tabela de controle interna do',
    '-- AUTOINCREMENT nunca e lida nem escrita por este gerador.',
    '',
  )

  // 1. users
  for (const linha of dados.users) {
    partes.push(montarInsert('users', COLUNAS.users, linha))
  }
  partes.push('')

  // 2. voting_sessions — winner_movie_id SEMPRE NULL aqui, mesmo pras
  //    sessões fechadas que já têm vencedor de verdade. O vencedor real é
  //    guardado à parte e só entra depois, via UPDATE (passo 7), quando
  //    session_movies já existe.
  const vencedores = []
  for (const sessao of dados.votingSessions) {
    if (sessao.winner_movie_id !== null && sessao.winner_movie_id !== undefined) {
      vencedores.push({ id: sessao.id, winner_movie_id: sessao.winner_movie_id })
    }
    const linhaSemVencedor = { ...sessao, winner_movie_id: null }
    partes.push(montarInsert('voting_sessions', COLUNAS.voting_sessions, linhaSemVencedor))
  }
  partes.push('')

  // 3. session_movies
  for (const linha of dados.sessionMovies) {
    partes.push(montarInsert('session_movies', COLUNAS.session_movies, linha))
  }
  partes.push('')

  // 4. votes — ids preservados literalmente, incl. os buracados.
  for (const linha of dados.votes) {
    partes.push(montarInsert('votes', COLUNAS.votes, linha))
  }
  partes.push('')

  // 5. tiebreaks
  for (const linha of dados.tiebreaks) {
    partes.push(montarInsert('tiebreaks', COLUNAS.tiebreaks, linha))
  }
  partes.push('')

  // 6. backups
  for (const linha of dados.backups) {
    partes.push(montarInsert('backups', COLUNAS.backups, linha))
  }
  partes.push('')

  // 7. UPDATE voting_sessions — por ÚLTIMO, só pras sessões que tinham
  //    vencedor de verdade na origem. session_movies já existe nesse ponto
  //    (passo 3), então a FK sempre resolve.
  for (const vencedor of vencedores) {
    partes.push(
      `UPDATE voting_sessions SET winner_movie_id = ${sqlLiteral(vencedor.winner_movie_id)} WHERE id = ${sqlLiteral(vencedor.id)};`,
    )
  }
  partes.push('')

  return partes.join('\n')
}

/**
 * Atalho: lê o SQLite de origem e já devolve o `.sql` gerado. A maioria dos
 * testes usa `gerarImportDeDados` direto (mais rápido, sem I/O); este é o
 * caminho que o CLI de verdade usa, e o que os testes "com fixture de
 * verdade" (Step 1 do brief) exercitam ponta a ponta.
 */
export function gerarImport(caminhoDb) {
  return gerarImportDeDados(lerBancoOrigem(caminhoDb))
}

// -------------------------------------------------------------------------
// 5. CLI
// -------------------------------------------------------------------------

export function defaultOutputPath(caminhoDb) {
  const { dir, name } = path.parse(caminhoDb)
  return path.join(dir || '.', `${name}.import.sql`)
}

function contarLinhas(dados) {
  return {
    users: dados.users.length,
    voting_sessions: dados.votingSessions.length,
    session_movies: dados.sessionMovies.length,
    votes: dados.votes.length,
    tiebreaks: dados.tiebreaks.length,
    backups: dados.backups.length,
  }
}

function usage() {
  return `Uso: node scripts/gerar-import.mjs <votacao.db> [--saida <arquivo.sql>]

Lê o histórico REAL de votação do SQLite da API Go e gera um arquivo .sql
com INSERTs (lista de colunas explícita, ordem FK-safe) pronto pro dono
rodar contra o D1 do ramielle.

⚠️ Este script NUNCA toca o D1. Só lê o SQLite de origem (read-only) e
escreve o .sql de saída — quem aplica é o dono, com wrangler, escolhendo
--local ou --remote.

⚠️ Se o banco de origem estiver em WAL não-checkpointado, o arquivo .db
sozinho pode estar vazio (4096 bytes) — o dado todo mora no .db-wal.
Copie os dois arquivos (mesmo diretório, mesmo nome-base) antes de rodar
este script, ou rode PRAGMA wal_checkpoint(TRUNCATE) na CÓPIA.

Opções:
  --saida <path>   Caminho do .sql de saída (default: <entrada>.import.sql)
  --help, -h       Mostra esta ajuda
`
}

export function parseArgs(argv) {
  const args = { caminhoDb: undefined, saida: undefined, help: false, error: null }
  const posicionais = []

  for (let i = 0; i < argv.length; i++) {
    const atual = argv[i]
    if (atual === '--help' || atual === '-h') {
      args.help = true
      continue
    }
    if (atual === '--saida' || atual === '--output') {
      const valor = argv[i + 1]
      if (valor === undefined) {
        args.error = `a opção ${atual} precisa de um valor`
        return args
      }
      args.saida = valor
      i++
      continue
    }
    posicionais.push(atual)
  }

  args.caminhoDb = posicionais[0]
  return args
}

export async function run(argv, deps = {}) {
  const {
    lerBancoOrigemImpl = lerBancoOrigem,
    writeFile = writeFileSync,
    log = console.log,
    logError = console.error,
  } = deps

  const args = parseArgs(argv)

  if (args.help) {
    log(usage())
    return 0
  }
  if (args.error) {
    logError(`erro: ${args.error}`)
    log(usage())
    return 2
  }
  if (args.caminhoDb === undefined) {
    logError('erro: informe o caminho do SQLite de origem (votacao.db).')
    log(usage())
    return 2
  }

  let dados
  try {
    dados = lerBancoOrigemImpl(args.caminhoDb)
  } catch (err) {
    logError(`erro: não consegui ler "${args.caminhoDb}": ${err.message}`)
    return 1
  }

  const contagens = contarLinhas(dados)
  const totalLinhas = Object.values(contagens).reduce((a, b) => a + b, 0)

  if (totalLinhas === 0) {
    logError(
      'erro: o banco de origem não tem NENHUMA linha nas 6 tabelas — nada foi escrito.\n' +
        '      Isso é o sintoma clássico de copiar só o .db sem o .db-wal (banco\n' +
        '      vazio, sem erro nenhum). Confira se o .db-wal foi copiado junto, ou\n' +
        '      rode PRAGMA wal_checkpoint(TRUNCATE) na CÓPIA antes de tentar de novo.',
    )
    return 1
  }

  const sql = gerarImportDeDados(dados)
  const saida = args.saida ?? defaultOutputPath(args.caminhoDb)

  try {
    writeFile(saida, sql)
  } catch (err) {
    logError(`erro: não consegui escrever "${saida}": ${err.message}`)
    return 1
  }

  log(`==> lido de ${args.caminhoDb}:`)
  for (const [tabela, n] of Object.entries(contagens)) {
    log(`    ${tabela}: ${n}`)
  }
  log('')
  log(`==> SQL gerado em ${saida} (${totalLinhas} linhas de dado)`)
  log('')
  log('Próximo passo (comando do DONO, nunca de um agente):')
  log('  1. Aplicar as migrations em produção, se ainda não aplicadas:')
  log('     pnpm --filter @piluvitu/ramielle exec wrangler d1 migrations apply piluvitu-ramielle --remote')
  log('  2. Rodar o import — ATÔMICO, e tem que ser ANTES do primeiro login no ramielle:')
  log(`     pnpm --filter @piluvitu/ramielle exec wrangler d1 execute piluvitu-ramielle --remote --file ${saida}`)

  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const codigoDeSaida = await run(process.argv.slice(2))
  process.exitCode = codigoDeSaida
}
