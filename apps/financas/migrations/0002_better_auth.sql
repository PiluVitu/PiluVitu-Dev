-- =====================================================================
-- migrations/0002_better_auth.sql   —  alvo: Cloudflare D1 (SQLite)
--
-- Tabelas do Better Auth 1.6.25 (core, sem plugin). ZERO colisao com o
-- 0001: aquelas 10 sao plural (accounts, transactions, ...), estas sao
-- singular (user, session, account, verification).
--
-- PROCEDENCIA: DDL gerado por `npx auth@latest generate` contra um config
-- descartavel com node:sqlite (o CLI nao alcanca D1 direto) e ADAPTADO A
-- MAO:
--   date          -> TEXT     ('2026-07-26T16:27:46.844Z', ISO-8601 UTC)
--   emailVerified -> INTEGER  (0|1)
-- O tipo `date` do gerador NAO existe em STRICT — 'unknown datatype'. A
-- adaptacao e segura porque o adapter roda com supportsDates:false e
-- supportsBooleans:false em SQLite: o core ja converte Date->toISOString()
-- e boolean->1|0 na escrita, e reverte na leitura. Escrita real e leitura
-- de volta confirmadas por execucao dentro do Miniflare (spike S2/S5,
-- via internalAdapter.createOAuthUser e via signUpEmail/signInEmail).
--
-- EXCECAO DELIBERADA A CONVENCAO DO MODULO: as colunas sao camelCase
-- (emailVerified, createdAt, userId), nao snake_case como as 10 tabelas
-- do 0001. Renomear exigiria mapear cada campo em `user: { fields: {...} }`
-- na config, e todo plugin futuro herdaria a mesma divida. O nome dessas
-- colunas e contrato da biblioteca, nao escolha nossa — fica camelCase.
--
-- Nomes de indice preservados do gerador (session_userId_idx, ...) de
-- proposito: mantem `npx auth generate` comparavel por diff quando a
-- versao do Better Auth subir.
--
-- Sem BEGIN/COMMIT (o D1 rejeita). Forward-only: nao ha down migration.
-- =====================================================================

-- ---------------------------------------------------------------------
-- user — exatamente UMA linha em regime normal (modulo single-user). A
-- linha so nasce se o e-mail passar por databaseHooks.user.create.before
-- (src/lib/auth.ts). Este schema NAO impoe a allowlist: o UNIQUE de email
-- impede duplicata do mesmo e-mail, nao a entrada de um e-mail estranho —
-- quem impede isso e o hook, camada de aplicacao, nao o schema.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  emailVerified INTEGER NOT NULL,   -- 0|1, nunca boolean
  image         TEXT,
  createdAt     TEXT NOT NULL,      -- ISO-8601 UTC com 'Z', igual ao nowIsoUtc() do modulo
  updatedAt     TEXT NOT NULL
) STRICT;

-- ---------------------------------------------------------------------
-- session — o cookie better-auth.session_token (ou __Secure-... em prod,
-- por causa do baseURL https) carrega o `token` assinado; esta tabela e a
-- fonte de verdade da validade. ON DELETE CASCADE: apagar o user derruba
-- as sessoes junto (o D1 aplica FOREIGN KEY de verdade, PRAGMA
-- foreign_keys = 1 por padrao).
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
-- account — o vinculo com o provider. providerId='google', accountId=sub
-- do Google. `password` fica sempre NULL em producao: emailAndPassword
-- esta desligado em createAuth() (src/lib/auth.ts) — a coluna existe
-- porque e parte do schema padrao do Better Auth, nao porque sera usada.
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
-- verification — usada pelo fluxo OAuth para state/PKCE (nao so por
-- verificacao de e-mail). Linhas efemeras; nao ha rotina de limpeza nesta
-- fatia, e o volume single-user nao justifica uma.
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
