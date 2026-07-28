# Design system compartilhado + UI rica do finanças — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extrair o design system do `apps/web` para `packages/ui`, colocar o `apps/financas/web` em cima dele, e entregar uma home modular com gráficos e uma tela de configurações — sem mudar um pixel do blog.

**Architecture:** `@piluvitu/ui` publica fonte TSX crua pelo `exports` map (precedente do `@piluvitu/tools`, sem build step). Cada app importa `tailwindcss` no próprio CSS e declara `@source` apontando para `packages/ui/src` — o scanner roda no contexto do app. A home do finanças é composta de quatro blocos independentes, cada um com fetch, loading, erro e vazio próprios.

**Tech Stack:** Tailwind 4 (CSS-first) · shadcn/ui · CVA · clsx + tailwind-merge · recharts 3.10.1 · React 19 · Vite 7 · Next 16 · pnpm workspaces

**Spec:** `docs/superpowers/specs/2026-07-26-financas-ui-design-system.md` — **leia a §0 antes de começar**, ela contradiz a documentação em três pontos.

## Global Constraints

Valem para **todas** as tasks, implicitamente.

**O modo de falha que governa este plano**

- **`@source` é obrigatório nos dois apps.** Sem ele, classe que só existe em `packages/ui` some do CSS emitido — silenciosamente. O dev server do **Vite serve certo sem `@source` e só quebra no build**; o do Next quebra no dev também. Nunca conclua "funciona" a partir do dev server do finanças.
- O caminho do `@source` é relativo **ao arquivo CSS**. Contar os `../` errado é idêntico a não ter `@source`.
- Teste que renderiza e passa **não** pega classe faltando: o componente monta igual, só sai sem estilo. Só o gate no CSS emitido pega.

**Não quebrar o blog**

- `apps/web` está em produção na Vercel. Ele **cede** o design system; o visual não muda. Diferença de pixel é regressão, não melhoria.
- Nenhum componente muda de API na migração. Se a API precisar mudar, pare e reporte.
- A suíte do `apps/web` (89 testes) precisa estar verde antes e depois de cada task que o toca.

**Convenções do repo**

- **Colocation:** teste no mesmo diretório do fonte (`x.tsx` + `x.test.tsx`). Jamais em `tests/` separado.
- Estilo TS: **sem ponto-e-vírgula**, aspas simples, prettier. ESM.
- `packages/*` expõe cada módulo no **`exports` map** do `package.json`. Sem build, sem `dist/`.
- pnpm 11 bloqueia lifecycle scripts: dependência que precise de script entra em `allowBuilds` no `pnpm-workspace.yaml`. **Nunca** `dangerouslyAllowAllBuilds`. `minimumReleaseAge: 1440` pula versões com menos de 24 h — recharts 3.10.1 é bem mais antigo que isso, não deve esbarrar.
- Antes de commit: `pnpm prettier:fix` → `pnpm lint` → `make test`.
- **Regra global:** tecnologia nova ou fluxo alterado ⇒ atualizar o `CLAUDE.md` do workspace onde mexeu.

**Envelope e dinheiro (herdado da fatia ①)**

- Dinheiro é **sempre `INTEGER` em centavos**. Formatação só via `formatBRL` de `@piluvitu/tools/money`.
- Toda rota JSON responde `{ ok, data, notifications }`; `notifications` é `[]` quando vazio, nunca `null`.
- A SPA consome tudo pelo helper `api<T>(path, init)` de `web/src/api.ts`, que lança `ApiError(status, code, message)`.
- Datas: `todayInTeresina()` de `web/src/lib/dates.ts`. **Nunca** `new Date().toISOString().slice(0,10)` — Teresina é UTC−3 e isso já causou bug de competência.

**Denominador do comprometido**

- O `%` é contra a **renda fixa sem freela**, `DEFAULT_FIXED_NET_CENTS = 360000` (R$ 3.600) — nunca contra os R$ 5.300 do mês bom. Medir contra o líquido com freela esconde exatamente o risco que a tela existe para mostrar.

---

## Task 1: `packages/ui` — esqueleto, tokens, `cn` e a sentinela do gate

**Files:**

- Create: `packages/ui/package.json`, `packages/ui/tsconfig.json`, `packages/ui/src/styles.css`, `packages/ui/src/cn.ts`, `packages/ui/src/cn.test.ts`
- Modify: `pnpm-workspace.yaml` (se `packages/*` ainda não estiver no glob — conferir antes)

**Interfaces:**

- Consumes: nada
- Produces: `@piluvitu/ui/styles.css` (tokens + `@custom-variant dark`), `@piluvitu/ui/cn` → `cn(...inputs: ClassValue[]): string`

- [ ] **Step 1: Conferir o glob do workspace**

Run: `grep -n 'packages' pnpm-workspace.yaml`
Se `packages/*` já estiver lá, não mexer. Se não, adicionar.

- [ ] **Step 2: `packages/ui/package.json`**

Espelhar o de `packages/tools` (leia-o primeiro — é o precedente). Nome `@piluvitu/ui`, `"type": "module"`, sem `main`/`dist`, `exports` com `"./styles.css"`, `"./cn"`. Dependências: `clsx`, `tailwind-merge`, `class-variance-authority` (versões idênticas às do `apps/web` — copiar, não resolver de novo). `react` como **peerDependency**, nunca dependency: duas cópias de React quebram hooks em runtime.

- [ ] **Step 3: Mover os tokens**

`apps/web/app/globals.css` tem 276 linhas. Recortar para `packages/ui/src/styles.css` **apenas** o bloco `@theme`, o `@custom-variant dark (&:is(.dark *))` e as declarações de variáveis CSS (`:root` / `.dark`) que o `@theme` referencia.

**Não mover** e deixar no `apps/web`: `@import 'tailwindcss'`, `@plugin '@tailwindcss/typography'`, e qualquer regra específica do blog. O pacote **não** importa `tailwindcss` — quem importa é o app, porque é o `@import` que dispara o scanner.

- [ ] **Step 4: A classe sentinela**

No fim de `packages/ui/src/styles.css`, um comentário declarando a sentinela do gate:

```css
/* SENTINELA DO GATE — não remover, não usar em app nenhum.
   `scripts/check-tailwind-source.mjs` procura esta classe no CSS emitido de
   cada app. Se ela sumir, o @source do app está errado e TODA classe que só
   existe em packages/ui foi descartada silenciosamente. Ver §4 do spec. */
```

E em `packages/ui/src/cn.ts`, num comentário, o uso real da classe para o scanner encontrar: `ui-sentinela-nao-remover`. A classe precisa aparecer em **código que o scanner varre**, não só em CSS.

Escolher um utilitário que gere CSS determinístico e que nenhum app usaria por acidente.

- [ ] **Step 5: `cn.ts` + teste**

`cn` é `twMerge(clsx(inputs))`, idêntico ao que o `apps/web` já tem (copiar de `apps/web/lib/utils.ts` ou equivalente — localizar primeiro). Teste cobrindo: merge de conflito (`'p-2 p-4'` → `'p-4'`), condicional falsy ignorado, e array aninhado.

- [ ] **Step 6: Instalar e conferir que o workspace enxerga**

Run: `pnpm install`
Esperado: `@piluvitu/ui` aparece como workspace project.

- [ ] **Step 7: Rodar o teste**

Run: `pnpm --filter @piluvitu/ui test` (adicionar o script se não existir; espelhar o de `packages/tools`)

- [ ] **Step 8: Commit**

---

## Task 2: `apps/web` consome `packages/ui` — sem mudar um pixel

**Files:**

- Modify: `apps/web/app/globals.css`, `apps/web/package.json`
- Create: `scripts/check-tailwind-source.mjs`

**Interfaces:**

- Consumes: `@piluvitu/ui/styles.css`, a sentinela da Task 1
- Produces: `scripts/check-tailwind-source.mjs <caminho-do-css-emitido>` — sai 1 se a sentinela não estiver lá

- [ ] **Step 1: Escrever o gate primeiro**

`scripts/check-tailwind-source.mjs`: recebe um glob ou diretório, encontra o(s) `.css` emitido(s), procura a regra da sentinela. Ausente ⇒ `process.exit(1)` com mensagem dizendo **exatamente** o que está errado (`@source` do app não alcança `packages/ui/src`) e como conferir. Presente ⇒ silêncio e exit 0.

Mensagem de erro é o produto aqui: quem esbarrar nisso em CI precisa entender em 5 segundos.

- [ ] **Step 2: Provar que o gate falha quando deve**

Antes de ligar o `@source`: build do `apps/web` e rodar o gate. **Esperado: falha.** Se passar aqui, o gate não serve para nada e a task inteira é teatro — pare e reporte.

- [ ] **Step 3: Ligar o `@source` e o import**

`apps/web/app/globals.css` no topo:

```css
@import 'tailwindcss';
@import '@piluvitu/ui/styles.css';
@source '../../../packages/ui/src';
@plugin '@tailwindcss/typography';
```

Conferir a contagem de `../` a partir de `apps/web/app/`. Se der errado, o Step 4 pega.

- [ ] **Step 4: Build + gate, agora esperando passar**

Run: `pnpm --filter @piluvitu/web build && node scripts/check-tailwind-source.mjs apps/web/.next`
Esperado: build ok e gate silencioso. Registre no relatório a saída dos dois — o par falha-depois-passa é a evidência de que o gate mede alguma coisa.

- [ ] **Step 5: Amarrar o gate ao build**

`apps/web/package.json`: o script `build` passa a rodar o gate depois do `next build`.

- [ ] **Step 6: Suíte do web verde**

Run: `pnpm --filter @piluvitu/web test`
Esperado: 89 testes verdes, iguais a antes. Qualquer falha aqui é regressão sua.

- [ ] **Step 7: Commit**

---

## Task 3: Migrar os 14 componentes para `packages/ui`

**Files:**

- Move: `apps/web/components/ui/{aspect-ratio,avatar,badge,button,card,command,dialog,dropdown-menu,form,input,label,separator,skeleton,textarea}.tsx` → `packages/ui/src/`
- Keep: `apps/web/components/ui/sonner.tsx` (único acoplado ao `next-themes` — §3.1 do spec)
- Modify: `packages/ui/package.json` (exports), todos os call sites do `apps/web`

**Interfaces:**

- Produces: `@piluvitu/ui/button`, `/card`, `/badge`, … um export por componente

- [ ] **Step 1: Mapear os call sites antes de mover**

Run: `grep -rn "components/ui/" apps/web --include=*.tsx --include=*.ts -l`
Guardar a lista. É a checagem do Step 5.

- [ ] **Step 2: Mover os 14 arquivos**

`git mv`, não copiar — preserva histórico. Ajustar os imports internos (`@/lib/utils` → `./cn`, imports entre componentes).

- [ ] **Step 3: Um export por componente no `package.json`**

Export por arquivo, não um barrel `index.ts`: barrel força o bundler a carregar os 14 para usar 1, e o finanças vai usar poucos.

- [ ] **Step 4: Reapontar os imports do `apps/web`**

`@/components/ui/button` → `@piluvitu/ui/button`. `sonner.tsx` continua onde está e passa a importar `cn` de `@piluvitu/ui/cn`.

- [ ] **Step 5: Nenhum import órfão**

Run: `grep -rn "components/ui/" apps/web --include=*.tsx --include=*.ts | grep -v sonner`
Esperado: **vazio**.

- [ ] **Step 6: Typecheck, teste, build, gate, Storybook**

```bash
pnpm --filter @piluvitu/web exec tsc --noEmit
pnpm --filter @piluvitu/web test
pnpm --filter @piluvitu/web build   # já roda o gate
```

Esperado: 89 verdes, build ok, gate silencioso.

⚠️ **A pegadinha do `implicit-any` da Vercel** está documentada no `apps/web/CLAUDE.md` — leia antes de concluir que está tudo bem só porque o `tsc` local passou.

- [ ] **Step 7: Conferir o `transpilePackages` (§0.3 do spec, inconclusivo)**

O spike não conseguiu decidir se o Next precisa de `transpilePackages: ['@piluvitu/ui']`. **Agora dá para medir de verdade.** Buildar sem; se passar, não adicionar e **registrar o resultado medido**. Se falhar, adicionar e registrar o erro exato. Não copiar a conclusão do spike nem o comentário antigo do `vite.config.ts`.

- [ ] **Step 8: Commit**

---

## Task 4: `apps/financas/web` em cima do Tailwind + `packages/ui`

**Files:**

- Modify: `apps/financas/web/package.json`, `apps/financas/web/vite.config.ts`, `apps/financas/web/src/styles.css`, `apps/financas/web/index.html`
- Create: `apps/financas/web/src/lib/theme.ts`, `apps/financas/web/src/lib/theme.test.ts`

**Interfaces:**

- Consumes: `@piluvitu/ui/*`
- Produces: `aplicarTema(t: 'claro' | 'escuro' | 'sistema'): void`, `temaSalvo(): 'claro' | 'escuro' | 'sistema'`

- [ ] **Step 1: Dependências**

`tailwindcss@4`, `@tailwindcss/vite`, `@piluvitu/ui` (workspace:\*). Usar o **plugin Vite** do Tailwind, não PostCSS — o `apps/web` usa PostCSS porque é Next; aqui é Vite.

- [ ] **Step 2: `styles.css`**

As 58 linhas de CSS puro **saem inteiras**. Entram:

```css
@import 'tailwindcss';
@import '@piluvitu/ui/styles.css';
@source '../../../../packages/ui/src';
```

Conferir a contagem de `../` a partir de `apps/financas/web/src/`.

- [ ] **Step 3: Provar o gate deste lado ANTES de confiar**

Este é o app onde o dev server mente (§0.2). Buildar com o `@source` **comentado** e rodar o gate: **tem que falhar**. Descomentar, buildar, rodar: **tem que passar**. Registrar as duas saídas no relatório. Sem esse par, você não sabe se o `@source` está certo — só sabe que o dev estava bonito.

- [ ] **Step 4: Amarrar o gate ao build do finanças**

`apps/financas/web/package.json`: `build` roda `vite build` e depois o gate sobre `dist/assets/*.css`.

⚠️ O `pretest` de `@piluvitu/financas` builda o SPA, e o `deploy` também. O gate passa a rodar nos dois caminhos — é de propósito.

- [ ] **Step 5: Tema**

`theme.ts`: lê/grava `localStorage`, alterna `.dark` no `<html>`, e no modo `sistema` observa `matchMedia('(prefers-color-scheme: dark)')`. ~20 linhas, sem provider.

Teste: os três modos, e que `sistema` reage à mudança do `matchMedia` (mock).

- [ ] **Step 6: Conferir o `optimizeDeps.exclude` (§0.3)**

Mesma medição do Step 7 da Task 3, do lado do Vite. O comentário atual do `vite.config.ts` diz que `@piluvitu/tools` precisa do exclude; o spike não reproduziu. Medir com o `packages/ui` real e **registrar o que aconteceu**, seja qual for.

- [ ] **Step 7: Suítes verdes**

Run: `pnpm --filter @piluvitu/financas-web test` (63) e `pnpm --filter @piluvitu/financas test` (207)

- [ ] **Step 8: Commit**

---

## Task 5: Backend — `GET /api/reports/by-category`

**Files:**

- Modify: `apps/financas/src/domain/reports.ts`, `apps/financas/src/domain/reports.test.ts`, `apps/financas/src/routes/reports.ts`, `apps/financas/src/routes/reports.test.ts`

**Interfaces:**

- Produces: `byCategory(db, { competence }): Promise<{ competence, rows: { category_id, category_name, category_slug, total_cents }[], total_cents }>`
- HTTP: `GET /api/reports/by-category?competence=YYYY-MM` → 200 no envelope; `400 invalid_query` para `competence` ausente ou malformada

- [ ] **Step 1: Teste de domínio primeiro**

Cobrir: soma por categoria no mês; **exclui transferência** (`transfer_id IS NULL`) e **filha de rateio** (`parent_id IS NULL`) — o mesmo anti-dupla-contagem de `v_cashflow`; lançamento sem categoria cai num bucket "Sem categoria"; mês vazio devolve `rows: []` e `total_cents: 0`.

⚠️ O mês aqui é por **`purchase_date`**, não por `bill_competence`: a pergunta é "para onde foi o dinheiro **neste mês**", não "o que cai na fatura que fecha neste mês". São coisas diferentes e confundi-las torna o gráfico mentiroso.

- [ ] **Step 2: Rodar, ver falhar**

- [ ] **Step 3: Implementar `byCategory`**

Uma query com `GROUP BY`, `LEFT JOIN categories`, `LIMIT` (teto como o resto do módulo — "rows read" conta linha escaneada no D1).

- [ ] **Step 4: Rodar, ver passar**

- [ ] **Step 5: Rota + teste de rota**

`competence` inválida ⇒ **400 `invalid_query`**, não 422 — é query string, e o catálogo do módulo trata query malformada como 400 (ver a ⚠️ da seção _Relatório de comprometido_ no `CLAUDE.md`, que é a fonte de verdade sobre isso). `RangeError` de `lib/dates.ts` precisa do branch explícito, senão vaza como 500 sem envelope.

Montar acima do catch-all `app.all('/api/*')`, que **continua sendo o último `app.*` registrado**.

- [ ] **Step 6: Suíte do Worker verde (207 + as novas)**

- [ ] **Step 7: Commit**

---

## Task 6: Casca da home + bloco Comprometido (o gráfico)

**Files:**

- Create: `apps/financas/web/src/pages/home.tsx` + teste, `apps/financas/web/src/blocos/BlocoComprometido.tsx` + teste, `apps/financas/web/src/blocos/Bloco.tsx` + teste
- Modify: `apps/financas/web/src/App.tsx` (+ teste)

**Interfaces:**

- Produces: `<Bloco titulo carregando erro vazio>` — casca comum (card + título + os três estados); `<BlocoComprometido />` autônomo

- [ ] **Step 1: `Bloco` primeiro, com teste**

A casca que os quatro blocos compartilham: card do design system, título, e os estados **carregando / erro / vazio / conteúdo**. Um bloco em erro renderiza a mensagem **dentro do próprio card** — não propaga.

Teste: os quatro estados, e que `erro` tem `role="alert"`.

- [ ] **Step 2: `BlocoComprometido` com teste**

Busca `GET /api/reports/commitments`, renderiza barras por competência com linha de referência em `fixed_net_cents`. Acima de 50% em vermelho (token `--color-destructive`, nunca hex solto).

Importar o gráfico com `lazy` + `Suspense` — recharts custa +110 KB gzip medidos e não pode pesar a primeira pintura.

Teste: com dados, vazio, e erro. **Mockar `api`**, não a rede.

- [ ] **Step 3: `home.tsx` monta os blocos**

Nesta task só o Comprometido; os outros três entram nas Tasks 7 e 8. Grid responsivo — o dono lança gasto pelo **Android** e confere no MacBook.

- [ ] **Step 4: Rota `#/`**

`App.tsx`: `#/` vira a home e o default; `#/contas` deixa de ser o default e continua acessível. Teste de roteamento por hash, no padrão que já existe (`getByRole('heading', …)`, não `getByText` — a lição do fix da T4 do plano anterior).

- [ ] **Step 5: Suíte da SPA verde + build + gate**

- [ ] **Step 6: Commit**

---

## Task 7: Blocos Saldos e Dívidas

**Files:**

- Create: `apps/financas/web/src/blocos/BlocoSaldos.tsx` + teste, `apps/financas/web/src/blocos/BlocoDividas.tsx` + teste
- Modify: `apps/financas/web/src/pages/home.tsx` (+ teste)

- [ ] **Step 1: `BlocoSaldos` com teste**

`GET /api/accounts` (já devolve `balance_cents` por conta). Card por conta, **total PJ e total PF separados** — a separação é o motivo de `is_business` existir. Conta arquivada não aparece.

Teste: com contas, sem conta nenhuma (estado vazio com chamada para ação, já que sem conta não dá para lançar nada), e erro.

- [ ] **Step 2: `BlocoDividas` com teste**

`GET /api/debts` (já devolve `payee_name`). Barra de progresso por dívida. Só `status='open'` e `direction='i_owe'` — o que me devem não é compromisso meu.

Teste: dívida parcial, dívida sem item, lista vazia, erro.

- [ ] **Step 3: Montar na home + teste de que um bloco em erro não derruba os outros**

Esse teste é o que prova a modularidade da §3.4 do spec. Sem ele, "modular" é adjetivo.

- [ ] **Step 4: Suíte verde + build + gate**

- [ ] **Step 5: Commit**

---

## Task 8: Bloco "Para onde foi o dinheiro"

**Files:**

- Create: `apps/financas/web/src/blocos/BlocoCategorias.tsx` + teste
- Modify: `apps/financas/web/src/pages/home.tsx` (+ teste)

- [ ] **Step 1: Teste primeiro**

Consome `GET /api/reports/by-category` (Task 5). Gráfico por categoria do mês corrente via `todayInTeresina()`. Seletor de mês.

Teste: com dados, mês vazio, erro, e que o seletor refaz a busca.

- [ ] **Step 2: Implementar, montar na home**

Mesmo `lazy` do gráfico da Task 6.

- [ ] **Step 3: Suíte verde + build + gate**

- [ ] **Step 4: Commit**

---

## Task 9: Migrar as 5 telas existentes para o design system

**Files:**

- Modify: `apps/financas/web/src/pages/{accounts,DividasPage,debt-detail,new-entry,commitments}.tsx` e `NovoItemForm.tsx` (+ testes)

- [ ] **Step 1: Uma tela por vez, teste rodando entre cada uma**

Trocar markup cru por componentes do `@piluvitu/ui`. **Comportamento não muda** — os testes existentes (63) são o contrato. Se um teste precisar mudar, isso é sinal de que você mudou comportamento: pare e justifique no relatório.

Ordem sugerida: `accounts` → `new-entry` → `DividasPage` → `debt-detail` + `NovoItemForm` → `commitments`.

⚠️ `commitments.tsx` deve passar a **reusar o `BlocoComprometido`** da Task 6, não ter a própria cópia do gráfico. Duas implementações da mesma tela divergem.

⚠️ O `<select>` de conta em `debt-detail.tsx` **filtra `credit_card`** — `payDebt` sempre recusa. Não perder esse filtro na migração.

- [ ] **Step 2: Suíte verde, build, gate**

- [ ] **Step 3: Commit**

---

## Task 10: Tela de configurações

**Files:**

- Create: `apps/financas/web/src/pages/config.tsx` + teste
- Modify: `apps/financas/web/src/App.tsx`, backend para persistir `fixed_net_cents`

**Interfaces:**

- HTTP: `GET /api/settings`, `PUT /api/settings` no envelope

- [ ] **Step 1: Decidir e registrar a persistência do `fixed_net_cents`**

Hoje `DEFAULT_FIXED_NET_CENTS = 360000` é constante no backend e a rota aceita `?fixed_net_cents=`. Para editar sem deploy precisa persistir. **Migration nova (`0004`)** com uma tabela de settings chave-valor.

⚠️ Migration é **forward-only** e índice no D1 **não é alterável**. Acerte de primeira. **Informe o comando de `--remote`, não rode.**

- [ ] **Step 2: Backend com teste**

`GET`/`PUT /api/settings`. Valor inválido (não inteiro, ≤ 0) ⇒ 422.

- [ ] **Step 3: A tela, com teste**

Renda fixa de referência (com `parseBRL`/`formatBRL`, nunca float), tema (Task 4), conta logada + sair, e a seção de backup com o comando e o que ela cobre. Espaço reservado para conectar contas, com uma frase honesta de que é a fatia ② e ainda não existe — **não** um botão que não faz nada.

- [ ] **Step 4: `commitments` e `BlocoComprometido` passam a ler o valor salvo**

- [ ] **Step 5: Suítes verdes, build, gate**

- [ ] **Step 6: Commit**

---

## Task 11: Documentação, CI e deploy

**Files:**

- Create: `packages/ui/CLAUDE.md`
- Modify: `CLAUDE.md` (raiz — tabela de workspaces), `apps/financas/CLAUDE.md`, `apps/web/CLAUDE.md`, `.github/workflows/ci.yml`

- [ ] **Step 1: `packages/ui/CLAUDE.md`**

O que é, por que não tem build, por que `styles.css` não importa `tailwindcss`, por que `sonner` ficou para trás, e **a explicação inteira do `@source` e do gate** — incluindo a assimetria dev/prod do Vite, que é o que vai morder o próximo.

- [ ] **Step 2: Tabela de workspaces no `CLAUDE.md` da raiz**

Quatro linhas viram cinco. `packages/ui` entra com o que cobre.

- [ ] **Step 3: `apps/financas/CLAUDE.md`**

Seção da SPA reescrita: design system, home modular, blocos, tema, configurações. A seção atual descreve 58 linhas de CSS puro e cinco telas — está inteira desatualizada.

- [ ] **Step 4: CI**

O job `web` e o job `financas` já rodam `build`, e o gate está amarrado nos dois `build`. Confirmar que é verdade **rodando**, não lendo. Um job novo para `packages/ui` se ele tiver teste próprio.

- [ ] **Step 5: Suíte inteira, dos quatro workspaces**

Run: `pnpm -r test && pnpm -r lint`

- [ ] **Step 6: Comandos de produção — informar, não rodar**

Migration `0004` em `--remote` e `deploy`. Escrever a lista ordenada com a saída esperada de cada um.

- [ ] **Step 7: Commit**
