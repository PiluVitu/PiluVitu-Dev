CREATE TABLE IF NOT EXISTS distribution_targets (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slug       TEXT NOT NULL,
  platform   TEXT NOT NULL,
  kind       TEXT NOT NULL,
  content    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending',
  remote_url TEXT NOT NULL DEFAULT '',
  error      TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  posted_at  TEXT NOT NULL DEFAULT '',
  UNIQUE(slug, platform)
);
