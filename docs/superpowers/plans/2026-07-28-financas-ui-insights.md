# Fatia ⑨ — UI/UX, gráficos shadcn e insight local — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tirar a UI do estado de protótipo, entregar os gráficos pedidos com o `chart` do shadcn, tornar o caminho do PDF descoberto, e dar o insight — gerado no Mac com Ollama, gravado no D1, lido pelo app de qualquer aparelho.

**Architecture:** O Mac **empurra**, o app **lê**. Nenhuma tela chama o Mac. A AI é local (custo zero); os números são consulta exata no Worker.

**Spec:** `docs/superpowers/specs/2026-07-28-financas-ui-insights-design.md` — leia a §3 antes de começar.

## Global Constraints

**As regras desta fatia**

- **Nenhum número exibido pode vir do modelo.** Os valores são calculados no Worker e renderizados pelo código; o modelo escreve só o texto ao redor. LLM erra aritmética com confiança, e aqui erro de número é erro financeiro.
- **A tela de insight funciona sem AI.** Os números aparecem mesmo que o comando do Mac nunca tenha rodado. Se falta o texto, falta o texto — a tela não fica em branco.
- **O insight mostra a data de geração.** Texto de três semanas apresentado como se fosse de hoje é pior que texto nenhum.
- **Zero custo de AI.** Workers AI foi medido, funciona, e está **descartado** por custo (§0 do spec). A AI é Ollama no Mac.
- **Não é redesign.** Os tokens, o tema escuro e os componentes ficam. Muda a aplicação deles.

**Bundle**

- ⚠️ **Não criar um terceiro chunk de recharts.** O build emite hoje exatamente um (`GraficoComprometido-*.js`) e o bundle principal tem **zero** ocorrências de `recharts-wrapper`. `scripts/check-financas-lazy-chart.mjs` protege isso e falha o build. Exportar do chunk existente, como o gráfico de categorias fez.
- Conferir a contagem **no build**, não por dedução.

**Convenções do módulo**

- Dinheiro é **`INTEGER` centavos**; `formatBRL`/`parseBRL` só.
- Datas por `todayInTeresina()`; nunca rotear data por UTC.
- Corpo inválido é **422**; query string é **400**. Envelope `{ ok, data, notifications }`, `notifications` nunca `null`.
- Erro de constraint nunca chega cru — `friendlyConstraintMessage` + `logConstraintError`.
- Rota usa `type Env` **local**; catch-all `app.all('/api/*')` continua sendo o **último** `app.*`.
- Migration é forward-only; índice no D1 é irreversível. **A próxima é a `0007`** — confira o diretório.
- Colocation; sem ponto-e-vírgula; aspas simples; ESM.
- Testes mockam `api`, não a rede; `getByRole('heading', …)`, nunca `getByText`.
- Confirmação usa `Dialog` do design system, nunca `window.confirm`.
- ⚠️ Jamais escrever o nome da classe sentinela do Tailwind dentro de `apps/*`; cite `SENTINEL_SELECTOR`.
- Ambos os gates silenciosos, verificados **depois** da última edição.
- **~390 px é alvo.** Navegação com mais peso visual é onde é mais fácil estourar largura.

**Suítes:** Worker 427 · SPA 273 · `apps/web` 89 · `packages/ui` 8 · `packages/tools` 123.

---

## Task 1: `chart` do shadcn + area chart no fluxo

**Files:** `packages/ui/src/chart.tsx` (+ teste), `packages/ui/package.json`, `web/src/blocos/GraficoComprometido.tsx`, `web/src/pages/fluxo.tsx` (+ testes)

- [ ] **Step 1:** trazer o `chart` do shadcn para `packages/ui`, um export próprio no map, **sem barrel**
- [ ] **Step 2:** area chart do **acumulado** no fluxo de caixa — é a série que mais ganha com área, porque a leitura é a reserva subindo ou sendo consumida
- [ ] **Step 3: conferir a contagem de chunks no build.** Um único arquivo com `recharts-wrapper`; o principal com zero. Se aparecer um segundo, pare e reporte
- [ ] **Step 4:** suítes, build, gates, 390 px · **Step 5:** commit

---

## Task 2: UI/UX e a descoberta do PDF

**Files:** `web/src/App.tsx` (+ teste), `web/src/pages/importar.tsx` (+ teste), telas com formulário

- [ ] **Step 1: navegação de verdade**, com **estado ativo** — hoje são links sublinhados crus (`text-primary text-sm underline underline-offset-4`). Teste que afirme o estado ativo pela rota corrente
- [ ] **Step 2: hierarquia e densidade** — título, subtítulo e ação com pesos distintos; espaçamento consistente entre cards
- [ ] **Step 3: o bug do print** — `Arquivo (.ofx, .qfx ou .csv)Choose File No file chosen`: rótulo colado no input, sem respiro. Vale para todos os formulários
- [ ] **Step 4: o PDF fica descoberto.** A tela de import explica o caminho: rodar `node apps/financas/scripts/pdf-import.mjs fatura.pdf` no Mac gera um CSV que entra ali mesmo

  ⚠️ Precisa dizer que **nenhum servidor precisa estar ligado** — o Ollama roda só durante o comando, na máquina do dono. Foi exatamente essa a dúvida dele. E **não prometer botão que não existe**

- [ ] **Step 5:** suítes, build, gates, **390 px conferido em navegador**, não deduzido · **Step 6:** commit

---

## Task 3: Backend do insight

**Files:** `migrations/0007_insights.sql`, `src/domain/insights.ts` + teste, `src/routes/insights.ts` + teste, `src/index.ts`

| Rota                        | Auth               | Sucesso | Erros               |
| --------------------------- | ------------------ | ------- | ------------------- |
| `GET /api/insights/latest`  | sessão             | 200     | —                   |
| `GET /api/insights/numbers` | sessão             | 200     | 400 `invalid_query` |
| `POST /api/insights`        | **`INGEST_TOKEN`** | 201     | 401, 422            |

- [ ] **Step 1: migration `0007`** — tabela `insights` STRICT (texto, modelo, período, `generated_at`). CHECK de tabela **depois** de todas as column-defs; a gramática é `column-def* table-constraint*` e isso já quebrou a `0001`
- [ ] **Step 2: `numbers`** — os fatos calculados: top categorias do período, variação contra o período anterior, e o que mais cresceu. **Consulta exata, sem AI.** Reusar `byCategory`; não escrever uma segunda regra que possa divergir
- [ ] **Step 3: ingestão autenticada por `INGEST_TOKEN`**, em middleware **só desta rota**

  ⚠️ O caminho de sessão do navegador fica **intocado** — nenhuma rota existente passa a aceitar token. Teste que prove que o token **não** abre `/api/accounts`

- [ ] **Step 4:** suíte do Worker · **Step 5:** commit · informar o comando `--remote`, não rodar

---

## Task 4: O comando que gera o insight no Mac

**Files:** `apps/financas/scripts/insight.mjs` (+ teste)

- [ ] **Step 1:** lê `numbers` da API, monta prompt com **os números já calculados**, chama o Ollama local, e faz `POST` do texto
- [ ] **Step 2: o modelo não recebe lançamento cru** — só os agregados. E o prompt proíbe inventar número; qualquer valor no texto tem que estar entre os que foram passados
- [ ] **Step 3: erros com mensagem, no padrão de `backup-d1.sh` e `pdf-import.mjs`** — Ollama desligado, modelo ausente, token faltando, API fora do ar. Nunca `ECONNREFUSED` cru
- [ ] **Step 4: rodar de verdade** contra o Ollama e reportar a saída real. Um comando que só rodou contra stub não é conhecido como funcionando
- [ ] **Step 5:** commit

---

## Task 5: Tela de insight + documentação

**Files:** `web/src/pages/insight.tsx` + teste, `web/src/App.tsx`, `apps/financas/CLAUDE.md`

- [ ] **Step 1: testes primeiro**
  1. **os números aparecem mesmo sem insight nenhum gravado** — é o teste que garante que a tela não depende do Mac
  2. com insight, mostra o texto **e a data de geração**
  3. insight antigo aparece com a idade visível
  4. nenhum número renderizado vem do campo de texto
- [ ] **Step 2:** implementar, com `<Ajuda>` explicando que o texto é gerado localmente e os números são calculados
- [ ] **Step 3:** rota `#/insight` + menu
- [ ] **Step 4: documentação** — o modelo push, por que não Workers AI (medido, funciona, descartado por custo), o escopo do `INGEST_TOKEN`, e como rodar o comando
- [ ] **Step 5:** suítes, build, gates, 390 px · **Step 6:** commit
