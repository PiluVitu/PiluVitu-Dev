-- Registro de cada pagamento de fatura feito por payBill e das linhas que ele
-- liquidou, para o desfazer saber exatamente o que voltar a "em aberto".
-- Sem backfill: os pagamentos anteriores não registraram as linhas, e
-- reconstruí-las pela data seria adivinhar.
CREATE TABLE bill_payments (
  transfer_id     TEXT PRIMARY KEY,
  card_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  competence      TEXT NOT NULL,
  paid_on         TEXT NOT NULL,
  amount_cents    INTEGER NOT NULL CHECK (amount_cents > 0),
  created_at      TEXT NOT NULL
) STRICT;

CREATE INDEX idx_bill_payments_card_paid_on
  ON bill_payments(card_account_id, paid_on);

CREATE TABLE bill_payment_lines (
  transfer_id    TEXT NOT NULL REFERENCES bill_payments(transfer_id) ON DELETE CASCADE,
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  PRIMARY KEY (transfer_id, transaction_id)
) STRICT;

CREATE INDEX idx_bill_payment_lines_tx
  ON bill_payment_lines(transaction_id);
