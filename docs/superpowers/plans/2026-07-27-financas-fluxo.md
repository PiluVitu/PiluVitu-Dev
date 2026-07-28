# Fatia ⑧ — Mapa de fluxo de caixa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o **mapa visual de fluxo de caixa** do brief original — entrou, saiu, sobrou, mês a mês — usando a `v_cashflow` que está órfã no banco desde a primeira migration.

**Architecture:** Sem migration. O domínio usa os três filtros da view e **ignora a coluna `competence_month`**, que é UTC e deslocaria dinheiro entre meses.

**Spec:** `docs/superpowers/specs/2026-07-27-financas-fluxo-design.md` — leia a §3 antes de começar.

## Global Constraints

**A regra que governa esta fatia**

- ⚠️ **Não usar `v_cashflow.competence_month`.** Ela sai de `substr(settled_at, 1, 7)` e `settled_at` é UTC. Teresina é UTC−3, então um pagamento das 22h de 31/01 local vira 01h de 01/02 em UTC e cai no mês errado — no relatório que existe exatamente para mostrar entrada e saída por mês. Agrupar aplicando o deslocamento de Teresina antes de cortar o mês. A view continua valendo pelos **três filtros**, que é o que ela tem de bom.
- **Não corrigir a view.** Ela está órfã e o `SELECT t.*` já entrega `settled_at` cru; uma `0007` só para isso não paga o próprio custo. Mas **documentar que a coluna não deve ser usada** — o risco não é o defeito, é alguém achar que ela serve.
- **O acumulado parte do saldo de abertura das contas**, nunca de zero. Zero desenha uma curva que sobe do nada e não corresponde a dinheiro nenhum.
- **Mês sem movimento aparece zerado**, não some. Buraco na série mente sobre a continuidade do tempo.

**Convenções do módulo**

- Dinheiro é **`INTEGER` centavos**; `formatBRL` só.
- Datas por `todayInTeresina()`; nunca rotear data por UTC.
- Query string inválida é **400**; corpo é **422**. Envelope `{ ok, data, notifications }`, `notifications` nunca `null`.
- Rota usa `type Env` **local**; catch-all `app.all('/api/*')` continua sendo o **último** `app.*`.
- `LIMIT` em tudo que possa crescer — o D1 cobra por **linha lida**.
- Colocation; sem ponto-e-vírgula; aspas simples; ESM.
- Testes mockam `api`, não a rede; `getByRole('heading', …)`, nunca `getByText`.
- ⚠️ Jamais escrever o nome da classe sentinela do Tailwind dentro de `apps/*`; cite `SENTINEL_SELECTOR`.
- recharts atrás da fronteira lazy — `check-financas-lazy-chart.mjs` a protege e falha o build se ela quebrar.
- Ambos os gates silenciosos, verificados **depois** da última edição. ~390px é alvo.

**Suítes:** Worker 411 · SPA 256 · `apps/web` 89 · `packages/ui` 8 · `packages/tools` 123.

---

## Task 1: Domínio

**Files:** `src/domain/cashflow.ts` + teste

**Produz:** `cashflow(db, { from, months }): Promise<{ meses: string[], linhas: { competence, entrou_cents, saiu_cents, saldo_cents, acumulado_cents }[] }>`

- [ ] **Step 1: Testes primeiro**
  1. entrada e saída somadas por mês, com sinal correto
  2. **o teste que decide a fatia:** lançamento com `settled_at` em `2026-02-01T01:00:00Z` (22h de 31/01 em Teresina) cai em **`2026-01`**. Trocar para `substr(settled_at,1,7)` faz ele falhar — é o ponto
  3. transferência entre contas próprias não aparece de lado nenhum
  4. filha de rateio não duplica o pai
  5. lançamento **não liquidado** (`settled_at IS NULL`) não entra — é compromisso, não caixa
  6. mês sem movimento aparece zerado
  7. **acumulado parte do saldo de abertura** das contas, não de zero
  8. acumulado do mês N = acumulado de N−1 + saldo de N
- [ ] **Step 2: RED** · **Step 3: Implementar** · **Step 4: GREEN** · **Step 5: Commit**

---

## Task 2: Rota

**Files:** `src/routes/reports.ts` (+ teste)

`GET /api/reports/cashflow?from=YYYY-MM&months=N` — 200 no envelope; **400 `invalid_query`** para `from` malformado ou `months` fora de 1..36.

- [ ] **Step 1: Testes de rota primeiro.** O branch de `RangeError` de `lib/dates.ts` é obrigatório — sem ele vaza 500 sem envelope, como já aconteceu antes neste módulo
- [ ] **Step 2–4: RED, implementar, GREEN.** Montar acima do catch-all · **Step 5: Commit**

---

## Task 3: Tela

**Files:** `web/src/pages/fluxo.tsx` + teste, `web/src/blocos/GraficoComprometido.tsx` (novo export), `web/src/App.tsx`

- [ ] **Step 1: Testes primeiro**
  1. mostra entrou, saiu, saldo e acumulado por mês
  2. mês vazio aparece zerado
  3. seletor de janela refaz a busca — asserção na segunda chamada de `api`, não em estado local
  4. estado vazio explica que só lançamento **liquidado** entra
- [ ] **Step 2: Implementar.** Barras de entrada/saída com linha de acumulado. **Reusar o chunk lazy existente** exportando dali, como a fatia do gráfico de categorias fez — um terceiro chunk de recharts custaria ~104 KB gzip à toa
- [ ] **Step 3: Rota `#/fluxo`** + menu · **Step 4: Suítes, build, gates, 390px** · **Step 5: Commit**

---

## Task 4: Documentação

**Files:** `apps/financas/CLAUDE.md`

- [ ] **Step 1** — a tela, e sobretudo **por que `v_cashflow.competence_month` não é usada**, com o exemplo das 22h. Alguém vai encontrar a coluna e achar que ela serve; o texto existe para impedir isso
- [ ] **Step 2: Suítes, build, gates** · **Step 3: Commit**
