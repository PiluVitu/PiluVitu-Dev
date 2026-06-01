-- Idempotent schema for movie voting feature.
-- Applied at startup via embed.go + Store.migrate().

CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  google_sub      TEXT NOT NULL UNIQUE,
  email           TEXT NOT NULL,
  name            TEXT NOT NULL,
  picture         TEXT,
  is_admin        INTEGER NOT NULL DEFAULT 0,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS voting_sessions (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  title             TEXT NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('open','closed')),
  created_by        INTEGER NOT NULL REFERENCES users(id),
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at         DATETIME,
  winner_movie_id   INTEGER REFERENCES session_movies(id),
  winner_method     TEXT,
  sort_options_json TEXT NOT NULL DEFAULT '{}'
);

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
  UNIQUE (session_id, category)
);

CREATE TABLE IF NOT EXISTS votes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  INTEGER NOT NULL REFERENCES voting_sessions(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  movie_id    INTEGER NOT NULL REFERENCES session_movies(id),
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (session_id, user_id, movie_id)
);

CREATE TABLE IF NOT EXISTS backups (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  drive_file_id   TEXT NOT NULL,
  drive_file_name TEXT NOT NULL,
  size_bytes      INTEGER NOT NULL,
  trigger_type    TEXT NOT NULL CHECK (trigger_type IN ('cron','manual','session_close')),
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_session_movies_session ON session_movies(session_id);
CREATE INDEX IF NOT EXISTS idx_votes_session ON votes(session_id);
CREATE INDEX IF NOT EXISTS idx_voting_sessions_created ON voting_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backups_created ON backups(created_at DESC);

CREATE TABLE IF NOT EXISTS tiebreaks (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id      INTEGER NOT NULL REFERENCES voting_sessions(id) ON DELETE CASCADE,
  triggered_by    INTEGER NOT NULL REFERENCES users(id),
  tied_ids_json   TEXT NOT NULL,
  client_entropy  TEXT NOT NULL,
  server_nonce    TEXT NOT NULL,
  winner_movie_id INTEGER NOT NULL REFERENCES session_movies(id),
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tiebreaks_session ON tiebreaks(session_id);
