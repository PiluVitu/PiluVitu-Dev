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
import { movieToWire, sessionToWire } from './wire'
import type { SessionMovieRow, VotingSessionRow, WireSession } from './wire'

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
