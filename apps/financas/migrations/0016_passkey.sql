-- =====================================================================
-- migrations/0016_passkey.sql   —  alvo: Cloudflare D1 (SQLite)
--
-- Tabela do plugin @better-auth/passkey 1.6.25 (segundo jeito de entrar,
-- ao lado do Google). Mesma adaptação do 0002: colunas camelCase (contrato
-- da biblioteca), date -> TEXT ISO-8601 UTC, boolean -> INTEGER 0|1.
--
-- Única divergência do gerador: credentialID com índice UNIQUE. O plugin
-- acha a credencial por findOne(credentialID); o WebAuthn garante que o id
-- é único, e o banco passa a garantir também.
--
-- ON DELETE CASCADE: apagar o user derruba as passkeys junto, igual a
-- session/account. Sem BEGIN/COMMIT (o D1 rejeita). Forward-only.
--
-- session.metodoLogin: 'google' ou 'passkey', gravado pelo Better Auth ao
-- criar a sessão. Só sessão do Google cadastra passkey. NULL = sessão
-- anterior a esta migração, que só podia ter vindo do Google.
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
