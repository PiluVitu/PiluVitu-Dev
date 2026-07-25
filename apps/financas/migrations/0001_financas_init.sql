-- =====================================================================
-- migrations/0001_financas_init.sql   —  alvo: Cloudflare D1 (SQLite)
--
-- REGRAS DE COMPATIBILIDADE D1 — TODAS MEDIDAS EM 2026-07-25:
--  * Sem PRAGMA de conexao (journal_mode/busy_timeout nao existem no D1;
--    a allowlist do D1 tem 17 PRAGMAs e os de conexao nao estao nela).
--  * Sem BEGIN/COMMIT/SAVEPOINT: o D1 REJEITA. Atomicidade e via batch(),
--    que MEDIDO faz rollback real da sequencia inteira.
--  * TRIGGER FUNCIONA e dispara — ao contrario do que se assumia com base
--    em workers-sdk#4998. Por isso os invariantes de soma vivem no BANCO,
--    via RAISE(ABORT), e nao na aplicacao.
--  * FOREIGN KEY e aplicada de verdade: PRAGMA foreign_keys = 1 por padrao e
--    INSERT orfao falha. Todo REFERENCES abaixo tem efeito real.
--  * STRICT funciona e o tipo e aplicado => todas as tabelas sao STRICT.
--  * sqlite_version() e BLOQUEADA pelo D1 ("not authorized to use function").
--    A versao exata segue desconhecida; STRICT funcionar prova >= 3.37.
--  * Migrations sao forward-only: nao existe down migration.
--
-- CONVENCOES:
--  * PK TEXT (UUIDv4 gerado no cliente).
--  * Dinheiro e INTEGER em centavos, nunca REAL.
--    2^53-1 centavos = R$ 90.071.992.547.409,91.
--  * Datas: TEXT ISO-8601 'YYYY-MM-DD' (ordenacao lexicografica ==
--    cronologica). Competencia: TEXT 'YYYY-MM'. Timestamps: UTC 'Z'.
--  * STRICT em todas as tabelas: num livro-caixa, matar a afinidade de tipo
--    do SQLite vale o custo. Consequencia: so INT/INTEGER/REAL/TEXT/BLOB/ANY
--    sao tipos validos, e toda coluna precisa de tipo declarado.
-- =====================================================================

-- ---------------------------------------------------------------------
-- accounts — "varias contas e varios cartoes" e a dor declarada no 1.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounts (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,

  -- Etiqueta PJ/PF. Fica na conta como DEFAULT do lancamento, nao como
  -- verdade final (ver transactions.is_business).
  scope                 TEXT NOT NULL CHECK (scope IN ('PJ','PF')),

  -- O subtipo decide a SEMANTICA: so credit_card tem fatura, portanto so
  -- credit_card preenche transactions.bill_competence.
  kind                  TEXT NOT NULL
                        CHECK (kind IN ('checking','savings','credit_card',
                                        'cash','investment','benefit')),

  institution           TEXT,   -- 'Nubank','Inter','BB' — chave de matching no import (fatia 2)
  currency              TEXT NOT NULL DEFAULT 'BRL',

  -- Fechamento/vencimento moram AQUI, nao em codigo: e o que permite
  -- derivar bill_competence de purchase_date sem regra hardcoded.
  -- Compra 28/07 num cartao que fecha dia 25 => competencia '2026-08'.
  closing_day           INTEGER CHECK (closing_day BETWEEN 1 AND 31),
  due_day               INTEGER CHECK (due_day     BETWEEN 1 AND 31),
  credit_limit_cents    INTEGER,

  -- Saldo de abertura: extrato = opening_balance + SUM(transactions).
  -- Evita importar o historico inteiro do banco so para o saldo bater —
  -- o que, alem de trabalhoso, estouraria os 100k rows written/dia.
  opening_balance_cents INTEGER NOT NULL DEFAULT 0,
  opening_date          TEXT,

  archived_at           TEXT,   -- soft delete: conta encerrada nao apaga historico
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,

  -- Cartao sem dia de fechamento nao calcula fatura nenhuma: barra na
  -- entrada em vez de gerar competencia errada depois.
  CHECK (kind <> 'credit_card' OR (closing_day IS NOT NULL AND due_day IS NOT NULL))
) STRICT;

-- Indice PARCIAL: 90% das telas listam so contas ativas. No D1, indice
-- parcial nao e so economia de espaco — e economia de cota de escrita,
-- porque so custa "row written" quando a linha CASA com o WHERE.
CREATE INDEX IF NOT EXISTS idx_accounts_scope
  ON accounts(scope, kind) WHERE archived_at IS NULL;

-- ---------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id            TEXT PRIMARY KEY,
  parent_id     TEXT REFERENCES categories(id) ON DELETE RESTRICT,
  name          TEXT NOT NULL,

  -- 'transfer' e 'debt_settlement' NAO sao receita nem despesa. Sao as
  -- duas classes que TODO relatorio de resultado exclui. Pilar no 2 do
  -- anti-dupla-contagem (o no 1 e transactions.transfer_id).
  kind          TEXT NOT NULL
                CHECK (kind IN ('income','expense','transfer','debt_settlement')),

  -- slug estavel para MEDIR o gap declarado de ~R$ 1.000/mes (DAS +
  -- contador + INSS) sem depender do texto digitado.
  -- Semear: 'das', 'contador', 'inss', 'pro-labore'.
  slug          TEXT,

  default_scope TEXT CHECK (default_scope IN ('PJ','PF')),
  archived_at   TEXT,
  created_at    TEXT NOT NULL,
  CHECK (parent_id IS NULL OR parent_id <> id)   -- hierarquia de 2 niveis; ciclo raso barrado
) STRICT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_slug
  ON categories(slug) WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_categories_parent
  ON categories(parent_id) WHERE parent_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- payees — credores, devedores, estabelecimentos e a PROPRIA PJ.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payees (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,

  -- Nome normalizado (upper, sem acento, sem sufixo de maquininha/cidade).
  -- Criado na fatia 1 mesmo sem import: indice do D1 nao e alteravel.
  norm_name           TEXT NOT NULL,

  -- 'self_entity' = a PROPRIA PJ do dono. Permite modelar divida com a
  -- propria empresa sem gambiarra: a PJ e um credor como outro qualquer,
  -- e o pagamento a ela e transferencia interna.
  kind                TEXT NOT NULL
                      CHECK (kind IN ('person','merchant','government','self_entity')),

  document            TEXT,   -- CPF/CNPJ sem mascara
  default_category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  created_at          TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS idx_payees_norm ON payees(norm_name);

-- ---------------------------------------------------------------------
-- transactions — o livro-caixa UNICO. Dois filtros (is_business, scope),
-- uma tabela. Tudo que e dinheiro passa por aqui e so por aqui.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
  id                    TEXT PRIMARY KEY,
  account_id            TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,

  -- VALOR COM SINAL: negativo = saida, positivo = entrada.
  -- Alternativa descartada: coluna `direction` + valor absoluto. Com sinal,
  -- saldo e fluxo de caixa sao um SUM() coberto por indice; com direction,
  -- toda agregacao vira CASE WHEN e o indice deixa de ajudar — e no D1
  -- "rows read" conta linhas ESCANEADAS, entao perder indice custa COTA.
  amount_cents          INTEGER NOT NULL CHECK (amount_cents <> 0),

  currency              TEXT NOT NULL DEFAULT 'BRL',
  -- Compra em USD (Steam, AWS, Copilot): guarda o original e a taxa para o
  -- extrato reconciliar com a fatura em real. fx_rate em PARTES POR MILHAO
  -- (taxa x 1e6, INTEGER): e o unico lugar onde um REAL entraria, e REAL no
  -- SQLite e float64 — 5,4321 nunca volta exatamente 5,4321.
  amount_original_cents INTEGER,
  fx_rate_ppm           INTEGER CHECK (fx_rate_ppm IS NULL OR fx_rate_ppm > 0),

  -- TRES DATAS, TRES PERGUNTAS DIFERENTES. Coracao do schema:
  --  purchase_date   : quando o FATO aconteceu (competencia do gasto).
  purchase_date         TEXT NOT NULL,
  --  bill_competence : em qual FATURA caiu ('YYYY-MM'). Sem esta coluna,
  --                    "quanto vem na fatura de agosto" obrigaria a
  --                    reimplementar a regra de fechamento em toda query
  --                    (e a regra muda por cartao). NULL fora de cartao.
  bill_competence       TEXT,
  --  settled_at      : quando o DINHEIRO se moveu. NULL = previsto (parcela
  --                    futura, fatura em aberto). Permite responder regime
  --                    de caixa E projecao a partir de UMA tabela so.
  settled_at            TEXT,

  description           TEXT NOT NULL,
  payee_id              TEXT REFERENCES payees(id)     ON DELETE SET NULL,
  category_id           TEXT REFERENCES categories(id) ON DELETE SET NULL,

  -- Etiqueta PJ/PF NO LANCAMENTO, nao so na conta. A conta da o default;
  -- aqui e sobrescrivivel porque na pratica gasto de PJ cai em cartao PF —
  -- e e justamente esse caso que distorce a medicao do custo real da PJ.
  is_business           INTEGER NOT NULL DEFAULT 0 CHECK (is_business IN (0,1)),

  -- TRANSFERENCIA ENTRE CONTAS PROPRIAS: DUAS linhas (saida em A, entrada
  -- em B) com o MESMO transfer_id. Mecanismo anti-dupla-contagem no 1.
  -- Alternativa descartada: uma linha com account_from/account_to — quebra
  -- o SUM() por conta e obriga UNION em toda query de extrato.
  transfer_id           TEXT,

  -- RATEIO / ESTORNO: compra de mercado dividida em 'mercado' e 'pet' vira
  -- 1 linha pai (valor cheio, category_id NULL) + N filhas. Extrato usa os
  -- pais; relatorio por categoria usa as folhas. CASCADE porque apagar o
  -- pai sem as filhas deixaria o caixa inconsistente.
  parent_id             TEXT REFERENCES transactions(id) ON DELETE CASCADE,

  -- IDEMPOTENCIA DE IMPORT: FITID do OFX, ou hash estavel da linha do CSV.
  -- Coluna + indice unico parcial criados JA na fatia 1 porque indice no D1
  -- nao pode ser alterado depois — so dropado (irreversivel) e recriado.
  imported_id           TEXT,
  import_source         TEXT CHECK (import_source IS NULL OR
                          import_source IN ('manual','ofx','csv','pdf','pluggy','share-target')),

  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,

  -- NOTA DE TRANSCRICAO: os dois CHECKs de tabela abaixo (nao presos a uma
  -- coluna) precisaram vir para o FINAL do CREATE TABLE. A gramatica do
  -- SQLite (== SQL padrao) e column-def* table-constraint* — uma vez que um
  -- table-constraint solto aparece, nenhuma column-def pode vir depois.
  -- MEDIDO com sqlite3 3.51.0 e com D1 local: um CHECK solto seguido de mais
  -- uma coluna da exatamente "near \"<proxima-coluna>\": syntax error". A
  -- posicao original no brief (currency-check logo apos fx_rate_ppm, e o
  -- parent_id-check logo apos parent_id) nao parseia. Logica, colunas e
  -- ordem entre si preservadas — so a POSICAO das duas linhas de CHECK
  -- mudou, para o unico lugar em que a gramatica aceita.
  CHECK (currency = 'BRL'
         OR (amount_original_cents IS NOT NULL AND fx_rate_ppm IS NOT NULL)),
  CHECK (parent_id IS NULL OR parent_id <> id)
) STRICT;

-- INDICES — desenhados contra a COTA, nao so contra latencia. Cada indice
-- APLICAVEL soma 1 "row written". Um lancamento comum (sem transfer, sem
-- import, sem fatura) casa com 3 dos 7 => 4 rows written, nao 8. Por isso
-- quase todos sao parciais.
CREATE INDEX IF NOT EXISTS idx_tx_account_date
  ON transactions(account_id, purchase_date);                 -- extrato por conta
CREATE INDEX IF NOT EXISTS idx_tx_settled
  ON transactions(settled_at) WHERE settled_at IS NOT NULL;   -- fluxo realizado
CREATE INDEX IF NOT EXISTS idx_tx_bill
  ON transactions(account_id, bill_competence)
  WHERE bill_competence IS NOT NULL;                          -- "o que vem na fatura de X"
CREATE INDEX IF NOT EXISTS idx_tx_category
  ON transactions(category_id, purchase_date)
  WHERE category_id IS NOT NULL;
-- Igualdade ANTES do range: is_business e igualdade, purchase_date e range.
CREATE INDEX IF NOT EXISTS idx_tx_business
  ON transactions(is_business, purchase_date);
CREATE INDEX IF NOT EXISTS idx_tx_transfer
  ON transactions(transfer_id) WHERE transfer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tx_parent
  ON transactions(parent_id)   WHERE parent_id   IS NOT NULL;
-- Dedupe do import. Unico POR CONTA porque FITID so e unico dentro da
-- instituicao; global daria colisao entre bancos.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tx_imported
  ON transactions(account_id, imported_id) WHERE imported_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- installment_plans / installments — parcelamento.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS installment_plans (
  id                 TEXT PRIMARY KEY,
  account_id         TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  payee_id           TEXT REFERENCES payees(id)     ON DELETE SET NULL,
  category_id        TEXT REFERENCES categories(id) ON DELETE SET NULL,
  description        TEXT NOT NULL,

  -- total_cents e a soma EXATA das parcelas, nao o preco de tabela.
  -- Arredondamento: R$ 100,00 em 3x = 3334 + 3333 + 3333. O resto de
  -- (total_cents % n) vai nas PRIMEIRAS parcelas, que e o que os emissores
  -- brasileiros fazem. Invariante SUM(parcelas) = total_cents validado no batch.
  total_cents        INTEGER NOT NULL CHECK (total_cents > 0),
  installments_count INTEGER NOT NULL CHECK (installments_count BETWEEN 1 AND 360),

  purchase_date      TEXT NOT NULL,
  first_competence   TEXT NOT NULL,   -- 'YYYY-MM' da 1a fatura
  is_business        INTEGER NOT NULL DEFAULT 0 CHECK (is_business IN (0,1)),
  canceled_at        TEXT,            -- antecipacao/quitacao encerra o plano sem apagar historico
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS installments (
  id             TEXT PRIMARY KEY,
  plan_id        TEXT NOT NULL REFERENCES installment_plans(id) ON DELETE CASCADE,
  seq            INTEGER NOT NULL CHECK (seq >= 1),
  due_date       TEXT NOT NULL,

  -- DECISAO CENTRAL: cada parcela materializa UMA transaction, criada JA NO
  -- ATO da compra, com settled_at NULL e bill_competence preenchida.
  --  * O dinheiro tem UMA fonte da verdade (transactions); installments
  --    guarda apenas metadado de cronograma (seq, vencimento).
  --  * "Quanto ja esta comprometido nos proximos 6 meses" vira UMA query
  --    indexada em transactions, sem tabela de projecao.
  --  * Quando a fatura e paga, o import so preenche settled_at — nao cria
  --    linha nova, entao previsto e realizado nunca se somam.
  -- Alternativa descartada: materializar so quando a parcela cai na fatura
  -- — some a visibilidade do comprometimento futuro, que e exatamente o
  -- que doi com varios cartoes.
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,

  created_at     TEXT NOT NULL,
  UNIQUE (plan_id, seq)
) STRICT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_installments_tx ON installments(transaction_id);

-- ORCAMENTO DE BATCH — REVISADO APOS MEDICAO.
-- Plano de 60 parcelas:
--    1  INSERT installment_plans
--   12  INSERT transactions  multi-row (19 colunas => 5 linhas/statement)
--    3  INSERT installments  multi-row ( 5 colunas => 20 linhas/statement)
--  = 16 statements.
--
-- A versao anterior deste spec dizia que 1 statement por parcela (121 no
-- total) FALHARIA por causa do limite de 50 queries/invocacao. MEDIDO: nao
-- falha — batch de 200 statements passou (210 ms), e 200 queries sequenciais
-- tambem (26,7 s). O multi-row continua sendo o desenho certo, mas por
-- LATENCIA, nao por correcao: 60 parcelas em 3 statements levam 151 ms
-- contra ~8.000 ms sequencial (53x). O limite de 100 bound params por
-- statement esse sim e real e continua governando as 7/20 linhas por INSERT.

-- ---------------------------------------------------------------------
-- debts / debt_items / debt_payments / debt_payment_allocations
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS debts (
  id            TEXT PRIMARY KEY,

  -- Credor/devedor e um payee. Pessoa fisica E entidade propria caem no
  -- mesmo modelo (payees.kind = 'person' | 'self_entity').
  payee_id      TEXT NOT NULL REFERENCES payees(id) ON DELETE RESTRICT,

  -- Direcao decide a semantica de caixa:
  --  'i_owe'      : eu devo. A COMPRA original geralmente NAO esta no meu
  --                 caixa (outra pessoa pagou) => debt_items.transaction_id NULL.
  --  'owed_to_me' : me devem. A compra ESTA no meu caixa (paguei no meu
  --                 cartao) => debt_items.transaction_id aponta pra ela.
  direction     TEXT NOT NULL CHECK (direction IN ('i_owe','owed_to_me')),

  title         TEXT NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'BRL',
  opened_at     TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open'
                CHECK (status IN ('open','settled','written_off')),
  settled_at    TEXT,
  notes         TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  CHECK (status <> 'settled' OR settled_at IS NOT NULL)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_debts_open
  ON debts(payee_id, direction) WHERE status = 'open';

-- O item responde "o Steam Deck ja esta quitado?".
CREATE TABLE IF NOT EXISTS debt_items (
  id             TEXT PRIMARY KEY,
  debt_id        TEXT NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
  description    TEXT NOT NULL,                              -- 'Steam Deck OLED 1TB'
  amount_cents   INTEGER NOT NULL CHECK (amount_cents > 0),  -- SEMPRE positivo: e ESTOQUE, nao fluxo
  incurred_on    TEXT NOT NULL,

  -- Link OPCIONAL para a compra original no livro-caixa. NUNCA usado para
  -- gerar lancamento: debt_items e dimensao PATRIMONIAL. Quem toca no caixa
  -- e debt_payments. Essa separacao e o que torna a dupla contagem
  -- estruturalmente impossivel.
  -- ON DELETE SET NULL: apagar o lancamento nao pode apagar a divida.
  transaction_id TEXT REFERENCES transactions(id) ON DELETE SET NULL,

  category_id    TEXT REFERENCES categories(id) ON DELETE SET NULL,
  created_at     TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS idx_debt_items_debt ON debt_items(debt_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_debt_items_tx
  ON debt_items(transaction_id) WHERE transaction_id IS NOT NULL;  -- 1 compra = 1 item

CREATE TABLE IF NOT EXISTS debt_payments (
  id             TEXT PRIMARY KEY,
  debt_id        TEXT NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
  paid_on        TEXT NOT NULL,
  amount_cents   INTEGER NOT NULL CHECK (amount_cents > 0),

  -- 'cash'     : houve movimento de dinheiro => transaction_id OBRIGATORIO.
  -- 'offset'   : encontro de contas (ele me devia, abateu) => sem caixa.
  -- 'forgiven' : perdao/baixa => sem caixa.
  kind           TEXT NOT NULL DEFAULT 'cash'
                 CHECK (kind IN ('cash','offset','forgiven')),

  -- O ELO com o livro-caixa. 1:1 forcado pelo indice unico abaixo — impede
  -- que um mesmo lancamento seja reaproveitado por dois pagamentos.
  transaction_id TEXT REFERENCES transactions(id) ON DELETE RESTRICT,

  notes          TEXT,
  created_at     TEXT NOT NULL,

  -- NOTA DE TRANSCRICAO (mesma razao da tabela transactions acima): estes
  -- dois CHECKs de tabela precisaram mover para o final do CREATE TABLE —
  -- gramatica do SQLite nao aceita column-def depois de um table-constraint
  -- solto. Logica e ordem entre os dois CHECKs preservadas.
  CHECK (kind <> 'cash' OR transaction_id IS NOT NULL),
  CHECK (kind =  'cash' OR transaction_id IS NULL)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_debt_payments_debt ON debt_payments(debt_id, paid_on);
CREATE UNIQUE INDEX IF NOT EXISTS uq_debt_payments_tx
  ON debt_payments(transaction_id) WHERE transaction_id IS NOT NULL;

-- ALOCACAO pagamento -> item. Tabela propria (N:N) e nao coluna item_id em
-- debt_payments, porque um pagamento de R$ 500 pode cobrir R$ 300 do Steam
-- Deck e R$ 200 do jantar. E essa granularidade que responde "o Steam Deck
-- ja esta quitado?" quando os pagamentos foram genericos.
CREATE TABLE IF NOT EXISTS debt_payment_allocations (
  id           TEXT PRIMARY KEY,
  payment_id   TEXT NOT NULL REFERENCES debt_payments(id) ON DELETE CASCADE,
  item_id      TEXT NOT NULL REFERENCES debt_items(id)    ON DELETE RESTRICT,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  created_at   TEXT NOT NULL,

  -- Impede alocar o MESMO pagamento duas vezes ao MESMO item.
  UNIQUE (payment_id, item_id)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_alloc_item ON debt_payment_allocations(item_id);

-- INVARIANTES DE SOMA NO BANCO (I1 e I2). Possivel porque foi MEDIDO que
-- TRIGGER funciona no D1 remoto e que batch() faz rollback real: um
-- RAISE(ABORT) aqui aborta a sequencia inteira, sem deixar rastro.
-- Isto SUBSTITUI o padrao de "INSERT guardado + inspecao de meta.changes +
-- batch compensatorio" que a versao anterior deste spec exigia.

-- (I2) a soma alocada a um item nunca passa do valor do item.
CREATE TRIGGER IF NOT EXISTS trg_alloc_item_teto
BEFORE INSERT ON debt_payment_allocations
BEGIN
  SELECT RAISE(ABORT, 'alocacao excede o valor do item')
  WHERE (SELECT amount_cents FROM debt_items WHERE id = NEW.item_id)
        < NEW.amount_cents + COALESCE(
            (SELECT SUM(amount_cents) FROM debt_payment_allocations
              WHERE item_id = NEW.item_id), 0);
END;

-- (I1) a soma alocada por um pagamento nunca passa do valor do pagamento.
CREATE TRIGGER IF NOT EXISTS trg_alloc_pagamento_teto
BEFORE INSERT ON debt_payment_allocations
BEGIN
  SELECT RAISE(ABORT, 'alocacao excede o valor do pagamento')
  WHERE (SELECT amount_cents FROM debt_payments WHERE id = NEW.payment_id)
        < NEW.amount_cents + COALESCE(
            (SELECT SUM(amount_cents) FROM debt_payment_allocations
              WHERE payment_id = NEW.payment_id), 0);
END;
