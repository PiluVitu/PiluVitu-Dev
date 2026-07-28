-- =====================================================================
-- migrations/0007_insights.sql   —  alvo: Cloudflare D1 (SQLite)
--
-- Fatia ⑨, Task 3 (docs/superpowers/specs/2026-07-28-financas-ui-insights-design.md
-- §3): guarda só o TEXTO gerado pelo Ollama local (no Mac do dono) sobre um
-- período — NUNCA um número. Os números que a leitura descreve (top
-- categorias, variação contra o período anterior, o que mais cresceu) são
-- SEMPRE calculados por consulta exata em domain/insights.ts#insightNumbers
-- (que reusa byCategory de domain/reports.ts, nunca uma segunda regra) —
-- essa consulta não lê esta tabela nem depende de nenhuma linha aqui. É o
-- que garante a tela mostrar os números mesmo que o comando do Mac nunca
-- tenha rodado.
--
-- `generated_at` é gravado pelo SERVIDOR no momento do INSERT
-- (nowIsoUtc(), src/lib/dates.ts) — nunca aceito do corpo do POST de
-- ingestão. "Frescor, não silêncio" (spec §3: insight velho apresentado
-- como se fosse de hoje é pior que insight nenhum) depende de um relógio
-- confiável, e o relógio de quem faz o POST (o Mac do dono, atrás de um
-- comando manual) não é essa fonte — o mesmo raciocínio de nunca confiar
-- num timestamp vindo de fora já vale para created_at/updated_at no resto
-- do schema (sempre nowIsoUtc() do lado do Worker).
--
-- Sem FK: esta tabela não referencia nem é referenciada por nenhuma outra
-- — é um log de texto gerado, não dado transacional. `periodo` é
-- 'YYYY-MM' (mesma convenção de competência do resto do schema), validado
-- em TS (domain/insights.ts, via addMonthsToCompetence de lib/dates.ts —
-- mesma técnica de byCategory, nunca uma regex nova) antes do INSERT; os
-- três CHECK abaixo são defesa de SANIDADE no banco (não vazio), não a
-- única linha de validação — mesmo padrão de settings.ts/setFixedNetCents
-- (TS valida antes, CHECK é backstop).
--
-- CHECK de tabela vem DEPOIS de todas as column-defs — gramática do
-- SQLite é column-def* table-constraint*, já quebrou a 0001 uma vez (ver
-- CLAUDE.md/"Migrations").
--
-- Sem índice: a única leitura desta tabela é "o mais recente"
-- (ORDER BY generated_at DESC LIMIT 1) contra uma tabela que cresce por
-- comando MANUAL do dono — dezenas de linhas por ano, não milhares.
-- Mesmo raciocínio de recurring_expenses (0006) não ganhar índice próprio:
-- varrer uma tabela deste tamanho custa o mesmo que buscar por índice, e
-- índice no D1 é irreversível (só DROP + CREATE).
--
-- Sem BEGIN/COMMIT/SAVEPOINT (D1 rejeita). Forward-only: não há down
-- migration.
-- =====================================================================

CREATE TABLE IF NOT EXISTS insights (
  id           TEXT NOT NULL PRIMARY KEY,
  texto        TEXT NOT NULL,
  modelo       TEXT NOT NULL,
  periodo      TEXT NOT NULL,
  generated_at TEXT NOT NULL,

  CHECK (length(texto)   > 0),
  CHECK (length(modelo)  > 0),
  CHECK (length(periodo) > 0)
) STRICT;
