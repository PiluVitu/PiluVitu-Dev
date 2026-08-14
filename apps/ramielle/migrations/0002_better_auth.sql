-- =====================================================================
-- migrations/0002_better_auth.sql   —  alvo: Cloudflare D1 (SQLite)
--
-- Tabelas do Better Auth 1.6.25 (core, sem plugin) — porte 1:1 de
-- apps/financas/migrations/0002_better_auth.sql (ver apps/financas/CLAUDE.md
-- para a procedência completa do DDL e as medições contra STRICT). ZERO
-- colisão com a 0001 deste app (schema da votação): aquelas 6 tabelas são o
-- domínio (users, voting_sessions, session_movies, votes, backups,
-- tiebreaks — INTEGER PRIMARY KEY AUTOINCREMENT, snake_case), estas 4 são a
-- biblioteca de auth (user, session, account, verification — TEXT PRIMARY
-- KEY, camelCase).
--
-- ⚠️ `users` (plural, migration 0001, domínio da votação — google_sub,
-- is_admin, FKs de votes/voting_sessions) e `user` (singular, aqui, contrato
-- do Better Auth) são DUAS TABELAS DIFERENTES DE PROPÓSITO, não uma
-- duplicata a "arrumar". Uma é a lib de autenticação (session/account/
-- verification giram em torno dela); a outra é o domínio de negócio (quem
-- pode votar, quem é admin). Nada nesta migration liga uma na outra — isso
-- é da Task 4 (guards), não do schema.
--
-- PROCEDÊNCIA: DDL gerado por `npx auth@latest generate` contra um config
-- descartável com node:sqlite (o CLI não alcança D1 direto) e ADAPTADO À
-- MÃO, mesma adaptação já medida e documentada no finanças:
--   date          -> TEXT     ('2026-07-26T16:27:46.844Z', ISO-8601 UTC)
--   emailVerified -> INTEGER  (0|1)
-- O tipo `date` do gerador NÃO existe em STRICT — 'unknown datatype'. A
-- adaptação é segura porque o adapter roda com supportsDates:false e
-- supportsBooleans:false em SQLite: o core já converte Date->toISOString()
-- e boolean->1|0 na escrita, e reverte na leitura (medido no finanças,
-- spikes S2/S5 — mesmo adapter Kysely embutido, mesma versão da lib).
--
-- EXCEÇÃO DELIBERADA À CONVENÇÃO DO MÓDULO: as colunas são camelCase
-- (emailVerified, createdAt, userId), não snake_case como as 6 tabelas do
-- 0001. Renomear exigiria mapear cada campo em `user: { fields: {...} }` na
-- config, e todo plugin futuro herdaria a mesma dívida. O nome dessas
-- colunas é contrato da biblioteca, não escolha nossa — fica camelCase.
--
-- Nomes de índice preservados do gerador (session_userId_idx, ...) de
-- propósito: mantém `npx auth generate` comparável por diff quando a versão
-- do Better Auth subir.
--
-- Sem BEGIN/COMMIT (o D1 rejeita). Forward-only: não há down migration.
-- =====================================================================

-- ---------------------------------------------------------------------
-- user — ao contrário do finanças (single-user, uma linha em regime
-- normal), aqui a votação é LIVRE (spec §7): qualquer conta Google que
-- completa o login social ganha uma linha aqui. NÃO existe hook de
-- allowlist em src/lib/auth.ts bloqueando a criação — ver o comentário lá
-- para o porquê (copiar o hook do finanças bloquearia todo mundo menos um
-- e-mail e mataria a feature). Quem decide ADMIN é `is_admin` em `users`
-- (migration 0001) + o guard da Task 4, nunca esta tabela.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  emailVerified INTEGER NOT NULL,   -- 0|1, nunca boolean
  image         TEXT,
  createdAt     TEXT NOT NULL,      -- ISO-8601 UTC com 'Z'
  updatedAt     TEXT NOT NULL
) STRICT;

-- ---------------------------------------------------------------------
-- session — o cookie better-auth.session_token (ou __Secure-... em prod,
-- por causa do baseURL https) carrega o `token` assinado; esta tabela é a
-- fonte de verdade da validade. ON DELETE CASCADE: apagar o user derruba
-- as sessões junto (FOREIGN KEY de verdade — D1 aplica PRAGMA
-- foreign_keys = 1 por padrão).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS session (
  id        TEXT PRIMARY KEY,
  expiresAt TEXT NOT NULL,
  token     TEXT NOT NULL UNIQUE,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  ipAddress TEXT,
  userAgent TEXT,
  userId    TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
) STRICT;

-- ---------------------------------------------------------------------
-- account — o vínculo com o provider. providerId='google', accountId=sub
-- do Google. `password` fica sempre NULL: emailAndPassword está desligado
-- em createAuth() (src/lib/auth.ts) — a coluna existe porque é parte do
-- schema padrão do Better Auth, não porque será usada.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS account (
  id                    TEXT PRIMARY KEY,
  accountId             TEXT NOT NULL,
  providerId            TEXT NOT NULL,
  userId                TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  accessToken           TEXT,
  refreshToken          TEXT,
  idToken               TEXT,
  accessTokenExpiresAt  TEXT,
  refreshTokenExpiresAt TEXT,
  scope                 TEXT,
  password              TEXT,
  createdAt             TEXT NOT NULL,
  updatedAt             TEXT NOT NULL
) STRICT;

-- ---------------------------------------------------------------------
-- verification — usada pelo fluxo OAuth para state/PKCE (não só por
-- verificação de e-mail). Linhas efêmeras; sem rotina de limpeza nesta
-- fatia.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS verification (
  id         TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value      TEXT NOT NULL,
  expiresAt  TEXT NOT NULL,
  createdAt  TEXT NOT NULL,
  updatedAt  TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS session_userId_idx         ON session(userId);
CREATE INDEX IF NOT EXISTS account_userId_idx         ON account(userId);
CREATE INDEX IF NOT EXISTS verification_identifier_idx ON verification(identifier);
