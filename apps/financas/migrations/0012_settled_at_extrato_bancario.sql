-- =====================================================================
-- migrations/0012_settled_at_extrato_bancario.sql  —  alvo: Cloudflare D1
--
-- BACKFILL DE DADO, nao de schema.
--
-- MOTIVO (medido em producao, 2026-09-22): as 697 transacoes do ledger
-- estavam com settled_at NULL — TODAS, em conta `checking`, todas vindas
-- do Pluggy. importTransactions() gravava NULL fixo, justificado por um
-- comentario que dizia "extrato importado e fatura ainda em aberto, nao
-- dinheiro ja liquidado". Isso e verdade para FATURA DE CARTAO e falso
-- para EXTRATO BANCARIO: no extrato, o dinheiro ja se moveu — e o
-- adaptador do Pluggy so aceita status POSTED
-- (pluggy-map.ts#STATUS_IMPORTAVEL), nunca PENDING.
--
-- DOIS EFEITOS VISIVEIS, os dois corrigidos por esta migration:
--  1. A tela de extrato marca `settled_at IS NULL` como "falta marcar
--     como pago". Com 697/697 em NULL, TODO lancamento pedia acao —
--     inclusive Pix RECEBIDO, que nao e conta a pagar coisa nenhuma.
--  2. cashflow() (a tela Fluxo, regime de caixa) exige
--     `settled_at IS NOT NULL`. Com nenhuma linha liquidada, ela nao
--     tinha UMA linha para somar.
--
-- SO MEXE EM LINHA IMPORTADA DE CONTA QUE NAO E CARTAO. Lancamento
-- manual com settled_at NULL e um "previsto" que o dono escreveu de
-- proposito (parcela futura, conta a pagar) — atropelar isso apagaria
-- intencao. Cartao fica de fora porque la o NULL continua correto: a
-- compra so liquida quando a fatura e paga (payBill).
--
-- settled_at recebe purchase_date (data pura 'YYYY-MM-DD', ja LOCAL) —
-- mesma convencao de createTransfer()/payDebt(), e o caso que
-- localCompetence() (domain/cashflow.ts) trata SEM deslocamento de fuso.
--
-- Sem BEGIN/COMMIT (o D1 rejeita). Forward-only, sem down migration.
-- =====================================================================

UPDATE transactions
   SET settled_at = purchase_date,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
 WHERE settled_at    IS NULL
   AND import_source IS NOT NULL
   AND import_source <> 'manual'
   AND account_id IN (SELECT id FROM accounts WHERE kind <> 'credit_card');
