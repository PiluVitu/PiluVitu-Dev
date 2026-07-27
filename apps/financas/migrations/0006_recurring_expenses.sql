-- =====================================================================
-- migrations/0006_recurring_expenses.sql   —  alvo: Cloudflare D1 (SQLite)
--
-- Fatia ⑥ (docs/superpowers/specs/2026-07-27-financas-recorrentes-design.md
-- §3-§4): despesas recorrentes com FAIXA de valor. O Simples varia de
-- R$ 12 a R$ 600 conforme o faturamento — entrar como R$ 306 seria o
-- numero que nunca acontece.
--
-- DECISAO 1 — projecao, nunca materializada (§3): o parcelamento
-- materializa N `transactions` de uma vez porque N e finito e conhecido na
-- criacao (installments_count 1..360). Uma recorrente NAO TEM FIM.
-- Materializar exigiria um horizonte arbitrario mais um processo que o
-- estende com o tempo — um cron que este projeto nao tem, ou um "estende ao
-- ler" que e materializacao disfarcada de projecao, com o pior dos dois.
-- Esta tabela guarda so a DEFINICAO da recorrente; nada aqui escreve em
-- `transactions`. A leitura (competencia a competencia, dentro da janela
-- pedida) fica pra Task 2.
--
-- DECISAO 2 — guarda de dupla contagem EXATA, nao heuristica (§3.1): se a
-- projecao diz "Starlink R$ 189 em agosto" e o lancamento real de agosto ja
-- existe, os dois contariam. Casar por categoria + valor aproximado erra em
-- SILENCIO — a classe de defeito que este projeto ja cacou a sessao
-- inteira. Por isso `transactions` ganha `recurring_expense_id` (nullable):
-- a projecao de uma competencia e suprimida quando ja existe lancamento com
-- aquele recurring_expense_id naquela competencia. Sem vinculo explicito, a
-- projecao continua aparecendo — comportamento correto: sem prova de que o
-- gasto aconteceu, ele continua previsto.
--
-- ⚠️ ON DELETE SET NULL, NUNCA CASCADE: apagar a DEFINICAO de uma recorrente
-- nao pode apagar um lancamento real (dinheiro que de fato saiu). Licao
-- medida em fatia anterior deste projeto: um CASCADE deixou linha orfa no
-- livro-caixa — dinheiro ainda registrado como gasto, motivo apagado.
--
-- `day_of_month` aceita ate 31 e e APARADO no calculo da projecao (dia 31
-- vira 28 em fevereiro) — mesma disciplina do fechamento/vencimento de
-- cartao (accounts.closing_day/due_day). A aritmetica ja existe em
-- src/lib/dates.ts (competenceDueDate); Task 2 reusa, nao reimplementa.
--
-- Sem BEGIN/COMMIT/SAVEPOINT (D1 rejeita). Forward-only: nao ha down
-- migration. CHECK de tabela (nao preso a uma coluna) vem DEPOIS de todas
-- as column-defs — gramatica do SQLite e column-def* table-constraint*, ja
-- errado uma vez na 0001 (ver CLAUDE.md).
--
-- ⚠️ Indice no D1 e IRREVERSIVEL — so DROP (destrutivo) + CREATE de novo,
-- nunca ALTER. Decidido agora, com a tabela vazia: SO o indice que a
-- supressao de projecao vai usar (`idx_tx_recurring`, abaixo). Nenhum
-- indice extra em `recurring_expenses` — a tabela tem no maximo uma dezena
-- de linhas em regime normal (Starlink, DAS, contador, INSS...), mesmo
-- raciocinio de 0003_account_provider_idx.sql: varrer a tabela inteira
-- custa o mesmo que buscar por indice quando ela e pequena por natureza, e
-- indice que nao paga a propria escrita e custo de cota sem beneficio.
-- =====================================================================

CREATE TABLE IF NOT EXISTS recurring_expenses (
  id                TEXT PRIMARY KEY,
  description       TEXT NOT NULL,
  category_id       TEXT REFERENCES categories(id) ON DELETE SET NULL,
  account_id        TEXT REFERENCES accounts(id)   ON DELETE SET NULL,
  scope             TEXT NOT NULL CHECK (scope IN ('PJ','PF')),
  day_of_month      INTEGER NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
  amount_min_cents  INTEGER NOT NULL CHECK (amount_min_cents > 0),
  amount_max_cents  INTEGER NOT NULL,
  starts_on         TEXT NOT NULL,
  ends_on           TEXT,
  active            INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  notes             TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,

  -- Valor fixo (Starlink R$ 189) e o caso min = max — nao existe um tipo
  -- "fixo" separado, porque isso duplicaria caminho de codigo pra nada
  -- (§2 do spec). min > max e sempre erro de digitacao.
  CHECK (amount_max_cents >= amount_min_cents),
  CHECK (ends_on IS NULL OR ends_on >= starts_on)
) STRICT;

-- Vinculo com o livro-caixa (§3.1). NAO materializa nada sozinho: so passa
-- a existir quando um lancamento real e explicitamente ligado a recorrente
-- (tela Lancar, "este lancamento e o Starlink de agosto"; import na fatia ②
-- fica pra depois). ON DELETE SET NULL: apagar a recorrente desvincula o
-- lancamento, nunca apaga.
ALTER TABLE transactions
  ADD COLUMN recurring_expense_id TEXT
    REFERENCES recurring_expenses(id) ON DELETE SET NULL;

-- Indice parcial que a supressao de projecao usa: "ja existe lancamento
-- desta recorrente dentro desta janela de purchase_date?". Igualdade
-- (recurring_expense_id) antes do range (purchase_date), mesmo padrao de
-- idx_tx_bill/idx_tx_category no 0001. Parcial porque so lancamentos
-- VINCULADOS interessam a essa pergunta — a maioria de `transactions` nunca
-- tera recurring_expense_id preenchido.
CREATE INDEX IF NOT EXISTS idx_tx_recurring
  ON transactions(recurring_expense_id, purchase_date)
  WHERE recurring_expense_id IS NOT NULL;
