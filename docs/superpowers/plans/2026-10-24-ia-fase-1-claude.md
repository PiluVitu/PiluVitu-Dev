# IA fase 1 (Claude nos Workers): plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** tirar do Mac o insight financeiro e a revisão de posts, levando os dois para a API da Claude dentro dos Workers, e criar o resumo de post. O promeia fica só com a transcrição.

**Architecture:** um pacote novo, `packages/ia` (`@piluvitu/ia`), concentra o cliente Claude (`@anthropic-ai/sdk`), a tradução de erros, o cálculo de custo e a reserva de orçamento na tabela D1 `uso_ia`. Cada Worker (financas, ramielle) tem a sua cópia da tabela, gerada a partir do SQL do pacote e travada por um teste. A chave `ANTHROPIC_API_KEY` mora só como secret do Worker. Os prompts e o `markdown_blocos` saem do Python e vão para TypeScript sem mudar um byte.

**Tech Stack:** Hono + D1 (Workers), `@anthropic-ai/sdk`, Vitest com `@cloudflare/vitest-pool-workers`, Next 16 (`apps/web`), Jest, Storybook 10, Playwright.

**Spec:** relatório de IA (https://claude.ai/artifact/HFMRr6yfTC13xRSRgV4DT1). As decisões do usuário de 2026-10-24, listadas abaixo, valem sobre ele.

## Global Constraints

- Um PR por item, nesta ordem: **PR1** base → **PR2** insight → **PR3** revisão → **PR4** resumo. PR2, PR3 e PR4 partem do branch do PR1, e o PR4 parte do PR3, porque usa `dividirBlocos`. Sem merge e sem deploy.
- Branch a partir de `origin/main` atualizado: o `main` local está atrás do merge do #73. Rodar `git fetch && git switch -c feat/ia-base origin/main`.
- Modelos (ids exatos):
  - `claude-sonnet-5-5`: insight e proofread.
  - `claude-haiku-5-5`: refine, encurtar, hooks e resumo.
  - Nada de Opus e nada de modo `careful`.
- **Sem `temperature`/`top_p`/`top_k`:** Sonnet 5.5 e Haiku 5.5 recusam valor não padrão. As temperaturas 0.1/0.7/0.3 do promeia somem, e o conjunto de avaliação do PR3 confere que o comportamento continua aceitável.
- Sem `thinking` nas chamadas (são tarefas curtas de uma resposta). Sem streaming: `max_tokens` fica sempre ≤ 4096.
- Preços por MTok (entrada/saída):
  - Sonnet 5.5: US$ 2 / 10.
  - Haiku 5.5: US$ 0,10 / 0,50.
- Dinheiro sempre em **micro-dólar inteiro** (`INTEGER`); nunca usar float no banco.
- Tetos mensais por feature (micro-USD), constantes em código:

  | Feature (Worker)     | Teto mensal |
  | -------------------- | ----------- |
  | `insight` (financas) | US$ 2       |
  | `revisao` (ramielle) | US$ 10      |
  | `hooks` (ramielle)   | US$ 2       |
  | `resumo` (ramielle)  | US$ 2       |

  A soma é US$ 16; o usuário põe o teto duro de US$ 20 no Console.

- Erros da IA, todos no envelope `{ok:false, notifications}` de cada Worker:

  | Código                | Status | Quando                                                                     |
  | --------------------- | ------ | -------------------------------------------------------------------------- |
  | `claude_desligado`    | 503    | Sem `ANTHROPIC_API_KEY`                                                    |
  | `claude_indisponivel` | 503    | Rede, 5xx, 529 (overloaded) ou 429 (rate limit)                            |
  | `claude_recusou`      | 502    | 400, 401 ou 403, ou `stop_reason: "refusal"`                               |
  | `teto_atingido`       | 429    | A reserva estouraria o teto do mês; a mensagem diz o teto, o gasto e o mês |

- A mensagem de `claude_recusou` para o 401 diz "chave inválida, confira o `wrangler secret`", nunca o texto cru da API.
- `ANTHROPIC_API_KEY` é secret, nunca vai em `vars` do `wrangler.jsonc` nem em `.dev.vars` commitado. Nenhum agente escreve a chave real; o usuário roda `wrangler secret put ANTHROPIC_API_KEY` em cada Worker.
- Migrations: rodar só `--local`. As de produção ficam como comando informado ao usuário.
- Insight: o modelo vê **só agregados** (`insightNumbers`); a conta continua em SQL. O prompt é o `build_prompt` do `insight.py` portado byte a byte.
- Transcrição fica no promeia (Mac, LaunchAgent, túnel). Nada de Workers AI.
- Resumo: sem rótulo "gerado por IA". É gerado pelo dono no editor e gravado no frontmatter do MDX; nunca em render nem em ISR.
- Toda tarefa termina com `tsc --noEmit` e lint limpos no workspace mexido, os testes afetados verdes e o `CLAUDE.md` do workspace atualizado.

## Review Focus

1. **Reserva órfã:** o Worker morre entre a reserva e a conclusão, e a linha fica `reservado` para sempre. Ela continua contando contra o teto, de propósito (erra para o lado barato). Teste em `uso.test.ts`: uma reserva sem conclusão ainda bloqueia a próxima que estouraria.
2. **Duas reservas concorrentes perto do teto:** só uma pode passar. A reserva é um único `INSERT … SELECT … WHERE soma + estimativa <= teto`, atômico no D1. Teste com duas `reservar` em `Promise.all` e teto para uma só.
3. **A chave vazando:** pelo corpo da resposta de erro (mensagem da SDK repassada), por `console.error` ou por header. Teste sentinela nos dois Workers.
4. **Artigo com cerca de código não fechada, tabela ou JSX:** o proofread não pode mandar esses trechos ao modelo nem alterá-los. Teste de invariante byte a byte com as fixtures do Python e uma rota que confere que o passthrough sai idêntico.
5. **Resposta da Claude fora do formato:** texto vazio, `stop_reason: "max_tokens"`, JSON do resumo inválido, `metaDescription` acima de 160 caracteres. Vira `claude_recusou` com mensagem acionável, nunca 500 e nunca um campo truncado salvo.

---

## PR1: base comum (`feat/ia-base`)

### Task 1: pacote `@piluvitu/ia`, com custo e erros

**Files:**

- Create:
  - `packages/ia/package.json` (`name: @piluvitu/ia`, `private: true`, scripts `lint` = `tsc --noEmit` e `test` = `vitest run`, dependência `@anthropic-ai/sdk` com versão exata de 24 h ou mais)
  - `packages/ia/tsconfig.json`
  - `packages/ia/vitest.config.ts`
  - `packages/ia/CLAUDE.md`
  - `packages/ia/src/custo.ts`
  - `packages/ia/src/erros.ts`
- Test:
  - `packages/ia/src/custo.test.ts`
  - `packages/ia/src/erros.test.ts`
- Modify:
  - `.github/workflows/ci.yml`: o job `ramielle` também roda `lint` e `test` de `packages/ia`.
  - `CLAUDE.md` raiz: linha da tabela de workspaces.

**Interfaces:**

- Produces:
  - `type Modelo = 'claude-sonnet-5-5' | 'claude-haiku-5-5'`
  - `PRECOS: Record<Modelo, { entradaMicroPorMTok: number; saidaMicroPorMTok: number }>`
  - `custoMicroUsd(modelo, { input_tokens, output_tokens, cache_read_input_tokens?, cache_creation_input_tokens? }): number`. Arredonda para cima; cache read a 0,1× e cache write a 1,25× da entrada.
  - `estimativaMicroUsd(modelo, caracteresEntrada: number, maxTokens: number): number`. Entrada estimada em `ceil(caracteres / 2)` tokens (folga de propósito) mais `maxTokens` de saída.
  - `class ClaudeDesligado`, `class ClaudeIndisponivel`, `class ClaudeRecusou` (campos `status?: number`, `motivo: 'chave_invalida' | 'requisicao_invalida' | 'recusa' | 'formato'`) e `class TetoAtingido` (campos `feature`, `mes`, `tetoMicro`, `gastoMicro`)
  - `codigoDoErro(err): { status: 503 | 502 | 429; code: string; message: string } | null`

- [ ] **Step 1:** escrever os testes.
  - `custo.test.ts`:
    - 1 000 000 de tokens de entrada no Sonnet dá `2_000_000` micro.
    - 1 de saída no Haiku dá `1` (arredonda para cima).
    - `estimativaMicroUsd('claude-haiku-5-5', 2000, 1000)` dá `ceil(1000 × 0,1) + ceil(1000 × 0,5) = 600`.
  - `erros.test.ts`:
    - Cada classe é mapeada pelo `codigoDoErro` ao status e código da tabela das Global Constraints.
    - A mensagem do `TetoAtingido` contém `US$ 2,00`, o gasto e o `mes`.
    - Erro desconhecido devolve `null`.
- [ ] **Step 2:** `pnpm --filter @piluvitu/ia test`. Esperado: FAIL, módulos inexistentes.
- [ ] **Step 3:** implementar `custo.ts` e `erros.ts`.
- [ ] **Step 4:** `pnpm --filter @piluvitu/ia test && pnpm --filter @piluvitu/ia lint`. Esperado: PASS.
- [ ] **Step 5:** `pnpm install` desacoplado da sessão (nohup/setsid, log no scratchpad). Depois o usuário roda o `pnpm dedupe --check` ou ele roda no CI; nunca pela ferramenta Bash.
- [ ] **Step 6:** commit `feat(ia): pacote @piluvitu/ia com custo e erros da Claude`.

### Task 2: cliente Claude

**Files:**

- Create: `packages/ia/src/claude.ts`
- Test: `packages/ia/src/claude.test.ts`

**Interfaces:**

- Consumes: Task 1.
- Produces:
  - `type PedidoClaude = { modelo: Modelo; system: string; user: string; maxTokens: number; formatoJson?: object }`
  - `type RespostaClaude = { texto: string; uso: Usage; custoMicro: number }`
  - `chamarClaude(apiKey: string | undefined, pedido: PedidoClaude, opts?: { fetch?: typeof fetch }): Promise<RespostaClaude>`

- [ ] **Step 1:** testes, com o `fetch` injetado no `new Anthropic({ apiKey, fetch, maxRetries: 1 })`.
  - `apiKey` vazio ou `undefined` lança `ClaudeDesligado` e o fetch não é chamado.
  - 200 com `content: [{type:'text', text:'  oi  '}]` devolve `texto: 'oi'` (trim) e `custoMicro` calculado do `usage`.
  - Status 401 → `ClaudeRecusou{motivo:'chave_invalida'}`; 400 → `requisicao_invalida`; 529, 500 e 429 → `ClaudeIndisponivel`; `fetch` lançando `TypeError` → `ClaudeIndisponivel`.
  - `stop_reason: 'refusal'` → `ClaudeRecusou{motivo:'recusa'}`; `stop_reason: 'max_tokens'` → `ClaudeRecusou{motivo:'formato'}`; texto vazio → `formato`.
  - O corpo enviado não tem `temperature`, `top_p`, `top_k` nem `thinking`.
  - Com `formatoJson`, o corpo leva `output_config.format = { type: 'json_schema', schema }`. Conferir o nome exato do campo em `typescript/` da skill `claude-api` antes de escrever.
  - Sentinela: com `apiKey = 'sk-ant-SENTINELA-nao-vaze'`, nenhuma `message` das exceções lançadas (todas as do describe) contém `SENTINELA`.
- [ ] **Step 2:** rodar e ver FAIL.
- [ ] **Step 3:** implementar.
  - Usar `client.messages.create` com o `model` e o `system` como string.
  - Mapear os erros pelas classes da SDK (`APIStatusError` e semelhantes): nunca repassar `err.message` da SDK; montar a mensagem própria.
- [ ] **Step 4:** PASS, mais o `lint`.
- [ ] **Step 5:** commit `feat(ia): cliente Claude com erros traduzidos`.

### Task 3: reserva de orçamento (`uso_ia`) e migrations

**Files:**

- Create:
  - `packages/ia/sql/uso_ia.sql`
  - `packages/ia/src/uso.ts`
  - `apps/ramielle/migrations/0006_uso_ia.sql`
  - `apps/financas/migrations/0015_uso_ia.sql`
- Test:
  - `packages/ia/src/uso.test.ts` (pool de Workers, com o binding D1 `DB` declarado em `miniflare.d1Databases` e o `sql/uso_ia.sql` aplicado no setup)
  - `apps/ramielle/src/schema.test.ts` e `apps/financas/src/schema.test.ts`: o arquivo da migration é idêntico ao `packages/ia/sql/uso_ia.sql`.

**Interfaces:**

- Consumes: Tasks 1-2.
- Produces:
  - Tabela `uso_ia`:

    | Coluna            | Tipo                                                       |
    | ----------------- | ---------------------------------------------------------- |
    | `id`              | `TEXT PK`                                                  |
    | `feature`         | `TEXT NOT NULL`                                            |
    | `mes`             | `TEXT NOT NULL`, `'YYYY-MM'` em America/Fortaleza          |
    | `modelo`          | `TEXT NOT NULL`                                            |
    | `estado`          | `TEXT NOT NULL`, CHECK em `reservado`/`concluido`/`falhou` |
    | `reservado_micro` | `INTEGER NOT NULL`                                         |
    | `custo_micro`     | `INTEGER`                                                  |
    | `tokens_entrada`  | `INTEGER`                                                  |
    | `tokens_saida`    | `INTEGER`                                                  |
    | `criado_em`       | `TEXT NOT NULL`                                            |
    | `concluido_em`    | `TEXT`                                                     |

    `STRICT`, mais o índice `(feature, mes)`.

  - `reservar(db, { feature, mes, modelo, estimativaMicro, tetoMicro }): Promise<string>`. Devolve o id, ou lança `TetoAtingido`. A soma conta `custo_micro` dos `concluido` e `reservado_micro` dos `reservado`; `falhou` conta 0.
  - `concluir(db, id, resposta: RespostaClaude): Promise<void>`
  - `liberar(db, id): Promise<void>` (marca `falhou`)
  - `comOrcamento(db, cfg: { feature; tetoMicro; apiKey; fetch? }, pedido: PedidoClaude): Promise<RespostaClaude>`. Faz reservar → `chamarClaude` → concluir; em erro, `liberar` e relança.

- [ ] **Step 1:** testes em `uso.test.ts`.
  - Reserva dentro do teto passa e grava `reservado`.
  - Uma reserva que estoura lança `TetoAtingido`, com `gastoMicro` certo.
  - `concluir` troca a estimativa pelo custo real, e uma nova reserva cabe.
  - `liberar` zera.
  - Reserva órfã ainda conta (Review Focus 1).
  - Duas reservas em `Promise.all` com espaço para uma: exatamente uma lança (Review Focus 2).
  - O mês é o de Fortaleza: `2026-11-01T02:00Z` cai em `2026-10`.
  - `comOrcamento` com fetch falhando deixa a linha `falhou`.
  - Os dois `schema.test.ts`: a migration é igual ao SQL do pacote, e o `PRAGMA table_info(uso_ia)` tem as colunas da tabela acima.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** implementar.
  - Copiar o SQL para as duas migrations.
  - `reservar` é um único `INSERT INTO uso_ia (...) SELECT ... WHERE (SELECT COALESCE(SUM(...),0) FROM uso_ia WHERE feature=? AND mes=?) + ? <= ?`; `meta.changes === 0` vira `TetoAtingido`, buscando o gasto numa segunda leitura só para a mensagem.
- [ ] **Step 4:** testes do pacote e dos dois Workers verdes. Aplicar só local: `pnpm --filter @piluvitu/ramielle db:migrate:local` e o equivalente do financas.
- [ ] **Step 5:** commit `feat(ia): tabela uso_ia com reserva atômica e teto por feature`.

### Task 4: ligar a base nos dois Workers

**Files:**

- Modify:
  - `apps/ramielle/src/lib/auth.ts` e `apps/financas/src/index.ts` (Bindings): `ANTHROPIC_API_KEY?: string`
  - `apps/ramielle/package.json` e `apps/financas/package.json`: `"@piluvitu/ia": "workspace:*"`
  - Os dois `CLAUDE.md` (secret, comando `wrangler secret put ANTHROPIC_API_KEY`, tabela de tetos, erros)
- Create:
  - `apps/ramielle/src/lib/ia.ts` (`TETOS_RAMIELLE`, `respostaDeErroIa(err): Response | never`, que usa `codigoDoErro` com o `errJson` local e relança o desconhecido)
  - `apps/financas/src/lib/ia.ts` (o mesmo, com `TETOS_FINANCAS`)
- Test:
  - `apps/ramielle/src/lib/ia.test.ts` e `apps/financas/src/lib/ia.test.ts`
  - `apps/*/src/ia-segredo.test.ts`: sentinela contra o app montado.

**Interfaces:**

- Produces: `respostaDeErroIa`, `TETOS_*`, consumidos pelas rotas dos PRs 2-4.

- [ ] **Step 1:** testes.
  - `respostaDeErroIa` produz o envelope de cada código.
  - Sentinela: o `wrangler.jsonc` lido como texto não contém `ANTHROPIC_API_KEY`.
  - Sentinela: com `env.ANTHROPIC_API_KEY = 'sk-ant-SENTINELA'` e o fetch global devolvendo 401, uma rota que chama a IA (no PR1, uma rota de teste montada só no teste com `comOrcamento`) devolve um corpo e headers sem `SENTINELA`; o `console.error` espionado também não a recebe. O header `x-api-key` sai só para `api.anthropic.com`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** `pnpm --filter @piluvitu/ramielle test`, `pnpm --filter @piluvitu/financas test` e os dois `tsc --noEmit`, todos verdes.
- [ ] **Step 5:** commit, push e `gh pr create` (sem merge). O corpo lista os comandos para o usuário:
  ```bash
  pnpm --filter @piluvitu/ramielle exec wrangler secret put ANTHROPIC_API_KEY
  pnpm --filter @piluvitu/financas exec wrangler secret put ANTHROPIC_API_KEY
  pnpm --filter @piluvitu/ramielle db:migrate:remote   # 0006_uso_ia
  pnpm --filter @piluvitu/financas exec wrangler d1 migrations apply piluvitu-financas --remote   # 0015_uso_ia
  ```

## PR2: insight na Claude (`feat/ia-insight`, a partir de `feat/ia-base`)

### Task 5: gerar o insight no Worker

**Files:**

- Create:
  - `apps/financas/src/domain/insight-prompt.ts`: `montarPromptInsight(numbers: InsightNumbers): string`, porte byte a byte de `build_prompt`, `format_brl` e das três `_linha_*` do `insight.py`.
  - `apps/financas/src/domain/insight-gerar.ts`: `gerarInsight(env, competence): Promise<Insight>`, que faz `insightNumbers` → `comOrcamento(feature 'insight', Sonnet, maxTokens 600)` → `createInsight({texto, modelo:'claude-sonnet-5-5', periodo})`.
- Test:
  - `apps/financas/src/domain/insight-prompt.test.ts`: três fixtures (mês normal, sem base de comparação, sem gasto) com a saída esperada gravada em `__fixtures__/insight-prompt-*.txt`, geradas **antes** rodando o `build_prompt` do Python atual. A comparação é por `===`.
  - `apps/financas/src/domain/insight-gerar.test.ts`
- Modify: `apps/financas/src/routes/insights.ts`.
  - `POST /insights/generate` chama `gerarInsight` e responde 200 com o insight. O 202 e o `ESPERA_CURTA_MS` saem.
  - Saem também `POST /insights` (ingestão) e o caminho de token do `GET /insights/numbers`, que volta a ser só sessão. As exceções correspondentes saem do `index.ts`, e `lib/promeia.ts` e `lib/promeia.test.ts` são apagados.

**Interfaces:**

- Consumes: `comOrcamento`, `respostaDeErroIa`, `TETOS_FINANCAS.insight`, `insightNumbers`, `createInsight`.
- Produces: `gerarInsight(env: { DB: D1Database; ANTHROPIC_API_KEY?: string }, competence: string, opts?: { fetch?: typeof fetch }): Promise<Insight>`.

- [ ] **Step 1:** testes.
  - Prompt idêntico às fixtures.
  - `gerarInsight` com fetch falso envia `model: 'claude-sonnet-5-5'` e um `user` igual ao prompt; o corpo enviado não contém nenhum `description`/`payee` de lançamento, conferido com um lançamento sentinela inserido antes.
  - Grava o insight e uma linha `uso_ia` `concluido`.
  - A rota devolve 200 com `texto`.
  - Sem chave: 503 `claude_desligado`. Teto: 429 `teto_atingido`. Competência inválida: 422 `invalid_competence` (já existe).
  - `POST /api/insights` com Bearer: 404/401 (a rota não existe mais). O `index.test.ts`, describe "fronteira do INGEST_TOKEN", é reescrito para provar que o token não abre nada.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** testes do Worker verdes, mais o `tsc`.
- [ ] **Step 5:** commit `feat(financas): insight gerado pela Claude no Worker`.

### Task 6: Cron no dia 1, tela sem polling e saída do promeia

**Files:**

- Modify:
  - `apps/financas/wrangler.jsonc`: `"triggers": { "crons": ["0 12 1 * *"] }`, que é 09:00 em Teresina.
  - `apps/financas/src/index.ts`: `export default { fetch: app.fetch, scheduled }`.
  - `apps/financas/web/src/pages/insight.tsx`: sai o polling e o estado `gerando` de 20-35 s; fica "Gerando…" durante o request e mostra o resultado ou o erro (`notifications[0].message`).
  - `apps/financas/web/src/pages/insight.test.tsx`
  - `insight.stories.tsx`: atualizar, ou criar se não existir. Estados: sem insight, gerando, pronto, `teto_atingido`, `claude_desligado`.
  - `apps/financas/CLAUDE.md`:
    - insight pela Claude, Cron, fim do INGEST_TOKEN.
    - Troca da regra "o modelo nunca vê lançamento cru" pela decisão da fase 2: a categorização vai mandar descrição, favorecido, valor e data; o insight continua só com agregados.
  - Promeia:
    - Remover: `insight.py`, `insight_test.py`, `ramielle.py` + teste, `cli.py` + teste e `money.py` (se só o insight usa).
    - Remover o router do insight em `app.py`, e as settings `ingest_token`/`ramielle_url`/`model_insight` em `config.py` (e testes).
    - `apps/promeia/CLAUDE.md`.
  - `Makefile`: alvo `insight`. `CLAUDE.md` raiz: linha do promeia e tabela de comandos.
- Create: `apps/financas/src/scheduled.ts`: `scheduled(controller, env, ctx)` gera a competência **anterior** ao mês de Fortaleza do `controller.scheduledTime`, e pula se já existe insight daquele `periodo`.
- Test: `apps/financas/src/scheduled.test.ts`.

- [ ] **Step 1:** testes.
  - `scheduledTime = 2026-11-01T12:00Z` gera `2026-10`.
  - Rodar duas vezes grava um insight só.
  - Falha da Claude não lança (só `console.error` sem a chave), e a linha `uso_ia` fica `falhou`.
  - `insight.test.tsx`: 200 mostra o texto; 429 mostra a mensagem do teto; sem chamada repetida a `latest` depois do 200.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** testes do Worker, do SPA e do promeia (`make test-promeia`, `make lint-promeia`) verdes; build do SPA (com os gates) verde.
- [ ] **Step 5:** commit, push e PR. O corpo pede ao usuário, depois do deploy:
  ```bash
  wrangler secret delete INGEST_TOKEN
  wrangler secret delete PROMEIA_URL
  wrangler secret delete PROMEIA_TOKEN
  ```
  Os três no financas.

## PR3: revisão de post pela Claude (`feat/ia-revisao`, a partir de `feat/ia-base`)

### Task 7: porte do `markdown_blocos` e dos prompts

**Files:**

- Create:
  - `apps/ramielle/src/domain/revisao/markdown-blocos.ts`: `dividirBlocos(entrada: string): Bloco[]` e `restaurarBordas(original: string, corrigido: string): string`, com `type Bloco = { tipo: 'prosa' | 'passthrough'; texto: string }`. Mesmo algoritmo do Python: split que preserva `\n`, cerca atômica, primeira linha não vazia decide `| < > ![`.
  - `apps/ramielle/src/domain/revisao/prompts.ts`: `PROOFREAD_SYSTEM`, `REFINE_SYSTEM`, `SHORTEN_SYSTEM`, `INSTRUCAO_PADRAO`, `hooksSystem(plataforma: string, limite: number): string`.
  - `apps/ramielle/src/domain/revisao/__fixtures__/prompts-promeia.json`: gerado do Python antes de apagá-lo (`uv run python -c` com `json.dump` das constantes e de `HOOKS_SYSTEM_TMPL.format('bluesky', 300)`).
- Test:
  - `markdown-blocos.test.ts`: os casos do `markdown_blocos_test.py`, mais a invariante `dividirBlocos(x).map(b => b.texto).join('') === x` para uma lista de entradas. A lista inclui: vazio, sem `\n` final, `\r\n`, cerca não fechada, tabela, JSX, citação, imagem, só espaços e emoji.
  - `prompts.test.ts`: cada constante `===` à do JSON.

- [ ] **Step 1:** testes. **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS.
- [ ] **Step 5:** commit `feat(ramielle): porte do markdown_blocos e dos prompts da revisão`.

### Task 8: proofread, refine e hooks no ramielle

**Files:**

- Create:
  - `apps/ramielle/src/domain/revisao/revisao.ts`:
    - `proofread(texto, chat)`: só os blocos de prosa vão ao `chat`, com `restaurarBordas`.
    - `refine(plataforma, texto, instrucao, chat)`
    - `gerarHooks(artigo, plataformas, chat)`: uma falha derruba o lote.
    - `ajustarAoLimite(texto, limite, chat)`: fail-soft que trunca.
    - `truncar(texto, limite)`
    - `LIMITES = { bluesky: 300, mastodon: 500 }`, padrão 280.
    - `type Chat = (p: { modelo: Modelo; system: string; user: string; maxTokens: number }) => Promise<string>`
  - `apps/ramielle/src/domain/revisao/chat-claude.ts`: `chatComOrcamento(env, feature: 'revisao' | 'hooks'): Chat` sobre `comOrcamento`.
- Modify:
  - `apps/ramielle/src/routes/atelier.ts`: as duas rotas usam `revisao.ts` com `chatComOrcamento`. O proofread usa Sonnet (feature `revisao`, `maxTokens` 4096 por bloco); o refine usa Haiku (feature `hooks`). O campo `careful` é ignorado. Sem chave: `claude_desligado` em vez de `promeia_disabled`.
  - `apps/ramielle/src/domain/distribution-service.ts`: `gerarHooks` direto, no lugar de `chamarPromeia('/llm/hooks')`. Os dois estados documentados continuam: sem chave, pula os sociais; Claude falhando, mesmo tratamento de hoje.
  - `apps/ramielle/src/lib/promeia.ts` fica só para a transcrição.
  - `apps/web/components/admin/posts/proofread-button.tsx` (+ `.stories.tsx`, `.test.tsx`) e `apps/web/lib/admin/atelier/api.ts`: sai o checkbox "careful" e o parâmetro.
  - Promeia: remover `revisao.py`, `revisao_rotas.py`, `prompts.py`, `markdown_blocos.py`, `ollama.py` (o último consumidor sai aqui), os testes deles, o router em `app.py` e as settings `model_*`/`ollama_url`. Atualizar `CLAUDE.md` do promeia, do ramielle e da raiz: o promeia passa a ser só transcrição. Sai também o Ollama do `process-compose`/`make stack`, se ainda estiver lá.
- Test:
  - `revisao.test.ts`: os casos portados de `revisao_test.py` com `Chat` falso. Inclui:
    - O passthrough de código não chega ao `chat`.
    - O texto do `chat` trimado antes de medir o limite.
    - Encurtar que falha vira `truncar`.
    - `truncar` com os casos do Python.
    - Hook que falha derruba o lote.
  - `atelier.test.ts` e `distribution*.test.ts`, com o fetch global falso da Anthropic:
    - O proofread de um artigo com cerca, tabela e JSX devolve esses trechos idênticos (Review Focus 4).
    - O corpo enviado tem `model: 'claude-sonnet-5-5'` e não tem `temperature`.
    - Refine e hooks usam `claude-haiku-5-5`.
    - Um 529 vira 503 `claude_indisponivel`; o teto vira 429.

- [ ] **Step 1:** testes. **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** testes e `tsc` do ramielle, Jest e `tsc` do web, e `make test-promeia` e `make lint-promeia`, todos verdes.
- [ ] **Step 5:** commit `feat(ramielle): proofread, refine e hooks pela Claude; promeia fica só com a transcrição`.

### Task 9: conjunto pequeno de avaliação dos prompts

**Files:**

- Create:
  - `apps/ramielle/scripts/avaliar-revisao.ts`: script Node, roda com `ANTHROPIC_API_KEY` do ambiente do usuário e nunca no CI.
  - `apps/ramielle/scripts/__fixtures__/avaliacao/*.md`: 5 artigos curtos com erros plantados (crase, concordância, acento, digitação), cerca de código, tabela e JSX.
  - `apps/ramielle/scripts/__fixtures__/avaliacao/artigo-hooks.json`: dados para 3 plataformas.
  - `apps/ramielle/scripts/avaliar-revisao.test.ts`: testa só a nota, com respostas gravadas.
- Modify: `apps/ramielle/package.json`, script `eval:revisao`.

**Interfaces:** `avaliarProofread(original, esperado, obtido): { passthroughIdentico: boolean; errosCorrigidos: number; errosTotal: number; mudancasExtras: number }` e `avaliarHook(texto, limite): { dentroDoLimite: boolean; semUrl: boolean; semNome: boolean }`.

- [ ] **Step 1:** teste da nota com respostas gravadas.
  - Cerca alterada dá `passthroughIdentico: false`.
  - Uma palavra extra trocada fora dos erros plantados dá `mudancasExtras: 1`.
  - Hook com `https://` dá `semUrl: false`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS.
- [ ] **Step 5:** **não rodar contra a API sem o OK do usuário.** Custo estimado abaixo de US$ 0,05 por rodada. O critério de aceite vai no `CLAUDE.md` do ramielle: passthrough 5/5, erros ≥ 90%, extras ≤ 1 por artigo, hooks 3/3 nos três critérios.
- [ ] **Step 6:** commit, push e PR. O corpo traz a nota da rodada, se o usuário a autorizou, ou "pendente".

## PR4: resumo do post (`feat/ia-resumo`, a partir de `feat/ia-revisao`)

### Task 10: rota do resumo no ramielle

**Files:**

- Create:
  - `apps/ramielle/src/domain/revisao/resumo.ts`: `gerarResumo(entrada: { title: string; body: string }, chamar: (p: PedidoClaude) => Promise<RespostaClaude>): Promise<Resumo>` (em produção, `p => comOrcamento(db, {feature:'resumo', ...}, p)`), com `type Resumo = { tldr: string; metaDescription: string; tags: string[] }`.
    - Manda só os blocos de prosa do `body`, cortados em 24 000 caracteres.
    - Haiku, `maxTokens` 600, `formatoJson` com o schema dos três campos.
    - Valida: `tldr` 1-400 chars; `metaDescription` 50-160; `tags` 1-5, minúsculas, `^[a-z0-9-]+$`.
    - Inválido vira `ClaudeRecusou{motivo:'formato'}`.
  - `RESUMO_SYSTEM` em `prompts.ts`, em pt-BR: TL;DR em 2-3 frases na voz do autor (1ª pessoa); meta description para busca, sem aspas; tags curtas.
- Modify: `apps/ramielle/src/routes/atelier.ts`: `POST /admin/llm/resumo` (admin), feature `resumo`, que responde `okJson(resumo)`.
- Test:
  - `resumo.test.ts`: JSON válido passa. `metaDescription` com 161 chars, tag `"Next JS"`, JSON quebrado e `stop_reason: 'max_tokens'` viram `claude_recusou` (Review Focus 5). O conteúdo de cerca de código não está no `user` enviado.
  - `atelier.test.ts`: sem sessão admin, 401/403; com sessão, 200 e o shape.

- [ ] **Steps 1-4:** TDD como acima.
- [ ] **Step 5:** commit `feat(ramielle): resumo do post (tldr, meta description e tags) pela Claude`.

### Task 11: botão no editor e gravação no MDX

**Files:**

- Modify:
  - `apps/web/lib/admin/post-schema.ts`: `tldr: z.string().default('')` e `metaDescription: z.string().max(160).default('')`, nos `KNOWN_KEYS`.
  - `apps/web/lib/admin/atelier/api.ts`: `resumo(title, body)`.
  - `apps/web/components/admin/posts/post-meta-card.tsx`: monta o botão e os dois campos editáveis.
  - `apps/web/lib/blog-posts.ts`: lê `tldr` e `metaDescription`.
  - `apps/web/app/(site)/posts/[slug]/page.tsx`: TL;DR no topo, se houver, sem rótulo de IA; `generateMetadata` usa `description = metaDescription || excerpt`.
  - `apps/web/CLAUDE.md`
- Create:
  - `apps/web/components/admin/posts/resumo-button.tsx`, com `.test.tsx` e `.stories.tsx` (estados: ocioso, gerando, erro de teto, preenchido).
  - `onAplicar(r: Resumo)` preenche `tldr`, `metaDescription` e `tags` no estado do formulário. Quem grava é o "Salvar alterações" de sempre (PUT → commit no repo do blog).
  - A troca de tags pede confirmação inline (mostra as atuais e as sugeridas) quando já existem tags.
- Test:
  - `post-schema.test.ts`: o frontmatter antigo, sem os campos, ainda é válido; 161 chars na meta falham.
  - `resumo-button.test.tsx`: clique → chama a API → aplica; erro mostra `notifications[0].message`.
  - `lib/blog-posts.test.ts`: lê os campos. Teste de fronteira: `lib/blog-posts.ts` e `app/(site)/posts/[slug]/page.tsx` não importam `lib/admin/atelier` nem citam `ramielle` (nunca no ISR).
  - E2E `app/(admin)/admin/posts/atelier.e2e.ts`: com a rota do ramielle mockada, gerar → salvar → o PUT leva `tldr`/`metaDescription`.

- [ ] **Step 1:** testes. **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** Jest, `tsc`, lint, `pnpm --filter @piluvitu/web build` e o E2E do atelier, todos verdes; o build roda desacoplado da sessão.
- [ ] **Step 5:** commit, push e PR.

---

## Fora da fase 1

- Categorização (fase 2): só a decisão registrada no `CLAUDE.md` do financas (Task 6).
- Agente mensal, painel de uso de IA e alerta de gasto.
- Política de privacidade: não muda, porque nenhum dado de visitante ou eleitor vai para a IA. O que vai: totais do financas, o texto dos posts do próprio dono e o título.
