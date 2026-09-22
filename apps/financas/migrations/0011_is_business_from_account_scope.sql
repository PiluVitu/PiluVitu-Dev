-- =====================================================================
-- migrations/0011_is_business_from_account_scope.sql  —  alvo: Cloudflare D1
--
-- BACKFILL DE DADO, nao de schema. Nenhuma coluna nasce ou muda aqui.
--
-- MOTIVO (medido em producao, 2026-09-22): as 697 transacoes do ledger
-- tinham is_business = 0, INCLUSIVE as 93 da conta PJ. Todas vieram do
-- Pluggy, e importTransactions() gravava `row.is_business ?? 0` — um zero
-- fixo, sem olhar accounts.scope. O schema 0001 define a conta como
-- DEFAULT e a linha como verdade final ("aqui e sobrescrivivel porque na
-- pratica gasto de PJ cai em cartao PF"), mas o default nunca era
-- aplicado: o campo ficava uniformemente 0 e portanto sem informacao
-- nenhuma. Qualquer relatorio por escopo lia "tudo PF".
--
-- O lado do CODIGO ja foi corrigido na mesma fatia (import.ts passa a
-- herdar accounts.scope). Esta migration so acerta o que ja estava
-- gravado — sem ela, o filtro por escopo de byCategory()/insightNumbers()
-- responderia certo para import novo e errado para todo o historico.
--
-- SO MEXE EM LINHA DE CONTA PJ, e so nas que ainda estao com 0: uma linha
-- PJ que o dono tenha marcado a mao como PF (o override que o schema
-- permite) e indistinguivel, hoje, de uma nunca preenchida — mas como
-- NENHUMA linha do banco tinha 1 no momento desta migration (medido), nao
-- existe override para atropelar. Em banco onde isso deixe de valer, esta
-- migration ja rodou e nao roda de novo (forward-only).
--
-- Sem BEGIN/COMMIT (o D1 rejeita). Sem down migration.
-- =====================================================================

UPDATE transactions
   SET is_business = 1,
       updated_at  = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
 WHERE is_business = 0
   AND account_id IN (SELECT id FROM accounts WHERE scope = 'PJ');
