-- =====================================================================
-- migrations/0004_distribution.sql   —  alvo: Cloudflare D1 (SQLite)
--
-- Porte de apps/api/internal/distribution/schema.sql (Go, distribuição de
-- artigos: dev.to, Hashnode, Bluesky, Mastodon) para D1. Mesma tabela,
-- mesma lógica — só o dialeto muda, pelas regras já medidas em
-- migrations/0001_votacao.sql:9-26:
--
--  * STRICT — convenção do monorepo desde a 0001 do finanças.
--  * DEFAULT CURRENT_TIMESTAMP em vez de DEFAULT (datetime('now')) — mesma
--    saída, convenção do repo (o original usa DEFAULT (datetime('now'))).
--  * Sem BEGIN/COMMIT: o D1 rejeita.
--  * UNIQUE de tabela (não presa a uma coluna) vem DEPOIS de todas as
--    column-defs (gramática column-def* table-constraint*) — já era a
--    ÚLTIMA linha antes do fechamento no original, nenhum reposicionamento
--    necessário.
--
-- ⚠️ created_at/posted_at existem na tabela mas NÃO saem no JSON hoje —
-- `apps/api/internal/distribution/store.go:68-69,91-92` não as seleciona
-- nas queries de leitura, e `src/domain/distribution.ts` (que porta essas
-- queries) reproduz a mesma lista de colunas exaustiva. Se um dia forem
-- expostas, precisam passar por `toIsoUtc` (src/lib/dates.ts) — mesma
-- armadilha de data crua do D1 já documentada 3× em apps/ramielle/CLAUDE.md.
--
-- Migrations são forward-only: não existe down migration.
-- =====================================================================

CREATE TABLE IF NOT EXISTS distribution_targets (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slug       TEXT NOT NULL,
  platform   TEXT NOT NULL,
  kind       TEXT NOT NULL,
  content    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending',
  remote_url TEXT NOT NULL DEFAULT '',
  error      TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  posted_at  TEXT NOT NULL DEFAULT '',

  -- UNIQUE de tabela: já a última linha antes das column-defs terminarem,
  -- nenhum reposicionamento necessário (mesma observação de
  -- session_movies/votes em migrations/0001_votacao.sql).
  UNIQUE (slug, platform)
) STRICT;
