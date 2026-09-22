-- =====================================================================
-- migrations/0014_saldo_abertura_investimento.sql  —  alvo: Cloudflare D1
--
-- BACKFILL DE DADO, nao de schema.
--
-- MOTIVO: a 0013 criou `Nubank RDB` e `Inter CDB` com
-- opening_balance_cents = 0, e as duas ficaram com SALDO NEGATIVO
-- (-105,39 e -50,37). O negativo nao era erro de conta — era a ausencia
-- do saldo de abertura aparecendo: o Pluggy so trouxe out/2025, e a
-- PRIMEIRA movimentacao de cada conta e um RESGATE. Resgatar de um cofre
-- que, nos livros, comecou vazio, deixa o cofre devendo.
--
-- O dono confirmou (2026-09-22) que esvaziou as duas e nao mexeu mais —
-- coerente com o dado: a ultima movimentacao e 2025-10-17, ha 11 meses,
-- e nao ha nenhuma depois em nenhuma das duas.
--
-- ⚠️ OS VALORES NAO SAO CHUTE, e e por isso que esta migration pode
-- existir. Se o saldo HOJE e zero e o liquido conhecido e -105,39, entao
-- o saldo de abertura era exatamente +105,39 — sai da aritmetica dos
-- proprios resgates, nao de uma estimativa. Mesma conta para o Inter CDB
-- (+50,37). Depois desta migration, `opening_balance + SUM(amount_cents)`
-- fecha em R$ 0,00 EXATO nas duas.
--
-- opening_date recebe a data da primeira movimentacao conhecida: e o
-- instante a que o saldo de abertura se refere. Campo informativo — nenhuma
-- query de saldo o usa (accounts.ts so o grava e le), entao nao ha risco
-- de dupla contagem.
--
-- ⚠️ INERTE EM BANCO VAZIO, pelo mesmo motivo da 0013 (applyD1Migrations
-- roda toda migration no beforeEach de cada teste): sao UPDATEs por id de
-- conta que so existe em producao — em banco sem elas, atualiza zero.
--
-- Isto NAO precisa ser migration para sempre: `opening_balance_cents` e
-- editavel em #/contas. Virou migration aqui so porque os dois valores
-- foram DERIVADOS do ledger, e derivacao merece ficar registrada junto com
-- o raciocinio, em vez de aparecer como um numero digitado numa tela.
--
-- Sem BEGIN/COMMIT (o D1 rejeita). Forward-only, sem down migration.
-- =====================================================================

UPDATE accounts
   SET opening_balance_cents = 10539,
       opening_date          = '2025-10-13',
       updated_at            = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
 WHERE id = 'f789e170-e796-4545-98d6-60ed8ffdf4af';

UPDATE accounts
   SET opening_balance_cents = 5037,
       opening_date          = '2025-10-14',
       updated_at            = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
 WHERE id = 'a1ae8ca2-75bb-4721-8839-3aa839591716';
