-- =====================================================================
-- migrations/0005_settings.sql   —  alvo: Cloudflare D1 (SQLite)
--
-- Tabela chave-valor para parametros editaveis SEM DEPLOY. Primeiro (e
-- unico, por enquanto) consumidor: fixed_net_cents (Task 10) — o
-- denominador do "% do liquido fixo" em GET /api/reports/commitments
-- (src/domain/reports.ts#DEFAULT_FIXED_NET_CENTS). Ate aqui era so
-- constante no codigo (com override via `?fixed_net_cents=` na query);
-- o dono e PJ com renda variavel (R$ 4.300 fixo + ate R$ 2.000 de
-- freela volatil) e precisa poder corrigir esse numero quando a renda
-- mudar, sem esperar um deploy — mas o DEFAULT continua sendo o
-- liquido SEM freela (R$ 3.600), nunca elevado "de mao beijada".
--
-- Key/value generico em vez de uma coluna dedicada `fixed_net_cents`:
-- qualquer configuracao futura reusa esta MESMA tabela sem migration
-- nova. `value` e TEXT de proposito — a camada de dominio
-- (src/domain/settings.ts) sempre BINDA uma string (ex. '360000'), nunca
-- um numero cru: ver CLAUDE.md/"Migrations" pela nota MEDIDA de que uma
-- coluna TEXT em tabela STRICT CONVERTE um INTEGER recebido em vez de
-- rejeitar (12345 -> '12345.0') — bindar string evita essa conversao
-- por baixo, sem depender de nenhum comportamento "sortudo" do driver.
--
-- Validacao de formato/faixa (inteiro positivo, teto de sanidade) fica
-- na camada de dominio, nao no schema — mesmo padrao de createAccount
-- (TS valida antes; um CHECK aqui so poderia cobrir UM formato fixo, o
-- que contradiz a tabela ser generica pra qualquer chave futura).
--
-- Sem CHECK/FK: chave e texto livre, sem relacionamento com outra
-- tabela. `updated_at` e so para auditoria (quando o valor mudou pela
-- ultima vez) — nenhuma query depende dele hoje.
--
-- Sem BEGIN/COMMIT (o D1 rejeita). Forward-only: nao ha down migration
-- — corrigir esta tabela no futuro e uma migration 0006+, nunca editar
-- esta. Sem indice extra: a PK (key) ja e o unico acesso que qualquer
-- rota faz (leitura/escrita por chave exata) — nao ha necessidade de
-- criar (e arriscar ter que recriar, irreversivel) um indice que
-- nenhuma query usaria.
-- =====================================================================

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT NOT NULL PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
