# ramielle fatia ④ — o cutover

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development para implementar task a task, com revisão entre elas.

**Goal:** Repontar o `apps/web` da API Go para o ramielle, importar o histórico real, e deixar a Go aposentável — sem que nenhum passo irreversível seja executado por um agente.

**Architecture:** O código muda no branch (reversível por `git revert`); tudo que toca produção — migration `--remote`, `wrangler secret put`, deploy, DNS, import de dados — é **comando do dono**, entregue como runbook numerado com verificação e rollback por passo.

**Tech Stack:** Cloudflare Worker (Hono + D1), Next.js na Vercel, SQLite → D1, `wrangler`.

---

## Fatos medidos (spike de 2026-08-12) — leia antes de qualquer task

Estes números vieram de medição, não de leitura de código. Quem implementar deve tratá-los como dados, e **remedir se algo não bater**.

### A Go está fora do ar há dois meses

```
curl -s -o /dev/null -w '%{http_code}' https://promeia.piluvitu.com.br/health   →  530
docker ps -a  →  cloudflare/cloudflared  "Exited (0) 2 months ago"  (×2, nenhum container `api`)
```

530 = a Cloudflare não alcança a origem. **A votação em produção já está quebrada hoje**, antes de qualquer coisa que este plano faça.

Duas consequências que mudam o plano:

1. **"Desligar a Go" deixou de ser o passo de risco.** O risco virou o inverso: atribuir ao cutover uma quebra que já existia. Toda verificação precisa de um **baseline registrado antes** de mexer.
2. O critério de aceitação do spec (§11) — _"votação migrada responde igual à do Go — comparação lado a lado antes de aposentar"_ — **exige ressuscitar a Go** (`make stack`) para ter contra o que comparar.

### O banco de produção — e a armadilha do WAL

Mora no volume Docker **`infra_api-data`** (`/data/votacao.db`), não em `apps/api/tmp/votacao.db` (esse é o de dev). Acessível read-only sem subir o serviço:

```bash
docker run --rm -v infra_api-data:/data:ro -v /tmp/saida:/out alpine \
  sh -c 'cp /data/votacao.db /data/votacao.db-wal /out/'
```

| tabela            | linhas | min id | max id | `sqlite_sequence` |
| ----------------- | -----: | -----: | -----: | ----------------: |
| `users`           |      4 |      1 |      4 |            **12** |
| `voting_sessions` |      4 |      1 |      4 |                 4 |
| `session_movies`  |     42 |      1 |     42 |                42 |
| `votes`           | **54** |      1 | **81** |                81 |
| `tiebreaks`       |      2 |      1 |      2 |                 2 |
| `backups`         |      0 |      — |      — |                 — |

⚠️⚠️ **O arquivo `.db` tem 4.096 bytes. TODO o dado está no `-wal` (1.108.312 bytes), não checkpointado.** Copiar só o `.db` copia um banco **vazio** — e vazio não dá erro, dá um import "bem-sucedido" de zero linhas. Sempre `PRAGMA wal_checkpoint(TRUNCATE)` antes, ou levar os dois arquivos.

Outros números que quebram suposições ingênuas:

- **`votes` tem 27 ids buracados** (54 linhas, max id 81) — desvotos do voto de aprovação. Qualquer import que assuma id contíguo quebra.
- **`users.sqlite_sequence` = 12 com max id = 4** — 8 ids queimados. O `seq` de origem não reflete o max id.
- `sessions` e `distribution_targets` existem na Go e não têm equivalente no ramielle — **as duas com 0 linhas**. Nada a migrar.
- Compatibilidade `STRICT`: auditadas as 25 colunas não-PK das 6 tabelas — só `text`, `integer` e `null`. **Nenhum `real`, nenhum `blob`.** Nada que o `STRICT` rejeite.

### 🚨 `sqlite3 .dump` corrompe em silêncio — a ordem das colunas difere

A ordem física de `voting_sessions` **não é a mesma** nos dois schemas, porque na Go o `winner_method` entrou por `ALTER TABLE` (foi pro fim) e na migration do ramielle ele foi escrito no meio:

|          | ordem das 3 últimas colunas                                 |
| -------- | ----------------------------------------------------------- |
| Go       | `winner_movie_id`, `sort_options_json`, **`winner_method`** |
| ramielle | `winner_movie_id`, **`winner_method`**, `sort_options_json` |

O `.dump` emite `INSERT INTO voting_sessions VALUES(...)` **posicional, sem lista de colunas**. Reproduzido contra o schema real do ramielle:

```
🚣 2 commands executed successfully.          ← "sucesso"
id=2 | winner_method='{"title":"Segundou"}' | sort_options_json='roulette'
```

As duas colunas são `TEXT`, então o `STRICT` **não pega**. Atingiria as 3 sessões fechadas. E a sessão aberta (`winner_method = NULL`) falha com uma mensagem que aponta pra coluna errada:

```
✘ [ERROR] NOT NULL constraint failed: voting_sessions.sort_options_json
```

⇒ **Todo `INSERT` do arquivo de import precisa de lista explícita de colunas.** Não usar `.dump` cru.

### A ordem de import é forçada pela FK circular

`voting_sessions.winner_movie_id → session_movies(id)` e `session_movies.session_id → voting_sessions(id)`, com `PRAGMA foreign_keys = 1` no D1. A única ordem que funciona (medida):

```
1. users
2. voting_sessions      ← winner_movie_id = NULL FORÇADO, inclusive nas 3 fechadas
3. session_movies
4. votes
5. tiebreaks
6. backups              (vazia hoje)
7. UPDATE voting_sessions SET winner_movie_id=? WHERE id=?    ← 3 statements, por último
```

Prova ✅: `109 commands executed successfully`, `PRAGMA foreign_key_check` vazio, contagens 4/4/42/54/2.
Prova ❌ (ordem errada): `FOREIGN KEY constraint failed: SQLITE_CONSTRAINT_FOREIGNKEY` — e **3 das 4 sessões reais** disparam isso.

### Preservar ids; o `sqlite_sequence` se ajusta sozinho

Com o D1 vazio não há colisão, e preservar id dispensa remapear `winner_movie_id`, `votes.{user_id,movie_id,session_id}` e `tiebreaks.*`. **Medido:** inserir com id explícito numa tabela `AUTOINCREMENT` já avança o `seq` para o max id — depois do import, `votes|81` (o max, não a contagem de 54). **Nenhum `UPDATE sqlite_sequence` é necessário**, o que é ótimo porque escrever em tabela de sistema no D1 é território não documentado.

### 🚨 O import tem que vir ANTES do primeiro login no ramielle

Se alguém logar antes, `upsertVotacaoUser` cria `users.id = 1` pelo AUTOINCREMENT e o import colide:

```
✘ [ERROR] UNIQUE constraint failed: users.id: SQLITE_CONSTRAINT_PRIMARYKEY
```

**O import é atômico** — depois da falha, a contagem continuou intacta, nada parcial gravado. Mas a ordem do runbook é obrigatória: `migrations apply --remote` → **import** → só então liberar login / repontar o web.

### Datas: 67 de 67 passam pelo `toIsoUtc` — item fechado

Todos os 67 valores de data do banco de produção são `YYYY-MM-DD HH:MM:SS` (TEXT, 19 chars, separador espaço). Passados pelo `apps/ramielle/src/lib/dates.ts` real: **`total=67 ok=67 falha=0`**.

Controles negativos (para provar que o teste tinha poder de detecção): `time.Time.String()` do Go (`2026-05-26 00:13:17.123456789 +0000 UTC`) → **`RangeError`**; unix epoch → **`RangeError`**; string vazia → **`RangeError`**. Nenhum desses formatos ocorre no banco.

E o ramielle também nunca escreve `created_at` explicitamente (`domain/sessions.ts:266`, `domain/votes.ts:83`, `:273` — todos caem no `DEFAULT CURRENT_TIMESTAMP`), então **linhas novas saem no mesmo formato das importadas**. Não haverá banco com dois formatos.

> Isso **fecha** o item 1 do checklist de cutover em `apps/ramielle/CLAUDE.md`.

### `NEXT_PUBLIC_API_URL` está inlinado no bundle — trocar a env não basta

```
curl https://piluvitu.com.br/_next/static/chunks/0l_b7yv1~buqj.js | grep -oE "promeia\.piluvitu\.com\.br"
  → promeia.piluvitu.com.br
```

`api-client.ts:14` e `:123` são compilados no chunk. **Repontar exige redeploy da Vercel** — e como o `loginHref` também muda, exige commit + merge + redeploy. Não é um toggle de env.

(Nota lateral: `apps/web/.env.example` **não declara** `NEXT_PUBLIC_API_URL`. Só existe em `.env.local`. Corrigir na T2.)

### `ramielle.piluvitu.com.br` não é um nome livre — o wildcard envenena a verificação

```
dig +short ramielle.piluvitu.com.br              → 172.67.220.214 / 104.21.24.214 (proxy CF)
curl -sI https://ramielle.piluvitu.com.br/health → HTTP/2 404 + x-vercel-error: DEPLOYMENT_NOT_FOUND
dig +short naoexiste-xyz123.piluvitu.com.br      → MESMOS IPs, MESMO 404
```

Existe um wildcard `*.piluvitu.com.br` → Vercel. O `financas` só funciona porque o Custom Domain criou um registro específico que vence o wildcard.

⚠️ **Um 404 nesse host é ambíguo.** Distinguir sempre:

- header `x-vercel-error: DEPLOYMENT_NOT_FOUND` ⇒ o Custom Domain **não existe**, caiu no wildcard;
- corpo `{"ok":false,...,"code":"not_found"}` ⇒ é o catch-all do Worker — **o domínio está funcionando**.

### O deploy do finanças nunca rodou pelo CI

```
gh run list --workflow=deploy-financas.yml --json conclusion  →  [{"skipped"}, {"skipped"}]
gh variable list → (vazio)     gh secret list → (vazio)
```

As duas execuções saíram `skipped` (o `if:` exige `vars.CLOUDFLARE_ACCOUNT_ID`, que não existe). O finanças, que **está** em produção, foi deployado à mão. ⇒ **O caminho provado para o ramielle é o deploy manual.** Copiar `deploy-financas.yml` é copiar um arquivo que nunca executou.

### As 13 rotas `/tools/*`: zero chamadores, inclusive o CLI

`apps/api/internal/router/router.go:98-112` (o checklist do ramielle diz 97-111 — off-by-one, corrigir). **Nenhuma tem `.With(auth.*)`: as 13 são públicas e sem autenticação**, ao contrário das 12 de `/votacao` + `/admin` logo acima.

Busca de chamador no repo inteiro: **zero chamadas HTTP**. Em particular, o CLI Go (`apps/api/cmd/cli/main.go`) **não importa `net/http`** — linka `internal/tools` direto. O CLI sobrevive intacto à remoção. O `apps/web` usa `@piluvitu/tools` local, que tem paridade 1:1 com os 13 endpoints.

⚠️ **Não é possível provar ausência de consumidor externo**: o túnel encaminha todos os caminhos de `promeia.piluvitu.com.br`, então `curl -X POST https://promeia.piluvitu.com.br/tools/cpf/validate` funciona de qualquer lugar, sem credencial. A decisão de apagar é do spec (§8, "código morto"); este plano a executa e registra o fato.

---

## Global Constraints

- **Nenhum passo irreversível é executado por agente.** Migration `--remote`, `wrangler secret put`, `wrangler deploy`, DNS/Custom Domain, import de dados e merge/redeploy da Vercel são **comandos do dono**. O plano os entrega prontos; não os roda.
- **A Go nunca é alterada, exceto na T5** (que apaga as 13 rotas mortas). Fora disso ela segue sendo a fonte da verdade.
- **Paridade de comportamento, `code` e mensagem** com a Go, onde houver equivalente.
- **Nenhum teste chama serviço real** (Google, TMDb, Sheets, D1 remoto).
- **Nenhum segredo em log, erro, resposta ou arquivo commitado.**
- Colocation (teste ao lado do fonte). Comentários e mensagens em **português**.
- Gates por task: `pnpm --filter @piluvitu/ramielle run lint` + `run test`, e `pnpm --filter @piluvitu/web run lint` + `test` quando a task tocar o web.
- **Decisão do dono, já tomada (2026-08-12):** o Atelier é **desacoplado** numa env própria, não migrado nem sacrificado. Ver T1.

---

## Task 1: Desacoplar o Atelier do `apiBase` da votação

**Files:**

- Modify: `apps/web/lib/admin/atelier/api.ts`
- Modify: `apps/web/.env.example`, `apps/web/CLAUDE.md`
- Test: `apps/web/lib/admin/atelier/api.test.ts` (criar)

**Interfaces:**

- Produces: `atelierBase` — a base URL do Atelier, independente de `apiBase`.

**Por quê:** `atelier/api.ts:1` importa `apiBase` de `@/lib/votacao/api-client`. Repontar a votação **arrastaria o Atelier junto, sem escolha**, e o ramielle não tem as 5 rotas dele (`/admin/llm/proofread`, `/admin/llm/refine`, `/admin/distribution/proposals`, `/admin/distribution/{slug}`, `/admin/distribution/{slug}/publish`). Desacoplar mantém o fluxo de artigo exatamente como está hoje.

⚠️ **O que acontece hoje se NÃO desacoplar** (medido, é o teste de regressão desta task): `DistributionPanel` monta `useDistribution(slug, !!slug)` com `enabled` verdadeiro — **dispara sozinho no mount**. O `QueryClient` é `new QueryClient()` cru, sem `defaultOptions`, então `retry` = 3 ⇒ **4 requisições por post aberto**. E `grep -n "isError" distribution-panel.tsx` → **zero**: `targets = localTargets ?? existing.data?.targets ?? []` vira `[]`, e o card renderiza vazio **sem sinal de erro**. Um post que tinha distribuição salva passa a parecer que nunca teve.

- [ ] **Step 1: Teste primeiro**

⚠️ **Correção deste template (achado da revisão da T1, 2026-08-12):** a primeira versão que escrevi aqui usava `'http://localhost:8080'` como valor esperado — **o mesmo valor do default**. Com isso, nenhum teste consegue distinguir "leu a env var" de "devolveu a constante": trocar a implementação por uma string hardcoded deixava os 5 testes **verdes**. O valor de teste tem que ser **distinguível do default**.

```ts
// apps/web/lib/admin/atelier/api.test.ts
import { atelierBase } from './api'

describe('atelierBase', () => {
  it('LÊ a NEXT_PUBLIC_ATELIER_URL — valor distinguível do default', () => {
    // (montar via jest.resetModules() + await import('./api') com env stubada)
    expect(atelierBase).toBe('https://tunel-go-de-teste.exemplo')
  })

  it('sem a env var, cai no default local', () => {
    expect(atelierBase).toBe('http://localhost:8080')
  })

  it('NÃO cai no NEXT_PUBLIC_API_URL da votação — é o ponto inteiro desta task', () => {
    // Com NEXT_PUBLIC_API_URL apontando pro ramielle e ATELIER_URL pra Go,
    // atelierBase tem que ser a Go.
    expect(atelierBase).not.toContain('ramielle')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar** — `atelierBase` não existe ainda.

- [ ] **Step 3: Implementar**

Em `apps/web/lib/admin/atelier/api.ts`, trocar o import de `apiBase` por uma base própria:

```ts
/**
 * Base do Atelier — DELIBERADAMENTE separada do `apiBase` da votação.
 *
 * A votação foi repontada pro ramielle (fatia ④); o Atelier NÃO, porque as 5
 * rotas dele (`/admin/llm/*`, `/admin/distribution/*`) só existem na Go e
 * estão previstas pro promeia (spec §7.2), que ainda não existe.
 *
 * ⚠️ Se um dia isto voltar a apontar pro mesmo host da votação, o card
 * "Distribuição" volta a renderizar VAZIO SEM ERRO em todo post existente
 * (`useDistribution` dispara no mount, `retry` default = 3 ⇒ 4 requisições
 * falhas por post, e nada lê `isError`) — um post com distribuição salva
 * passa a parecer que nunca teve. Medido em 2026-08-12.
 */
export const atelierBase =
  process.env.NEXT_PUBLIC_ATELIER_URL ?? 'http://localhost:8080'
```

E trocar os usos de `apiBase` por `atelierBase` no arquivo.

- [ ] **Step 4: Rodar e ver passar.**

- [ ] **Step 5: Documentar** — acrescentar `NEXT_PUBLIC_ATELIER_URL` a `apps/web/.env.example` e à seção _Environment variables_ de `apps/web/CLAUDE.md`, explicando **por que** é separada.

- [ ] **Step 6: Mutação** — fazer `atelierBase` voltar a ser `apiBase` e confirmar que o segundo teste **falha**. Reverter, `/usr/bin/git diff` vazio.

- [ ] **Step 7: Commit.**

---

## Task 2: Repontar o `apps/web` para o ramielle

**Files:**

- Modify: `apps/web/lib/votacao/api-client.ts` (o `loginHref`)
- Modify: `apps/web/.env.example`, `apps/web/CLAUDE.md`
- Test: `apps/web/lib/votacao/api-client.test.ts`

**Interfaces:**

- Consumes: `atelierBase` da T1 (o Atelier já não depende mais deste arquivo).

**O que muda de verdade** (medido: são 14 caminhos que batem byte a byte, e **1** que não existe):

| Rota                                              | Status no ramielle                        |
| ------------------------------------------------- | ----------------------------------------- |
| `/auth/me`, `/auth/logout`                        | EXISTE                                    |
| as 9 de `/votacao/*`                              | EXISTE                                    |
| `/admin/users`, `/admin/backups`, `/admin/backup` | EXISTE (o `POST` responde 503 permanente) |
| **`GET /auth/google/login`**                      | **NÃO EXISTE** → 404                      |

⚠️ `loginHref` (`api-client.ts:123`) monta `${apiBase}/auth/google/login`, usado como `<a href>` em `login-button.tsx:8` e `admin-login-screen.tsx:17,35`. No ramielle o login é `POST /api/auth/sign-in/social` (Better Auth) — **não é navegação top-level via `<a>`**. Esta é a única mudança de código do repoint.

⚠️ Confirmado por sonda: as rotas ausentes caem no catch-all e respondem **dentro do envelope** (`{"ok":false,...,"code":"not_found"}`), não HTML — então `call<T>()` produz `ApiError(404, 'not_found')`, não um crash.

- [ ] **Step 1: Teste primeiro** — um teste que prova que o fluxo de login não aponta mais para uma rota inexistente no ramielle:

```ts
it('o login NÃO usa GET /auth/google/login (não existe no ramielle — 404)', () => {
  expect(loginHref).not.toContain('/auth/google/login')
})
```

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar o login via Better Auth.** Ler `apps/financas/web` — ele **já faz login Google com Better Auth em produção**; copiar o padrão de lá em vez de inventar. Substituir o `<a href>` por uma chamada que faça `POST /api/auth/sign-in/social` com `{ provider: 'google', callbackURL }` e siga o redirect.

- [ ] **Step 4: Rodar e ver passar.** Atualizar os mocks E2E de `votacao.e2e.ts` e `sessoes.e2e.ts` se o caminho de login mudar (eles usam globs host-agnósticos `**/...`, então o repoint em si não os quebra).

- [ ] **Step 5: `.env.example`** — declarar `NEXT_PUBLIC_API_URL` (hoje **ausente** do arquivo; só existe em `.env.local`), com o valor de produção do ramielle comentado.

- [ ] **Step 6: Commit.**

> ⚠️ Este commit **não reponta produção sozinho**. `NEXT_PUBLIC_API_URL` está inlinado no bundle: só passa a valer depois de merge + redeploy da Vercel (runbook, T6).

---

## Task 3: Gerador do arquivo de import (Go SQLite → D1)

**Files:**

- Create: `apps/ramielle/scripts/gerar-import.mjs` (+ `gerar-import.test.mjs`)

**Interfaces:**

- Produces: um `.sql` com `INSERT`s **com lista explícita de colunas**, na ordem FK-safe, pronto pro dono rodar com `wrangler d1 execute --file`.

**Por que um gerador e não `sqlite3 .dump`:** o `.dump` emite INSERT posicional e **troca `winner_method` com `sort_options_json` em silêncio** (ver Fatos medidos). O gerador emite lista de colunas explícita, o que torna a ordem física irrelevante.

- [ ] **Step 1: Teste primeiro.** Um SQLite de fixture com o **mesmo formato do real**: ids buracados em `votes`, uma sessão aberta (`winner_movie_id` NULL) e uma fechada (preenchido), `poster_url`/`tmdb_id` NULL em alguns filmes.

```js
test('todo INSERT tem lista explícita de colunas — nunca posicional', () => {
  const sql = gerarImport(dbFixture)
  const inserts = sql.match(/INSERT INTO \w+/g) ?? []
  expect(inserts.length).toBeGreaterThan(0)
  // Nenhum `INSERT INTO tabela VALUES` (sem parênteses de colunas).
  expect(sql).not.toMatch(/INSERT INTO \w+\s+VALUES/i)
})

test('voting_sessions entra com winner_movie_id NULL e recebe UPDATE no fim (FK circular)', () => {
  const sql = gerarImport(dbFixture)
  const idxInsert = sql.indexOf('INSERT INTO voting_sessions')
  const idxMovies = sql.indexOf('INSERT INTO session_movies')
  const idxUpdate = sql.indexOf('UPDATE voting_sessions')
  expect(idxInsert).toBeLessThan(idxMovies) // sessão antes do filme
  expect(idxMovies).toBeLessThan(idxUpdate) // o UPDATE do vencedor por último
  // e nenhum winner_movie_id não-nulo no INSERT
})

test('preserva ids buracados de votes (54 linhas, max id 81 no real)', () => {
  // ids do fixture aparecem literalmente; nada é renumerado
})
```

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar.** Ordem obrigatória: `users` → `voting_sessions` (winner NULL) → `session_movies` → `votes` → `tiebreaks` → `backups` → `UPDATE voting_sessions`.
      Escapar strings corretamente (aspas simples duplicadas). **Nada de `sqlite_sequence`** — ele se ajusta sozinho (medido).

- [ ] **Step 4: Rodar e ver passar.**

- [ ] **Step 5: Validar contra um D1 local limpo** — `wrangler d1 execute piluvitu-ramielle --local --persist-to <dir isolado> --file <saída>`, e conferir `PRAGMA foreign_key_check` vazio + contagens. **Só `--local`, nunca `--remote`.**

- [ ] **Step 6: Mutação** — gerar com `winner_movie_id` preenchido no INSERT e confirmar o `FOREIGN KEY constraint failed`; e gerar posicional e confirmar a troca de colunas. Reverter.

- [ ] **Step 7: Commit.**

---

## Task 4: Harness de comparação lado a lado (Go × ramielle)

**Files:**

- Create: `apps/ramielle/scripts/comparar-com-go.mjs` (+ teste)

**Por quê:** é critério de aceitação do spec (§11). E é o que transforma "394 testes verdes contra mock" em evidência de que os dois serviços respondem igual **com dados reais**.

- [ ] **Step 1:** Script que, dadas duas base URLs (a Go local via `make stack` e o ramielle), chama as **mesmas 13 rotas com chamador real** e compara status, `code` e o shape do `data` — normalizando o que legitimamente difere (timestamps de `created_at` de linhas novas, ids gerados).

- [ ] **Step 2:** Relatório de diferenças legível, com saída não-zero se houver divergência.

- [ ] **Step 3:** Teste do próprio comparador com duas respostas mockadas — uma igual, uma diferente — provando que ele **detecta** a diferença (um comparador que sempre diz "igual" é pior que nenhum).

- [ ] **Step 4: Commit.**

> ⚠️ Rodar isto exige a Go de pé (`make stack`) — é passo do dono, no runbook.

---

## Task 5: Apagar as 13 rotas `/tools/*` da Go

**Files:**

- Modify: `apps/api/internal/router/router.go` (linhas **98-112**)
- Delete: `apps/api/internal/handlers/tools.go`, `apps/api/internal/handlers/tools_test.go`
- Modify: `apps/api/internal/router/router_test.go` (usa `/tools/cpf/validate` como alvo do preflight CORS — trocar por uma rota que sobreviva)
- Modify: `apps/api/CLAUDE.md`

⚠️ **NÃO apagar `apps/api/internal/tools/`** (a lógica pura): o CLI Go (`cmd/cli/main.go`) a linka direto e **não importa `net/http`**. O CLI tem que continuar compilando.

- [ ] **Step 1:** Apagar as 13 rotas e os handlers HTTP.
- [ ] **Step 2:** Corrigir `router_test.go` (o teste de preflight precisa de outro alvo).
- [ ] **Step 3:** `go build ./...` + `go test ./...` + `make build-cli` — **o CLI tem que continuar compilando e funcionando**.
- [ ] **Step 4:** Atualizar `apps/api/CLAUDE.md` (hoje diz "13 endpoints under `/tools`").
- [ ] **Step 5: Commit.**

---

## Task 6: Backup do D1 + runbook de cutover

**Files:**

- Create: `apps/ramielle/scripts/backup-d1.sh` (ou parametrizar o do finanças)
- Create: `docs/superpowers/runbooks/2026-08-12-cutover-ramielle.md`
- Modify: `apps/ramielle/CLAUDE.md` (fechar os itens do checklist que este plano resolveu)

- [ ] **Step 1: Backup.** `apps/financas/scripts/backup-d1.sh` já é parametrizado. Apontar para `piluvitu-ramielle` e declarar um script `backup` no `package.json` do ramielle. ⚠️ **Hoje não há o que perder (D1 remoto vazio); depois do import, o histórico inteiro fica sem backup.**

- [ ] **Step 2: O runbook.** Sequência numerada, cada passo com **comando exato**, **como verificar** e **como desfazer**. A ordem não é negociável:

1. **Baseline** — registrar que a Go está em 530 **antes** de qualquer mudança (senão o cutover leva a culpa por uma quebra que já existia).
2. `make stack` — subir a Go local (necessária para os passos 3 e 9).
3. **Extrair o banco de produção** com o WAL — `PRAGMA wal_checkpoint(TRUNCATE)` antes, ou copiar `.db` **e** `.db-wal`. ⚠️ Copiar só o `.db` copia 4 KB vazios.
4. `wrangler d1 migrations list piluvitu-ramielle --remote` (read-only) — **confirmar** que o remoto está no estado esperado.
5. `wrangler d1 migrations apply piluvitu-ramielle --remote`.
6. `wrangler secret put` de `GOOGLE_SA_JSON`, `TMDB_API_KEY`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
7. **Decidir `ADMIN_EMAILS`: var OU secret, e remover a outra** — é o único gate de privilégio do Worker, e `vars` é reaplicada a cada deploy.
8. Adicionar a redirect URI de `ramielle.piluvitu.com.br` no console do Google — **aditiva, nunca substituir** as existentes.
9. `wrangler deploy` (manual — o CI nunca rodou) + criar o Custom Domain. ⚠️ Verificar por **header**, não por status: `x-vercel-error` ⇒ o domínio não existe; envelope `not_found` ⇒ funciona.
10. **Import** (T3) — `wrangler d1 execute --file`. ⚠️ **Antes de qualquer login no ramielle.** Verificar contagens 4/4/42/54/2 e `PRAGMA foreign_key_check` vazio.
11. **Comparação lado a lado** (T4), Go local × ramielle.
12. **CORS em produção** — `curl` com `Origin: https://piluvitu.com.br` e conferir `access-control-allow-origin` + `access-control-allow-credentials`.
13. Merge + redeploy da Vercel (a env inlinada só vale depois disto).
    ⚠️⚠️ **Cadastrar `NEXT_PUBLIC_ATELIER_URL` na Vercel ANTES do redeploy**, com a URL do túnel da Go — **não** o placeholder `http://localhost:8080` do `.env.example`. Achado da revisão da T1: sem essa variável o Atelier cai no default, que **do navegador do admin em produção é a máquina dele**, não a Go — e isso reproduz, por um gatilho diferente (env ausente em vez de derivação acidental de `apiBase`), exatamente o bug que a T1 existe para evitar: card "Distribuição" **vazio, sem erro nenhum**, em todo post que tinha distribuição salva. A instrução genérica do `CLAUDE.md` da raiz ("copiar todas as `NEXT_PUBLIC_*` do `.env.example`") **leva ao valor errado** se seguida literalmente.
14. Verificar a votação real em `https://piluvitu.com.br/votacao`.
    ⚠️ **Confirmar o host EFETIVO do site.** `better-auth/dist/api/middlewares/origin-check.mjs:67` valida `callbackURL` **e** `errorCallbackURL` contra `trustedOrigins`, e hoje isso é exatamente `https://piluvitu.com.br` (via `wrangler.jsonc#vars`). Se o site for servido em **qualquer outro host** — `www.piluvitu.com.br`, ou um preview `*.vercel.app` — o login vira **`403 INVALID_CALLBACK_URL`**. Se houver `www` ou se você for testar num preview, acrescente essas origens a `CORS_ALLOWED_ORIGINS` antes (o `trustedOrigins` deriva dela).
    ⚠️ **O botão "Disparar backup" de `/admin/sessoes` vai falhar sempre** — `POST /admin/backup` no ramielle responde **503 `backup_disabled`** por design (o D1 não tem `VACUUM INTO`; o backup é o script do passo 8). Isso **não** é regressão do cutover, é o caminho degradado que a própria Go já tinha. Conferir o que o usuário vê e decidir se vale esconder o botão numa fatia futura.
15. **Ponto de não-retorno:** só depois de 14 verde, aposentar a Go.

- [ ] **Step 3:** Marcar no `apps/ramielle/CLAUDE.md` os itens do checklist de cutover que este plano **fechou por medição** (o formato de data, o `.dump`, a ordem de import, o `sqlite_sequence`) e corrigir o off-by-one de `router.go:97-111` → `98-112`.

- [ ] **Step 4: Commit.**

---

## Estado ao fim desta fatia

**Pronto:** o `apps/web` reponta pro ramielle; o Atelier segue na Go, desacoplado; o histórico real tem um caminho de import testado; existe comparação lado a lado e backup.

**Não feito por agente, de propósito:** tudo do runbook. Migration remota, secrets, deploy, DNS, import e o merge da Vercel são do dono.

**Depois:** o promeia — insight (§9.2 do spec), revisão de artigo (§7.2), PDF/transcrição (§9.3). Só quando o Atelier existir no promeia é que `NEXT_PUBLIC_ATELIER_URL` muda e a Go fica de fato aposentável.
