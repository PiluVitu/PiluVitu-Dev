-- =====================================================================
-- migrations/0005_session_movies_varios_por_categoria.sql — alvo: D1
--
-- Tira o UNIQUE (session_id, category) de session_movies: uma sessão
-- temática (ex.: Halloween, `per_category` em POST /votacao/sessions)
-- sorteia vários filmes da MESMA categoria. SQLite não tem DROP
-- CONSTRAINT, então a tabela é recriada (cópia → drop → rename), com os
-- ids preservados — votes.movie_id e voting_sessions.winner_movie_id
-- continuam apontando pras mesmas linhas.
--
-- ⚠️ defer_foreign_keys: sem ele, o DROP TABLE de uma tabela referenciada
-- por votes/voting_sessions falha (ou apaga em cascata). Adiado, as FKs só
-- são conferidas no fim, quando session_movies já existe de novo.
-- =====================================================================

PRAGMA defer_foreign_keys = true;

CREATE TABLE session_movies_nova (
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

INSERT INTO session_movies_nova
  (id, session_id, category, title, type, poster_url, tmdb_id, was_watched, sheet_number)
SELECT
  id, session_id, category, title, type, poster_url, tmdb_id, was_watched, sheet_number
FROM session_movies;

DROP TABLE session_movies;

ALTER TABLE session_movies_nova RENAME TO session_movies;

CREATE INDEX IF NOT EXISTS idx_session_movies_session ON session_movies(session_id);
