-- =====================================================================
-- migrations/0004_tx_purchase_date_expense_idx.sql  —  alvo: Cloudflare D1 (SQLite)
--
-- Indice parcial em transactions(purchase_date), restrito as linhas que
-- GET /api/reports/by-category (Task 5, domain/reports.ts#byCategory)
-- realmente le: despesa real, sem perna de transferencia, sem filha de
-- rateio. O predicado do indice repete de proposito o predicado ESTATICO
-- da query (amount_cents < 0 AND transfer_id IS NULL AND parent_id IS
-- NULL) — o que varia entre chamadas e so a FAIXA de purchase_date
-- (>= inicio do mes, < inicio do mes seguinte), que o range scan do
-- indice resolve direto.
--
-- ACHADO DA REVISAO (fix round 1): a versao original da query filtrava com
-- `substr(t.purchase_date, 1, 7) = ?`. Uma FUNCAO aplicada em cada linha
-- antes de comparar impede QUALQUER indice em purchase_date — todo SELECT
-- escaneava a tabela `transactions` INTEIRA (o que "rows read" cobra),
-- nao so o mes pedido, e o custo cresce com o ledger inteiro pra sempre,
-- nao com o tamanho de um mes. Reescrito para faixa semi-aberta
-- (purchase_date >= ? AND purchase_date < ?, sargable) e este indice criado
-- pra sustentar o range scan.
--
-- ⚠️ INDICE NO D1 E IRREVERSIVEL — so DROP (destrutivo) + CREATE de novo,
-- nunca ALTER. Mesma decisao consciente do 0003 (account_providerId_
-- accountId_idx): o momento mais barato pra acertar o desenho e ANTES de
-- existir dado real, e e exatamente onde este modulo esta — producao hoje
-- tem so as 7 linhas do seed de categorias (ver CLAUDE.md/"Backup do D1"),
-- nenhum lancamento de verdade ainda.
--
-- Sem BEGIN/COMMIT (o D1 rejeita). Forward-only: nao ha down migration —
-- reverter significa DROP INDEX manual, irreversivel igual a criacao.
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_tx_purchase_date_expense
  ON transactions(purchase_date)
  WHERE amount_cents < 0 AND transfer_id IS NULL AND parent_id IS NULL;
