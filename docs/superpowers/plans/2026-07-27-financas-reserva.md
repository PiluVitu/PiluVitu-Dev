# Fatia ⑦ — Reserva de emergência — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a métrica que o dono chamou de **prioridade matemática absoluta** e que nunca existiu — quantos meses ele sobrevive sem receita — e o confronto entre reserva e ativo que deprecia.

**Architecture:** Sem migration. As contas designadas como reserva vivem em `settings` (`emergency_accounts`), que já é chave-valor genérica. Meses de sobrevivência é **faixa**, porque o custo fixo virou faixa na fatia ⑥.

**Spec:** `docs/superpowers/specs/2026-07-27-financas-reserva-design.md` — leia §3 antes de começar; a inversão do alerta está lá.

## Global Constraints

**As regras desta fatia**

- **A faixa se propaga, e o perigo troca de lado.** No Comprometido o risco é o **teto** (gasto máximo). Aqui o risco é o **piso** (sobrevivência mínima). O alerta olha o piso. Errar isso inverte o sentido da tela.
- **Reserva é saldo de conta, nunca número digitado.** Saldo auto-declarado envelhece e mente.
- **Sem custo fixo cadastrado não existe resposta.** A tela diz que não dá para calcular — jamais "infinito", jamais zero. Zero meses e infinitos meses são as duas mentiras possíveis aqui.

**Convenções do módulo**

- Dinheiro é **`INTEGER` em centavos**; `formatBRL`/`parseBRL` só. Divisão para achar meses produz fração — **arredonde só na exibição**, nunca no cálculo.
- Corpo inválido é **422**; query string é **400**. Envelope `{ ok, data, notifications }`, `notifications` nunca `null`.
- Erro de constraint nunca chega cru — `friendlyConstraintMessage` + `logConstraintError`.
- Rota usa `type Env` **local**; o catch-all `app.all('/api/*')` continua sendo o **último** `app.*`.
- `settings` já tem `GET|PUT /api/settings/:key`; `fixed_net_cents` é reservada e recusa o caminho genérico.
- Colocation; sem ponto-e-vírgula; aspas simples; ESM.
- Testes mockam `api`, não a rede; `getByRole('heading', …)`, nunca `getByText`.
- ⚠️ Jamais escrever o nome da classe sentinela do Tailwind dentro de `apps/*`; cite `SENTINEL_SELECTOR`.
- Ambos os gates silenciosos, verificados **depois** da última edição. ~390px é alvo.
- Confirmação usa o `Dialog` do design system, nunca `window.confirm`.

**Suítes:** Worker 382 · SPA 228 · `apps/web` 89 · `packages/ui` 8 · `packages/tools` 109.

---

## Task 1: Domínio — custo fixo e sobrevivência

**Files:** `src/domain/reserve.ts` + teste

**Produz:** `monthlyFixedCost(db): Promise<{min,max}>`, `emergencyStatus(db, { goal_months }): Promise<{ saldo_cents, meta_cents: {min,max}, meses: {min,max} | null, contas: string[] }>`

- [ ] **Step 1: Testes primeiro**
  1. custo fixo sai das recorrentes ativas — Starlink 189 fixo + DAS 12–600 ⇒ `{min: 20100, max: 78900}`
  2. recorrente inativa ou encerrada **não** entra
  3. saldo é a soma das contas designadas, e **só** delas
  4. meses = saldo ÷ custo — e a faixa **inverte**: custo `max` produz meses `min`
  5. **sem custo fixo ⇒ `meses: null`**, não `Infinity` e não `0`
  6. sem conta designada ⇒ `saldo_cents: 0` e `contas: []`
  7. conta arquivada designada não conta
- [ ] **Step 2: RED** · **Step 3: Implementar** · **Step 4: GREEN** · **Step 5: Commit**

⚠️ O passo 4 é o que mais engana: dividir pelo custo **máximo** dá a sobrevivência **mínima**. Um teste que use faixa degenerada (min = max) passaria com a inversão errada — use faixa aberta.

---

## Task 2: Rota

**Files:** `src/routes/reserve.ts` + teste, `src/index.ts`

| Rota                        | Sucesso | Erros                                          |
| --------------------------- | ------- | ---------------------------------------------- |
| `GET /api/reserve`          | 200     | —                                              |
| `PUT /api/reserve/accounts` | 200     | 422 `constraint_violation` (conta inexistente) |

- [ ] **Step 1: Testes de rota primeiro**, incluindo id de conta inexistente ⇒ 422 cozido, e `meses: null` chegando como `null` no JSON (não sumindo)
- [ ] **Step 2–4: RED, implementar, GREEN.** Montar **acima** do catch-all · **Step 5: Commit**

---

## Task 3: Tela da reserva

**Files:** `web/src/pages/reserva.tsx` + teste, `web/src/App.tsx`

- [ ] **Step 1: Testes primeiro**
  1. mostra saldo, meta e meses **como faixa**
  2. **alerta quando o piso está abaixo da meta em meses** — teste com piso abaixo e teto acima, esperando alerta (é o espelho do teste do Comprometido, com o lado invertido)
  3. `meses: null` ⇒ texto explicando que falta cadastrar custo fixo, com link para as recorrentes
  4. nenhuma conta designada ⇒ explica o que fazer
  5. designar conta e ver o saldo mudar
- [ ] **Step 2: Implementar.** Ajuda (`<Ajuda>`) explicando por que a reserva vem antes de ativo que deprecia
- [ ] **Step 3: Rota `#/reserva`** + menu · **Step 4: Suítes, build, gates, 390px** · **Step 5: Commit**

---

## Task 4: O confronto com ativo que deprecia

**Files:** `web/src/pages/reserva.tsx` (+ teste), `packages/tools/src/simulacao.ts` (+ teste)

O pedido literal do dono: reserva **antes** de ativo que deprecia. O caso real era Polo Track R$ 96.000 financiado (72% do líquido) contra Pop 110i R$ 13.000 à vista.

- [ ] **Step 1: Lógica pura em `packages/tools`, testada primeiro**
  - à vista: quantos **meses de reserva** o valor consome, e a sobrevivência resultante
  - financiado: parcela, quanto entra no Comprometido, e o **% da renda fixa de R$ 3.600** — nunca do líquido com freela
  - Casos reais como teste: 13.000 à vista e 96.000 em 72x
- [ ] **Step 2: UI lado a lado** — à vista e financiado, em meses de reserva **e** em % da renda fixa
- [ ] **Step 3: Suítes, build, gates, 390px** · **Step 4: Commit**

⚠️ **A tela não aconselha.** Não escreve "não compre". Mostra o custo em meses de sobrevivência — a unidade que o próprio dono escolheu ao chamar a reserva de prioridade absoluta. Julgamento é dele.

---

## Task 5: Documentação

**Files:** `apps/financas/CLAUDE.md`

- [ ] **Step 1** — a fonte do saldo (contas designadas, e que a reserva se move sozinha quando a conta se move), a inversão do alerta em relação ao Comprometido, e por que `meses: null` em vez de zero ou infinito
- [ ] **Step 2: Suítes, build, gates** · **Step 3: Commit**
