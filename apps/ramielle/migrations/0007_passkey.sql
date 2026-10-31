-- =====================================================================
-- migrations/0007_passkey.sql   —  alvo: Cloudflare D1 (SQLite)
--
-- Tabela do plugin @better-auth/passkey 1.6.25 (schema em
-- node_modules/@better-auth/passkey/dist/index.mjs, região src/schema.ts),
-- com a mesma adaptação da 0002_better_auth.sql para STRICT:
--   date    -> TEXT     (ISO-8601 UTC; o adapter escreve toISOString())
--   boolean -> INTEGER  (0|1; o adapter roda com supportsBooleans:false)
--
-- Passkey só de admin do site (src/lib/passkey.ts). Uma linha por
-- credencial; a chave pública fica em `publicKey` (COSE em base64), nunca
-- um segredo.
--
-- Diferença deliberada do gerador: o índice de credentialID é UNIQUE. O
-- login acha a passkey SÓ pelo credentialID que o navegador manda
-- (findOne), então duas linhas com o mesmo id deixariam a escolha da chave
-- para a ordem do SELECT.
--
-- Também soma `session.metodoLogin` ('google' | 'passkey'), gravado pelo
-- databaseHooks.session.create.before de src/lib/auth.ts: o cadastro de
-- passkey exige sessão aberta pelo Google. NULL = sessão anterior a esta
-- migração, aberta pelo Google (o único jeito de entrar até então).
--
-- Sem BEGIN/COMMIT (o D1 rejeita). Forward-only.
-- =====================================================================

CREATE TABLE IF NOT EXISTS passkey (
  id           TEXT PRIMARY KEY,
  name         TEXT,
  publicKey    TEXT NOT NULL,
  userId       TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  credentialID TEXT NOT NULL,
  counter      INTEGER NOT NULL,
  deviceType   TEXT NOT NULL,
  backedUp     INTEGER NOT NULL,   -- 0|1, nunca boolean
  transports   TEXT,
  createdAt    TEXT,               -- ISO-8601 UTC com 'Z'
  aaguid       TEXT
) STRICT;

CREATE INDEX IF NOT EXISTS passkey_userId_idx ON passkey(userId);
CREATE UNIQUE INDEX IF NOT EXISTS passkey_credentialID_idx ON passkey(credentialID);

ALTER TABLE session ADD COLUMN metodoLogin TEXT;
