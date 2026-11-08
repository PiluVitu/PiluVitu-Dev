-- Metas de economia. O progresso não é gravado: vem do saldo da conta
-- vinculada (abertura + lançamentos), o mesmo cálculo de GET /api/accounts.
-- Uma meta por conta, para duas metas não contarem o mesmo dinheiro.
-- Que a conta não seja cartão nem arquivada é validado em TS (domain/goals.ts).
CREATE TABLE savings_goals (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  target_cents INTEGER NOT NULL,
  target_date  TEXT,
  account_id   TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,

  CHECK (target_cents > 0),
  CHECK (length(trim(name)) BETWEEN 1 AND 80),
  CHECK (target_date IS NULL OR (
         length(target_date) = 10
         AND substr(target_date, 5, 1) = '-'
         AND substr(target_date, 8, 1) = '-'
         AND substr(target_date, 1, 4) NOT GLOB '*[^0-9]*'
         AND substr(target_date, 6, 2) NOT GLOB '*[^0-9]*'
         AND substr(target_date, 9, 2) NOT GLOB '*[^0-9]*'
         AND CAST(substr(target_date, 6, 2) AS INTEGER) BETWEEN 1 AND 12
         AND CAST(substr(target_date, 9, 2) AS INTEGER) BETWEEN 1 AND 31)),
  UNIQUE (account_id)
) STRICT;
