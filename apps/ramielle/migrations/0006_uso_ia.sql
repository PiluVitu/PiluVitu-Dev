-- =====================================================================
-- uso_ia: reserva e custo das chamadas à Claude, por feature e mês.
--
-- Fonte: packages/ia/sql/uso_ia.sql. A migration de cada Worker é cópia
-- byte a byte deste arquivo, travada pelo schema.test.ts do Worker.
-- Dinheiro em micro-dólar inteiro. `mes` é 'YYYY-MM' em America/Fortaleza.
-- =====================================================================

CREATE TABLE uso_ia (
  id               TEXT PRIMARY KEY,
  feature          TEXT NOT NULL,
  mes              TEXT NOT NULL,
  modelo           TEXT NOT NULL,
  estado           TEXT NOT NULL CHECK (estado IN ('reservado','concluido','falhou')),
  reservado_micro  INTEGER NOT NULL,
  custo_micro      INTEGER,
  tokens_entrada   INTEGER,
  tokens_saida     INTEGER,
  criado_em        TEXT NOT NULL,
  concluido_em     TEXT
) STRICT;

CREATE INDEX IF NOT EXISTS idx_uso_ia_feature_mes ON uso_ia(feature, mes);
