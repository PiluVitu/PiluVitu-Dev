# Fatia ⑥ — Despesas recorrentes com faixa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o Comprometido parar de mentir por omissão — passar a somar Starlink, DAS, contador e INSS — e mostrar **intervalo** em vez de fingir precisão num Simples que varia de R$ 12 a R$ 600.

**Architecture:** Recorrente é **projeção calculada na leitura**, nunca linha em `transactions`. Supressão exata por `transactions.recurring_expense_id`, não por heurística. `commitments()` passa a devolver faixa.

**Tech Stack:** Hono · D1 (SQLite STRICT) · React 19 · Vite 7 · `@piluvitu/ui` · recharts

**Spec:** `docs/superpowers/specs/2026-07-27-financas-recorrentes-design.md` — leia a §3 antes de começar; ela decide projeção vs. materialização e o porquê.

## Global Constraints

**As regras que governam esta fatia**

- **Recorrente é expectativa, não fato.** Nunca cria `transaction`. Quando o dinheiro sai de verdade, existe um lançamento real — lançado à mão ou importado na fatia ②.
- **Supressão é exata, nunca heurística.** A projeção de uma competência some quando existe lançamento com aquele `recurring_expense_id` naquela competência. Casar por categoria + valor aproximado erra em silêncio, que é a classe de defeito que esta sessão passou inteira caçando.
- **`ON DELETE SET NULL` no vínculo, jamais CASCADE.** Apagar a definição de uma recorrente não pode apagar movimento de dinheiro — lição medida na fatia de exclusão, onde um cascade deixava lançamento órfão.
- **Faixa nunca vira média.** R$ 306 é o número que nunca acontece. O alerta de 50% dispara pelo **teto**, porque a tela existe para mostrar risco.

**Schema (lições já pagas neste projeto)**

- Todo `CHECK` de tabela vem **depois** de todas as column-defs — a gramática é `column-def* table-constraint*`, e um CHECK solto no meio faz a próxima coluna dar `syntax error`. Já aconteceu na `0001`.
- Tabela **`STRICT`**. E, medido: coluna `TEXT` em tabela STRICT **converte** INTEGER em vez de rejeitar; a direção que rejeita é TEXT não-numérico em coluna INTEGER. Não escreva teste que espere a direção errada — passaria provando nada.
- **Índice no D1 é irreversível.** Decidir agora, com o banco praticamente vazio.
- Migrations são forward-only. **A próxima é a `0006`** — confira o diretório. Nada contra `--remote`.

**Convenções do módulo**

- Dinheiro é **`INTEGER` em centavos**, formatado só por `formatBRL`, parseado só por `parseBRL`.
- Corpo inválido é **422**; query string inválida é **400**.
- Envelope `{ ok, data, notifications }`; `notifications` é `[]`, nunca `null`.
- Transição de estado devolve **`404 not_found` quando `meta.changes === 0`**.
- Erro de constraint do D1 nunca chega cru — passa por `friendlyConstraintMessage`, com `logConstraintError` mandando o original pro `console.error`.
- Rota usa `type Env` **local**, nunca importando de `../index`. O catch-all `app.all('/api/*')` continua sendo o **último** `app.*`.
- Atomicidade é `db.batch()` — D1 rejeita `BEGIN`/`COMMIT`.
- Datas: `todayInTeresina()`. Dia 31 é **aparado** ao último dia do mês, igual ao fechamento de cartão — a aritmética já existe em `lib/dates.ts`.

**Frontend**

- Colocation; sem ponto-e-vírgula; aspas simples; ESM.
- Testes mockam `api`, não a rede. `getByRole('heading', …)`, nunca `getByText`.
- ⚠️ Jamais escrever o nome da classe sentinela do Tailwind dentro de `apps/*`. Cite `SENTINEL_SELECTOR`.
- Ambos os gates do build silenciosos, verificados **depois** da última edição.
- ~390px é alvo. O dono lança gasto pelo Android.

**Suítes:** Worker 290 · SPA 165 · `apps/web` 89 · `packages/ui` 8 · `packages/tools` 73.

---

## Task 1: Migration `0006` + schema

**Files:** `migrations/0006_recurring_expenses.sql`, `src/schema.test.ts`

- [ ] **Step 1: Escrever a migration** conforme a §4 do spec — tabela `recurring_expenses` STRICT, coluna `recurring_expense_id` em `transactions` com `ON DELETE SET NULL`, e o índice que a supressão vai usar.
- [ ] **Step 2: Testes de schema** — STRICT aplicado (na direção que rejeita), os CHECKs (`max >= min`, `day_of_month` 1..31, `ends_on >= starts_on`, `active IN (0,1)`), e que apagar uma recorrente **deixa o lançamento vivo com `recurring_expense_id` nulo**.
- [ ] **Step 3: Aplicar `--local` e conferir** com `sqlite_master`. Informar o comando `--remote`, não rodar.
- [ ] **Step 4: Suíte inteira do Worker** · **Step 5: Commit**

---

## Task 2: Domínio — CRUD e projeção

**Files:** `src/domain/recurring.ts` + teste

**Produz:** `createRecurring`, `listRecurring`, `updateRecurring`, `deleteRecurring`, e `projectRecurring(db, { from, months }): Promise<Map<competência, {min,max}>>`

- [ ] **Step 1: Testes primeiro.** Os casos que importam:
  1. Starlink R$ 189 fixo (min = max) projeta 189..189 em cada competência da janela
  2. DAS R$ 12–600 projeta 12..600
  3. recorrente com `ends_on` no meio da janela **para** de projetar depois
  4. `active = 0` não projeta
  5. `starts_on` no futuro só projeta a partir dali
  6. **supressão:** competência com lançamento vinculado não projeta — conte o total antes e depois de inserir o lançamento
  7. supressão é **por competência**, não global: vincular agosto não suprime setembro
  8. dia 31 cai no último dia de fevereiro
  9. apagar recorrente **não apaga lançamento** — conte `transactions` antes e depois
- [ ] **Step 2: Rodar, ver falhar** · **Step 3: Implementar** · **Step 4: Rodar, ver passar** · **Step 5: Commit**

---

## Task 3: `commitments()` passa a devolver faixa

**Files:** `src/domain/reports.ts` + teste

⚠️ **Mudança de contrato.** `totals` e `pct_of_fixed_net` viram `{min,max}`. Três consumidores dependem disso — as Tasks 5 e 6 os atualizam.

- [ ] **Step 1: Testes primeiro**
  1. sem recorrente nenhuma, `min === max` e o valor bate com o que a versão anterior devolvia — **é o teste de não-regressão desta task**
  2. com Starlink fixo, os dois sobem igual
  3. com DAS 12–600, `min` e `max` divergem exatamente por 588
  4. `pct_of_fixed_net` vira faixa contra os R$ 3.600
  5. parcela e dívida continuam somando como antes, junto das recorrentes
- [ ] **Step 2: Rodar, ver falhar** · **Step 3: Implementar** · **Step 4: Rodar, ver passar** · **Step 5: Commit**

---

## Task 4: Rotas

**Files:** `src/routes/recurring.ts` + teste, `src/index.ts`

| Rota                        | Sucesso | Erros                                          |
| --------------------------- | ------- | ---------------------------------------------- |
| `GET /api/recurring`        | 200     | —                                              |
| `POST /api/recurring`       | 201     | 400 `invalid_json`, 422 `constraint_violation` |
| `PUT /api/recurring/:id`    | 200     | 404 `not_found`, 422                           |
| `DELETE /api/recurring/:id` | 200     | 404 `not_found`                                |

- [ ] **Step 1: Testes de rota primeiro**, incluindo `max < min` recusado com mensagem acionável (não erro cru do D1)
- [ ] **Step 2–4: RED, implementar, GREEN.** Montar **acima** do catch-all · **Step 5: Commit**

---

## Task 5: Tela de recorrentes

**Files:** `web/src/pages/recorrentes.tsx` + teste, `web/src/App.tsx` + teste

- [ ] **Step 1: Teste primeiro** — lista, cadastro, edição, exclusão com confirmação (`Dialog` do design system, não `window.confirm`), e o campo de faixa
- [ ] **Step 2: Implementar.** Um só campo quando min = max, com um "varia?" que abre o segundo. Ajuda explicando por que faixa e não média
- [ ] **Step 3: Rota `#/recorrentes`** + item no menu · **Step 4: Suítes, build, gates, 390px** · **Step 5: Commit**

---

## Task 6: Comprometido mostra intervalo

**Files:** `web/src/pages/commitments.tsx`, `web/src/blocos/BlocoComprometido.tsx`, `web/src/blocos/GraficoComprometido.tsx`, `web/src/lib/commitments.ts` (+ testes)

- [ ] **Step 1: Testes primeiro**
  1. faixa renderizada como intervalo, não como um número
  2. **o alerta de 50% dispara pelo teto** — teste com piso abaixo e teto acima do limiar, esperando alerta
  3. quando min = max, a UI mostra um número só (intervalo degenerado não vira ruído visual)
- [ ] **Step 2: Implementar.** O gráfico representa faixa — barra com intervalo, não barra única. Manter a fronteira lazy do recharts; o gate a protege
- [ ] **Step 3: Suítes, build, gates, 390px** · **Step 4: Commit**

---

## Task 7: Vincular lançamento à recorrente + documentação

**Files:** `web/src/pages/new-entry.tsx` (+ teste), `src/routes/transactions.ts` (+ teste), `apps/financas/CLAUDE.md`

- [ ] **Step 1: Backend** — `POST /api/transactions` aceita `recurring_expense_id` opcional; id inexistente ⇒ 422
- [ ] **Step 2: UI** — na tela Lançar, escolher "este lançamento é o Starlink de agosto". Só recorrentes ativas
- [ ] **Step 3: Teste de ponta a ponta da supressão** — lançar vinculado e conferir que o Comprometido daquela competência **cai** pelo valor projetado. É o teste que prova que a fatia inteira fecha o ciclo
- [ ] **Step 4: `CLAUDE.md`** — a tabela nova, o contrato de faixa do `commitments()`, projeção vs. materialização e por quê, e a regra do `SET NULL`
- [ ] **Step 5: Suítes, build, gates** · **Step 6: Commit**
