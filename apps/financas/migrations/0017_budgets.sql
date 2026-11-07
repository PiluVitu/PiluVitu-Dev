-- Orçamento mensal por categoria. Valor em centavos inteiros; mês 'YYYY-MM'.
-- A categoria ser 'expense' e ativa é validada em TS (domain/budgets.ts):
-- um CHECK não enxerga outra tabela.
CREATE TABLE budgets (
  id           TEXT PRIMARY KEY,
  category_id  TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  month        TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,

  CHECK (amount_cents > 0),
  CHECK (length(month) = 7
         AND substr(month, 5, 1) = '-'
         AND substr(month, 1, 4) NOT GLOB '*[^0-9]*'
         AND substr(month, 6, 2) NOT GLOB '*[^0-9]*'
         AND CAST(substr(month, 6, 2) AS INTEGER) BETWEEN 1 AND 12),
  UNIQUE (month, category_id)
) STRICT;
