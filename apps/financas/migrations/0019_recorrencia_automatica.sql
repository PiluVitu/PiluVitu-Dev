-- Recorrência automática: frequência e lançamento pendente gerado pelo Cron.
--
-- frequency: 'monthly' é o comportamento de antes, então as recorrentes que
-- já existem ficam iguais. weekly/biweekly andam 7/14 dias a partir de
-- starts_on; annual cai uma vez por ano, no mês de starts_on.
--
-- generate_since NULL = não lança sozinha. A geração é opt-in por
-- recorrente, e o deploy desta migration não gera nada.
--
-- recurring_occurrences guarda cada ocorrência já tratada, com a chave
-- (recorrente, occurrence_key): 'YYYY-MM' do vencimento para mensal e
-- anual, 'YYYY-MM-DD' para semanal e quinzenal. É tabela e não coluna em
-- transactions porque apagar o pendente gerado não pode fazê-lo voltar no
-- dia seguinte: a linha fica, com transaction_id NULL.
--
-- Sem BEGIN/COMMIT (o D1 rejeita). Forward-only.

ALTER TABLE recurring_expenses
  ADD COLUMN frequency TEXT NOT NULL DEFAULT 'monthly'
    CHECK (frequency IN ('weekly','biweekly','monthly','annual'));

ALTER TABLE recurring_expenses
  ADD COLUMN generate_since TEXT;

CREATE TABLE recurring_occurrences (
  recurring_expense_id TEXT NOT NULL REFERENCES recurring_expenses(id) ON DELETE CASCADE,
  occurrence_key       TEXT NOT NULL,
  due_date             TEXT NOT NULL,
  transaction_id       TEXT REFERENCES transactions(id) ON DELETE SET NULL,
  origin               TEXT NOT NULL CHECK (origin IN ('gerado','vinculado')),
  created_at           TEXT NOT NULL,

  PRIMARY KEY (recurring_expense_id, occurrence_key)
) STRICT;

-- O ON DELETE SET NULL procura por transaction_id a cada lançamento apagado.
CREATE INDEX idx_recurring_occurrences_tx
  ON recurring_occurrences(transaction_id)
  WHERE transaction_id IS NOT NULL;
