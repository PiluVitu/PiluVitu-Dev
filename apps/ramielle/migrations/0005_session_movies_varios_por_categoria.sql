-- =====================================================================
-- migrations/0005_session_movies_varios_por_categoria.sql — alvo: D1
--
-- Tira o UNIQUE (session_id, category) de session_movies: uma sessão
-- temática (ex.: Halloween) sorteia vários filmes da MESMA categoria.
-- SQLite não tem DROP CONSTRAINT, então a tabela é recriada com os ids
-- preservados — votes.movie_id, tiebreaks.winner_movie_id e
-- voting_sessions.winner_movie_id continuam apontando pras mesmas linhas.
--
-- ⚠️ Copiar para uma auxiliar, dropar e recriar com o nome FINAL, nunca
-- "criar nova → drop → RENAME": o DROP conta as linhas filhas como órfãs
-- na checagem adiada de FK e o RENAME não desconta, então o commit falha
-- com FOREIGN KEY constraint failed (medido em produção em 2026-10-23).
-- Reinserir as linhas na tabela de nome final resolve as órfãs.
-- =====================================================================

PRAGMA defer_foreign_keys = true;

CREATE TABLE session_movies_copia AS SELECT * FROM session_movies;

DROP TABLE session_movies;

CREATE TABLE session_movies (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    INTEGER NOT NULL REFERENCES voting_sessions(id) ON DELETE CASCADE,
  category      TEXT NOT NULL,
  title         TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('filme','serie')),
  poster_url    TEXT,
  tmdb_id       INTEGER,
  was_watched   INTEGER NOT NULL DEFAULT 0,
  sheet_number  INTEGER
) STRICT;

INSERT INTO session_movies
  (id, session_id, category, title, type, poster_url, tmdb_id, was_watched, sheet_number)
SELECT
  id, session_id, category, title, type, poster_url, tmdb_id, was_watched, sheet_number
FROM session_movies_copia;

DROP TABLE session_movies_copia;

CREATE INDEX IF NOT EXISTS idx_session_movies_session ON session_movies(session_id);
