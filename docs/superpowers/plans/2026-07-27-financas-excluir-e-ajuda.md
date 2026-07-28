# Excluir dívidas + ajuda contextual — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao dono como desfazer o que criou — sem nunca apagar movimento de dinheiro em silêncio — e ensinar o vocabulário do app onde ele é usado.

**Architecture:** Quatro rotas novas em `debtsRoutes` (excluir dívida, dar baixa, excluir item, excluir pagamento), com as regras de segurança no domínio e não na UI. Um componente `Ajuda` em `@piluvitu/ui`, sobre `@radix-ui/react-popover`, aplicado em 7 pontos.

**Tech Stack:** Hono · D1 (SQLite STRICT) · React 19 · Vite 7 · `@piluvitu/ui` · Radix Popover

**Spec:** `docs/superpowers/specs/2026-07-27-financas-excluir-e-ajuda-design.md` — **leia a §0 antes de começar**; ela mede o que decide o desenho inteiro.

## Global Constraints

Valem para **todas** as tasks.

**A regra que governa este plano**

- **Nunca apagar movimento de dinheiro em silêncio.** MEDIDO: `DELETE FROM debts` não aborta mesmo com alocação (o SQLite resolve o CASCADE antes do RESTRICT) e deixa o lançamento **órfão** em `transactions` — dinheiro registrado como saído, motivo apagado. Toda decisão de exclusão sai daí.
- Todo teste de exclusão **conta linha nas cinco tabelas** (`debts`, `debt_items`, `debt_payments`, `debt_payment_allocations`, `transactions`) antes e depois. Contar só a tabela alvo esconde exatamente o defeito que este plano existe para evitar.

**Convenções do módulo (lei, documentada no `apps/financas/CLAUDE.md`)**

- **Transição de estado devolve `404 not_found` quando `meta.changes === 0`.** Id inexistente e id já apagado são indistinguíveis de sucesso sem essa checagem. A função de domínio devolve `boolean`; a rota traduz.
- Erro de constraint do D1 **nunca** chega cru ao usuário — passa por `friendlyConstraintMessage` (`src/lib/errors.ts`), com `logConstraintError` mandando o texto original para o `console.error`.
- Corpo inválido é **422**; query string inválida é **400**.
- Envelope `{ ok, data, notifications }`; `notifications` é `[]`, nunca `null`.
- Atomicidade é via `db.batch()` — `BEGIN`/`COMMIT` são rejeitados pelo D1. O `batch()` faz rollback real.
- Rota usa `type Env = { Bindings: { DB: D1Database } }` **local**, nunca importando de `../index`.
- O catch-all `app.all('/api/*')` continua sendo o **último** `app.*` registrado.
- Dinheiro é **`INTEGER` em centavos**, formatado só por `formatBRL`.

**Frontend**

- Colocation; sem ponto-e-vírgula; aspas simples; ESM.
- Testes mockam `api`, não a rede. `getByRole('heading', …)`, nunca `getByText` — o menu duplica o texto de todo título.
- ⚠️ **Jamais escrever o nome da classe sentinela do Tailwind por extenso dentro de `apps/*`**, documentação inclusa — isso desativa o gate do `@source`. Cite `SENTINEL_SELECTOR`.
- Os dois gates do build da SPA continuam silenciosos.
- **~390px é alvo, não detalhe.** O dono lança gasto pelo Android.
- ⚠️ **`hover` não existe em touch.** Nada de `title=`, nada de `hover:`-only para ajuda.

**Suítes que precisam continuar verdes:** Worker 259 · SPA 136 · `apps/web` 89 · `packages/ui` 3 · `packages/tools` 73.

---

## Task 1: Domínio — excluir dívida e dar baixa

**Files:** `src/domain/debts.ts` (+ teste)

**Interfaces produzidas:**

- `deleteDebt(db, id): Promise<boolean>` — `false` quando nada mudou
- `writeOffDebt(db, id): Promise<boolean>`
- `DebtHasLedgerError` — erro próprio, com `code = 'debt_has_ledger'`

- [ ] **Step 1: Testes primeiro**

Cobrir, cada um contando as **cinco** tabelas antes e depois:

1. dívida sem pagamento nenhum ⇒ apaga dívida + itens + alocações, `transactions` **inalterada**
2. dívida com pagamento `cash` ⇒ **lança `DebtHasLedgerError`**, e as cinco tabelas ficam **idênticas**
3. dívida com pagamento `offset` (sem lançamento) ⇒ apaga normalmente
4. id inexistente ⇒ `false`, sem exceção
5. `writeOffDebt` ⇒ `status='written_off'`, itens/pagamentos/lançamentos **preservados**
6. dívida baixada **sai do comprometido** — chamar `commitments()` antes e depois e comparar

O caso 6 é o que prova que a baixa serve para alguma coisa. Sem ele, `written_off` é só uma string no banco.

- [ ] **Step 2: Rodar, ver falhar**

- [ ] **Step 3: Implementar**

`deleteDebt` consulta primeiro se existe pagamento `cash` (`kind='cash'`); havendo, lança. Senão apaga a dívida e deixa o CASCADE fazer o resto.

`writeOffDebt` faz `UPDATE debts SET status='written_off' … WHERE id=? AND status='open'`.

⚠️ O `CHECK (status <> 'settled' OR settled_at IS NOT NULL)` é só para `settled` — `written_off` não exige `settled_at`. Confira o CHECK antes de decidir se preenche.

- [ ] **Step 4: Rodar, ver passar**

- [ ] **Step 5: Commit**

---

## Task 2: Domínio — excluir item e excluir pagamento

**Files:** `src/domain/debts.ts` (+ teste)

**Interfaces produzidas:**

- `deleteDebtItem(db, debtId, itemId): Promise<boolean>`
- `deleteDebtPayment(db, debtId, paymentId): Promise<boolean>`

- [ ] **Step 1: Testes primeiro**

1. item sem alocação ⇒ apaga; as outras quatro tabelas intactas
2. item **com** alocação ⇒ recusa (o `RESTRICT` dispara), e **nada** é apagado
3. pagamento `cash` ⇒ some **junto com o lançamento**; `transactions` perde exatamente 1 linha
4. pagamento `offset` ⇒ some sem tocar `transactions`
5. apagar pagamento **libera o item**: alocação some junto (CASCADE), e o item volta a poder ser apagado
6. id de pagamento inexistente ⇒ `false`
7. pagamento que pertence a **outra** dívida ⇒ `false` (não apagar por id solto)

O caso 7 é o mesmo tipo de furo que uma revisão anterior pegou em alocação apontando para item de outra dívida.

- [ ] **Step 2: Rodar, ver falhar**

- [ ] **Step 3: Implementar**

`deleteDebtPayment` num **único `db.batch()`**: apaga o `debt_payments` e o `transactions` correspondente. Nessa ordem — o `RESTRICT` em `transaction_id` impede apagar o lançamento antes do pagamento.

Ambas as funções filtram por `debt_id` **e** id do registro.

- [ ] **Step 4: Rodar, ver passar**

- [ ] **Step 5: Commit**

---

## Task 3: Rotas

**Files:** `src/routes/debts.ts` (+ teste)

**Rotas produzidas:**

| Rota                                        | Sucesso | Erros                                       |
| ------------------------------------------- | ------- | ------------------------------------------- |
| `DELETE /api/debts/:id`                     | 200     | 404 `not_found`, 422 `debt_has_ledger`      |
| `POST /api/debts/:id/write-off`             | 200     | 404 `not_found`                             |
| `DELETE /api/debts/:id/items/:itemId`       | 200     | 404 `not_found`, 422 `constraint_violation` |
| `DELETE /api/debts/:id/payments/:paymentId` | 200     | 404 `not_found`                             |

- [ ] **Step 1: Testes de rota primeiro**

Um por linha da tabela, mais: a mensagem do `debt_has_ledger` **cita "Dar baixa"** (é o que ensina a saída), e o erro de item alocado **não** contém `SQLITE_CONSTRAINT` nem nome de tabela.

- [ ] **Step 2: Rodar, ver falhar**

- [ ] **Step 3: Implementar**

Montar acima do catch-all. `DebtHasLedgerError` ⇒ 422 com o código próprio; erro de constraint ⇒ `friendlyConstraintMessage`; `false` ⇒ 404.

- [ ] **Step 4: Rodar, ver passar — e a suíte inteira do Worker**

- [ ] **Step 5: Commit**

---

## Task 4: `Ajuda` em `@piluvitu/ui`

**Files:** `packages/ui/src/ajuda.tsx` (+ teste), `packages/ui/package.json`, `packages/ui/CLAUDE.md`

**Interface produzida:** `<Ajuda rotulo="Competência">conteúdo</Ajuda>`

- [ ] **Step 1: Dependência**

`@radix-ui/react-popover`, versão da mesma família dos outros Radix já em `packages/ui`. **Não** `react-tooltip`.

⚠️ pnpm 11 bloqueia lifecycle script — se pedir, entra em `allowBuilds` no `pnpm-workspace.yaml`. **Nunca** `dangerouslyAllowAllBuilds`.

- [ ] **Step 2: Teste primeiro**

1. abre **no clique** (`userEvent.click`), não no hover
2. fecha com `Esc`
3. o gatilho tem `aria-label` derivado de `rotulo` — um `?` mudo é inacessível
4. o conteúdo **não** está no DOM antes de abrir

⚠️ Teste com `mouseOver` passaria num tooltip e num popover — não prova nada. Use clique.

- [ ] **Step 3: Implementar** · **Step 4: Rodar** · **Step 5: Export no `package.json`** (um por componente, sem barrel) · **Step 6: Commit**

---

## Task 5: UI — excluir, dar baixa e ajuda nas telas

**Files:** `web/src/pages/debt-detail.tsx`, `DividasPage.tsx`, `new-entry.tsx`, `accounts.tsx`, `commitments.tsx`, `config.tsx`, `blocos/BlocoComprometido.tsx` (+ testes)

- [ ] **Step 1: Confirmação antes de qualquer exclusão**

As quatro ações pedem confirmação. Exclusão aqui é irreversível — não existe lixeira.

- [ ] **Step 2: Ações na tela de dívida**

Excluir dívida, dar baixa, excluir item (por linha), excluir pagamento (por linha). Erro `debt_has_ledger` aparece com a mensagem do servidor — ela é que ensina a saída.

- [ ] **Step 3: Ajuda nos 7 pontos da §3.2 do spec**

Nem um a mais. Ajuda em campo óbvio vira ruído.

- [ ] **Step 4: Estados vazios que explicam**

Dívida sem item não mostra mais só "devo R$ 0,00 de R$ 0,00": diz que o total sai da soma dos itens. "Dividir entre itens" sem item explica em vez de renderizar bloco vazio.

- [ ] **Step 5: Suítes, build, os dois gates, e conferir a 390px**

- [ ] **Step 6: `CLAUDE.md`** — rotas novas, catálogo de erros (`debt_has_ledger`), o componente `Ajuda` e por que popover e não tooltip

- [ ] **Step 7: Commit**
