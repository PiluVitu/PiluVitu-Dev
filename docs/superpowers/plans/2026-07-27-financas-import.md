# Fatia ② — Import de fatura e extrato — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolver a dor original — _"tenho várias contas e meu problema é aglutinar tudo com vários cartões"_ — importando CSV e OFX sem nunca duplicar e sem gravar nada por adivinhação.

**Architecture:** O arquivo é lido **no navegador**; o Worker nunca o vê. A lógica de parse vive em `packages/tools` (TS puro). Idempotência por `imported_id` (FITID no OFX, hash estável no CSV), com o índice único que a fatia ① já criou.

**Tech Stack:** TS puro (`@piluvitu/tools`) · React 19 · Hono · D1 · WebCrypto

**Spec:** `docs/superpowers/specs/2026-07-27-financas-import-design.md` — leia §3 (por que não parsear no Worker) e §5 (idempotência) antes de começar.

## Global Constraints

**As regras que governam esta fatia**

- **Reimportar o mesmo arquivo não pode duplicar nada.** É o requisito que decide todo o resto. Todo teste de import conta `transactions` antes e depois.
- **Nada é gravado por adivinhação.** Payee e categoria são **sugestão**; a tela de conferência confirma. `normalizeName` tem limitação conhecida (corta o último token quando parece sigla de estado: `'Comercial SP'` → `'COMERCIAL'`), registrada na fatia ① — por isso `norm_name` é chave **candidata**, nunca decisão final.
- **O arquivo não sobe.** O `POST` recebe linhas estruturadas. Motivo medido: o Worker tem teto de **10 ms de CPU** por invocação no free tier, o mesmo teto que já obrigou a memoizar o Better Auth e a evitar `Intl.DateTimeFormat` no cálculo de fuso.
- **Teto de 100 bound params por statement no D1** (medido na fatia ①). `transactions` tem 19 colunas bound ⇒ **5 linhas por statement**. Import de 200 linhas = 40 statements, em lotes, com progresso.

**Idempotência**

- OFX: `FITID`, garantido único por conta pelo padrão.
- CSV: SHA-256 estável de `data | valor | descrição normalizada`, via WebCrypto (existe no navegador e no Worker; sem dependência nova).
- O índice é `uq_tx_imported ON transactions(account_id, imported_id)` — **por conta**. O mesmo FITID em bancos diferentes é legítimo.
- ⚠️ Limitação real do hash: duas compras genuinamente idênticas no mesmo dia (dois cafés de R$ 8) colidem. A tela **mostra** o que considerou duplicata e deixa forçar. Documentar, nunca esconder.

**Convenções do módulo**

- Dinheiro é **`INTEGER` em centavos**; `formatBRL`/`parseBRL` só.
- Datas: `todayInTeresina()`; `'YYYY-MM-DD'` para data local, `'YYYY-MM'` para competência.
- Corpo inválido é **422**; query string é **400**. Envelope `{ ok, data, notifications }`, `notifications` nunca `null`.
- Erro de constraint do D1 nunca chega cru — `friendlyConstraintMessage` + `logConstraintError`.
- Rota usa `type Env` **local**; o catch-all `app.all('/api/*')` continua sendo o **último** `app.*`.
- Atomicidade é `db.batch()`; D1 rejeita `BEGIN`/`COMMIT`.
- `packages/tools` expõe cada módulo no **export map**, sem barrel, e não importa React nem DOM.
- Colocation; sem ponto-e-vírgula; aspas simples; ESM.
- Testes mockam `api`, não a rede; `getByRole('heading', …)`, nunca `getByText`.
- ⚠️ Jamais escrever o nome da classe sentinela do Tailwind dentro de `apps/*`; cite `SENTINEL_SELECTOR`.
- Ambos os gates do build silenciosos, verificados **depois** da última edição. ~390px é alvo.

**Suítes:** Worker 350 · SPA 196 · `apps/web` 89 · `packages/ui` 8 · `packages/tools` 73.

---

## Task 1: Parser OFX em `packages/tools`

**Files:** `packages/tools/src/import/{ofx.ts,index.ts}` + testes, `packages/tools/package.json`

**Produz:** `parseOfx(texto: string): LinhaImportada[]`, e o tipo `LinhaImportada { imported_id, purchase_date, amount_cents, description }`

- [ ] **Step 1: Testes primeiro**, com OFX real de banco brasileiro como fixture:
  1. extrai `FITID`, `DTPOSTED`, `TRNAMT`, `MEMO`
  2. **valor vira centavos inteiros** — `-189.90` ⇒ `-18990`, sem float intermediário
  3. `DTPOSTED` com fuso (`20260728120000[-3:BRT]`) vira `'2026-07-28'` — **não** deslocar para UTC
  4. arquivo vazio ⇒ `[]`, não exceção
  5. arquivo malformado ⇒ erro com mensagem acionável
  6. OFX com uma transação só, e com várias
- [ ] **Step 2: RED** · **Step 3: Implementar** · **Step 4: GREEN** · **Step 5: Export map** · **Step 6: Commit**

---

## Task 2: Parser CSV + hash estável

**Files:** `packages/tools/src/import/{csv.ts,id.ts}` + testes

**Produz:** `parseCsv(texto, mapa: MapaColunas): LinhaImportada[]`, `idEstavel(linha): Promise<string>`

- [ ] **Step 1: Testes primeiro**
  1. CSV com cabeçalho, mapeado por índice de coluna
  2. valor em formato brasileiro (`1.234,56`) ⇒ `123456` centavos — reusar `parseBRL`, não reimplementar
  3. valor negativo com sinal e com parênteses
  4. data em `DD/MM/AAAA` e em `AAAA-MM-DD`
  5. campo com vírgula dentro de aspas
  6. **`idEstavel` é determinístico**: mesma linha ⇒ mesmo id, em execuções diferentes
  7. `idEstavel` difere quando valor, data **ou** descrição diferem
  8. duas linhas idênticas no mesmo arquivo geram o **mesmo** id — é a limitação documentada, e o teste a fixa como comportamento conhecido
- [ ] **Step 2: RED** · **Step 3: Implementar** · **Step 4: GREEN** · **Step 5: Commit**

---

## Task 3: Rota de import

**Files:** `src/routes/import.ts` + teste, `src/domain/import.ts` + teste, `src/index.ts`

**Rota:** `POST /api/transactions/import` — recebe `{ account_id, import_source, rows[] }`

- [ ] **Step 1: Testes primeiro**
  1. importa N linhas ⇒ `transactions` cresce N
  2. **reimportar as mesmas linhas ⇒ cresce 0** e a resposta diz quantas foram puladas
  3. o mesmo `imported_id` em **outra conta** é aceito (o índice é por conta)
  4. lote acima de 5 linhas gera múltiplos statements — espiar `db.batch`
  5. `account_id` inexistente ⇒ 422 com mensagem cozida
  6. linha com valor zero ⇒ recusada (o `CHECK` do schema já barra; a rota traduz)
  7. `import_source` fora do enum ⇒ 422
- [ ] **Step 2: RED** · **Step 3: Implementar** · **Step 4: GREEN** · **Step 5: Commit**

⚠️ O Worker **revalida tudo**. Não confiar em nada que veio do cliente, mesmo tendo sido a nossa própria SPA que montou o payload.

---

## Task 4: Tela de import — leitura e mapeamento

**Files:** `web/src/pages/importar.tsx` + teste, `web/src/App.tsx`

- [ ] **Step 1: Testes primeiro** — escolher conta e arquivo, parsear no navegador, e para CSV a etapa de mapeamento de colunas mostrando as primeiras linhas
- [ ] **Step 2: Implementar.** O mapa por banco é salvo em `settings` e reusado na próxima importação, sumindo a etapa
- [ ] **Step 3: Rota `#/importar`** + item no menu · **Step 4: Suítes, build, gates, 390px** · **Step 5: Commit**

---

## Task 5: Tela de conferência

**Files:** `web/src/pages/importar.tsx` (+ teste)

- [ ] **Step 1: Testes primeiro**
  1. cada linha mostra data, valor, descrição, payee sugerido e categoria sugerida
  2. **linha já importada aparece marcada como duplicata e desmarcada por padrão** — e o teste prova que confirmar não a envia
  3. dá para forçar uma duplicata marcando de novo (a limitação do hash exige essa saída)
  4. dá para trocar o payee sugerido antes de confirmar
  5. confirmar envia **só** as linhas marcadas
- [ ] **Step 2: Implementar.** Progresso visível quando o lote é grande
- [ ] **Step 3: Suítes, build, gates, 390px** · **Step 4: Commit**

---

## Task 6: Ponta a ponta + documentação

**Files:** `web/src/pages/importar.test.tsx`, `apps/financas/CLAUDE.md`, `packages/tools/CLAUDE.md`

- [ ] **Step 1: Teste de ponta a ponta** — parsear um OFX de fixture, confirmar, e conferir que os lançamentos aparecem; **reimportar o mesmo arquivo e conferir que nada muda**
- [ ] **Step 2: Documentação** — o fluxo, por que o parse é no cliente (teto de 10 ms de CPU), a idempotência por conta, e **a limitação do hash de CSV escrita com todas as letras**
- [ ] **Step 3: Suítes, build, gates** · **Step 4: Commit**
