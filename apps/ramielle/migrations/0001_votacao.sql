-- =====================================================================
-- migrations/0001_votacao.sql   —  alvo: Cloudflare D1 (SQLite)
--
-- Porte de apps/api/internal/votacao/schema.sql (Go, votação de filmes) para
-- D1. Mesmas 6 tabelas, mesmos 5 índices, mesma lógica — só o dialeto muda,
-- pelas regras de compatibilidade já MEDIDAS em apps/financas/migrations/0001
-- (ver apps/financas/CLAUDE.md):
--
--  * Sem BEGIN/COMMIT/SAVEPOINT: o D1 REJEITA. Atomicidade é via batch().
--  * STRICT em todas as tabelas — convenção do monorepo desde a 0001 do
--    finanças.
--  * DATETIME não existe em STRICT (vira "unknown datatype") — trocado por
--    TEXT em toda coluna que era DATETIME no original (created_at,
--    closed_at). DEFAULT CURRENT_TIMESTAMP continua funcionando e grava
--    texto.
--  * CREATE TABLE: CHECK/UNIQUE de TABELA (não presos a uma coluna) têm que
--    vir DEPOIS de todas as column-defs (gramática column-def* table-
--    constraint*). Conferido tabela a tabela no original: os UNIQUE de
--    session_movies e votes já são a ÚLTIMA linha antes do fechamento, e
--    todo CHECK do original é column-level (preso à própria coluna, ex.
--    "status TEXT NOT NULL CHECK (...)") — nenhum precisou mudar de
--    posição.
--  * PKs continuam INTEGER PRIMARY KEY AUTOINCREMENT — PROIBIDO trocar por
--    UUID nesta task (apps/web tipa session_id/movie_id como number; ver
--    decisão 3 do plano). Medição que confirma o RETURNING id funcionando
--    é o Step 5 do brief, não muda o schema em si.
--
-- Migrations são forward-only: não existe down migration.
-- =====================================================================

CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  google_sub      TEXT NOT NULL UNIQUE,
  email           TEXT NOT NULL,
  name            TEXT NOT NULL,
  picture         TEXT,
  is_admin        INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

-- ⚠️ winner_movie_id referencia session_movies(id), criada DEPOIS desta
-- tabela. Aceito no SQLite/D1: FOREIGN KEY é resolvida na primeira escrita
-- que a exercita, não no CREATE TABLE — não há tabela "session_movies"
-- nenhuma que precisar existir ainda para este CREATE TABLE ser aceito.
-- Confirmado no Step 2 (apply --local) desta task.
CREATE TABLE IF NOT EXISTS voting_sessions (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  title             TEXT NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('open','closed')),
  created_by        INTEGER NOT NULL REFERENCES users(id),
  created_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at         TEXT,
  winner_movie_id   INTEGER REFERENCES session_movies(id),
  winner_method     TEXT,
  sort_options_json TEXT NOT NULL DEFAULT '{}'
) STRICT;

CREATE TABLE IF NOT EXISTS session_movies (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    INTEGER NOT NULL REFERENCES voting_sessions(id) ON DELETE CASCADE,
  category      TEXT NOT NULL,
  title         TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('filme','serie')),
  poster_url    TEXT,
  tmdb_id       INTEGER,
  was_watched   INTEGER NOT NULL DEFAULT 0,
  sheet_number  INTEGER,

  -- UNIQUE de tabela: já a última linha antes das column-defs terminarem,
  -- nenhum reposicionamento necessário.
  UNIQUE (session_id, category)
) STRICT;

CREATE TABLE IF NOT EXISTS votes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  INTEGER NOT NULL REFERENCES voting_sessions(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  movie_id    INTEGER NOT NULL REFERENCES session_movies(id),
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Voto de aprovação: um usuário pode votar em vários filmes da mesma
  -- sessão, mas não duas vezes no mesmo filme.
  UNIQUE (session_id, user_id, movie_id)
) STRICT;

CREATE TABLE IF NOT EXISTS backups (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  drive_file_id   TEXT NOT NULL,
  drive_file_name TEXT NOT NULL,
  size_bytes      INTEGER NOT NULL,
  trigger_type    TEXT NOT NULL CHECK (trigger_type IN ('cron','manual','session_close')),
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE TABLE IF NOT EXISTS tiebreaks (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id      INTEGER NOT NULL REFERENCES voting_sessions(id) ON DELETE CASCADE,
  triggered_by    INTEGER NOT NULL REFERENCES users(id),
  tied_ids_json   TEXT NOT NULL,
  client_entropy  TEXT NOT NULL,
  server_nonce    TEXT NOT NULL,
  winner_movie_id INTEGER NOT NULL REFERENCES session_movies(id),
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

-- Os 5 índices do schema original, mantidos 1:1.
CREATE INDEX IF NOT EXISTS idx_session_movies_session ON session_movies(session_id);
CREATE INDEX IF NOT EXISTS idx_votes_session ON votes(session_id);
CREATE INDEX IF NOT EXISTS idx_voting_sessions_created ON voting_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backups_created ON backups(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tiebreaks_session ON tiebreaks(session_id);
