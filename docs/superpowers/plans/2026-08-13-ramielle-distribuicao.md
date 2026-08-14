# ramielle — distribuição de artigo (dev.to, Hashnode, Bluesky, Mastodon)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development, task a task, com revisão entre elas.

**Goal:** Portar a **publicação** de artigo da API Go para o Worker `apps/ramielle`, mantendo o contrato que o `apps/web` já consome.

**Architecture:** Pela regra de corte do projeto, publicar é HTTP para API de terceiro ⇒ **ramielle**. A geração das chamadas sociais é inferência e **já vive no promeia** (`POST /llm/hooks`, sem consumidor até esta fatia). O estado vai pro D1.

**Tech Stack:** Cloudflare Worker (Hono + D1), `fetch`, vitest com `@cloudflare/vitest-pool-workers`.

---

## Fatos medidos (spike de 2026-08-13)

**749 linhas** de produção Go em 9 arquivos, com **694 linhas de teste Go** que servem de **oráculo de paridade** — os testes do Go não tocam rede real, então são portáveis como casos.

Nenhum dos 4 adapters usa crypto, XML, multipart ou disco — **todos são JSON puro sobre HTTP**, portáveis 1:1 para `fetch`. Confirmado por grep dos imports.

### As 4 plataformas

| Plataforma | Chamada                                                            | Auth                                    |
| ---------- | ------------------------------------------------------------------ | --------------------------------------- |
| dev.to     | `POST https://dev.to/api/articles`                                 | header `api-key`                        |
| Hashnode   | `POST https://gql.hashnode.com/` (GraphQL, mutation `publishPost`) | header `Authorization` **sem `Bearer`** |
| Bluesky    | `createSession` → `createRecord` (**1 ou 2×**)                     | Bearer JWT da sessão                    |
| Mastodon   | `POST <instance>/api/v1/statuses`                                  | `Authorization: Bearer`                 |

### 🚨 As armadilhas que um porte ingênuo erraria

1. **Contagem de caracteres é `RuneCount`, não `.length`.** `bluesky.go:41` e `mastodon.go:42` contam **code points**; o `.length` do JS conta **UTF-16 code units** — divergem em emoji e qualquer coisa fora do BMP. Use `[...texto].length`. E `bluesky.go:78` usa **bytes UTF-8** para o offset do facet do link: em JS isso é `new TextEncoder().encode(url).length`, nunca `.length`.
2. **Bluesky faz DUAS escritas por publicação** (`bluesky.go:53-66` o post, `:76-100` a reply com o link, se houver `canonical_url`). ⚠️ **Se a segunda falhar, a função inteira retorna erro e o alvo vira `failed` — mas o post principal JÁ EXISTE no Bluesky.** Republicar (o fluxo normal de "clicar Publicar de novo num alvo `failed`") cria um **segundo post duplicado**, porque o AT Protocol não dedupa. É uma exposição real do Go; o porte a replica. **Registre no código** — não conserte nesta fatia sem decidir com o dono.
3. **Nenhuma das 4 plataformas dedupa.** A idempotência existe só no serviço: `Publish` pula o alvo se `status == 'posted'` no banco (`service.go:89-92`). Não há retry nem backoff em lugar nenhum; cada `Publisher` tem só um timeout de 30 s.
4. **`Upsert` sobrescreve `content` SEMPRE, mas preserva `status` quando já é `'posted'`** (`store.go:58-63`, `CASE WHEN … THEN 'posted' ELSE excluded.status END`). Regenerar propostas de um post já publicado reescreve o texto salvo, mas mantém o selo e a `remote_url`. Comportamento observável — não "limpar".
5. **`BuildProposals` devolve `status: 'pending'` SEMPRE**, da lista em memória, sem reler o banco (`service.go:48,60,69`) — diferente de `Publish`, que relê (`:113`). Um alvo já `posted` aparece como `pending` na resposta. Inofensivo (a proteção real é no `Publish`), mas é o comportamento a replicar.
6. **dev.to trunca para 4 tags em silêncio** (`devto.go:34-37`) — sem erro, sem log.
7. **dev.to aceita 200 OU 201** (`devto.go:59`). E o **Hashnode só trata como erro definitivo `>=500`/`401`/`403`** (`hashnode.go:61`); outros 4xx passam e só são pegos ao decodificar o corpo (`:80-85`). Um `if (!res.ok) throw` genérico divergiria dos dois.
8. **`kind` nunca vem do cliente na publicação** — `service.go:95` usa `pub.Kind()`, do adapter. Proteção silenciosa contra o frontend mandar `kind` errado.
9. **Nas 3 plataformas de 2 variáveis, o Go só valida a PRIMEIRA** (`main.go:97,100,103`): `HASHNODE_PUBLICATION_ID`, `BLUESKY_APP_PASSWORD` e `MASTODON_ACCESS_TOKEN` podem estar vazios e o publisher é construído mesmo assim, falhando só na hora de publicar. Exigir as duas mudaria comportamento observável.

### O schema

```sql
CREATE TABLE IF NOT EXISTS distribution_targets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL, platform TEXT NOT NULL, kind TEXT NOT NULL,
  content TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
  remote_url TEXT NOT NULL DEFAULT '', error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  posted_at TEXT NOT NULL DEFAULT '',
  UNIQUE(slug, platform)
);
```

Adaptações obrigatórias para o D1 (regras já documentadas em `migrations/0001_votacao.sql:9-26`): **`STRICT`** em toda tabela, sem `BEGIN`/`COMMIT`, e `DEFAULT CURRENT_TIMESTAMP` em vez de `DEFAULT (datetime('now'))` (mesma saída, convenção do repo).

⚠️ **`created_at`/`posted_at` NÃO saem no JSON hoje** — `store.go:67-70` não as seleciona. Então a armadilha de data crua do D1 (já documentada 3× em `apps/ramielle/CLAUDE.md`) **não se aplica**. Se algum dia forem expostas, precisam de `toIsoUtc`. **Registre isso no código.**

### As 3 rotas e o contrato vivo

`Target` = `{slug, platform, kind, content, status, remote_url, error}` — bate campo a campo com `apps/web/lib/admin/atelier/types.ts:4-12`. `Selected` = `{platform, content, title, canonical_url, description, tags}`.

Status possíveis: **`'pending' | 'posted' | 'failed' | 'skipped'`** — `distribution-panel.tsx:50` usa `t.status !== 'posted'` como default de seleção.

| Rota                                      | Erros (status · `code` · mensagem literal)                                                                                                                                    |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /admin/distribution/proposals`      | 400 `invalid_json` "Corpo inválido: 'slug' é obrigatório." · 502 `proposals_failed` "Falha ao gerar propostas." · 503 `distribution_unavailable` "Distribuição indisponível." |
| `GET /admin/distribution/{slug}`          | 500 `internal_error` "Falha ao ler distribuição." · 503 `distribution_unavailable`                                                                                            |
| `POST /admin/distribution/{slug}/publish` | 400 `invalid_json` "Corpo inválido." · 502 `publish_failed` "Falha ao publicar." · 503 `distribution_unavailable`                                                             |

⚠️ `publish` sempre devolve a lista **relida do banco**, nunca a de memória.

### Credenciais — só o Bluesky existe hoje

Medido em `apps/api/.env` (valores não lidos, só presença): **`BLUESKY_HANDLE` e `BLUESKY_APP_PASSWORD` configurados**; dev.to, Hashnode e Mastodon com as chaves presentes e **vazias**.

⇒ Só o Bluesky pode ter smoke test real. As outras três exigem o dono criar conta/token — mesma situação já registrada para o TMDb, e que lá virou **pré-condição de cutover**, não dívida.

---

## Global Constraints

- **Paridade de comportamento, `code` e mensagem** com o Go — o `apps/web` mostra `primary.message` em `toast.error`.
- **Zero dependência nova.** GraphQL é uma string; AT Protocol é `fetch`.
- ⚠️ **Nenhum teste chama plataforma real.** `fetch` mockado, como `gsheets.test.ts`/`tmdb.test.ts`/`promeia.test.ts` já fazem.
- ⚠️ **As 7 credenciais são secrets** (`wrangler secret put`), **nunca `vars`** do `wrangler.jsonc` (texto claro, commitado). Nenhuma pode aparecer em log, erro ou resposta — teste com marcador improvável, como `promeia.test.ts`.
- Colocation; comentários e mensagens em **português**.
- Gates: `pnpm --filter @piluvitu/ramielle run lint` e `run test`. Hoje: **426 + 116**.
- **Migrations `--remote` são comando do dono.** Escrever o arquivo e rodar `--local` é do agente; aplicar em produção, não.

---

## Task 1: Schema + store

**Files:** `migrations/0004_distribution.sql`, `src/domain/distribution.ts` (+teste)

Porte de `schema.sql` (13 linhas) + `store.go` (116). **Zero rede** — é a de menor risco e as outras três dependem dela.

- [ ] **Step 1:** A migration, com `STRICT` e `DEFAULT CURRENT_TIMESTAMP`. Confirmar o número da próxima migration lendo `migrations/`.
- [ ] **Step 2:** `upsert`, `listBySlug`, `get`, `markPosted`, `markFailed` — porte de `store.go`. ⚠️ O `ON CONFLICT` depende do `UNIQUE(slug, platform)`.
- [ ] **Step 3: Testes.** ⚠️ O caso que importa: **upsert sobre um alvo `posted` reescreve `content` mas PRESERVA `status`/`remote_url`** (armadilha 4). Escreva-o explicitamente.
- [ ] **Step 4:** Rodar `wrangler d1 migrations apply --local` (⚠️ **nunca `--remote`**) e confirmar.
- [ ] **Step 5: Mutação:** remova o `CASE WHEN … 'posted'` do upsert e confirme que o teste falha. Reverter.
- [ ] **Step 6: Commit.**

---

## Task 2: Os 4 adapters de plataforma

**Files:** `src/lib/publishers/{devto,hashnode,bluesky,mastodon}.ts` (+testes)

Porte de 350 linhas. **Os testes Go (`devto_test.go` 40, `hashnode_test.go` 38, `bluesky_test.go` 152, `mastodon_test.go` 81) são o oráculo — leia-os e porte os casos.**

Cada adapter precisa de teste dedicado para a sua armadilha, não só do caminho feliz:

- [ ] **dev.to:** truncamento silencioso para **4 tags** (armadilha 6); aceitar **200 OU 201** (7).
- [ ] **Hashnode:** só `>=500`/`401`/`403` são erro imediato; **outros 4xx passam** e são pegos pelo corpo (7). Header `Authorization` **sem `Bearer`**.
- [ ] **Bluesky:** `createSession` → `createRecord`; **a segunda escrita** (reply com link) e a exposição da armadilha 2 — teste que a falha da 2ª deixa o post principal criado, e **registre no código** que republicar duplica. Contagem por **code point** (armadilha 1) e offset do facet em **bytes UTF-8**.
- [ ] **Mastodon:** limite de 500 por **code point**.
- [ ] **Mutação por adapter:** troque `[...t].length` por `t.length` e prove que o teste com emoji falha.
- [ ] **Não-vazamento:** nenhuma credencial em mensagem de erro. Marcador improvável.
- [ ] **Commit.**

---

## Task 3: O serviço

**Files:** `src/domain/distribution-service.ts` (+teste)

Porte de `service.go` (119 linhas). O `HookGenerator` do Go vira uma chamada a **`chamarPromeia('/llm/hooks', {article, platforms}, cfg)`** — `src/lib/promeia.ts` já existe e resolve exatamente isto (`PromeiaInalcancavel`/`PromeiaRecusou`/`promeiaConfigurado`). **Infraestrutura zero a inventar.**

- [ ] **Step 1:** `buildProposals` — artigos de crosspost + hooks sociais via promeia, persistidos. ⚠️ Devolve a lista **de memória** com `status:'pending'` (armadilha 5).
- [ ] **Step 2:** `publish` — pula `posted` (armadilha 3), reseta `failed`→`pending` antes de retentar, usa `pub.Kind()` e não o do cliente (armadilha 8), e **relê do banco** no fim.
- [ ] **Step 3:** `list`.
- [ ] **Step 4: Testes** com publishers falsos + promeia mockado, como `service_test.go` já faz. ⚠️ **Promeia fora do ar não pode derrubar o `buildProposals` inteiro** — o Go pula os hooks sociais sem erro quando não há gerador (`service.go:54`). Confirme no Go e replique.
- [ ] **Step 5: Mutação:** faça `publish` NÃO pular alvos `posted` e prove que o teste falha.
- [ ] **Step 6: Commit.**

---

## Task 4: As 3 rotas + wiring

**Files:** `src/routes/distribution.ts` (+teste), `src/index.ts`, `src/lib/auth.ts`

- [ ] **Step 1:** As 3 rotas atrás de `requireAdmin`, com os status/`code`/mensagens da tabela acima, **literais**.
- [ ] **Step 2:** As 7 bindings de credencial em `AuthBindings`, **opcionais** (ausente é o estado normal). ⚠️ Replicar a validação frouxa do Go (armadilha 9): só a primeira var de cada par é checada.
- [ ] **Step 3:** Montar em `index.ts` **acima do catch-all** e acrescentar as 3 ao `test.each` de montagem em `index.test.ts`.
- [ ] **Step 4: Testes.** ⚠️ **403 para conta autenticada não-admin nas três** — a lição da revisão anterior desta fatia: a votação é livre, e sem esse teste um refactor que enfraqueça o guard entra em verde.
- [ ] **Step 5: Mutação:** `requireAdmin` → `requireAuth` e prove que os 403 falham.
- [ ] **Step 6:** `apps/ramielle/CLAUDE.md` + `.dev.vars.example` + as pendências do dono (os `wrangler secret put`).
- [ ] **Step 7: Commit.**

---

## Estado ao fim desta fatia

**Pronto:** a distribuição inteira no ramielle, com paridade e sem credencial real necessária para os testes.

**⚠️ Não automático:** `NEXT_PUBLIC_ATELIER_URL` continua apontando pra Go. Trocá-la é decisão do dono — e há uma regressão já travada por teste (`apps/web/CLAUDE.md` § Atelier) se ela apontar pro ramielle antes destas rotas existirem lá.

**Pendências do dono:** criar conta/token em **dev.to, Hashnode e Mastodon** (hoje vazios) e cadastrar os 7 secrets. Só o **Bluesky** tem credencial hoje — é o único que pode ter smoke test real.
