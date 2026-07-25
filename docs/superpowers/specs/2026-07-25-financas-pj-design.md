# Finanças PJ — Fatia ① Dívidas, parcelas e comprometimento futuro

**Data:** 2026-07-25
**Status:** Aprovado (design) — **spikes executados contra D1 real em 2026-07-25**, spec revisado com os números medidos. Nenhum spike pendente. Pronto para plano de implementação.
**Escopo:** Módulo pessoal de controle financeiro PJ/PF do dono do repo. **Fatia ①** entrega o modelo de dados completo, dívidas com pessoas físicas (com sub-itens e alocação de pagamento por item), parcelamento de cartão e a tela de comprometimento futuro. Sem import, sem LLM, sem PWA.
**Nova frente:** `apps/financas` — Cloudflare Worker (Hono + Static Assets) sobre D1, em subdomínio próprio, atrás do Cloudflare Access. **`apps/web` e `apps/api` não são tocados nesta fatia.**
**Fonte de design:** brainstorming 2026-07-25; discovery de repo + Open Finance BR (7 agentes); viabilidade Cloudflare free tier com verificação adversarial (19 agentes, 14 afirmações refutadas ou confirmadas contra `developers.cloudflare.com`).

---

## 0. Resultados dos spikes (medidos, não inferidos)

Executados em 2026-07-25 contra um D1 real e descartável, a partir de um Worker real (`wrangler dev --remote`, wrangler 4.114.0, `compatibility_date` 2026-07-01). O banco foi apagado no fim. **Quatro premissas da versão anterior deste spec caíram.**

| Item                          | O spec assumia                                     | Medido                                                                                 | Efeito                                                                        |
| ----------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `sqlite_version()`            | versão desconhecida (relato de 3.41.0)             | **função bloqueada** — `D1_ERROR: not authorized to use function: sqlite_version`      | Segue desconhecida; ver linha seguinte                                        |
| **STRICT tables**             | não usar — "exige >= 3.37, versão não documentada" | **funciona, e o tipo é aplicado** (INSERT de texto em coluna INTEGER falha)            | 🔴 **todas as tabelas passam a ser STRICT**; prova indireta de SQLite >= 3.37 |
| **VIEW**                      | "validar antes; pode divergir local/remoto"        | `CREATE VIEW` + `SELECT` sobre view funcionam                                          | ✅ ressalva removida                                                          |
| **TRIGGER**                   | "não funciona (workers-sdk#4998)"                  | **`CREATE TRIGGER` funciona e o trigger DISPARA** (`SQLITE_CONSTRAINT_TRIGGER`)        | 🔴 **§5.3 reescrito** — invariantes migram para o banco                       |
| **Foreign keys**              | não testado                                        | `PRAGMA foreign_keys = 1` por padrão, e INSERT órfão **falha**                         | ✅ todo `REFERENCES` do §5.2 tem efeito real                                  |
| **50 queries por invocação**  | "60 parcelas em 121 statements → **FALHA**"        | **batch de 200 statements: ok (210 ms). 200 queries sequenciais: ok (26,7 s)**         | 🔴 multi-row vira otimização, não requisito                                   |
| **`batch()` faz rollback?**   | "a doc se contradiz — testar"                      | **ROLLBACK REAL.** UNIQUE violado no 3º statement reverteu os 2 anteriores             | 🔴 resolvido a favor                                                          |
| **0 linhas afetadas**         | "não é erro; exige batch compensatório"            | **confirmado** — `success: true`, `changes: 0`, batch segue                            | ✅ mantido (mas não é mais o mecanismo da alocação)                           |
| **Trigger + rollback juntos** | _não previsto_                                     | `RAISE(ABORT)` aborta e **reverte o batch inteiro**; caminho feliz no teto exato passa | 🔴 elimina o batch compensatório                                              |

**Latência medida** (a favor do desenho, por outro motivo): 60 parcelas em 3 `INSERT` multi-row = **151 ms**; as mesmas 60 em statements individuais ≈ **8.000 ms**. Fator **53×**. O limite de **100 bound params por statement** é real e continua governando as 7 linhas (transactions, 14 colunas) e 20 linhas (installments, 5 colunas) por INSERT.

⚠️ **Ressalva de validade.** S1, S3 e o teste de trigger medem comportamento do **D1**, e valem sem ressalva. O S2 mede um limite de **invocação de Worker**, e foi observado via `wrangler dev --remote` — que roda no edge, mas pode não aplicar todos os limites de um Worker publicado. Registre o resultado como _"o limite de 50 queries não foi reproduzido em `dev --remote`"_, **não** como _"o limite não existe"_. O desenho não depende dessa distinção: o multi-row é seguro nos dois cenários.

**S4 (seats do Cloudflare Access) — encerrado sem medição, por escopo.** O módulo tem **um único usuário**. Qualquer patamar do Zero Trust Free (produto documentado da Cloudflare, que inclui Access) cobre 1 seat com folga; o número de 50 vinha de blog e era a única parte incerta, e ela deixou de importar. Não há spike pendente.

---

## 1. Objetivo

Dar ao dono uma resposta confiável para três perguntas que hoje ele responde de cabeça:

1. **Quanto eu devo, para quem, e de quê?** — incluindo dívidas com pessoas físicas compostas de vários itens ("devo R$ 1.360 ao meu pai, dentro disso tem Steam Deck e MacBook"), com a capacidade de responder _"o Steam Deck já está quitado?"_.
2. **Quanto da minha renda já está comprometido nos próximos meses?** — parcelas de cartão já assumidas, por competência de fatura.
3. **Quanto custa de verdade a minha PJ?** — o gap declarado de ~R$ 1.000/mês entre R$ 6.300 bruto e R$ 5.300 líquido (DAS + contador + INSS), hoje estimado e nunca medido.

### Contexto do dono (restrições reais que moldam o design)

| Fato                                                                                               | Consequência de design                                                    |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| PJ Simples Nacional, R$ 4.300 fixo + R$ 2.000 freela volátil                                       | Orçamento tem que ser sobre a **base fixa**, não sobre o total            |
| **Dor nº 1 declarada:** "tenho várias contas e o meu problema é aglutinar tudo com vários cartões" | Transferência entre contas próprias é o maior risco de mentira do sistema |
| Quer "diminuir o contato com essas coisas para ser o mais autônomo possível"                       | Backend não pode depender do MacBook estar ligado                         |
| Alvo de custo: **R$ 0/mês**                                                                        | Cloudflare free tier, com todos os seus tetos estruturais                 |
| Celular **Android**, notebook MacBook                                                              | Web Share Target é viável (não seria no iOS)                              |

### Não-objetivos (fatia ①)

- **Não** importar arquivo de banco (OFX/CSV/PDF) — fatia ②.
- **Não** usar LLM para nada — fatias ② e ③.
- **Não** conectar Open Finance — fatia ④.
- **Não** construir PWA offline — fatia ④.
- **Não** tocar em `apps/web` (Vercel) nem em `apps/api` (Go). Zero risco de regressão no que já funciona.
- **Não** construir a aba _Saúde financeira_ — três das cinco métricas dependem de essenciais **medidos**, que dependem de import. Gráfico antes do dado é gráfico que mente.

---

## 2. Veredito sobre Open Finance (decidido, não reaberto)

**Ser participante direto está descartado:** só instituição autorizada pelo BCB entra no diretório, e a porta mais barata (Instituição de Pagamento iniciadora) exige **R$ 1.000.000 de capital social integralizado e mantido**, mais certificados ICP-Brasil (BRSEAL/BRCAC/mTLS) e Certificação de Conformidade.

**O caminho viável é lateral e gratuito:** **Meu Pluggy (`meu.pluggy.ai`) + Conector 200**. É produto de pessoa física (CPF, sem CNPJ), descrito pela Pluggy como "gratuito por tempo indeterminado, sem limite de contas, desde que todas as contas sejam suas, nominais". O Conector 200 expõe essas conexões na API REST via uma Development Application. A entidade `Bill` entrega fatura completa (`dueDate`, `billClosingDate`, `totalAmount`, `minimumPaymentAmount`, `financeCharges`, `payments`) e é **obrigatória para toda instituição financeira no canal regulado** — Nubank, Itaú, Inter, C6, BB e Caixa estão todos cobertos.

**Três ressalvas registradas, a resolver na fatia ④:**

1. **Contradição não resolvida.** A documentação do Actual Budget afirma que só se pode _conectar_ contas ao `meu.pluggy.ai` enquanto o trial de 14–15 dias estiver ativo, o que conflita com o "gratuito por tempo indeterminado". Leitura provável: _conectar_ banco novo exige trial ativo, _ler_ dados continua. **Spike obrigatório de 1 hora antes de construir dependência.**
2. **Uso comercial é proibido no free.** Conectar o CPF de outra pessoa move para o plano de **R$ 2.500/mês**. Isso inviabiliza transformar o módulo em produto.
3. **Re-consentimento provavelmente anual.** A Resolução Conjunta nº 7/2023 removeu o teto de 12 meses, mas a prática varia por instituição. A UX deve tratar isso como esperado ("consentimento do Nubank vence em 12 dias"), não como falha.

**Alternativa paga se houver fricção:** Banco MCP (`banco.mcp.ai`), R$ 29,90/mês no plano Plus — 3 bancos + API REST, faturas de cartão e 12 meses de histórico.

**O import por arquivo (fatia ②) não é plano B — é o piso obrigatório.** O consentimento pode expirar, o agregador pode mudar de política, e a fatura do mês corrente às vezes só existe em PDF. Ele tem uma propriedade que o Open Finance não tem: nunca quebra por decisão de terceiro.

---

## 3. Arquitetura

```
                    ┌─────────────────────────────────────────┐
   Android / Mac ──▶│ financas.piluvitu.com.br                │
                    │ Cloudflare Access · Google · allowlist  │  free, single-user
                    └──────────────────┬──────────────────────┘
                                       │ JWT do Access (Cf-Access-Jwt-Assertion)
                    ┌──────────────────▼──────────────────────┐
                    │ Worker único (apps/financas)            │
                    │  ├─ Static Assets → SPA Vite + React    │  grátis, fora da cota
                    │  ├─ Hono /api/*   → envelope {ok,data}  │  ~14 kB
                    │  └─ Cron × 1, switch (event.cron)       │  5 triggers no free
                    └──────────────────┬──────────────────────┘
                                       ▼
                                  D1 (SQLite)
   ──────────────────────────────────────────────────────────────────────────
   piluvitu.com.br (Vercel)  →  blog, /tools, /tasks, /admin        INTOCADO
   promeia.piluvitu.com.br   →  Go API + Ollama (Cloudflare Tunnel) INTOCADA
                                 ▲
                                 └── entra só na fatia ③, via service token
```

### 3.1 Por que subdomínio próprio, e não `/financas` no site

Não é preferência estética. Resolve quatro problemas simultâneos, todos verificados no repo:

- `apps/web/public/manifest.json` **não declara `scope` nem `id`**, e `start_url: "/tasks"` faz o escopo default virar `/` — o Mini Kanban reivindica a origem inteira.
- `apps/web/public/sw.js` tem `CACHE_NAME = 'kanban-v1'` **fixo**, com `PRECACHE = ['/tasks','/manifest.json','/icons/icon.svg']` em cache-first: **quem já abriu `/tasks` recebe o manifest antigo para sempre**. O handler de fetch também retorna cedo em qualquer método ≠ GET, ou seja nunca interceptaria o POST de um Web Share Target.
- Permissão de notificação é concedida por origem.
- **Eviction de storage é por origem e all-or-nothing** — no mesmo domínio, uma eviction do navegador levaria junto o `kanban-state` do Kanban.

### 3.2 Por que SPA (Vite), e não Next.js

O bundle de Worker no free tier é **3 MB gzip**, e Next.js via `@opennextjs/cloudflare` não cabe. Hono ocupa ~14 kB. Consequência favorável: UI e API ficam **no mesmo host**, o que elimina de uma vez CORS, cookie cross-site e o teto de 4,5 MB de body da Vercel (que quebraria o fallback de share-target com PDF de fatura na fatia ③).

Workers Static Assets é **grátis, ilimitado e não consome a cota de 100.000 requests/dia** (20.000 arquivos por versão, 25 MiB por arquivo).

### 3.3 Autenticação: Cloudflare Access

Google OAuth com allowlist do e-mail do dono, **zero linha de código de autenticação** — contra 3–4 dias para reimplementar o equivalente ao `apps/api/internal/auth/`. É o único motivo de a fatia ① caber em uma semana.

O Worker valida o JWT em `Cf-Access-Jwt-Assertion` contra o JWKS do time. **O fetch do JWKS conta como 1 dos 50 subrequests e custa 50–150 ms** — as chaves ficam em cache no escopo do módulo (ou em KV).

⚠️ **Custom Domain na zona `piluvitu.com.br` é obrigatório, não preferência.** Publicar em `*.workers.dev` torna o domínio registrável diferente, o contexto vira cross-site, `SameSite=Lax` deixa de ser enviado, e **a quebra só aparece em produção**. `SameSite=None` não resolve: Safari (ITP) e Firefox (ETP) bloqueiam terceiros por padrão, o Chrome não — testa-se no Chrome, funciona, e quebra fora dele.

### 3.4 O que se ganha e o que se perde em relação à Go API

| Perde                                                     | Substituto                                                                                   |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `auth.RequireAdmin` + sessão Google + `scs/sqlite3store`  | Cloudflare Access                                                                            |
| `internal/backup` (`VACUUM INTO` → Google Drive, cron 3h) | **Time Travel de 7 dias** (30 no Paid) + GitHub Action agendada rodando `wrangler d1 export` |
| `internal/logging` com `request_id`                       | Reimplementar (~40 LOC)                                                                      |
| `migrate()` idempotente em Go                             | `wrangler d1 migrations` (forward-only, sem down)                                            |
| ~3.800 LOC de teste Go como rede de proteção              | `@cloudflare/vitest-pool-workers`                                                            |

| Ganha                                               |                                      |
| --------------------------------------------------- | ------------------------------------ |
| Uptime 100% independente do MacBook                 | é o requisito que motivou a escolha  |
| Custo R$ 0/mês                                      |                                      |
| Caminho aberto para sync automático (Cron + Pluggy) | impossível com o backend no notebook |

**O híbrido é permanente, não transitório.** Ollama exige GPU/Metal; nenhum instance type de Cloudflare Containers oferece GPU, e Containers exige o plano pago de qualquer forma. O Mac fica no desenho para sempre, restrito a parse de PDF e LLM.

---

## 4. Limites do free tier que moldam o design

Nenhum limite de **capacidade** chega perto de doer: 36.000 linhas (10 anos a ~300 lançamentos/mês) ocupam ~25 MB, ou **5% do teto de 500 MB por banco**. O que molda o design são tetos **estruturais**, sem escape no free:

| Limite                         | Free                                           | Paid (USD 5)     | Consequência                                                                                                                                     |
| ------------------------------ | ---------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **CPU por invocação**          | **10 ms**                                      | 30 s             | Parse de PDF **nunca** roda no Worker. Vai para o cliente ou para o Mac. `limits.cpu_ms` só existe no Paid; Cron/Queue/DO herdam os mesmos 10 ms |
| ~~Queries por invocação (D1)~~ | documentado 50                                 | 1.000            | ⚠️ **MEDIDO: não reproduzido** (§0). Batch de 200 e 200 sequenciais passaram. Multi-row segue como escolha, por latência (53×), não por correção |
| **Bound params por statement** | **100**                                        | 100              | Este é o limite real e ativo: 14 colunas → 7 linhas por `INSERT` multi-row                                                                       |
| **Bundle do Worker (gzip)**    | **3 MB**                                       | 10 MB            | Mata Next.js/OpenNext. Motiva a SPA                                                                                                              |
| Workers requests               | 100.000/dia                                    | ilimitado        | Uso pessoal: centenas/dia. Irrelevante                                                                                                           |
| Static Assets                  | **grátis, ilimitado**                          | idem             | **Fora** da cota de requests                                                                                                                     |
| D1 storage                     | 500 MB/db · 5 GB/conta · 10 dbs                | 10 GB/db         | ~5% de uso                                                                                                                                       |
| D1 rows read                   | 5.000.000/dia                                  | 25 bi/mês        | Com índices ≈ 2.500/render → ~2.000 renders/dia. **Sem** índice: 36k/query → ~13 renders/dia                                                     |
| **D1 rows written**            | **100.000/dia**                                | 50 M/mês         | Uso corrente ~50/dia. **Carga inicial de histórico estoura** (ver §8.5)                                                                          |
| Transação D1                   | só `batch()`                                   | só `batch()`     | `BEGIN`/`SAVEPOINT` rejeitados. **MEDIDO: `batch()` faz rollback real** — atomicidade suficiente (§0)                                            |
| Trigger / FK / STRICT / VIEW   | **todos funcionam**                            | idem             | **MEDIDO (§0)** — invariantes de soma vivem no banco via `RAISE(ABORT)`                                                                          |
| D1 Time Travel                 | 7 dias                                         | 30 dias          | Substitui o backup atual, com perda de janela                                                                                                    |
| Cron Triggers                  | **5/conta**                                    | 250              | Agrupar num Worker com `switch (event.cron)`                                                                                                     |
| Queues                         | 10k ops/dia, **retenção fixa 24 h**            | 1 M/mês, 14 dias | Ver §8.14 — não usar na fatia ②                                                                                                                  |
| Workers AI                     | 10.000 neurons/dia                             | + USD 0,011/1k   | Fallback de categorização, fatia ②                                                                                                               |
| Durable Objects (SQLite)       | 100k req/dia, 5 GB, **`transactionSync` real** | —                | Válvula de escape para atomicidade                                                                                                               |
| Zero Trust / Access            | Free inclui Access                             | —                | Número só aparece em blog, **não** em `developers.cloudflare.com`                                                                                |

---

## 5. Modelo de dados

### 5.1 Os cinco invariantes

| #   | Invariante                                                                   | Mecanismo                                                                                                                                      | Se violado                                                               |
| --- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1   | Dinheiro nunca é float                                                       | `INTEGER` em centavos, do schema à UI                                                                                                          | `0.1 + 0.2` — erro de centavo acumulado                                  |
| 2   | Toda PK é `TEXT` UUID (`crypto.randomUUID()` no cliente)                     | O binding do D1 devolve `INTEGER` como `Number` do JS (52 bits); e não há `last_insert_rowid()` confiável **entre statements de um `batch()`** | Perda silenciosa de precisão; impossível pré-montar batch de 60 parcelas |
| 3   | Transferência entre contas próprias = **2 linhas** com o mesmo `transfer_id` | Todo relatório de resultado filtra `transfer_id IS NULL`                                                                                       | Com muitas contas, PIX interno vira despesa e infla tudo                 |
| 4   | Três datas, três perguntas                                                   | `purchase_date`, `bill_competence`, `settled_at`                                                                                               | Impossível conciliar relatório com extrato                               |
| 5   | Colunas e índices de import nascem **agora**                                 | **Índice no D1 não pode ser alterado** — só dropado (irreversível) e recriado                                                                  | Migration 0001 errada custa caro                                         |

### 5.2 DDL

```sql
-- =====================================================================
-- migrations/0001_financas_init.sql   —  alvo: Cloudflare D1 (SQLite)
--
-- REGRAS DE COMPATIBILIDADE D1 — TODAS MEDIDAS EM 2026-07-25 (ver §0):
--  * Sem PRAGMA de conexão (journal_mode/busy_timeout não existem no D1;
--    a allowlist do D1 tem 17 PRAGMAs e os de conexão não estão nela).
--  * Sem BEGIN/COMMIT/SAVEPOINT: o D1 REJEITA. Atomicidade é via batch(),
--    que MEDIDO faz rollback real da sequência inteira (S3).
--  * TRIGGER FUNCIONA e dispara (S1/S5) — ao contrário do que a versão
--    anterior deste spec assumia com base em workers-sdk#4998. Por isso os
--    invariantes de soma vivem no BANCO, via RAISE(ABORT), e não na aplicação.
--  * FOREIGN KEY é aplicada de verdade: PRAGMA foreign_keys = 1 por padrão e
--    INSERT órfão falha (S1). Todo REFERENCES abaixo tem efeito real.
--  * STRICT funciona e o tipo é aplicado (S1) => todas as tabelas são STRICT.
--  * sqlite_version() é BLOQUEADA pelo D1 ("not authorized to use function").
--    A versão exata segue desconhecida; STRICT funcionar prova >= 3.37.
--  * Migrations são forward-only: não existe down migration.
--
-- CONVENÇÕES:
--  * PK TEXT (UUIDv4 gerado no cliente). Ver invariante 2.
--  * Dinheiro é INTEGER em centavos, nunca REAL.
--    2^53-1 centavos = R$ 90.071.992.547.409,91.
--  * Datas: TEXT ISO-8601 'YYYY-MM-DD' (ordenação lexicográfica ==
--    cronológica). Competência: TEXT 'YYYY-MM'. Timestamps: UTC 'Z'.
--  * STRICT em todas as tabelas: num livro-caixa, matar a afinidade de tipo
--    do SQLite vale o custo. Consequência: só INT/INTEGER/REAL/TEXT/BLOB/ANY
--    são tipos válidos, e toda coluna precisa de tipo declarado.
-- =====================================================================

-- ---------------------------------------------------------------------
-- accounts — "várias contas e vários cartões" é a dor declarada nº 1.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounts (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,

  -- Etiqueta PJ/PF. Fica na conta como DEFAULT do lançamento, não como
  -- verdade final (ver transactions.is_business).
  scope                 TEXT NOT NULL CHECK (scope IN ('PJ','PF')),

  -- O subtipo decide a SEMÂNTICA: só credit_card tem fatura, portanto só
  -- credit_card preenche transactions.bill_competence.
  kind                  TEXT NOT NULL
                        CHECK (kind IN ('checking','savings','credit_card',
                                        'cash','investment','benefit')),

  institution           TEXT,   -- 'Nubank','Inter','BB' — chave de matching no import (fatia ②)
  currency              TEXT NOT NULL DEFAULT 'BRL',

  -- Fechamento/vencimento moram AQUI, não em código: é o que permite
  -- derivar bill_competence de purchase_date sem regra hardcoded.
  -- Compra 28/07 num cartão que fecha dia 25 => competência '2026-08'.
  closing_day           INTEGER CHECK (closing_day BETWEEN 1 AND 31),
  due_day               INTEGER CHECK (due_day     BETWEEN 1 AND 31),
  credit_limit_cents    INTEGER,

  -- Saldo de abertura: extrato = opening_balance + SUM(transactions).
  -- Evita importar o histórico inteiro do banco só para o saldo bater —
  -- o que, além de trabalhoso, estouraria os 100k rows written/dia.
  opening_balance_cents INTEGER NOT NULL DEFAULT 0,
  opening_date          TEXT,

  archived_at           TEXT,   -- soft delete: conta encerrada não apaga histórico
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,

  -- Cartão sem dia de fechamento não calcula fatura nenhuma: barra na
  -- entrada em vez de gerar competência errada depois.
  CHECK (kind <> 'credit_card' OR (closing_day IS NOT NULL AND due_day IS NOT NULL))
) STRICT;

-- Índice PARCIAL: 90% das telas listam só contas ativas. No D1, índice
-- parcial não é só economia de espaço — é economia de cota de escrita,
-- porque só custa "row written" quando a linha CASA com o WHERE.
CREATE INDEX IF NOT EXISTS idx_accounts_scope
  ON accounts(scope, kind) WHERE archived_at IS NULL;

-- ---------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id            TEXT PRIMARY KEY,
  parent_id     TEXT REFERENCES categories(id) ON DELETE RESTRICT,
  name          TEXT NOT NULL,

  -- 'transfer' e 'debt_settlement' NÃO são receita nem despesa. São as
  -- duas classes que TODO relatório de resultado exclui. Pilar nº 2 do
  -- anti-dupla-contagem (o nº 1 é transactions.transfer_id) — ver §5.4.
  kind          TEXT NOT NULL
                CHECK (kind IN ('income','expense','transfer','debt_settlement')),

  -- slug estável para MEDIR o gap declarado de ~R$ 1.000/mês (DAS +
  -- contador + INSS) sem depender do texto digitado.
  -- Semear: 'das', 'contador', 'inss', 'pro-labore'.
  slug          TEXT,

  default_scope TEXT CHECK (default_scope IN ('PJ','PF')),
  archived_at   TEXT,
  created_at    TEXT NOT NULL,
  CHECK (parent_id IS NULL OR parent_id <> id)   -- hierarquia de 2 níveis; ciclo raso barrado
) STRICT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_slug
  ON categories(slug) WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_categories_parent
  ON categories(parent_id) WHERE parent_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- payees — credores, devedores, estabelecimentos e a PRÓPRIA PJ.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payees (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,

  -- Nome normalizado (upper, sem acento, sem sufixo de maquininha/cidade).
  -- Criado na fatia ① mesmo sem import: índice do D1 não é alterável.
  norm_name           TEXT NOT NULL,

  -- 'self_entity' = a PRÓPRIA PJ do dono. Permite modelar dívida com a
  -- própria empresa sem gambiarra: a PJ é um credor como outro qualquer,
  -- e o pagamento a ela é transferência interna (§5.4, caso C).
  kind                TEXT NOT NULL
                      CHECK (kind IN ('person','merchant','government','self_entity')),

  document            TEXT,   -- CPF/CNPJ sem máscara
  default_category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  created_at          TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS idx_payees_norm ON payees(norm_name);

-- ---------------------------------------------------------------------
-- transactions — o livro-caixa ÚNICO. Dois filtros (is_business, scope),
-- uma tabela. Tudo que é dinheiro passa por aqui e só por aqui.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
  id                    TEXT PRIMARY KEY,
  account_id            TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,

  -- VALOR COM SINAL: negativo = saída, positivo = entrada.
  -- Alternativa descartada: coluna `direction` + valor absoluto. Com sinal,
  -- saldo e fluxo de caixa são um SUM() coberto por índice; com direction,
  -- toda agregação vira CASE WHEN e o índice deixa de ajudar — e no D1
  -- "rows read" conta linhas ESCANEADAS, então perder índice custa COTA.
  amount_cents          INTEGER NOT NULL CHECK (amount_cents <> 0),

  currency              TEXT NOT NULL DEFAULT 'BRL',
  -- Compra em USD (Steam, AWS, Copilot): guarda o original e a taxa para o
  -- extrato reconciliar com a fatura em real. fx_rate em PARTES POR MILHÃO
  -- (taxa × 1e6, INTEGER): é o único lugar onde um REAL entraria, e REAL no
  -- SQLite é float64 — 5,4321 nunca volta exatamente 5,4321.
  amount_original_cents INTEGER,
  fx_rate_ppm           INTEGER CHECK (fx_rate_ppm IS NULL OR fx_rate_ppm > 0),
  CHECK (currency = 'BRL'
         OR (amount_original_cents IS NOT NULL AND fx_rate_ppm IS NOT NULL)),

  -- TRÊS DATAS, TRÊS PERGUNTAS DIFERENTES. Coração do schema:
  --  purchase_date   : quando o FATO aconteceu (competência do gasto).
  purchase_date         TEXT NOT NULL,
  --  bill_competence : em qual FATURA caiu ('YYYY-MM'). Sem esta coluna,
  --                    "quanto vem na fatura de agosto" obrigaria a
  --                    reimplementar a regra de fechamento em toda query
  --                    (e a regra muda por cartão). NULL fora de cartão.
  bill_competence       TEXT,
  --  settled_at      : quando o DINHEIRO se moveu. NULL = previsto (parcela
  --                    futura, fatura em aberto). Permite responder regime
  --                    de caixa E projeção a partir de UMA tabela só.
  settled_at            TEXT,

  description           TEXT NOT NULL,
  payee_id              TEXT REFERENCES payees(id)     ON DELETE SET NULL,
  category_id           TEXT REFERENCES categories(id) ON DELETE SET NULL,

  -- Etiqueta PJ/PF NO LANÇAMENTO, não só na conta. A conta dá o default;
  -- aqui é sobrescrevível porque na prática gasto de PJ cai em cartão PF —
  -- e é justamente esse caso que distorce a medição do custo real da PJ.
  is_business           INTEGER NOT NULL DEFAULT 0 CHECK (is_business IN (0,1)),

  -- TRANSFERÊNCIA ENTRE CONTAS PRÓPRIAS: DUAS linhas (saída em A, entrada
  -- em B) com o MESMO transfer_id. Mecanismo anti-dupla-contagem nº 1.
  -- Alternativa descartada: uma linha com account_from/account_to — quebra
  -- o SUM() por conta e obriga UNION em toda query de extrato.
  transfer_id           TEXT,

  -- RATEIO / ESTORNO: compra de mercado dividida em 'mercado' e 'pet' vira
  -- 1 linha pai (valor cheio, category_id NULL) + N filhas. Extrato usa os
  -- pais; relatório por categoria usa as folhas. CASCADE porque apagar o
  -- pai sem as filhas deixaria o caixa inconsistente.
  parent_id             TEXT REFERENCES transactions(id) ON DELETE CASCADE,
  CHECK (parent_id IS NULL OR parent_id <> id),

  -- IDEMPOTÊNCIA DE IMPORT: FITID do OFX, ou hash estável da linha do CSV.
  -- Coluna + índice único parcial criados JÁ na fatia ① porque índice no D1
  -- não pode ser alterado depois — só dropado (irreversível) e recriado.
  imported_id           TEXT,
  import_source         TEXT CHECK (import_source IS NULL OR
                          import_source IN ('manual','ofx','csv','pdf','pluggy','share-target')),

  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
) STRICT;

-- ÍNDICES — desenhados contra a COTA, não só contra latência. Cada índice
-- APLICÁVEL soma 1 "row written". Um lançamento comum (sem transfer, sem
-- import, sem fatura) casa com 3 dos 7 => 4 rows written, não 8. Por isso
-- quase todos são parciais.
CREATE INDEX IF NOT EXISTS idx_tx_account_date
  ON transactions(account_id, purchase_date);                 -- extrato por conta
CREATE INDEX IF NOT EXISTS idx_tx_settled
  ON transactions(settled_at) WHERE settled_at IS NOT NULL;   -- fluxo realizado
CREATE INDEX IF NOT EXISTS idx_tx_bill
  ON transactions(account_id, bill_competence)
  WHERE bill_competence IS NOT NULL;                          -- "o que vem na fatura de X"
CREATE INDEX IF NOT EXISTS idx_tx_category
  ON transactions(category_id, purchase_date)
  WHERE category_id IS NOT NULL;
-- Igualdade ANTES do range: is_business é igualdade, purchase_date é range.
CREATE INDEX IF NOT EXISTS idx_tx_business
  ON transactions(is_business, purchase_date);
CREATE INDEX IF NOT EXISTS idx_tx_transfer
  ON transactions(transfer_id) WHERE transfer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tx_parent
  ON transactions(parent_id)   WHERE parent_id   IS NOT NULL;
-- Dedupe do import. Único POR CONTA porque FITID só é único dentro da
-- instituição; global daria colisão entre bancos.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tx_imported
  ON transactions(account_id, imported_id) WHERE imported_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- installment_plans / installments — parcelamento.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS installment_plans (
  id                 TEXT PRIMARY KEY,
  account_id         TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  payee_id           TEXT REFERENCES payees(id)     ON DELETE SET NULL,
  category_id        TEXT REFERENCES categories(id) ON DELETE SET NULL,
  description        TEXT NOT NULL,

  -- total_cents é a soma EXATA das parcelas, não o preço de tabela.
  -- Arredondamento: R$ 100,00 em 3x = 3334 + 3333 + 3333. O resto de
  -- (total_cents % n) vai nas PRIMEIRAS parcelas, que é o que os emissores
  -- brasileiros fazem. Invariante SUM(parcelas) = total_cents validado no batch.
  total_cents        INTEGER NOT NULL CHECK (total_cents > 0),
  installments_count INTEGER NOT NULL CHECK (installments_count BETWEEN 1 AND 360),

  purchase_date      TEXT NOT NULL,
  first_competence   TEXT NOT NULL,   -- 'YYYY-MM' da 1ª fatura
  is_business        INTEGER NOT NULL DEFAULT 0 CHECK (is_business IN (0,1)),
  canceled_at        TEXT,            -- antecipação/quitação encerra o plano sem apagar histórico
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS installments (
  id             TEXT PRIMARY KEY,
  plan_id        TEXT NOT NULL REFERENCES installment_plans(id) ON DELETE CASCADE,
  seq            INTEGER NOT NULL CHECK (seq >= 1),
  due_date       TEXT NOT NULL,

  -- DECISÃO CENTRAL: cada parcela materializa UMA transaction, criada JÁ NO
  -- ATO da compra, com settled_at NULL e bill_competence preenchida.
  --  * O dinheiro tem UMA fonte da verdade (transactions); installments
  --    guarda apenas metadado de cronograma (seq, vencimento).
  --  * "Quanto já está comprometido nos próximos 6 meses" vira UMA query
  --    indexada em transactions, sem tabela de projeção.
  --  * Quando a fatura é paga, o import só preenche settled_at — não cria
  --    linha nova, então previsto e realizado nunca se somam.
  -- Alternativa descartada: materializar só quando a parcela cai na fatura
  -- — some a visibilidade do comprometimento futuro, que é exatamente o
  -- que dói com vários cartões.
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,

  created_at     TEXT NOT NULL,
  UNIQUE (plan_id, seq)
) STRICT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_installments_tx ON installments(transaction_id);

-- ORÇAMENTO DE BATCH — REVISADO APÓS MEDIÇÃO (S2, ver §0).
-- Plano de 60 parcelas:
--    1  INSERT installment_plans
--    9  INSERT transactions  multi-row (14 colunas => 7 linhas/statement)
--    3  INSERT installments  multi-row ( 5 colunas => 20 linhas/statement)
--  = 13 statements.
--
-- A versão anterior deste spec dizia que 1 statement por parcela (121 no
-- total) FALHARIA por causa do limite de 50 queries/invocação. MEDIDO: não
-- falha — batch de 200 statements passou (210 ms), e 200 queries sequenciais
-- também (26,7 s). O multi-row continua sendo o desenho certo, mas por
-- LATÊNCIA, não por correção: 60 parcelas em 3 statements levam 151 ms
-- contra ~8.000 ms sequencial (53x). O limite de 100 bound params por
-- statement esse sim é real e continua governando as 7/20 linhas por INSERT.

-- ---------------------------------------------------------------------
-- debts / debt_items / debt_payments / debt_payment_allocations
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS debts (
  id            TEXT PRIMARY KEY,

  -- Credor/devedor é um payee. Pessoa física E entidade própria caem no
  -- mesmo modelo (payees.kind = 'person' | 'self_entity').
  payee_id      TEXT NOT NULL REFERENCES payees(id) ON DELETE RESTRICT,

  -- Direção decide a semântica de caixa (§5.4):
  --  'i_owe'      : eu devo. A COMPRA original geralmente NÃO está no meu
  --                 caixa (outra pessoa pagou) => debt_items.transaction_id NULL.
  --  'owed_to_me' : me devem. A compra ESTÁ no meu caixa (paguei no meu
  --                 cartão) => debt_items.transaction_id aponta pra ela.
  direction     TEXT NOT NULL CHECK (direction IN ('i_owe','owed_to_me')),

  title         TEXT NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'BRL',
  opened_at     TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open'
                CHECK (status IN ('open','settled','written_off')),
  settled_at    TEXT,
  notes         TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  CHECK (status <> 'settled' OR settled_at IS NOT NULL)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_debts_open
  ON debts(payee_id, direction) WHERE status = 'open';

-- O item responde "o Steam Deck já está quitado?".
CREATE TABLE IF NOT EXISTS debt_items (
  id             TEXT PRIMARY KEY,
  debt_id        TEXT NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
  description    TEXT NOT NULL,                              -- 'Steam Deck OLED 1TB'
  amount_cents   INTEGER NOT NULL CHECK (amount_cents > 0),  -- SEMPRE positivo: é ESTOQUE, não fluxo
  incurred_on    TEXT NOT NULL,

  -- Link OPCIONAL para a compra original no livro-caixa. NUNCA usado para
  -- gerar lançamento: debt_items é dimensão PATRIMONIAL. Quem toca no caixa
  -- é debt_payments. Essa separação é o que torna a dupla contagem
  -- estruturalmente impossível (§5.4).
  -- ON DELETE SET NULL: apagar o lançamento não pode apagar a dívida.
  transaction_id TEXT REFERENCES transactions(id) ON DELETE SET NULL,

  category_id    TEXT REFERENCES categories(id) ON DELETE SET NULL,
  created_at     TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS idx_debt_items_debt ON debt_items(debt_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_debt_items_tx
  ON debt_items(transaction_id) WHERE transaction_id IS NOT NULL;  -- 1 compra = 1 item

CREATE TABLE IF NOT EXISTS debt_payments (
  id             TEXT PRIMARY KEY,
  debt_id        TEXT NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
  paid_on        TEXT NOT NULL,
  amount_cents   INTEGER NOT NULL CHECK (amount_cents > 0),

  -- 'cash'     : houve movimento de dinheiro => transaction_id OBRIGATÓRIO.
  -- 'offset'   : encontro de contas (ele me devia, abateu) => sem caixa.
  -- 'forgiven' : perdão/baixa => sem caixa.
  kind           TEXT NOT NULL DEFAULT 'cash'
                 CHECK (kind IN ('cash','offset','forgiven')),

  -- O ELO com o livro-caixa. 1:1 forçado pelo índice único abaixo — impede
  -- que um mesmo lançamento seja reaproveitado por dois pagamentos.
  transaction_id TEXT REFERENCES transactions(id) ON DELETE RESTRICT,
  CHECK (kind <> 'cash' OR transaction_id IS NOT NULL),
  CHECK (kind =  'cash' OR transaction_id IS NULL),

  notes          TEXT,
  created_at     TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS idx_debt_payments_debt ON debt_payments(debt_id, paid_on);
CREATE UNIQUE INDEX IF NOT EXISTS uq_debt_payments_tx
  ON debt_payments(transaction_id) WHERE transaction_id IS NOT NULL;

-- ALOCAÇÃO pagamento -> item. Tabela própria (N:N) e não coluna item_id em
-- debt_payments, porque um pagamento de R$ 500 pode cobrir R$ 300 do Steam
-- Deck e R$ 200 do jantar. É essa granularidade que responde "o Steam Deck
-- já está quitado?" quando os pagamentos foram genéricos.
CREATE TABLE IF NOT EXISTS debt_payment_allocations (
  id           TEXT PRIMARY KEY,
  payment_id   TEXT NOT NULL REFERENCES debt_payments(id) ON DELETE CASCADE,
  item_id      TEXT NOT NULL REFERENCES debt_items(id)    ON DELETE RESTRICT,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  created_at   TEXT NOT NULL,

  -- Impede alocar o MESMO pagamento duas vezes ao MESMO item.
  UNIQUE (payment_id, item_id)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_alloc_item ON debt_payment_allocations(item_id);

-- INVARIANTES DE SOMA NO BANCO (I1 e I2). Possível porque o S1/S5 mediram
-- que TRIGGER funciona no D1 remoto e o S3 mediu que batch() faz rollback
-- real: um RAISE(ABORT) aqui aborta a sequência inteira, sem deixar rastro.
-- Isto SUBSTITUI o padrão de "INSERT guardado + inspeção de meta.changes +
-- batch compensatório" que a versão anterior deste spec exigia.

-- (I2) a soma alocada a um item nunca passa do valor do item.
CREATE TRIGGER IF NOT EXISTS trg_alloc_item_teto
BEFORE INSERT ON debt_payment_allocations
BEGIN
  SELECT RAISE(ABORT, 'alocacao excede o valor do item')
  WHERE (SELECT amount_cents FROM debt_items WHERE id = NEW.item_id)
        < NEW.amount_cents + COALESCE(
            (SELECT SUM(amount_cents) FROM debt_payment_allocations
              WHERE item_id = NEW.item_id), 0);
END;

-- (I1) a soma alocada por um pagamento nunca passa do valor do pagamento.
CREATE TRIGGER IF NOT EXISTS trg_alloc_pagamento_teto
BEFORE INSERT ON debt_payment_allocations
BEGIN
  SELECT RAISE(ABORT, 'alocacao excede o valor do pagamento')
  WHERE (SELECT amount_cents FROM debt_payments WHERE id = NEW.payment_id)
        < NEW.amount_cents + COALESCE(
            (SELECT SUM(amount_cents) FROM debt_payment_allocations
              WHERE payment_id = NEW.payment_id), 0);
END;

-- ---------------------------------------------------------------------
-- VIEWS — MEDIDO (S1): CREATE VIEW e SELECT sobre view funcionam no D1
-- remoto. A ressalva de "validar antes" da versão anterior está resolvida.
-- ---------------------------------------------------------------------

-- "O Steam Deck já está quitado?" em uma linha.
CREATE VIEW IF NOT EXISTS v_debt_item_balance AS
SELECT i.id            AS item_id,
       i.debt_id,
       i.description,
       i.amount_cents,
       COALESCE(SUM(a.amount_cents), 0)                  AS allocated_cents,
       i.amount_cents - COALESCE(SUM(a.amount_cents), 0) AS remaining_cents,
       CASE WHEN i.amount_cents - COALESCE(SUM(a.amount_cents), 0) <= 0
            THEN 1 ELSE 0 END                            AS is_settled
FROM debt_items i
LEFT JOIN debt_payment_allocations a ON a.item_id = i.id
GROUP BY i.id;

-- Fluxo de caixa REALIZADO. As duas exclusões são o anti-dupla-contagem:
--   transfer_id IS NULL -> não conta as duas pernas de uma transferência
--   parent_id   IS NULL -> conta o pai (valor cheio), nunca pai + filhas
CREATE VIEW IF NOT EXISTS v_cashflow AS
SELECT t.*, substr(t.settled_at, 1, 7) AS competence_month
FROM transactions t
WHERE t.settled_at IS NOT NULL
  AND t.transfer_id IS NULL
  AND t.parent_id  IS NULL;
```

### 5.3 Invariantes de soma — vivem no banco

Dois invariantes governam a alocação de pagamento a item:

- **(I1)** `SUM(alocações do pagamento) <= debt_payments.amount_cents`
- **(I2)** `SUM(alocações do item) <= debt_items.amount_cents`

**Ambos são `TRIGGER ... BEFORE INSERT ... RAISE(ABORT)` no D1** (DDL em §5.2). Isso só é possível porque três coisas foram **medidas** em 2026-07-25 (§0):

1. `CREATE TRIGGER` funciona no D1 remoto — a versão anterior deste spec assumia que não, com base em workers-sdk#4998;
2. o trigger **dispara** de verdade (`SQLITE_CONSTRAINT_TRIGGER`), não é DDL decorativo;
3. `batch()` faz **rollback real** da sequência inteira quando um statement aborta.

Consequência: uma tentativa de superalocação derruba o `batch()` completo e **não deixa rastro** — nem o pagamento, nem o lançamento no caixa, nem alocação parcial. A aplicação só precisa tratar o erro e mostrar mensagem; **não há batch compensatório, não há inspeção de `meta.changes`, não há janela de inconsistência.**

Medição de referência, contra D1 real (item com teto de 1000):

```
batch([ alloc 300 , alloc 900 ])
  → D1_ERROR: superalocacao … SQLITE_CONSTRAINT_TRIGGER
  → linhas restantes: []            ← reverteu inclusive o INSERT de 300

batch([ alloc 300 , alloc 700 ])    ← exatamente no teto
  → ok, soma = 1000                 ← sem falso positivo
```

**O que continua valendo:** `INSERT ... SELECT ... WHERE <falso>` afeta 0 linhas, e **0 linhas não é erro** (`success: true`, `changes: 0`) — o batch segue. Isso importa para qualquer outro lugar onde se use INSERT condicional; só não é mais o mecanismo da alocação.

**Válvula de escape não usada:** Durable Object com `ctx.storage.transactionSync()` (disponível no Workers Free). Deixa de ser necessário para este caso.

### 5.4 Como o pagamento de dívida aparece nos dois lugares

**Em uma frase:** `debt_items` é **estoque** (dimensão patrimonial) e nunca gera lançamento; `debt_payments` é **fluxo** e gera **exatamente um** lançamento em `transactions`, ligado 1:1 por `uq_debt_payments_tx`. Os dois nunca se somam porque medem grandezas diferentes — a dupla contagem não é evitada por regra de relatório, é **estruturalmente impossível**.

Um pagamento de R$ 500 alocado em dois itens = **um `batch()` de 5 statements**, com todos os UUIDs gerados antes:

```
1. INSERT transactions (id=tx1, account_id=<conta real>, amount_cents=-50000,
     purchase_date=hoje, settled_at=hoje, transfer_id=NULL,
     category_id=<categoria kind='debt_settlement'>, description='Pgto dívida — Pai')
2. INSERT debt_payments (id=p1, debt_id=d1, amount_cents=50000,
     kind='cash', transaction_id=tx1)                    -- elo 1:1 com o caixa
3. INSERT debt_payment_allocations (R$ 300 -> Steam Deck)  -- triggers I1/I2 vigiam
4. INSERT debt_payment_allocations (R$ 200 -> MacBook)     -- triggers I1/I2 vigiam
5. UPDATE debts SET status='settled', settled_at=? WHERE id=d1
     AND NOT EXISTS (SELECT 1 FROM v_debt_item_balance WHERE debt_id=d1 AND is_settled=0)
```

Se qualquer alocação estourar o teto do item ou do pagamento, o trigger aborta e **o batch inteiro reverte** — o lançamento de −R$ 500 no caixa não fica órfão. Basta capturar o erro e informar o usuário.

| Visão                 | Query                                                                | Aparece                                |
| --------------------- | -------------------------------------------------------------------- | -------------------------------------- |
| Fluxo de caixa        | `SUM(amount_cents) FROM v_cashflow WHERE competence_month='2026-07'` | **1×** (−50000)                        |
| Saldo da dívida       | `SELECT * FROM v_debt_item_balance WHERE debt_id='d1'`               | **1×** (allocated +500)                |
| Despesa por categoria | `... WHERE c.kind='expense'`                                         | **0×** (categoria é `debt_settlement`) |
| Saldo da conta        | `opening_balance + SUM(amount_cents) WHERE account_id=X`             | **1×**                                 |

**Os três casos, e onde o erro nasceria:**

- **Caso A — eu devo, a compra nunca foi minha.** O pai comprou o Steam Deck de R$ 2.800. Nada saiu da conta do dono, logo `debt_items.transaction_id = NULL` e **nenhuma transaction existe na compra**. Cada pagamento cria a sua. Zero risco.
- **Caso B — me devem, a compra foi minha.** Comprou no próprio cartão para um amigo: a transaction de −R$ 3.200 **existe e é real**. `debt_items.transaction_id` aponta para ela. Quando o amigo paga, entra +R$ 500 — **é aqui que o erro nasce:** classificar isso como `kind='income'` infla o faturamento e **distorce o cálculo do DAS** e a medição do gap de R$ 1.000/mês. Obrigatório `kind='debt_settlement'`. O item continua **não** gerando lançamento: a despesa já foi contada uma vez, na compra.
- **Caso C — dívida com a entidade própria** (`payees.kind='self_entity'`). Pagar a PJ é mover dinheiro entre duas contas do dono: **duas** transactions com o mesmo `transfer_id`, e `debt_payments.transaction_id` aponta para **a perna que sai da conta pagadora**. `v_cashflow` filtra `transfer_id IS NULL`, então o consolidado ignora (correto — patrimônio não mudou), enquanto o saldo de cada conta reflete os dois lados. Sem `transfer_id`, este caso contaria R$ 500 de despesa PF **e** R$ 500 de receita PJ que não existem.

---

## 6. Telas da fatia ①

```
┌─ CONTAS ────────────────────────┐   ┌─ DÍVIDA · "Pai" ──────────────────────┐
│ PF                              │   │ deve R$ 1.360 de R$ 7.300             │
│  Nubank ............ 2.340,12   │   │ ████████████████████░░░░  81%         │
│  Nubank cartão ..... −1.847,90  │   │                                       │
│    fecha 25 · vence 05          │   │ ITENS         total    pago   falta   │
│  Inter ............... 890,00   │   │  MacBook Air  4.500   4.500      0  ✓ │
│  Dívida — Pai ...... −1.360,00  │   │  Steam Deck   2.800   1.440  1.360    │
│ PJ                              │   │                                       │
│  Inter PJ .......... 4.120,00   │   │ PAGAMENTOS                            │
│                                 │   │  05/03  1.000  → MacBook 1.000        │
│ [+ conta]                       │   │  05/04  1.000  → MacBook 1.000        │
└─────────────────────────────────┘   │  10/05  2.940  → MacBook 1.500        │
                                      │                → Steam   1.440        │
                                      │ [+ pagamento]                         │
                                      └───────────────────────────────────────┘
┌─ COMPROMETIDO ─────────────────────────────────────────────────────────────┐
│                    ago      set      out      nov      dez      jan        │
│ Nubank cartão      1.240    1.240    1.240      890      890      890      │
│ Inter cartão         420      420      420      420        —        —      │
│ Dívida — Pai         500      500      360        —        —        —      │
│                   ─────    ─────    ─────    ─────    ─────    ─────       │
│ TOTAL              2.160    2.160    2.020    1.310      890      890      │
│ % do líquido fixo   60%      60%      56%      36%      25%      25%   🔴  │
└────────────────────────────────────────────────────────────────────────────┘
```

Quatro telas: **Contas**, **Lançamento manual**, **Dívida (detalhe)** e **Comprometido**.

A tela **Comprometido** é a que justifica o projeto: mostra que 60% da renda fixa já está comprometida em agosto antes de qualquer compra nova. Sai de graça do modelo de parcelas (`settled_at IS NULL` agrupado por `bill_competence`), sem import, sem banco, sem LLM.

O denominador de _"% do líquido fixo"_ é **R$ 3.600** — o líquido em mês **sem** freela (§11), nunca R$ 5.300. Usar o líquido com freela aqui esconderia exatamente o risco que a tela existe para mostrar.

---

## 7. Estratégia de testes

Colocation, conforme a lei do projeto no `CLAUDE.md` raiz: teste ao lado do fonte, sempre.

| Camada                        | Ferramenta                            | Nota                                                                                                                                                 |
| ----------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/tools/src/money.ts` | **Jest** (infra existente)            | **Primeiro arquivo do projeto** — hoje não existe nenhum utilitário de moeda no repo; formatação é `toLocaleString('pt-BR')` inline em 5 componentes |
| Worker + D1                   | **`@cloudflare/vitest-pool-workers`** | Roda 100% local em Miniflare, **sem secret e sem `wrangler login`**. Helper oficial `applyD1Migrations()`                                            |
| SPA                           | Vitest + Testing Library              | —                                                                                                                                                    |
| E2E                           | Playwright                            | ⚠️ **O Cloudflare Access bloqueia o Playwright.** Exige service token ou policy de bypass para o CI                                                  |

⚠️ **Vitest e Jest convivendo no mesmo monorepo é o item mais subestimado de toda a estimativa.** `apps/web` é Jest; o Worker exige Vitest. Não é difícil, é chato, e some das estimativas.

Composição dos ~7 dias da fatia ① (o dia de teste está **dentro**, não somado):

| Etapa                                                                                         |    Dias |
| --------------------------------------------------------------------------------------------- | ------: |
| `wrangler` + D1 + Access + Custom Domain (spikes já feitos)                                   |     0,5 |
| `money.ts` + schema + migration 0001                                                          |     0,5 |
| Hono + envelope + validação do JWT do Access (com cache de JWKS)                              |     1,0 |
| CRUD de contas/lançamentos + dívidas/itens/pagamentos/alocação + gerador de parcelas em batch |     2,0 |
| SPA (4 telas)                                                                                 |     2,0 |
| `vitest-pool-workers` convivendo com Jest + os 6 casos inegociáveis                           |     1,0 |
| **Total**                                                                                     | **7,0** |

### Casos de teste inegociáveis

1. Plano de 60× gera 60 parcelas e `SUM(parcelas) == total_cents` **até o último centavo** (R$ 100 em 3× = 3334+3333+3333)
2. Pagamento de R$ 500 alocado em 2 itens: sai **1×** do caixa, sobe **1×** na dívida, aparece **0×** no relatório de despesa
3. Superalocação (alocar R$ 900 num item de R$ 1.000 que já tem R$ 300 alocados) → trigger aborta → **nada persiste**, nem o pagamento nem o lançamento no caixa. E o caso de borda: alocar exatamente até o teto **passa**
4. Transferência entre contas próprias não aparece em nenhum relatório de resultado
5. Compra 28/07 em cartão que fecha dia 25 → `bill_competence = '2026-08'`
6. **Fuso:** gasto às 22h do dia 31 em Teresina (UTC−3, sem horário de verão) não vira dia 1 do mês seguinte. `datetime('now')` no SQLite grava UTC — datas são gravadas como `TEXT` `YYYY-MM-DD` **local**

---

## 8. Riscos e armadilhas

**Da plataforma**

1. **CPU 10 ms por invocação, sem escape no free.** JWT RS256 ≈ 1 ms, serializar 300 linhas ≈ 2–4 ms — cabe. Parse de PDF, hash de arquivo, render de relatório em JS — não cabe. Parse roda no cliente ou no Mac, **nunca** no Worker.
2. ~~**50 queries por invocação.**~~ **RESOLVIDO (S2)** — não reproduzido: batch de 200 statements e 200 queries sequenciais passaram. O multi-row de §5.2 permanece por latência (53×), não por correção. O limite real e ativo é **100 bound params por statement**.
3. ~~**Sem transação interativa.**~~ **RESOLVIDO (S3/S5)** — `batch()` faz rollback real, e triggers com `RAISE(ABORT)` abortam a sequência inteira. Os invariantes de soma vivem no banco (§5.3). `BEGIN`/`SAVEPOINT` seguem rejeitados, mas deixaram de ser necessários.
4. ~~**A documentação do `batch()` se contradiz.**~~ **RESOLVIDO (S3)** — na prática **faz rollback**. UNIQUE violado no 3º de 4 statements reverteu os 2 anteriores.
5. **Carga inicial de histórico estoura a cota de escrita.** 36.000 linhas × (1 tabela + ~4 índices aplicáveis) ≈ **180.000 rows written** contra **100.000/dia**. O D1 **corta**, não faz throttle — o import morre no meio. Mitigação: criar as tabelas **sem índices**, importar, rodar os `CREATE INDEX` depois; ou dividir em 2 dias. Relevante na fatia ②.
6. **`rows read` conta scan, não result set.** Sem índice, agregação = 36k rows read/query → ~13 renders/dia. Com os índices de §5.2 → ~2.000 renders/dia. **A diferença entre viável e morto é literalmente o índice — e índice no D1 não pode ser alterado.**
7. **`INTEGER` volta como `Number` do JS, nunca `BigInt`.** Centavos são seguros (teto R$ 90 trilhões); qualquer id numérico grande não é. Daí PKs em TEXT. `wrangler d1 export` tem a mesma limitação de 52 bits.
8. **Bundle 3 MB gzip mata Next.js/OpenNext** — motiva a SPA (§3.2).
9. **`VACUUM INTO` não existe no D1.** `apps/api/internal/backup` **não porta**. Substitutos: Time Travel 7 dias + GitHub Action agendada com `wrangler d1 export --remote` (gera **SQL, não `.sqlite`**, não roda de dentro do Worker, e **bloqueia outras queries enquanto executa**).
10. **Cookie:** Custom Domain obrigatório (§3.3).
11. **Access:** o fetch do JWKS conta como **1 dos 50 subrequests** e custa 50–150 ms — cachear as chaves no escopo do módulo. (A dúvida sobre seats foi encerrada: 1 usuário.)
12. **O PWA do Kanban atrapalha** — verificado no repo (§3.1). Subdomínio resolve.
13. **RP ID do WebAuthn/passkey tem que ser decidido AGORA**, antes do subdomínio: registrar em `financas.piluvitu.com.br` não vale em `piluvitu.com.br`, e **mudar o RP ID depois invalida todas as passkeys existentes**.
14. **Queues no free: retenção fixa de 24 h**, não configurável. Consumer parado 1 dia = mensagem descartada em silêncio. Para ~10 lançamentos/dia, **não usar Queues na fatia ②** — ir direto de Cron + tabela de outbox no D1.
15. **Cron: 5 triggers por conta no free.** Fechamento, alerta de vencimento, export de backup e sync do Pluggy já são 4. Agrupar num Worker só com `switch (event.cron)` **desde o início**.
16. **Migrations forward-only, sem down.** `PRAGMA` no D1 só vale para a transação corrente; rebuild de tabela usa `PRAGMA defer_foreign_keys = true` dentro do batch.
17. ~~**Sem triggers no schema** (workers-sdk#4998).~~ **RESOLVIDO (S1/S5)** — trigger cria e dispara. Os invariantes de soma são do banco, não da aplicação.
18. **Versão do SQLite do D1 continua desconhecida** — `sqlite_version()` é **bloqueada** pelo D1 (`not authorized to use function`), então não dá para consultar por SQL. Mitigado empiricamente: `STRICT`, CTE recursivo e window functions **todos funcionam** (S1), o que implica >= 3.37. Risco residual: um recurso de SQLite mais novo pode faltar sem aviso.
19. **A rede de proteção some.** ~3.807 LOC de teste Go não migram.
20. **Ollama exige GPU/Metal.** Nenhum instance type de Containers tem GPU, e Containers exige o Paid. **O híbrido é permanente.**

**De modelagem (valem para qualquer stack)**

21. **Pagamento de fatura contado como despesa.** Importar a fatura (60 lançamentos, R$ 3.200) _e_ o extrato (débito de R$ 3.200) faz o mês virar R$ 6.400. O pagamento tem que ser **transferência conta→cartão**. Mitigado por `transfer_id` desde a fatia ①.
22. **Parcelamento cruzando ano.** Compra em 12× em novembro cai até outubro do ano seguinte. Materializar as parcelas no ato da compra (§5.2) resolve.
23. **Estorno, cashback, IOF e anuidade.** IOF às vezes vem como linha separada; estorno é valor negativo e quebra o guardrail de soma se tratado como despesa. Fatia ②.
24. **Fuso horário.** Ver caso de teste 6.
25. **PJ e PF misturados.** DAS, contador e pró-labore como "despesa do mês" fazem o app dizer que o dono gasta R$ 6.000 de vida pessoal. Mitigado por `is_business` + `categories.slug`.

---

## 9. Spikes

**S1, S2, S3 e S5 foram executados em 2026-07-25** contra D1 real. Resultados completos em §0; o spec foi reescrito com base neles.

| #      | Spike                                                     | Status              | Resultado                                                                    |
| ------ | --------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------- |
| **S1** | Versão do SQLite + STRICT/VIEW/TRIGGER/FK no D1 remoto    | ✅ feito            | `sqlite_version()` bloqueada; STRICT, VIEW, TRIGGER e FK **todos funcionam** |
| **S2** | Limite de queries por invocação                           | ✅ feito (ressalva) | Não reproduzido em `dev --remote`: batch de 200 e 200 sequenciais passaram   |
| **S3** | `batch()` faz rollback? 0 linhas é erro?                  | ✅ feito            | **Rollback real**; 0 linhas não é erro (`success: true`, `changes: 0`)       |
| **S5** | Trigger `RAISE(ABORT)` + rollback juntos _(não previsto)_ | ✅ feito            | Aborta e reverte o batch inteiro; caminho feliz no teto exato passa          |
| **S4** | Seats do Cloudflare Access                                | ➖ dispensado       | Módulo é single-user; qualquer patamar do Zero Trust Free cobre 1 seat       |

**Nenhum spike pendente.** O S4 foi dispensado por escopo (single-user), não por medição — se um dia o módulo ganhar um segundo usuário, revisitar.

Spike adicional, antes da **fatia ④**: conectar 1 banco ao `meu.pluggy.ai`, esperar o trial de 14–15 dias vencer, tentar `GET /bills`.

### Harness

O harness usado vive fora do repo (scratchpad da sessão), como Worker + `wrangler dev --remote` contra um D1 descartável apagado ao fim. Para reproduzir: um Worker com binding D1 e uma rota por medição — **uma medição por invocação**, senão o próprio teste consome a cota que ele mede.

---

## 10. Fatiamento

|       | Escopo                                                                                                   | Esforço     | Critério de pronto                                                                                                                        |
| ----- | -------------------------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **①** | Worker + D1 + Access + `money.ts` + schema + dívidas + parcelas + comprometido                           | **~7 dias** | Cadastrar o R$ 1.360 do pai com Steam Deck e MacBook, lançar uma compra em 10×, e a tela mostrar o comprometido de ago a jan corretamente |
| **②** | Import OFX/CSV, dedupe, normalizador de payee, memória de categoria por payee, aba _Saúde financeira_    | ~7 dias     | Importar a mesma fatura 2× não duplica nada; pagamento de fatura vira transfer, não despesa; 80% já vem categorizado na 2ª importação     |
| **③** | Parser de PDF + Ollama no Mac (service token via Tunnel) + **Web Share Target** (viável por ser Android) | ~10 dias    | Fatura em PDF do Inter entra sem digitação, com a soma dos itens batendo com o total impresso                                             |
| **④** | Meu Pluggy + Conector 200, PWA offline com outbox, orçamento sobre base fixa, alertas de vencimento      | ~10 dias    | Sync automático, R$ 0/mês, uso no celular sem sinal                                                                                       |

**A fatia ④ só começa depois de 30 dias de uso real das fatias ①–③.**

---

## 11. Anexo — análise financeira que originou os requisitos

### Fluxo de caixa

|                                      | Mês com freela | Mês sem freela |
| ------------------------------------ | -------------: | -------------: |
| Bruto                                |       R$ 6.300 |       R$ 4.300 |
| Camada PJ (DAS 6% + INSS + contador) |       − R$ 820 |       − R$ 700 |
| **Líquido**                          |   **R$ 5.480** |   **R$ 3.600** |
| Essenciais (meta R$ 2.650)           |     − R$ 2.650 |     − R$ 2.650 |
| Sobra                                |       R$ 2.830 |         R$ 950 |
| **Essenciais ÷ líquido**             |   **48,4%** ✅ |   **73,6%** 🔴 |

**Achado principal:** a regra 50/20/30 foi aplicada sobre R$ 5.300, que só existe em mês com freela. Sobre a base que sempre existe, os essenciais consomem **73,6%**. Os R$ 2.000 de freela não são bônus — são estruturais. O orçamento deve ser sobre a **base fixa**.

**Achado secundário:** DAS (R$ 378) + INSS (~R$ 167) + contador (~R$ 275) = **R$ 820**, contra R$ 1.000 declarados. Resíduo de **~R$ 180/mês = R$ 2.160/ano**, hoje sem explicação. Medir é função de `categories.slug`.

### Métricas que o app deve calcular

| Métrica               | Fórmula                           |         Hoje |         Meta |
| --------------------- | --------------------------------- | -----------: | -----------: |
| Dependência de freela | essenciais ÷ líquido fixo         |     73,6% 🔴 |        < 55% |
| Runway                | caixa ÷ essenciais                |            ? | 6 → 12 meses |
| Comprometido futuro   | Σ parcelas 6 meses ÷ líquido fixo |            ? |        < 15% |
| Conversão de freela   | (recebido − gasto) ÷ recebido     |            ? |         100% |
| Custo real da PJ      | Σ saídas PJ ÷ bruto               | 13,0% (est.) |        medir |

Três estão com `?` porque o dado não existe. É por isso que a fatia ① é o modelo de dados, e a _Saúde financeira_ só entra na ②.

### Sequência de capital

1. **Fundo de emergência mínimo** — 6 × essenciais = R$ 15.900, com 100% do freela (R$ 2.000/mês) → **8,0 meses**
2. **Honda Pop 110i à vista** — R$ 13.000 → **+6,5 meses**
3. **Fundo robusto** — 12 × essenciais = R$ 31.800

Inverter a ordem deixa ~6,5 meses com runway abaixo de 6 meses carregando renda com 31,7% de volatilidade.

**Polo Track:** descartado pelo próprio dono (72% da líquida). R$ 96.000 financiados a ~1,7% a.m. em 48× ≈ R$ 140.000 = **10,8 Honda Pop**.

**Starlink:** R$ 189/mês = **17,8% de todo o Estilo de Vida**, mais R$ 1.200–2.400 de hardware; R$ 2.268/ano = 17% da moto. Só após a etapa 1 — e **não resolve CGNAT** (a Starlink também não dá IP público), que já é resolvido pelo Cloudflare Tunnel em uso.

---

## 12. Manutenção de documentação

Conforme a regra global do `CLAUDE.md` raiz: a fatia ① cria a frente `apps/financas`, portanto exige **`apps/financas/CLAUDE.md`** novo (stack Worker/Hono/D1/Vitest, comandos `wrangler`, gotchas de free tier) e **uma linha na tabela de workspaces do `CLAUDE.md` raiz** apontando para ele. `apps/web/CLAUDE.md` e `apps/api/CLAUDE.md` não mudam nesta fatia.
