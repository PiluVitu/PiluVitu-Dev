/**
 * O vetor dourado: goParity.json foi gerado rodando o Go de verdade
 * (json.Marshal de votacao.VotingSession/SessionMovie) — ver
 * src/routes/__fixtures__/go-parity.json e o relatório da Task 1
 * (.superpowers/sdd/2026-07-29-ramielle-fatia2-votacao/task-1-report.md)
 * para como ele foi gerado. Nenhum valor aqui foi escrito à mão a partir do
 * que este arquivo leu no código Go — só comparado contra a execução real.
 */
import { describe, expect, it } from 'vitest'
import goParity from '../routes/__fixtures__/go-parity.json'
import { backupToWire, movieToWire, sessionToWire } from './wire'
import type {
  BackupRow,
  SessionMovieRow,
  VotingSessionRow,
  WireSession,
} from './wire'

// Linha de `voting_sessions` como sairia do D1: snake_case, timestamp no
// formato do CURRENT_TIMESTAMP do SQLite (espaço, sem T, sem Z).
const linhaSessionAberta: VotingSessionRow = {
  id: 7,
  title: 'Sessão de maio',
  status: 'open',
  created_by: 1,
  created_at: '2026-05-19 12:00:00',
  closed_at: null,
  winner_movie_id: null,
  winner_method: null,
  sort_options_json: '{}',
}

const linhaSessionFechada: VotingSessionRow = {
  id: 7,
  title: 'Sessão de maio',
  status: 'closed',
  created_by: 1,
  created_at: '2026-05-19 12:00:00',
  closed_at: '2026-05-20 18:30:00',
  winner_movie_id: 42,
  winner_method: 'roulette',
  sort_options_json: '{}',
}

const linhaFilmeSemTmdb: SessionMovieRow = {
  id: 3,
  session_id: 7,
  category: 'comedia',
  title: 'Um Filme Qualquer',
  type: 'filme',
  poster_url: null,
  tmdb_id: null,
  was_watched: 0,
  sheet_number: null,
}

const linhaFilmeComTmdb: SessionMovieRow = {
  id: 4,
  session_id: 7,
  category: 'terror',
  title: 'Outro Filme',
  type: 'serie',
  poster_url: 'https://image.tmdb.org/t/p/w500/abc123.jpg',
  tmdb_id: 603,
  was_watched: 1,
  sheet_number: 12,
}

describe('sessionToWire — paridade byte a byte com a Go (vetor dourado)', () => {
  it('sessão aberta (campos nulos): bate exatamente com o json.Marshal da Go', () => {
    expect(sessionToWire(linhaSessionAberta)).toEqual(goParity.sessionAberta)
  })

  it('sessão fechada (campos preenchidos): bate exatamente com o json.Marshal da Go', () => {
    expect(sessionToWire(linhaSessionFechada)).toEqual(goParity.sessionFechada)
  })

  it('as chaves são PascalCase, exatamente como a Go emite', () => {
    // ⚠️ NÃO "padronizar" para snake_case. As structs do Go (sessions.go:11-21,
    // movies.go:9-19) não têm tag `json:`, então o encoding/json usa o nome do
    // campo — e apps/web/lib/votacao/types.ts JÁ declara VotingSession.ID,
    // .Title, .CreatedBy em PascalCase. O resto da API é snake_case porque
    // aqueles handlers montam map[string]any com chaves explícitas. A mistura
    // é o contrato. Trocar quebra a tela EM SILÊNCIO: res.json() é `any`.
    const chaves = Object.keys(sessionToWire(linhaSessionAberta))
    expect(chaves).toEqual([
      'ID',
      'Title',
      'Status',
      'CreatedBy',
      'CreatedAt',
      'ClosedAt',
      'WinnerMovieID',
      'WinnerMethod',
      'SortOptionsJSON',
    ])
  })
})

describe('movieToWire — paridade byte a byte com a Go (vetor dourado)', () => {
  it('filme sem TMDb/sheet_number (campos nulos): bate exatamente com o json.Marshal da Go', () => {
    expect(movieToWire(linhaFilmeSemTmdb)).toEqual(goParity.filmeSemTmdb)
  })

  it('filme com TMDb/sheet_number (campos preenchidos): bate exatamente com o json.Marshal da Go', () => {
    expect(movieToWire(linhaFilmeComTmdb)).toEqual(goParity.filmeComTmdb)
  })

  it('as chaves são PascalCase, exatamente como a Go emite', () => {
    const chaves = Object.keys(movieToWire(linhaFilmeComTmdb))
    expect(chaves).toEqual([
      'ID',
      'SessionID',
      'Category',
      'Title',
      'Type',
      'PosterURL',
      'TMDbID',
      'WasWatched',
      'SheetNumber',
    ])
  })

  it('PosterURL nunca é null — coluna NULL do D1 vira string vazia (Go declara PosterURL string)', () => {
    expect(movieToWire(linhaFilmeSemTmdb).PosterURL).toBe('')
  })

  it('WasWatched é boolean no fio, não o INTEGER 0|1 do banco', () => {
    expect(movieToWire(linhaFilmeSemTmdb).WasWatched).toBe(false)
    expect(movieToWire(linhaFilmeComTmdb).WasWatched).toBe(true)
  })
})

// Linha de `backups` como sairia do D1: snake_case, timestamp no formato do
// CURRENT_TIMESTAMP do SQLite (espaço, sem T, sem Z) — mesma convenção das
// fixtures de sessão/filme acima.
const linhaBackup: BackupRow = {
  id: 5,
  drive_file_id: '1AbCdEfGhIjKlMnOpQrStUvWxYz',
  drive_file_name: 'votacao-2026-05-19.sqlite',
  size_bytes: 123456,
  trigger_type: 'manual',
  created_at: '2026-05-19 12:00:00',
}

describe('backupToWire — paridade byte a byte com a Go (vetor dourado)', () => {
  it('bate exatamente com o json.Marshal(votacao.Backup{...}) da Go', () => {
    expect(backupToWire(linhaBackup)).toEqual(goParity.backup)
  })

  it('as chaves são PascalCase, EXATAMENTE como a Go emite — literal, não por amostragem', () => {
    // ⚠️ O ponto desta task: emitir `drive_file_name` em vez de
    // `DriveFileName` quebra `apps/web` em produção (tabela renderiza
    // `undefined`), sem erro nenhum — nada denuncia em compile-time dos
    // dois lados (o Go não usa struct tag `json:`, o `res.json()` do
    // apps/web é `any`). Esta asserção é a rede de segurança.
    const chaves = Object.keys(backupToWire(linhaBackup))
    expect(chaves).toEqual([
      'ID',
      'DriveFileID',
      'DriveFileName',
      'SizeBytes',
      'TriggerType',
      'CreatedAt',
    ])
  })
})

describe('sessionToWire — null nunca vira undefined', () => {
  it('campos nulos permanecem `null` explícito na chave, nunca somem do objeto', () => {
    const wire: WireSession = sessionToWire(linhaSessionAberta)
    expect(Object.prototype.hasOwnProperty.call(wire, 'ClosedAt')).toBe(true)
    expect(wire.ClosedAt).toBeNull()
    expect(Object.prototype.hasOwnProperty.call(wire, 'WinnerMovieID')).toBe(
      true,
    )
    expect(wire.WinnerMovieID).toBeNull()
    expect(Object.prototype.hasOwnProperty.call(wire, 'WinnerMethod')).toBe(
      true,
    )
    expect(wire.WinnerMethod).toBeNull()
  })
})
