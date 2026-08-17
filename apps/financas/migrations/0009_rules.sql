-- =====================================================================
-- migrations/0009_rules.sql   —  alvo: Cloudflare D1 (SQLite)
--
-- CATEGORIZACAO AUTOMATICA POR REGRA — fase 1.
--
-- O buraco medido: `payees.default_category_id` existe desde a 0001, o
-- import ja o le (web/src/lib/payee-suggest.ts -> pages/importar.tsx) e a
-- tela Lancar finalmente o ESCREVE. Mas isso so cobre "este favorecido cai
-- nesta categoria" — nao cobre "qualquer descricao contendo X vai pra Y",
-- que e a forma como um extrato de banco de verdade se le (`UBER *TRIP`,
-- `PAG*Padaria`, `DAS SIMPLES NACIONAL`), onde o favorecido nem sempre
-- existe como cadastro.
--
-- ⚠️ NAO E MACHINE LEARNING, e isso e decisao registrada: um usuario so
-- nao gera dado de treino. O modelo copiado e o Actual Budget Rules
-- (https://actualbudget.org/docs/budgeting/rules/) — declarativo e
-- AUDITAVEL. O dono precisa poder ver POR QUE uma transacao foi
-- categorizada, e desfazer; um modelo nao responde nenhuma das duas.
--
-- ---------------------------------------------------------------------
-- DECISAO 1 — colunas fixas, nao um JSON de condicoes generico
-- ---------------------------------------------------------------------
-- O Actual tem um motor generico (`conditions: [{field, op, value}]`)
-- porque atende muitos usuarios e muitos bancos. Aqui e single-user, e um
-- JSON custaria: um validador em TS (o CHECK do schema nao enxerga dentro
-- de TEXT), uma tela que monta/le esse JSON, e a impossibilidade de
-- inspecionar uma regra com um SELECT durante uma depuracao. Cinco colunas
-- nomeadas dao CHECK de graca, sao legiveis no `wrangler d1 execute`, e
-- respondem os quatro eixos que este extrato de fato tem.
--
-- Prefixos `match_` (condicao) e `set_` (acao) fazem a linha se ler como
-- "SE ... ENTAO ..." da esquerda pra direita.
--
-- ---------------------------------------------------------------------
-- DECISAO 2 — o que casa: texto, conta, faixa de valor, sinal
-- ---------------------------------------------------------------------
-- `match_text`      substring da descricao, comparada normalizada (caixa e
--                   acento) em TS. Operador unico (`contains`) de
--                   proposito: descricao de banco vem cheia de ruido
--                   (`*1234`, cidade, UF), entao `equals` quase nunca
--                   serve, e um seletor de operador e mais uma coisa pra o
--                   dono errar. Se um dia fizer falta, `ALTER TABLE ADD
--                   COLUMN match_kind TEXT DEFAULT 'contains'` e aditivo e
--                   seguro (mesmo padrao ja MEDIDO na 0006).
-- `match_account_id` restringe a uma conta ("tudo no cartao da PJ").
-- `match_min_cents` / `match_max_cents`  faixa em MAGNITUDE (centavos
--                   absolutos), NUNCA com sinal: `amount_cents` e negativo
--                   pra despesa, entao uma faixa com sinal seria invertida
--                   e vazia. O sinal e outra pergunta e tem coluna propria.
-- `match_direction` 'expense' (saida) | 'income' (entrada). Nome com
--                   prefixo pra NAO colidir com `debts.direction`, que ja
--                   existe com outro enum ('i_owe'|'owed_to_me') — duas
--                   colunas `direction` com significados diferentes no
--                   mesmo schema seria armadilha de leitura.
--
-- Toda condicao e NULLABLE, e NULL significa "nao restringe por este
-- eixo" (nunca "casa com nada"). Mas uma regra com TODAS nulas casaria com
-- TODO lancamento — o CHECK "pelo menos uma condicao" no fim desta tabela
-- barra isso no banco, nao so em TS: uma regra que o dono nao consegue
-- prever e uma regra que ele nao vai confiar, e essa e a mais
-- imprevisivel possivel.
--
-- ⚠️ `match_account_id` e ON DELETE CASCADE, NAO SET NULL — e a direcao
-- OPOSTA da licao da 0006, de proposito. La (`recurring_expense_id`) o
-- dependente e um FATO (dinheiro que saiu) e CASCADE apagaria dinheiro.
-- Aqui o dependente e uma CONDICAO QUE ESTREITA: com SET NULL, apagar a
-- conta transformaria "so no cartao da PJ" em "em qualquer conta" — a
-- regra ALARGA sozinha, em silencio, que e o pior resultado possivel.
-- Apagar a regra junto e honesto (ela ja nao tinha mais o que casar).
--
-- ---------------------------------------------------------------------
-- DECISAO 3 — o que a regra faz: categoria, favorecido, PJ/PF
-- ---------------------------------------------------------------------
-- `set_is_business` e NULLABLE (0|1|NULL) e nao NOT NULL DEFAULT 0, porque
-- os tres valores sao tres coisas diferentes: 1 = marque PJ, 0 = marque PF
-- (sobrescrevendo uma regra ampla que veio antes), NULL = NAO MEXA. Com
-- DEFAULT 0, toda regra de categoria zeraria o PJ de brinde — e
-- `is_business` e a coluna que sustenta a separacao PJ/PF inteira
-- (0001: "na pratica gasto de PJ cai em cartao PF, e e justamente esse
-- caso que distorce a medicao do custo real da PJ").
--
-- Os dois FKs de acao tambem sao CASCADE: uma regra cujo alvo sumiu e uma
-- regra que MENTE — aparece na lista, casa lancamentos, e nao faz nada.
-- Mesmo criterio que o modulo ja usa pra apagar em cascata (transactions:
-- "cascatear so quando dono e dependente sao a MESMA unidade de
-- significado"): "Uber -> Transporte" E aquela categoria.
-- Na pratica a FK quase nunca dispara — categoria neste app se ARQUIVA,
-- nao se apaga. Por isso a categoria ARQUIVADA e tratada onde ela de fato
-- aparece: a sugestao e validada contra a lista carregada antes de ir pra
-- tela (o defeito corrigido em 6ba822c, que nao pode voltar pelo caminho
-- novo).
--
-- ---------------------------------------------------------------------
-- DECISAO 4 — ordem explicita quando duas regras casam
-- ---------------------------------------------------------------------
-- ⚠️ DUAS REGRAS CONFLITANTES E O CASO COMUM, NAO A BORDA ("UBER" e
-- "UBER *EATS" casam a mesma linha). Escolhido: `priority` ASC explicito,
-- TODAS as que casam se aplicam, e a ULTIMA vence POR CAMPO. As duas
-- alternativas foram descartadas com motivo (detalhe completo no
-- comentario de `aplicarRegras`, packages/tools/src/regras.ts):
--   * "primeira que casa e para" mata composicao — "tudo no cartao PJ e
--     is_business=1" + "Uber -> Transporte" precisam valer JUNTAS;
--   * "a mais especifica vence" exige uma metrica que o dono NAO VE (texto
--     mais longo? mais condicoes?) e que empata o tempo todo.
-- Ordem explicita e o modelo do Actual e o unico em que a UI pode mostrar
-- a cadeia inteira ("estas 3 regras casaram, nesta ordem").
--
-- DEFAULT 100 (nao 0) pra sobrar espaco dos DOIS lados sem renumerar tudo.
-- Empate de `priority` e desempatado em TS por (created_at, id) — a mesma
-- licao das TRES partes do cursor do extrato (0008): duas partes nao sao
-- unicas, e ordem parcial faria o MESMO conjunto de regras produzir
-- resultados diferentes entre execucoes.
--
-- ---------------------------------------------------------------------
-- DECISAO 5 — DELETE de verdade + `active`, nunca `archived_at`
-- ---------------------------------------------------------------------
-- `archived_at` existe em `accounts`/`categories` porque `transactions`
-- APONTA pra elas: apagar destruiria historico. NADA aponta pra `rules` —
-- a regra produz uma SUGESTAO que o dono confirma, e o que fica gravado no
-- lancamento e a categoria, nunca um `rule_id`. Entao apagar nao deixa
-- orfao, e o precedente correto e `recurring_expenses` (0006): DELETE de
-- verdade, mais `active` (0|1) pra PAUSAR sem perder o texto da regra —
-- que e o que o dono faz quando uma regra esta casando demais e ele quer
-- testar sem ela.
--
-- ---------------------------------------------------------------------
-- SEM INDICE, e isso e decisao consciente
-- ---------------------------------------------------------------------
-- Indice no D1 e IRREVERSIVEL (so DROP destrutivo + CREATE, nunca ALTER),
-- entao o momento mais barato pra decidir e agora, com a tabela vazia. O
-- unico acesso e "leia TODAS as regras" (o matching acontece em TS, sobre
-- algumas dezenas de linhas — Starlink, Uber, DAS, mercado...), e um
-- indice que nenhuma query usa e "row written" a mais por escrita, pra
-- sempre. Mesmo raciocinio de recurring_expenses (0006) e do 0003.
--
-- Sem BEGIN/COMMIT/SAVEPOINT (o D1 rejeita). Forward-only: nao ha down
-- migration — corrigir isto no futuro e uma 0010, nunca editar esta.
-- CHECK de TABELA (que toca mais de uma coluna) vem DEPOIS de todas as
-- column-defs: a gramatica do SQLite e column-def* table-constraint*, ja
-- errado uma vez na 0001.
-- =====================================================================

CREATE TABLE IF NOT EXISTS rules (
  id               TEXT PRIMARY KEY,

  -- Rotulo que o DONO le na lista ("Uber -> Transporte"). Nao e derivado
  -- de `match_text`: o padrao e criptico (`UBER *TRIP`) e o nome e o que
  -- torna a regra reconhecivel numa tela com uma duzia delas.
  name             TEXT NOT NULL CHECK (length(name) > 0),

  -- CONDICOES — NULL = nao restringe por este eixo (ver DECISAO 2).
  match_text       TEXT    CHECK (match_text IS NULL OR length(match_text) > 0),
  match_account_id TEXT    REFERENCES accounts(id) ON DELETE CASCADE,
  match_min_cents  INTEGER CHECK (match_min_cents IS NULL OR match_min_cents > 0),
  match_max_cents  INTEGER CHECK (match_max_cents IS NULL OR match_max_cents > 0),
  match_direction  TEXT    CHECK (match_direction IS NULL OR
                                  match_direction IN ('expense','income')),

  -- ACOES — NULL = nao mexe neste campo (ver DECISAO 3).
  set_category_id  TEXT    REFERENCES categories(id) ON DELETE CASCADE,
  set_payee_id     TEXT    REFERENCES payees(id)     ON DELETE CASCADE,
  set_is_business  INTEGER CHECK (set_is_business IS NULL OR
                                  set_is_business IN (0,1)),

  priority         INTEGER NOT NULL DEFAULT 100,
  active           INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,

  -- Faixa invertida e sempre erro de digitacao (mesmo CHECK de
  -- recurring_expenses.amount_max_cents >= amount_min_cents).
  CHECK (match_max_cents IS NULL OR match_min_cents IS NULL
         OR match_max_cents >= match_min_cents),

  -- PELO MENOS UMA CONDICAO: sem isto, uma regra com tudo NULL casaria
  -- TODO lancamento do livro-caixa e recategorizaria a vida inteira do
  -- dono num import. E a guarda mais importante desta tabela.
  CHECK (match_text       IS NOT NULL OR
         match_account_id IS NOT NULL OR
         match_min_cents  IS NOT NULL OR
         match_max_cents  IS NOT NULL OR
         match_direction  IS NOT NULL),

  -- PELO MENOS UMA ACAO: uma regra que nao faz nada nao e uma preferencia,
  -- e uma linha que ocupa espaco na tela e nunca explica por que existe.
  CHECK (set_category_id IS NOT NULL OR
         set_payee_id    IS NOT NULL OR
         set_is_business IS NOT NULL)
) STRICT;
