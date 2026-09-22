-- =====================================================================
-- migrations/0013_contas_investimento.sql   —  alvo: Cloudflare D1
--
-- BACKFILL DE DADO, nao de schema.
--
-- MOTIVO (medido em producao, 2026-09-22): aplicacao e resgate de
-- investimento estavam sendo lidos como DESPESA e RECEITA, porque a conta
-- de investimento nao existia no ledger. Sao 8 lancamentos, todos de
-- out/2025: R$ 114,31 em "Aplicacao RDB" contados como gasto (guardar
-- dinheiro aparecia como gastar) e R$ 270,07 em "Resgate" contados como
-- receita (resgatar aparecia como ganhar). Nenhuma ocorrencia depois disso.
--
-- O schema ja previa o caso: accounts.kind aceita 'investment'. Esta
-- migration cria as duas contas (saldo de abertura ZERO — o valor real so o
-- dono sabe, e corrigir depois em #/contas nao exige migration) e gera a
-- PERNA OPOSTA de cada lancamento, pareada por transfer_id. A partir dai o
-- filtro `transfer_id IS NULL` de cashflow()/commitments()/byCategory() tira
-- os dois lados do relatorio, que e o mesmo mecanismo de qualquer
-- transferencia entre contas proprias.
--
-- NAO e o mesmo defeito de 0012/transfer-pairing: aqui nao havia par a
-- reconhecer. A corrente de 2025-10-14 (resgate no Inter -> Pix -> aplicacao
-- no Nubank) ja teve o MIOLO pareado pelo transfer-pairing; o que sobrou
-- foram as duas PONTAS, e cada uma encarava uma contraparte que nao estava
-- no banco. Nenhuma heuristica de descricao resolveria: a perna faltante
-- precisava ser CRIADA.
--
-- ⚠️ INERTE EM BANCO VAZIO, de proposito. applyD1Migrations() roda TODA
-- migration no beforeEach de CADA teste (src/test-setup.ts): um INSERT
-- incondicional aqui poluiria as 41 suites com 2 contas e 8 lancamentos
-- fantasmas. Por isso tudo abaixo e `INSERT ... SELECT ... WHERE`/`FROM
-- transactions WHERE id = ...` ancorado nas linhas reais — em banco sem
-- elas, insere zero.
--
-- ⚠️ AS DUAS CONTAS NASCEM COM SALDO NEGATIVO, e isso e proposital.
-- MEDIDO simulando esta migration num SQLite descartavel com as 8 linhas
-- reais: Nubank RDB fecha em -105,39 e Inter CDB em -50,37. O motivo e que
-- opening_balance_cents = 0 e havia dinheiro aplicado ANTES de out/2025 —
-- resgatou-se mais do que se aplicou na janela conhecida. O numero real do
-- saldo de abertura so o dono tem, e chutar um valor que zerasse a conta
-- seria fabricar dado com cara de verdade. O negativo e VISIVEL e diz
-- exatamente o que esta faltando: ajustar o saldo de abertura em #/contas
-- (campo ja existente, nao exige migration).
--
-- Convencoes das pernas novas copiadas de createTransfer()
-- (domain/transactions.ts): mesma description nos dois lados, settled_at =
-- purchase_date, bill_competence NULL (transferencia nao entra em fatura).
-- import_source NULL: nao vieram de banco nenhum, foram derivadas aqui.
--
-- Sem BEGIN/COMMIT (o D1 rejeita). Forward-only, sem down migration.
-- =====================================================================

INSERT INTO accounts
  (id, name, scope, kind, institution, currency, closing_day, due_day,
   credit_limit_cents, opening_balance_cents, opening_date, archived_at,
   created_at, updated_at)
SELECT 'f789e170-e796-4545-98d6-60ed8ffdf4af', 'Nubank RDB', 'PF', 'investment', 'Nubank', 'BRL', NULL, NULL,
       NULL, 0, NULL, NULL, '2026-09-22T00:00:00.000Z', '2026-09-22T00:00:00.000Z'
 WHERE EXISTS (SELECT 1 FROM transactions WHERE id = '70b08358-2243-4064-8960-dfaa442207c5');

INSERT INTO accounts
  (id, name, scope, kind, institution, currency, closing_day, due_day,
   credit_limit_cents, opening_balance_cents, opening_date, archived_at,
   created_at, updated_at)
SELECT 'a1ae8ca2-75bb-4721-8839-3aa839591716', 'Inter CDB', 'PF', 'investment', 'Inter', 'BRL', NULL, NULL,
       NULL, 0, NULL, NULL, '2026-09-22T00:00:00.000Z', '2026-09-22T00:00:00.000Z'
 WHERE EXISTS (SELECT 1 FROM transactions WHERE id = '70b08358-2243-4064-8960-dfaa442207c5');

INSERT INTO transactions
  (id, account_id, amount_cents, currency, amount_original_cents, fx_rate_ppm,
   purchase_date, bill_competence, settled_at, description, payee_id,
   category_id, is_business, transfer_id, parent_id, imported_id,
   import_source, created_at, updated_at)
SELECT 'e2f8fd90-bd39-4a14-aea6-8608d731379b', 'f789e170-e796-4545-98d6-60ed8ffdf4af', -t.amount_cents, 'BRL', NULL, NULL,
       t.purchase_date, NULL, t.purchase_date, t.description, NULL,
       NULL, 0, '7f061b6c-f762-4541-98c2-3b17519d4d37', NULL, NULL, NULL, '2026-09-22T00:00:00.000Z', '2026-09-22T00:00:00.000Z'
  FROM transactions t WHERE t.id = '70b08358-2243-4064-8960-dfaa442207c5';

UPDATE transactions SET transfer_id = '7f061b6c-f762-4541-98c2-3b17519d4d37', updated_at = '2026-09-22T00:00:00.000Z'
 WHERE id = '70b08358-2243-4064-8960-dfaa442207c5' AND transfer_id IS NULL;

INSERT INTO transactions
  (id, account_id, amount_cents, currency, amount_original_cents, fx_rate_ppm,
   purchase_date, bill_competence, settled_at, description, payee_id,
   category_id, is_business, transfer_id, parent_id, imported_id,
   import_source, created_at, updated_at)
SELECT 'ea374f64-9e86-4e8e-933a-4db0c2e553ba', 'f789e170-e796-4545-98d6-60ed8ffdf4af', -t.amount_cents, 'BRL', NULL, NULL,
       t.purchase_date, NULL, t.purchase_date, t.description, NULL,
       NULL, 0, 'b00cbd39-6622-4a71-97a7-1ea54b723656', NULL, NULL, NULL, '2026-09-22T00:00:00.000Z', '2026-09-22T00:00:00.000Z'
  FROM transactions t WHERE t.id = '6ad7cb31-9be5-4adb-b629-7dba2b36eadd';

UPDATE transactions SET transfer_id = 'b00cbd39-6622-4a71-97a7-1ea54b723656', updated_at = '2026-09-22T00:00:00.000Z'
 WHERE id = '6ad7cb31-9be5-4adb-b629-7dba2b36eadd' AND transfer_id IS NULL;

INSERT INTO transactions
  (id, account_id, amount_cents, currency, amount_original_cents, fx_rate_ppm,
   purchase_date, bill_competence, settled_at, description, payee_id,
   category_id, is_business, transfer_id, parent_id, imported_id,
   import_source, created_at, updated_at)
SELECT 'e25a5339-5149-4b38-af27-34c1070b2c1c', 'f789e170-e796-4545-98d6-60ed8ffdf4af', -t.amount_cents, 'BRL', NULL, NULL,
       t.purchase_date, NULL, t.purchase_date, t.description, NULL,
       NULL, 0, 'f15f84e2-60ac-498a-a478-34ea3c60a8b3', NULL, NULL, NULL, '2026-09-22T00:00:00.000Z', '2026-09-22T00:00:00.000Z'
  FROM transactions t WHERE t.id = 'ecb79bfb-6a4c-42e3-9e4f-1fe2762effe7';

UPDATE transactions SET transfer_id = 'f15f84e2-60ac-498a-a478-34ea3c60a8b3', updated_at = '2026-09-22T00:00:00.000Z'
 WHERE id = 'ecb79bfb-6a4c-42e3-9e4f-1fe2762effe7' AND transfer_id IS NULL;

INSERT INTO transactions
  (id, account_id, amount_cents, currency, amount_original_cents, fx_rate_ppm,
   purchase_date, bill_competence, settled_at, description, payee_id,
   category_id, is_business, transfer_id, parent_id, imported_id,
   import_source, created_at, updated_at)
SELECT '6a28f072-7d7d-4e87-8219-625940e3a8ff', 'f789e170-e796-4545-98d6-60ed8ffdf4af', -t.amount_cents, 'BRL', NULL, NULL,
       t.purchase_date, NULL, t.purchase_date, t.description, NULL,
       NULL, 0, '693d9e7c-a6c3-4342-9e3e-9ee452d2bd70', NULL, NULL, NULL, '2026-09-22T00:00:00.000Z', '2026-09-22T00:00:00.000Z'
  FROM transactions t WHERE t.id = '320b9c42-66ae-4f9d-9d5f-ab4e3bd1051d';

UPDATE transactions SET transfer_id = '693d9e7c-a6c3-4342-9e3e-9ee452d2bd70', updated_at = '2026-09-22T00:00:00.000Z'
 WHERE id = '320b9c42-66ae-4f9d-9d5f-ab4e3bd1051d' AND transfer_id IS NULL;

INSERT INTO transactions
  (id, account_id, amount_cents, currency, amount_original_cents, fx_rate_ppm,
   purchase_date, bill_competence, settled_at, description, payee_id,
   category_id, is_business, transfer_id, parent_id, imported_id,
   import_source, created_at, updated_at)
SELECT '4bd042f6-5bb5-4770-94a6-71d765c64c92', 'a1ae8ca2-75bb-4721-8839-3aa839591716', -t.amount_cents, 'BRL', NULL, NULL,
       t.purchase_date, NULL, t.purchase_date, t.description, NULL,
       NULL, 0, '857ce909-f358-4a0a-9fed-63f61ba43513', NULL, NULL, NULL, '2026-09-22T00:00:00.000Z', '2026-09-22T00:00:00.000Z'
  FROM transactions t WHERE t.id = 'b3ecff2c-abfd-41d4-a586-14f66cb88100';

UPDATE transactions SET transfer_id = '857ce909-f358-4a0a-9fed-63f61ba43513', updated_at = '2026-09-22T00:00:00.000Z'
 WHERE id = 'b3ecff2c-abfd-41d4-a586-14f66cb88100' AND transfer_id IS NULL;

INSERT INTO transactions
  (id, account_id, amount_cents, currency, amount_original_cents, fx_rate_ppm,
   purchase_date, bill_competence, settled_at, description, payee_id,
   category_id, is_business, transfer_id, parent_id, imported_id,
   import_source, created_at, updated_at)
SELECT 'ba23cd8d-36a9-457c-92e4-7645f7206670', 'f789e170-e796-4545-98d6-60ed8ffdf4af', -t.amount_cents, 'BRL', NULL, NULL,
       t.purchase_date, NULL, t.purchase_date, t.description, NULL,
       NULL, 0, '705cebdf-429a-4f3c-8f77-3775a2c35b80', NULL, NULL, NULL, '2026-09-22T00:00:00.000Z', '2026-09-22T00:00:00.000Z'
  FROM transactions t WHERE t.id = 'd3baa0ab-38c6-4d9d-97d7-f30f326bad55';

UPDATE transactions SET transfer_id = '705cebdf-429a-4f3c-8f77-3775a2c35b80', updated_at = '2026-09-22T00:00:00.000Z'
 WHERE id = 'd3baa0ab-38c6-4d9d-97d7-f30f326bad55' AND transfer_id IS NULL;

INSERT INTO transactions
  (id, account_id, amount_cents, currency, amount_original_cents, fx_rate_ppm,
   purchase_date, bill_competence, settled_at, description, payee_id,
   category_id, is_business, transfer_id, parent_id, imported_id,
   import_source, created_at, updated_at)
SELECT 'cafc0474-42d0-4041-9685-4fed3d804f2b', 'f789e170-e796-4545-98d6-60ed8ffdf4af', -t.amount_cents, 'BRL', NULL, NULL,
       t.purchase_date, NULL, t.purchase_date, t.description, NULL,
       NULL, 0, '7c82f55b-c75e-44fe-8ecc-472f69e60200', NULL, NULL, NULL, '2026-09-22T00:00:00.000Z', '2026-09-22T00:00:00.000Z'
  FROM transactions t WHERE t.id = '079e79de-8abb-4399-a69f-1b94a0489c58';

UPDATE transactions SET transfer_id = '7c82f55b-c75e-44fe-8ecc-472f69e60200', updated_at = '2026-09-22T00:00:00.000Z'
 WHERE id = '079e79de-8abb-4399-a69f-1b94a0489c58' AND transfer_id IS NULL;

INSERT INTO transactions
  (id, account_id, amount_cents, currency, amount_original_cents, fx_rate_ppm,
   purchase_date, bill_competence, settled_at, description, payee_id,
   category_id, is_business, transfer_id, parent_id, imported_id,
   import_source, created_at, updated_at)
SELECT 'e427904a-26c0-4da9-9b7a-4fbdf64b9a61', 'f789e170-e796-4545-98d6-60ed8ffdf4af', -t.amount_cents, 'BRL', NULL, NULL,
       t.purchase_date, NULL, t.purchase_date, t.description, NULL,
       NULL, 0, '10d12cf9-46d8-406d-a768-647dabbfcf02', NULL, NULL, NULL, '2026-09-22T00:00:00.000Z', '2026-09-22T00:00:00.000Z'
  FROM transactions t WHERE t.id = '99aadca1-b30e-46c0-9e9a-6eef0daf1889';

UPDATE transactions SET transfer_id = '10d12cf9-46d8-406d-a768-647dabbfcf02', updated_at = '2026-09-22T00:00:00.000Z'
 WHERE id = '99aadca1-b30e-46c0-9e9a-6eef0daf1889' AND transfer_id IS NULL;
