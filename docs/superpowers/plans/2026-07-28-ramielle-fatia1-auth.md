# ramielle — fatia ① : Worker, D1, schema da votação e auth Google — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pôr o **ramielle** de pé — o Cloudflare Worker que substitui a API Go — com o banco, o schema da votação e o login Google funcionando, **sem repontar nada** que esteja em produção hoje.

**Architecture:** Worker Hono + D1, espelhando o padrão já provado em `apps/financas`: envelope `{ok,data,notifications}`, Better Auth com Google, migrations forward-only. A diferença que decide o desenho: **a votação é livre** (qualquer conta Google entra), ao contrário do finanças, que é fail-closed de usuário único.

**Tech Stack:** TypeScript, Hono, Cloudflare Workers + D1, Better Auth 1.6.25, Vitest com `@cloudflare/vitest-pool-workers`.

---

## Onde esta fatia se encaixa

`docs/superpowers/specs/2026-07-28-ramielle-promeia-design.md` §8 e §9.4. O ramielle é o subsistema que **libera `promeia.piluvitu.com.br`** — o hostname que hoje pertence à API Go — e por isso ele vem antes da revisão de artigo migrar para o promeia.

**O subsistema inteiro são quatro fatias.** Esta é a ①; cada uma ganha seu próprio plano quando chegar:

| Fatia              | O que entrega                                                                          | Estado |
| ------------------ | -------------------------------------------------------------------------------------- | ------ |
| **① (este plano)** | Worker + D1 + schema da votação + auth Google + CORS                                   | —      |
| ②                  | As 10 rotas de votação, com paridade provada lado a lado contra a Go                   | —      |
| ③                  | Admin (`/users`, `/backups`) + allowlist + Sheets/TMDb                                 | —      |
| ④                  | Cutover: `apps/web` aponta pro ramielle, CORS verificado **em produção**, Go desligada | —      |

**Ao fim desta fatia, nada em produção muda.** `apps/web` continua falando com a Go. O ramielle existe, responde, autentica — e ninguém o usa ainda. É de propósito: §9 do spec proíbe big bang.

---

## Contexto medido (2026-07-28) — não re-derivar

Levantado contra o código, não de memória.

| Fato                                                                                                                                                                    | Onde                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **O envelope do Go e o do financas são IDÊNTICOS** — `{ok, data, notifications[]}`, com `type/code/message/field`                                                       | `apps/api/internal/httpx/respond.go` vs. `apps/financas/src/lib/envelope.ts` vs. `apps/web/lib/votacao/api-client.ts:17-29` |
| **`apps/web` já tipa esse envelope** e desembrulha `data` — o cliente dele **não muda** na migração                                                                     | `apps/web/lib/votacao/api-client.ts`                                                                                        |
| As rotas que o `apps/web` de fato chama: `/auth/me`, `/auth/logout`, `/auth/google/login`, `/votacao/*`, `/admin/{users,backup,backups}`, `/admin/{llm,distribution}/*` | `grep` em `apps/web/lib`, `hooks`, `components`                                                                             |
| **As 13 rotas de `/tools/*` não têm um único chamador** no `apps/web`                                                                                                   | idem — o web importa `@piluvitu/tools` direto                                                                               |
| PKs da votação são `INTEGER PRIMARY KEY AUTOINCREMENT`, e o `apps/web` tipa `session_id`/`movie_id` como **number**                                                     | `apps/api/internal/votacao/schema.sql`, `apps/web/lib/votacao/types.ts`                                                     |
| `is_admin` sai de `ADMIN_EMAILS` (CSV, case-insensitive) no upsert do usuário                                                                                           | `apps/api/internal/auth/`                                                                                                   |
| CORS do Go: `AllowCredentials: true`, origens de `CORS_ALLOWED_ORIGINS` (default `http://localhost:3333,https://piluvitu.com.br`)                                       | `apps/api/internal/router/router.go:137-152`                                                                                |

### As três decisões que este plano toma, e por quê

**1. `apps/ramielle` é um Worker NOVO, não uma extensão do `apps/financas`.** Os dois têm ciclos de vida, bancos e políticas de acesso diferentes — o finanças é fail-closed de usuário único, o ramielle precisa aceitar qualquer conta Google. Fundi-los agora acoplaria o deploy do livro-caixa ao da votação. O split da API do próprio finanças (spec §6) é assunto de outra fatia.

**2. O hostname do ramielle é `ramielle.piluvitu.com.br`** — o serviço leva o próprio nome, simétrico a `promeia.piluvitu.com.br`. A única restrição técnica é estar sob `piluvitu.com.br`, para o cookie de sessão continuar _same-site_ com o `apps/web` (mesmo raciocínio que já obriga o Custom Domain no finanças); qualquer subdomínio serve.

⚠️ **Correção do dono (2026-07-29).** O rascunho deste plano propunha `api.piluvitu.com.br`, argumentando que era o que `NEXT_PUBLIC_API_URL` já significa. O dono corrigiu: os serviços têm nome próprio e deliberado (ramielle/promeia), e a simetria entre eles vale mais que a semântica genérica de "api". Trocado antes de existir Custom Domain ou secret cadastrado, então o custo foi só o de reescrever a string. Registrado aqui porque a versão anterior deste parágrafo aparece nos briefs e relatórios das tasks 1–5, que foram executadas com o nome antigo.

**3. PK continua `INTEGER AUTOINCREMENT`, com `RETURNING id`.** O `CLAUDE.md` do finanças documenta que lá toda PK é TEXT/UUID porque "não há `last_insert_rowid()` confiável entre statements de um `batch()`". ⚠️ **Essa restrição não se aplica aqui**: a votação insere sequencialmente, e o SQLite do D1 suporta `INSERT ... RETURNING id`, que devolve o id no mesmo statement sem depender de `last_insert_rowid()`. Trocar para UUID quebraria os tipos do `apps/web` (`movie_id: number`) e todos os mocks E2E — custo alto, ganho nenhum. **O Step 5 da Task 2 é a medição que confirma o `RETURNING`; se ele falhar, pare e reporte** — é a premissa desta decisão.

---

## Global Constraints

- **Envelope único:** toda rota JSON responde `{ok, data, notifications}`. `notifications` nunca serializa como `null` (é `[]`); `field` some do JSON quando ausente.
- **Colocation é lei do projeto:** o teste fica no mesmo diretório do fonte (`auth.ts` → `auth.test.ts`).
- **Migration no D1 é forward-only.** Não existe down migration; índice não é alterável, só dropado (irreversível). Ordem sempre **migration → deploy**.
- **Sem `BEGIN`/`COMMIT`/`SAVEPOINT`** em migration — o D1 rejeita. Atomicidade em runtime é `db.batch()`.
- **`CREATE TABLE`: `CHECK`/`UNIQUE` de tabela vem DEPOIS de todas as column-defs.** A gramática do SQLite é `column-def* table-constraint*`; um constraint solto seguido de coluna dá `syntax error`. Já quebrou a `0001` do finanças.
- **Teto de 100 bound params por statement** no D1 (o teto documentado de 50 queries/invocação não se reproduziu quando medido).
- **Teto de ~10 ms de CPU por invocação** no free tier — é o que obriga memoizar a instância do Better Auth por `env`, nunca reconstruí-la por request.
- **Fail-closed em segredo ausente, e falhar ALTO.** O Better Auth **não** lança sem `BETTER_AUTH_SECRET` — cai num default publicado no próprio pacote. O guard explícito é obrigatório.
- **A mensagem de erro é o produto.** Nunca vazar `D1_ERROR`/`SQLITE_CONSTRAINT` cru para o cliente.
- **Teste que não pode falhar é o defeito mais recorrente deste projeto.** Verifique por mutação: quebre o código de propósito e confirme que o teste falha.
- **Relógio injetado**, nunca mockado globalmente.
- ⚠️ **O `git` do shell é interceptado por um wrapper (`rtk`) que já devolveu saída falsa** — use `/usr/bin/git`. O mesmo vale para `pnpm lint` e `make test`; use as formas com `--filter`.

---

## File Structure

| Arquivo                                           | Responsabilidade                                   |
| ------------------------------------------------- | -------------------------------------------------- |
| `apps/ramielle/package.json`                      | Workspace `@piluvitu/ramielle`, scripts            |
| `apps/ramielle/wrangler.jsonc`                    | Worker, D1 binding, custom domain, vars            |
| `apps/ramielle/tsconfig.json`, `vitest.config.ts` | Toolchain, espelhando o do finanças                |
| `apps/ramielle/migrations/0001_votacao.sql`       | As 6 tabelas da votação, em `STRICT`               |
| `apps/ramielle/src/index.ts`                      | App Hono: middlewares, montagem, catch-all         |
| `apps/ramielle/src/lib/envelope.ts`               | `okJson` / `errJson`                               |
| `apps/ramielle/src/lib/auth.ts`                   | `createAuth` / `getAuth`, admin por `ADMIN_EMAILS` |
| `apps/ramielle/src/lib/session.ts`                | `requireAuth` / `requireAdmin`                     |
| `apps/ramielle/src/lib/cors.ts`                   | CORS com credenciais, origens por env              |
| `apps/ramielle/src/domain/users.ts`               | Upsert e leitura do usuário da votação             |
| `apps/ramielle/src/routes/auth.ts`                | `/auth/me`, `/auth/logout`                         |
| `apps/ramielle/src/**/*.test.ts`                  | Teste colocado ao lado de cada um                  |

---

### Task 1: Esqueleto — Worker, D1, envelope, `/health`, CI

**Files:**

- Create: `apps/ramielle/package.json`, `wrangler.jsonc`, `tsconfig.json`, `vitest.config.ts`, `.dev.vars.example`
- Create: `apps/ramielle/src/index.ts`, `src/index.test.ts`
- Create: `apps/ramielle/src/lib/envelope.ts`, `src/lib/envelope.test.ts`
- Create: `apps/ramielle/src/test-setup.ts`
- Modify: `.github/workflows/ci.yml` (job `ramielle`), `Makefile`, `pnpm-workspace.yaml` (se listar pacotes explicitamente)

**Interfaces produzidas:**

- `okJson(data: unknown, status?: number): Response`
- `errJson(status: number, code: string, message: string, field?: string): Response`
- `Bindings = { DB: D1Database }` (cresce nas tasks seguintes)

- [ ] **Step 1: Criar o workspace**

Copie a ESTRUTURA (não o conteúdo) de `apps/financas/package.json` — mesmos scripts (`lint` = `tsc --noEmit`, `test` = `vitest run`, `deploy`, `db:migrate:*`), nome `@piluvitu/ramielle`. Instale `hono` e, em devDeps, `@cloudflare/vitest-pool-workers`, `typescript`, `vitest`, `wrangler` — **as mesmas versões que `apps/financas` já usa** (leia o arquivo, não invente).

⚠️ **`pnpm -r <script>` pula EM SILÊNCIO um workspace que não declara o script** — sem erro, sem aviso. Confirme que `lint` e `test` estão declarados de fato; não assuma que "não deu erro" significa "rodou".

- [ ] **Step 2: `wrangler.jsonc`**

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "piluvitu-ramielle",
  "main": "src/index.ts",
  "compatibility_date": "2026-07-01",
  // nodejs_compat: o better-auth (Task 3) importa node:crypto/node:async_hooks.
  // Mesma justificativa medida em apps/financas/wrangler.jsonc.
  "compatibility_flags": ["nodejs_compat"],
  "observability": { "enabled": true },

  // Custom Domain, não *.workers.dev: em workers.dev o domínio registrável
  // passa a ser diferente do de piluvitu.com.br, o cookie de sessão vira
  // cross-SITE, SameSite=Lax deixa de ser enviado, e a quebra SÓ aparece em
  // produção (local usa localhost dos dois lados). Mesmo motivo já
  // documentado no finanças.
  "routes": [{ "pattern": "ramielle.piluvitu.com.br", "custom_domain": true }],

  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "piluvitu-ramielle",
      "database_id": "<PREENCHER: sai do `wrangler d1 create piluvitu-ramielle`>",
      "migrations_dir": "migrations",
    },
  ],
}
```

⚠️ **`database_id` é ação do dono** — `wrangler d1 create piluvitu-ramielle` exige conta autenticada. Se o comando não puder rodar, deixe o placeholder, **diga isso no relatório** e siga: os testes rodam contra o Miniflare local, que não precisa do id real.

- [ ] **Step 3: `envelope.ts` — teste primeiro**

Porte `apps/financas/src/lib/envelope.ts` (leia o arquivo) e o `envelope.test.ts` dele. O shape é contrato compartilhado com o Go e com o `apps/web`; não redesenhe. Garanta os dois invariantes que o teste do finanças já cobre: `notifications` é `[]` e nunca `null`; `field` **some** do JSON quando ausente, em vez de virar `null`.

- [ ] **Step 4: `index.ts` com `/health`**

```ts
import { Hono } from 'hono'
import { errJson, okJson } from './lib/envelope'

export type Bindings = { DB: D1Database }

const app = new Hono<{ Bindings: Bindings }>()

// Paridade com o /health do Go (router.go): ele pinga o banco e responde
// {"ok":true,"db":"up"} | {"ok":false,"db":"down"}. Aqui o corpo entra no
// envelope do módulo — `db` vira campo de `data`, não raiz — porque no
// ramielle TODA rota responde no envelope, e o /health do Go era a única
// exceção dele. Nenhum monitor externo depende do shape antigo (medido:
// nenhum chamador em apps/web).
app.get('/health', async (c) => {
  try {
    await c.env.DB.prepare('SELECT 1').first()
    return okJson({ db: 'up' })
  } catch {
    return errJson(503, 'db_down', 'banco indisponível')
  }
})

// SEMPRE POR ÚLTIMO — no Hono a ordem de registro decide. Qualquer
// app.route() registrado depois desta linha fica inalcançável.
app.all('*', () => errJson(404, 'not_found', 'rota não encontrada'))

export default app
```

- [ ] **Step 5: Testes de `index.ts`**

`vitest.config.ts` e `test-setup.ts` seguem o padrão medido do finanças: `readD1Migrations()` injeta as migrations em `env.TEST_MIGRATIONS`, e um `beforeEach` global faz `reset()` **seguido de** `applyD1Migrations()` — nessa ordem, porque `reset()` apaga também a tabela de controle das migrations. `isolatedStorage` **não existe mais** na 0.18.x.

Cubra: `/health` responde 200 com `{ok:true, data:{db:'up'}}`; uma rota inexistente responde **404 no envelope**, não HTML.

- [ ] **Step 6: Job no CI + alvos no Makefile**

Acrescente um job `ramielle` a `.github/workflows/ci.yml`, irmão de `web`/`api`/`financas`/`promeia` (não altere nenhum deles): install, `Typecheck` (`--filter @piluvitu/ramielle run lint`), `Test`. **Não** precisa de build de SPA — o ramielle não serve assets.

No `Makefile`: `dev-ramielle`, `test-ramielle`, e some `ramielle` aos agregados `test`/`lint`.

- [ ] **Step 7: Rodar tudo e commitar**

```bash
pnpm --filter @piluvitu/ramielle run lint
pnpm --filter @piluvitu/ramielle run test
/usr/bin/git add apps/ramielle .github/workflows/ci.yml Makefile
/usr/bin/git commit -m "feat(ramielle): esqueleto do Worker com D1 e envelope"
```

---

### Task 2: Migration `0001` — o schema da votação em D1

**Files:**

- Create: `apps/ramielle/migrations/0001_votacao.sql`
- Create: `apps/ramielle/src/schema.test.ts`

- [ ] **Step 1: Escrever a migration**

Porte `apps/api/internal/votacao/schema.sql` (6 tabelas: `users`, `voting_sessions`, `session_movies`, `votes`, `backups`, `tiebreaks`) para D1, com três mudanças obrigatórias e uma proibida:

1. **`STRICT` em todas as tabelas** — é a convenção deste monorepo desde a `0001` do finanças.
2. **`DATETIME` não existe em `STRICT`** — vira `TEXT` (ISO-8601 UTC). `DEFAULT CURRENT_TIMESTAMP` continua funcionando e grava texto.
3. **`CHECK`/`UNIQUE` de tabela DEPOIS de todas as column-defs** (a gramática `column-def* table-constraint*`). `session_movies` tem `UNIQUE (session_id, category)` e `voting_sessions`/`session_movies`/`backups` têm `CHECK` — reposicione.
4. **PROIBIDO trocar as PKs por UUID.** `INTEGER PRIMARY KEY AUTOINCREMENT` fica — ver a decisão 3 no topo deste plano.

Mantenha os 5 índices do original.

⚠️ **`voting_sessions.winner_movie_id` referencia `session_movies(id)`, que é criada DEPOIS.** No SQLite isso é aceito (FKs são resolvidas na primeira escrita, não no `CREATE`), mas confirme no Step 3 — se a migration falhar por isso, a saída é reordenar, nunca remover a FK.

- [ ] **Step 2: Aplicar localmente**

```bash
pnpm --filter @piluvitu/ramielle exec wrangler d1 migrations apply piluvitu-ramielle --local
```

⚠️ **NÃO rode `--remote`.** Migration em produção é ato deliberado do dono; e o banco remoto pode nem existir ainda (Task 1, Step 2).

- [ ] **Step 3: `schema.test.ts`**

Espelhe o padrão de `apps/financas/src/schema.test.ts`. Cubra:

- as 6 tabelas existem (`sqlite_master`);
- os 5 índices existem;
- `STRICT` está ativo, provado na direção que **de fato rejeita**: TEXT não-numérico em coluna `INTEGER`, mensagem `cannot store TEXT value in INTEGER column`.
  ⚠️ **Não escreva teste esperando `STRICT` barrar número em coluna `TEXT`** — MEDIDO neste projeto: coluna `TEXT` em tabela `STRICT` **converte** um `INTEGER` recebido (`12345` vira `'12345.0'`), não rejeita.
- o `CHECK` de `voting_sessions.status` rejeita um valor fora de `('open','closed')`;
- o `UNIQUE (session_id, category)` de `session_movies` rejeita a segunda linha.

- [ ] **Step 4: Rodar**

Run: `pnpm --filter @piluvitu/ramielle run test`

- [ ] **Step 5: MEDIR o `RETURNING id` — a premissa da decisão 3**

Este passo não é cerimônia: a escolha de manter PK `INTEGER` depende de o D1 devolver o id gerado no mesmo statement.

Escreva um teste que faça `INSERT INTO users (...) VALUES (...) RETURNING id`, leia o valor de volta e afirme que é um número **maior que zero**, e que um segundo insert devolve um id **diferente**.

⚠️ **Se `RETURNING` não funcionar no D1, PARE e reporte BLOCKED.** Não contorne com `last_insert_rowid()` (é justamente o que o finanças mediu como não-confiável) nem troque as PKs por UUID por conta própria — a troca quebra os tipos do `apps/web` e é decisão do dono.

- [ ] **Step 6: Commitar**

```bash
/usr/bin/git add apps/ramielle
/usr/bin/git commit -m "feat(ramielle): schema da votacao em D1 (migration 0001)"
```

---

### Task 3: Better Auth com Google — e a votação é LIVRE

**Files:**

- Create: `apps/ramielle/migrations/0002_better_auth.sql`
- Create: `apps/ramielle/src/lib/auth.ts`, `src/lib/auth.test.ts`
- Modify: `apps/ramielle/wrangler.jsonc` (vars), `.dev.vars.example`, `src/index.ts` (Bindings + handler)

**Interfaces produzidas:**

- `AuthBindings = { DB, BETTER_AUTH_URL, BETTER_AUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ADMIN_EMAILS }`
- `createAuth(env)` / `getAuth(env)` (memoizado por `WeakMap<AuthBindings, Auth>`)
- `isAdminEmail(email: string | null | undefined, csv: string | undefined): boolean`

- [ ] **Step 1: Migration `0002` — as 4 tabelas do Better Auth**

Copie `apps/financas/migrations/0002_better_auth.sql` (`user`, `session`, `account`, `verification`). Os nomes singular/camelCase são **contrato da biblioteca**, não escolha — não "padronize" para plural/snake_case.

⚠️ Duas tabelas `users` no mesmo banco? **Não.** A do Better Auth é `user` (singular); a da votação é `users` (plural, migration `0001`). São tabelas diferentes de propósito: a primeira é da lib, a segunda é do domínio da votação (com `google_sub`, `is_admin`, e as FKs de `votes`/`voting_sessions`). A Task 4 é quem liga uma na outra.

- [ ] **Step 2: `isAdminEmail` — teste primeiro**

```ts
import { isAdminEmail } from './auth'

describe('isAdminEmail', () => {
  it.each([
    ['paulo.tspi@gmail.com', 'paulo.tspi@gmail.com', true],
    ['PAULO.TSPI@GMAIL.COM', 'paulo.tspi@gmail.com', true], // case-insensitive, igual ao Go
    ['  paulo.tspi@gmail.com  ', 'paulo.tspi@gmail.com', true], // trim nas duas pontas
    ['outro@gmail.com', 'paulo.tspi@gmail.com', false],
    ['a@x.com', 'a@x.com,b@x.com', true], // CSV de verdade: o Go aceita lista
    ['b@x.com', 'a@x.com,b@x.com', true],
    ['c@x.com', 'a@x.com,b@x.com', false],
    ['a@x.com', '', false], // fail-closed: sem lista, ninguém é admin
    ['a@x.com', undefined, false], // binding não setada é undefined em runtime, não ''
    [null, 'a@x.com', false],
    ['', 'a@x.com', false],
  ])('isAdminEmail(%p, %p) === %p', (email, csv, esperado) => {
    expect(isAdminEmail(email, csv)).toBe(esperado)
  })
})
```

⚠️ **`ADMIN_EMAILS` é CSV de verdade aqui, ao contrário do `ALLOWED_EMAIL` do finanças** (que é um e-mail só e cujo `CLAUDE.md` avisa que CSV lá não casa com nada). São coisas diferentes: o Go sempre tratou `ADMIN_EMAILS` como lista. Não carregue o hábito de um para o outro.

- [ ] **Step 3: Implementar `auth.ts`**

Espelhe `apps/financas/src/lib/auth.ts` — leia o arquivo e copie a estrutura, incluindo os comentários que registram os fatos medidos (guard de `BETTER_AUTH_SECRET`, `rateLimit.enabled: true` explícito, `advanced.ipAddress.ipAddressHeaders: ['cf-connecting-ip']`, `customRules['/get-session']`, `storage: 'memory'`, memoização por `WeakMap`, `database: env.DB` cru).

**Três diferenças obrigatórias em relação ao finanças:**

1. **NÃO existe `databaseHooks.user.create.before` com allowlist.** A votação é livre (spec §7): qualquer conta Google entra. Copiar o hook do finanças barraria todo mundo menos o dono e mataria a feature.
2. **`trustedOrigins` explícito**, incluindo a origem do `apps/web`:
   ```ts
   trustedOrigins: [env.BETTER_AUTH_URL, 'https://piluvitu.com.br', 'http://localhost:3333'],
   ```
   ⚠️ MEDIDO no finanças: sem config, `trustedOrigins` é **só** a origem de `BETTER_AUTH_URL`. Como aqui o front vive noutra origem, sem esta linha o `POST /api/auth/sign-in/social` responde **403** e o login nunca completa.
3. **`isAdminEmail` exportado**, e nenhum uso dele dentro do `createAuth` — quem decide admin é o guard da Task 4, a cada request. Motivo: o Better Auth não tem noção de allowlist fora da criação, então um privilégio gravado no cadastro não acompanha uma troca de `ADMIN_EMAILS`.

⚠️ **Consequência de segurança que a votação livre traz e o finanças não tinha:** qualquer pessoa com conta Google passa a poder criar linha em `user`/`account` neste D1. O `rateLimit` deixa de ser higiene e vira a única barreira contra alguém esgotar a cota diária de escrita (100k/dia no free tier) — **não o desligue nem afrouxe** os valores herdados.

- [ ] **Step 4: Montar o handler no `index.ts`**

```ts
// Só GET e POST — os únicos métodos que o Better Auth usa. Precisa vir
// ACIMA do catch-all: no Hono a ordem de registro decide.
app.on(['GET', 'POST'], '/api/auth/*', (c) => getAuth(c.env).handler(c.req.raw))
```

- [ ] **Step 5: Testes de `auth.ts`**

Espelhe `apps/financas/src/lib/auth.test.ts`:

- guard de `BETTER_AUTH_SECRET` (vazio lança, `undefined` lança, presente não lança);
- memoização provada por **identidade** (`toBe`): mesmo objeto `env` ⇒ mesma instância; `env` diferente ⇒ instância diferente;
- **o teste que decide esta task:** um e-mail que NÃO é admin completa o cadastro e **grava linha em `user`** — o oposto do teste equivalente do finanças. Conte as linhas no D1 antes/depois, não confie só no status HTTP.

⚠️ **Duas armadilhas de teste MEDIDAS neste projeto, que valem aqui:**

- `cloudflare:test` **não exporta `fetchMock`** na versão instalada. Para mockar o token endpoint do Google, sobrescreva `globalThis.fetch` com um handler que intercepta só a URL esperada e delega o resto, restaurando num `finally`.
- O `Map` do `storage: 'memory'` do rate limit é **singleton de módulo** — `reset()` não o zera e `createAuth()` novo não ganha balde novo. Testes que batem em `/sign-in*` reusando o mesmo IP sintético **acumulam contagem entre si** contra o teto embutido de 3-por-10s. Varie o IP por teste.

- [ ] **Step 6: Rodar, verificar por mutação, commitar**

Mutação obrigatória: acrescente ao `createAuth` o `databaseHooks.user.create.before` com allowlist (copiado do finanças). O teste do Step 5 que prova "conta não-admin entra" tem que **falhar**. Reverta e confirme `/usr/bin/git status --porcelain` vazio.

```bash
/usr/bin/git commit -m "feat(ramielle): Better Auth com Google, votacao livre e admin por ADMIN_EMAILS"
```

---

### Task 4: `/auth/me`, `/auth/logout` e os guards — paridade de shape com a Go

**Files:**

- Create: `apps/ramielle/src/domain/users.ts`, `src/domain/users.test.ts`
- Create: `apps/ramielle/src/lib/session.ts`, `src/lib/session.test.ts`
- Create: `apps/ramielle/src/routes/auth.ts`, `src/routes/auth.test.ts`
- Modify: `apps/ramielle/src/index.ts`

**Interfaces produzidas:**

- `upsertVotacaoUser(db, { googleSub, email, name, picture, isAdmin }): Promise<VotacaoUser>`
- `requireAuth(): MiddlewareHandler` — anexa o `VotacaoUser` ao contexto
- `requireAdmin(): MiddlewareHandler`

- [ ] **Step 1: `users.ts` — a ponte entre o Better Auth e a votação**

O Better Auth grava em `user` (dele). A votação precisa de uma linha em `users` (dela), com `google_sub`, `is_admin` e a PK `INTEGER` que `votes`/`voting_sessions` referenciam.

`upsertVotacaoUser` casa por `google_sub` (que é `UNIQUE`), atualiza `email`/`name`/`picture`/`is_admin` quando já existe, e usa `RETURNING id` (validado na Task 2). `is_admin` é **sempre recalculado** a partir de `ADMIN_EMAILS` no upsert — nunca lido do banco como verdade.

⚠️ Teste que o upsert é **idempotente**: chamar duas vezes com o mesmo `google_sub` mantém **uma** linha e o mesmo `id`. Conte as linhas, não confie no retorno.

- [ ] **Step 2: `session.ts` — os dois guards**

`requireAuth`: chama `getAuth(c.env).api.getSession({ headers: c.req.raw.headers })`; sem sessão ⇒ `401 not_authenticated`. Com sessão, faz o upsert do Step 1 e põe o `VotacaoUser` no contexto.

`requireAdmin`: tudo do `requireAuth` mais `isAdminEmail`; não-admin ⇒ `403 admin_only`.

⚠️ **Os códigos `not_authenticated` e `admin_only` são os que o `apps/web` já trata** — não invente novos. `getSession()` vai ao D1 e **pode falhar**; sem `try/catch` o erro vaza como 500 sem envelope e o cliente levanta `invalid_envelope`, um sintoma sem relação com a causa. Capture e devolva `503 auth_unavailable`.

⚠️ **Não use `createAuth` direto** — custa CPU e o teto é 10 ms/invocação. Sempre `getAuth`, memoizado.

- [ ] **Step 3: `routes/auth.ts`**

`GET /auth/me` (com `requireAuth`) devolve o usuário no envelope. **Shape idêntico ao do Go** — leia `apps/api/internal/handlers/admin` e o tipo `User` de `apps/web/lib/votacao/types.ts` e case campo a campo: `id`, `name`, `email`, `picture`, `is_admin`, `created_at`. **`google_sub` NUNCA sai** — o Go já o omite de propósito.

`POST /auth/logout` delega ao Better Auth e responde 200 no envelope.

⚠️ `/auth/google/login` **não entra nesta fatia**: no ramielle o login é `POST /api/auth/sign-in/social` do Better Auth, não um redirect próprio. Repontar o `loginHref` do `apps/web` é trabalho da fatia ④, junto com o cutover.

- [ ] **Step 4: Testes**

- `requireAuth` sem cookie ⇒ 401 `not_authenticated`.
- **Controle positivo:** um cookie genuinamente válido chega na rota com 200. Gere-o com uma segunda instância `betterAuth()` só do teste, com `emailAndPassword` ligado, e `signUpEmail` — é o padrão que o finanças já usa. **Sem esse caso, um `await next()` trocado por um `return errJson(...)` passaria por todos os testes de rejeição.**
- `requireAdmin` com conta não-admin ⇒ 403 `admin_only`; com conta em `ADMIN_EMAILS` ⇒ 200.
- **O caso que prova o desenho:** o MESMO cookie, com `ADMIN_EMAILS` trocado entre as duas chamadas, muda o resultado de 403 para 200. É isso que prova que o privilégio é recalculado a cada request, e não gravado no cadastro.
- D1 indisponível durante `getSession` ⇒ 503 `auth_unavailable`, **não** 500 sem envelope. ⚠️ Precisa de um cookie com assinatura VÁLIDA — um malformado é rejeitado por HMAC local antes de tocar o banco, e nunca exercitaria um `DB` quebrado.
- `/auth/me` não expõe `google_sub` (asserção **negativa** sobre o JSON serializado, não sobre o objeto).

- [ ] **Step 5: Verificar por mutação, e commitar**

Faça `isAdminEmail` devolver sempre `true` — os testes de 403 têm que falhar. Depois faça `requireAuth` pular o upsert — o teste de idempotência/`id` tem que falhar. Reverta as duas e confirme árvore limpa.

```bash
/usr/bin/git commit -m "feat(ramielle): /auth/me, /auth/logout e os guards de sessao"
```

---

### Task 5: CORS — o custo aceito do split de hostname

**Files:**

- Create: `apps/ramielle/src/lib/cors.ts`, `src/lib/cors.test.ts`
- Modify: `apps/ramielle/src/index.ts`, `wrangler.jsonc`, `.dev.vars.example`
- Modify: `apps/ramielle/CLAUDE.md` (criar), `CLAUDE.md` da raiz

- [ ] **Step 1: Por que esta task existe, e o que ela NÃO resolve**

Hoje o `apps/web` (em `piluvitu.com.br`) e a Go (em `promeia.piluvitu.com.br`) já são origens diferentes, e a Go carrega CORS com `AllowCredentials: true` por isso. O ramielle herda a mesma necessidade.

⚠️ **A quebra de CORS só aparece em produção.** Local é `localhost` dos dois lados. Este plano cobre o que dá para provar em teste; a verificação **em produção** é critério de aceitação da fatia ④, não desta.

- [ ] **Step 2: `cors.ts` — teste primeiro**

Use o `cors` do Hono (`hono/cors`), com as origens lidas de `CORS_ALLOWED_ORIGINS` (CSV) e o mesmo default do Go: `http://localhost:3333,https://piluvitu.com.br`.

Cubra:

- preflight `OPTIONS` de uma origem permitida devolve `Access-Control-Allow-Origin` com **aquela origem** (nunca `*`) e `Access-Control-Allow-Credentials: true`;
- origem **não** permitida não recebe `Access-Control-Allow-Origin`;
- `CORS_ALLOWED_ORIGINS` vazio/ausente cai no default (e o default **inclui** `https://piluvitu.com.br`).

⚠️ **`Access-Control-Allow-Origin: *` é incompatível com credenciais** — o navegador recusa a resposta. Se algum caminho puder emitir `*`, é defeito. Escreva a asserção negativa.

- [ ] **Step 3: Montar no `index.ts`**

O CORS entra **antes** de tudo (inclusive do handler do Better Auth), senão o preflight de `/api/auth/*` não é respondido e o login quebra sem mensagem útil.

- [ ] **Step 4: `apps/ramielle/CLAUDE.md`**

Cubra, cada fato uma vez só (a regra do monorepo é fonte única — não repita o que já está no `CLAUDE.md` do finanças ou da raiz; aponte):

- O que o ramielle é, e a regra de corte contra o promeia.
- **A votação é LIVRE e o finanças é fail-closed de usuário único** — os dois usam Better Auth com desenhos opostos, e confundir os dois mata uma feature ou abre a outra.
- `is_admin` é recalculado a cada request a partir de `ADMIN_EMAILS`, nunca gravado como verdade.
- Duas tabelas de usuário no mesmo banco (`user` da lib, `users` do domínio) e por quê.
- A decisão da PK `INTEGER` + `RETURNING id`, com o resultado da medição da Task 2.
- Comandos (`make dev-ramielle`, `test-ramielle`, migrations local/remote).
- ⚠️ **Pendências do dono**, sem rodeio: criar o D1 (`wrangler d1 create`), preencher `database_id`, cadastrar os secrets, criar o Custom Domain `ramielle.piluvitu.com.br`, e registrar `https://ramielle.piluvitu.com.br/api/auth/callback/google` no Google Console **sem remover** as URIs existentes (o mesmo OAuth client serve o admin e a Go hoje — remover uma quebra o que está no ar).
- ⚠️ **Nada em produção mudou nesta fatia.** `apps/web` segue falando com a Go.

No `CLAUDE.md` da raiz: linha na tabela de workspaces, comandos, e o job novo no CI.

- [ ] **Step 5: Verificação final e commit**

```bash
pnpm --filter @piluvitu/ramielle run lint
pnpm --filter @piluvitu/ramielle run test
pnpm prettier:fix
/usr/bin/git status --porcelain
```

Confirme também que **as suítes que já existiam não mudaram de número** — esta fatia não toca `apps/web`, `apps/financas`, `apps/promeia`, `packages/*` nem `apps/api`.

```bash
/usr/bin/git commit -m "feat(ramielle): CORS com credenciais e documentacao da fatia"
```

---

## Estado ao fim desta fatia

**Funciona:** o ramielle sobe, responde `/health` contra o D1, autentica com Google aceitando qualquer conta, distingue admin por `ADMIN_EMAILS` a cada request, e responde CORS com credenciais para `piluvitu.com.br`.

**Não muda:** nenhuma tela, nenhum endpoint em produção. `apps/web` continua na Go. `promeia.piluvitu.com.br` continua sendo da Go.

**Pendente do dono:** criar o D1 e o Custom Domain, cadastrar os secrets, acrescentar a redirect URI no Google Console.

**Próximo:** fatia ② — as 10 rotas de votação, com paridade provada lado a lado contra a Go antes de qualquer cutover.
