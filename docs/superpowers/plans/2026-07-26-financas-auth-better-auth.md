# Finanças — Troca de Autenticação para Better Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar a autenticação do Worker `apps/financas` de Cloudflare Access para Better Auth 1.6.25 com login social do Google e D1 nativo, mantendo a mesma garantia de segurança (single-user, fail closed) através de duas camadas independentes (hook de criação + guarda de sessão).
**Architecture:** `betterAuth()` roda dentro do Worker via uma factory memoizada por requisição (`getAuth(env)`, `WeakMap`), montada em `/api/auth/*` acima do catch-all. Um hook (`databaseHooks.user.create.before`) barra a criação de usuário fora da allowlist; um middleware (`requireSession()`) barra o uso de sessão de e-mail fora da allowlist a cada request em `/api/*`. Nenhuma rota de domínio (`src/routes/*`, `src/domain/*`) é tocada.
**Tech Stack:** Cloudflare Workers, Hono v5, D1 (SQLite STRICT), Better Auth 1.6.25 (adapter D1 nativo via `@better-auth/kysely-adapter`), Vite + React 19 + TS na SPA, Vitest + `@cloudflare/vitest-pool-workers` no Worker, Vitest + jsdom + Testing Library na SPA.

## Global Constraints

- `better-auth@1.6.25` (sem `^`) já está em `apps/financas/package.json` e no `pnpm-lock.yaml`, modificado mas **não commitado** — nenhuma task readiciona a dependência; a Task 1 (`git add`) inclui essas duas linhas já modificadas no primeiro commit.
- Nenhuma entrada nova em `pnpm-workspace.yaml#allowBuilds` — medido (S1): nenhum pacote da árvore transitiva do `better-auth` tem lifecycle script de install.
- `.gitignore` já cobre `.dev.vars`/`**/.dev.vars` (confirmado nas linhas existentes) — nenhuma task edita `.gitignore`.
- `compatibility_flags: ["nodejs_compat"]` entra por precaução (silencia 2 warnings de build), **não** porque o Worker precise dele para subir — medido (S3) que sobe e funciona sem o flag nesta `compatibility_date`.
- Envelope `{ ok, data, notifications }` (`src/lib/envelope.ts`) continua obrigatório em toda resposta JSON do Worker, **exceto** `/api/auth/*` (respostas do próprio Better Auth, nunca embrulhadas).
- Códigos de erro em inglês snake_case, comparados literalmente pela SPA (`ApiError.code`) e catalogados em `apps/financas/CLAUDE.md`.
- Toda rota nova é montada **acima** da linha `// SEMPRE POR ÚLTIMO` em `src/index.ts` — o catch-all continua sendo o último `app.*` registrado.
- Convenção existente e não tocada por este plano (nenhuma task cria rota de transição de estado nova): toda rota de transição de estado devolve `404 not_found` quando `meta.changes === 0`.
- Colocation: todo teste e story fica no mesmo diretório do arquivo fonte.
- Sem ponto-e-vírgula, aspas simples — TS/TSX do Worker e da SPA.
- Os 7 arquivos de teste de rota (`src/routes/accounts.test.ts`, `transactions.test.ts`, `installments.test.ts`, `debts.test.ts`, `payees.test.ts`, `categories.test.ts`, `reports.test.ts`) não são editados em nenhuma task — é a prova de que a troca não vaza para o domínio.
- Comandos de migration remota (`db:migrate:remote` / `wrangler d1 migrations apply ... --remote`) são **informados**, nunca executados automaticamente — decisão do dono do repo.
- Todo comando roda a partir da raiz do monorepo, prefixado por `pnpm --filter @piluvitu/financas` (Worker) ou `pnpm --filter @piluvitu/financas-web` (SPA).

---

### Task 1: Migration `0002` — tabelas do Better Auth + testes de schema

**Files:**

- Create: `apps/financas/migrations/0002_better_auth.sql`
- Test: `apps/financas/src/schema.test.ts`

**Interfaces:**

- Consumes: nenhuma (não depende de `better-auth` instalado — só SQL).
- Produces: tabelas `user(id, name, email, emailVerified, image, createdAt, updatedAt)`, `session(id, expiresAt, token, createdAt, updatedAt, ipAddress, userAgent, userId)`, `account(id, accountId, providerId, userId, accessToken, refreshToken, idToken, accessTokenExpiresAt, refreshTokenExpiresAt, scope, password, createdAt, updatedAt)`, `verification(id, identifier, value, expiresAt, createdAt, updatedAt)` — consumidas por `createAuth()` (Task 2, via `database: env.DB`) e pelos testes de bloqueio da Task 2/3 (leitura direta via SQL de `user`/`account`).

- [ ] **Step 1: Escrever os casos novos em `src/schema.test.ts` (RED)**

Abrir `apps/financas/src/schema.test.ts`. Primeiro, **substituir** o teste existente `'cria exatamente as 10 tabelas do modelo'` (dentro de `describe('migration 0001 — tabelas', ...)`) por uma versão que já espera as 14 tabelas (10 do `0001` + 4 do `0002`) — ele vai ficar vermelho até a Step 3 deste task, junto com os casos novos abaixo:

```ts
describe('migrations 0001+0002 — tabelas', () => {
  it('cria exatamente as 14 tabelas do modelo (10 do 0001 + 4 do better auth)', async () => {
    const { results } = await DB.prepare(
      `SELECT name FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'
          AND name NOT LIKE '_cf_%'
          AND name <> 'd1_migrations'
        ORDER BY name`,
    ).all<{ name: string }>()

    expect(results.map((r) => r.name)).toEqual([
      'account',
      'accounts',
      'categories',
      'debt_items',
      'debt_payment_allocations',
      'debt_payments',
      'debts',
      'installment_plans',
      'installments',
      'payees',
      'session',
      'transactions',
      'user',
      'verification',
    ])
  })
})
```

Depois, no final do arquivo, adicionar:

```ts
describe('migration 0002 — STRICT, FK cascade, UNIQUE', () => {
  it('STRICT recusa INTEGER em coluna TEXT (user.createdAt)', async () => {
    await expect(
      DB.prepare(
        `INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt)
         VALUES ('u-strict', 'Teste', 'teste@exemplo.com', 1, ?, ?)`,
      )
        .bind(12345, NOW)
        .run(),
    ).rejects.toThrow(/cannot store INTEGER value in TEXT column/)
  })

  it('apagar o user cascateia para session e account', async () => {
    await DB.prepare(
      `INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt)
       VALUES ('u-cascade', 'Dono', 'dono@exemplo.com', 1, ?, ?)`,
    )
      .bind(NOW, NOW)
      .run()
    await DB.prepare(
      `INSERT INTO session (id, expiresAt, token, createdAt, updatedAt, userId)
       VALUES ('s-cascade', ?, 'token-cascade', ?, ?, 'u-cascade')`,
    )
      .bind(NOW, NOW, NOW)
      .run()
    await DB.prepare(
      `INSERT INTO account (id, accountId, providerId, userId, createdAt, updatedAt)
       VALUES ('a-cascade', 'google-sub-1', 'google', 'u-cascade', ?, ?)`,
    )
      .bind(NOW, NOW)
      .run()

    await DB.prepare(`DELETE FROM user WHERE id = 'u-cascade'`).run()

    const s = await DB.prepare(
      `SELECT count(*) AS n FROM session WHERE userId = 'u-cascade'`,
    ).first<{ n: number }>()
    const a = await DB.prepare(
      `SELECT count(*) AS n FROM account WHERE userId = 'u-cascade'`,
    ).first<{ n: number }>()
    expect(s?.n).toBe(0)
    expect(a?.n).toBe(0)
  })

  it('email é UNIQUE em user', async () => {
    await DB.prepare(
      `INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt)
       VALUES ('u-uniq-1', 'Um', 'duplicado@exemplo.com', 1, ?, ?)`,
    )
      .bind(NOW, NOW)
      .run()

    await expect(
      DB.prepare(
        `INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt)
         VALUES ('u-uniq-2', 'Dois', 'duplicado@exemplo.com', 1, ?, ?)`,
      )
        .bind(NOW, NOW)
        .run(),
    ).rejects.toThrow(/UNIQUE constraint failed/)
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm --filter @piluvitu/financas exec vitest run src/schema.test.ts`
Esperado: FAIL — o teste de 14 tabelas encontra 10 (`expected 10 items, received 14` ou equivalente do `toEqual`), e os três testes de `migration 0002` falham com `"no such table: user"` (D1_ERROR).

- [ ] **Step 3: Criar `migrations/0002_better_auth.sql` (GREEN)**

```sql
-- =====================================================================
-- migrations/0002_better_auth.sql   —  alvo: Cloudflare D1 (SQLite)
--
-- Tabelas do Better Auth 1.6.25 (core, sem plugin). ZERO colisao com o
-- 0001: aquelas 10 sao plural (accounts, transactions, ...), estas sao
-- singular (user, session, account, verification).
--
-- PROCEDENCIA: DDL gerado por `npx auth@latest generate` contra um config
-- descartavel com node:sqlite (o CLI nao alcanca D1 direto) e ADAPTADO A
-- MAO:
--   date          -> TEXT     ('2026-07-26T16:27:46.844Z', ISO-8601 UTC)
--   emailVerified -> INTEGER  (0|1)
-- O tipo `date` do gerador NAO existe em STRICT — 'unknown datatype'. A
-- adaptacao e segura porque o adapter roda com supportsDates:false e
-- supportsBooleans:false em SQLite: o core ja converte Date->toISOString()
-- e boolean->1|0 na escrita, e reverte na leitura. Escrita real e leitura
-- de volta confirmadas por execucao dentro do Miniflare (spike S2/S5,
-- via internalAdapter.createOAuthUser e via signUpEmail/signInEmail).
--
-- EXCECAO DELIBERADA A CONVENCAO DO MODULO: as colunas sao camelCase
-- (emailVerified, createdAt, userId), nao snake_case como as 10 tabelas
-- do 0001. Renomear exigiria mapear cada campo em `user: { fields: {...} }`
-- na config, e todo plugin futuro herdaria a mesma divida. O nome dessas
-- colunas e contrato da biblioteca, nao escolha nossa — fica camelCase.
--
-- Nomes de indice preservados do gerador (session_userId_idx, ...) de
-- proposito: mantem `npx auth generate` comparavel por diff quando a
-- versao do Better Auth subir.
--
-- Sem BEGIN/COMMIT (o D1 rejeita). Forward-only: nao ha down migration.
-- =====================================================================

-- ---------------------------------------------------------------------
-- user — exatamente UMA linha em regime normal (modulo single-user). A
-- linha so nasce se o e-mail passar por databaseHooks.user.create.before
-- (src/lib/auth.ts). Este schema NAO impoe a allowlist: o UNIQUE de email
-- impede duplicata do mesmo e-mail, nao a entrada de um e-mail estranho —
-- quem impede isso e o hook, camada de aplicacao, nao o schema.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  emailVerified INTEGER NOT NULL,   -- 0|1, nunca boolean
  image         TEXT,
  createdAt     TEXT NOT NULL,      -- ISO-8601 UTC com 'Z', igual ao nowIsoUtc() do modulo
  updatedAt     TEXT NOT NULL
) STRICT;

-- ---------------------------------------------------------------------
-- session — o cookie better-auth.session_token (ou __Secure-... em prod,
-- por causa do baseURL https) carrega o `token` assinado; esta tabela e a
-- fonte de verdade da validade. ON DELETE CASCADE: apagar o user derruba
-- as sessoes junto (o D1 aplica FOREIGN KEY de verdade, PRAGMA
-- foreign_keys = 1 por padrao).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS session (
  id        TEXT PRIMARY KEY,
  expiresAt TEXT NOT NULL,
  token     TEXT NOT NULL UNIQUE,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  ipAddress TEXT,
  userAgent TEXT,
  userId    TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
) STRICT;

-- ---------------------------------------------------------------------
-- account — o vinculo com o provider. providerId='google', accountId=sub
-- do Google. `password` fica sempre NULL em producao: emailAndPassword
-- esta desligado em createAuth() (src/lib/auth.ts) — a coluna existe
-- porque e parte do schema padrao do Better Auth, nao porque sera usada.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS account (
  id                    TEXT PRIMARY KEY,
  accountId             TEXT NOT NULL,
  providerId            TEXT NOT NULL,
  userId                TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  accessToken           TEXT,
  refreshToken          TEXT,
  idToken               TEXT,
  accessTokenExpiresAt  TEXT,
  refreshTokenExpiresAt TEXT,
  scope                 TEXT,
  password              TEXT,
  createdAt             TEXT NOT NULL,
  updatedAt             TEXT NOT NULL
) STRICT;

-- ---------------------------------------------------------------------
-- verification — usada pelo fluxo OAuth para state/PKCE (nao so por
-- verificacao de e-mail). Linhas efemeras; nao ha rotina de limpeza nesta
-- fatia, e o volume single-user nao justifica uma.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS verification (
  id         TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value      TEXT NOT NULL,
  expiresAt  TEXT NOT NULL,
  createdAt  TEXT NOT NULL,
  updatedAt  TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS session_userId_idx         ON session(userId);
CREATE INDEX IF NOT EXISTS account_userId_idx         ON account(userId);
CREATE INDEX IF NOT EXISTS verification_identifier_idx ON verification(identifier);
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm --filter @piluvitu/financas exec vitest run src/schema.test.ts`
Esperado: todos os testes verdes, incluindo `'cria exatamente as 14 tabelas...'` e os 3 casos de `migration 0002`.

- [ ] **Step 5: Aplicar localmente (não `--remote`)**

Run: `pnpm --filter @piluvitu/financas db:migrate:local`
Esperado: saída confirmando `0002_better_auth.sql` aplicada no estado local do Miniflare (`.wrangler/state`).

- [ ] **Step 6: Commit**

```bash
git add apps/financas/migrations/0002_better_auth.sql apps/financas/src/schema.test.ts
git commit -m "$(cat <<'EOF'
feat(financas): migration 0002 com as tabelas do Better Auth (user/session/account/verification)

Tipo `date` do gerador trocado por TEXT (invalido em tabela STRICT) e
emailVerified por INTEGER 0|1 — o adapter D1 do Better Auth ja converte
Date/boolean nesses formatos na escrita e leitura. Forward-only, mesmo
estilo comentado do 0001.
EOF
)"
```

---

### Task 2: `src/lib/auth.ts` — factory memoizada + allowlist (camada 1) + `nodejs_compat`

**Files:**

- Create: `apps/financas/src/lib/auth.ts`
- Test: `apps/financas/src/lib/auth.test.ts`
- Modify: `apps/financas/wrangler.jsonc`

**Interfaces:**

- Consumes: tabelas `user`/`session`/`account`/`verification` da Task 1 (via `env.DB` real do Miniflare, `cloudflare:test`).
- Produces:
  - `export type AuthBindings = { DB: D1Database; BETTER_AUTH_URL: string; BETTER_AUTH_SECRET: string; GOOGLE_CLIENT_ID: string; GOOGLE_CLIENT_SECRET: string; ALLOWED_EMAIL: string }` — consumido por `session.ts` (Task 3) e `index.ts` (Task 3).
  - `export type Auth = ReturnType<typeof betterAuth>` — consumido por `session.ts` (Task 3, tipo de retorno de `getAuth`).
  - `export function getAuth(env: AuthBindings): Auth` — consumido por `session.ts#requireSession()` (Task 3) e `index.ts` (Task 3, para montar `/api/auth/*`).
  - `export function createAuth(env: AuthBindings): Auth` — consumido pelos próprios testes desta task (e por `getAuth`).
  - `export const CODIGO_BARRADO = 'nao_autorizado'` — consumido por `Gate.tsx#mensagemDeErro` (Task 4).
  - `export function isAllowedEmail(email: unknown, permitido: string): boolean` — consumido por `session.ts#decidirAcesso()` (Task 3).
  - `export function assertEmailPermitido(email: unknown, permitido: string): void` — usado só dentro de `auth.ts` (hook).

- [ ] **Step 1: Escrever `src/lib/auth.test.ts` (RED)**

```ts
// apps/financas/src/lib/auth.test.ts
import { env } from 'cloudflare:test'
import { describe, expect, test } from 'vitest'
import {
  CODIGO_BARRADO,
  assertEmailPermitido,
  createAuth,
  getAuth,
  isAllowedEmail,
  type AuthBindings,
} from './auth'

const PERMITIDO = 'dono@exemplo.com'

describe('isAllowedEmail — pura, fail closed', () => {
  test.each([
    ['dono@exemplo.com', PERMITIDO, true],
    [' Dono@Exemplo.COM ', PERMITIDO, true],
    ['dono@exemplo.com.br', PERMITIDO, false],
    ['xdono@exemplo.com', PERMITIDO, false],
    ['', PERMITIDO, false],
    [null, PERMITIDO, false],
    [undefined, PERMITIDO, false],
    [42, PERMITIDO, false],
    [PERMITIDO, '', false], // ALLOWED_EMAIL vazio barra até o e-mail certo
  ])('isAllowedEmail(%o, %o) === %s', (email, permitido, esperado) => {
    expect(isAllowedEmail(email, permitido)).toBe(esperado)
  })
})

describe('assertEmailPermitido', () => {
  test('e-mail estranho lança APIError FORBIDDEN com o slug', () => {
    expect(() =>
      assertEmailPermitido('invasor@gmail.com', PERMITIDO),
    ).toThrowError(
      expect.objectContaining({ status: 'FORBIDDEN', message: CODIGO_BARRADO }),
    )
  })

  test('o slug é minúsculo, sem acento, sem espaço (vira query string crua)', () => {
    expect(CODIGO_BARRADO).toMatch(/^[a-z0-9_]+$/)
  })

  test('e-mail permitido não lança', () => {
    expect(() => assertEmailPermitido(PERMITIDO, PERMITIDO)).not.toThrow()
  })
})

const testEnv: AuthBindings = {
  DB: env.DB,
  BETTER_AUTH_URL: 'http://localhost:8787',
  BETTER_AUTH_SECRET: 'a'.repeat(32),
  GOOGLE_CLIENT_ID: 'client-id-de-teste',
  GOOGLE_CLIENT_SECRET: 'client-secret-de-teste',
  ALLOWED_EMAIL: PERMITIDO,
}

describe('getAuth — memoização por identidade de env', () => {
  test('o mesmo objeto env devolve a MESMA instância', () => {
    expect(getAuth(testEnv)).toBe(getAuth(testEnv))
  })

  test('um objeto env diferente devolve uma instância diferente', () => {
    const outroEnv: AuthBindings = { ...testEnv }
    expect(getAuth(testEnv)).not.toBe(getAuth(outroEnv))
  })
})

// --------------------------------------------------------------------
// Prova de bloqueio via fluxo OAuth real (auth.handler), não via chamada
// interna adivinhada: signInSocial gera o cookie de state/PKCE,
// globalThis.fetch é sobrescrito só para o token endpoint do Google, e o
// id_token mockado só precisa ter FORMA de JWT — getUserInfo do provider
// Google decodifica via jose.decodeJwt sem checar assinatura (medido no
// spike S5). Isso exercita o hook databaseHooks.user.create.before de
// dentro do caminho real, sem depender de nenhuma API interna não
// documentada.
// --------------------------------------------------------------------
function b64url(obj: Record<string, unknown>): string {
  return btoa(JSON.stringify(obj))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function fakeIdToken(payload: Record<string, unknown>): string {
  return `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url(payload)}.assinatura-nao-verificada`
}

function extrairCookiesParaHeader(headers: Headers): string {
  return headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ')
}

async function tentarLoginGoogle(
  auth: ReturnType<typeof createAuth>,
  baseURL: string,
  perfil: { sub: string; email: string; name: string },
): Promise<Response> {
  const iniciar = await auth.api.signInSocial({
    body: { provider: 'google', callbackURL: '/', errorCallbackURL: '/login' },
    asResponse: true,
  })
  const { url } = (await iniciar.json()) as { url: string; redirect: boolean }
  const state = new URL(url).searchParams.get('state')
  const cookiesDeState = extrairCookiesParaHeader(iniciar.headers)

  const idToken = fakeIdToken({
    sub: perfil.sub,
    email: perfil.email,
    email_verified: true,
    name: perfil.name,
  })

  const fetchOriginal = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const urlTexto =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url
    if (urlTexto.includes('oauth2.googleapis.com/token')) {
      return new Response(
        JSON.stringify({
          access_token: 'fake-access-token',
          id_token: idToken,
          token_type: 'Bearer',
          expires_in: 3600,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }
    return fetchOriginal(input as Parameters<typeof fetch>[0])
  }) as typeof fetch

  try {
    const callbackUrl = `${baseURL}/api/auth/callback/google?code=codigo-fake&state=${encodeURIComponent(state ?? '')}`
    return await auth.handler(
      new Request(callbackUrl, { headers: { cookie: cookiesDeState } }),
    )
  } finally {
    globalThis.fetch = fetchOriginal
  }
}

describe('databaseHooks.user.create.before — bloqueio real de ponta a ponta', () => {
  test('e-mail fora da allowlist: 302 com ?error=nao_autorizado e ZERO linhas em user/account', async () => {
    const auth = createAuth(testEnv)

    const res = await tentarLoginGoogle(auth, testEnv.BETTER_AUTH_URL, {
      sub: 'sub-invasor',
      email: 'invasor@gmail.com',
      name: 'Invasor',
    })

    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain(`error=${CODIGO_BARRADO}`)

    const u = await env.DB.prepare('SELECT count(*) AS n FROM user').first<{
      n: number
    }>()
    const a = await env.DB.prepare('SELECT count(*) AS n FROM account').first<{
      n: number
    }>()
    expect(u?.n).toBe(0)
    expect(a?.n).toBe(0)
  })

  test('e-mail permitido: cria exatamente 1 user e 1 account (controle positivo)', async () => {
    const auth = createAuth(testEnv)

    const res = await tentarLoginGoogle(auth, testEnv.BETTER_AUTH_URL, {
      sub: 'sub-dono',
      email: PERMITIDO,
      name: 'Dono',
    })

    expect(res.status).toBe(302)
    expect(res.headers.get('location')).not.toContain('error=')

    const u = await env.DB.prepare('SELECT count(*) AS n FROM user').first<{
      n: number
    }>()
    const a = await env.DB.prepare('SELECT count(*) AS n FROM account').first<{
      n: number
    }>()
    expect(u?.n).toBe(1)
    expect(a?.n).toBe(1)
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm --filter @piluvitu/financas exec vitest run src/lib/auth.test.ts`
Esperado: FAIL — `Cannot find module './auth'` (o arquivo `src/lib/auth.ts` ainda não existe).

- [ ] **Step 3: Criar `src/lib/auth.ts` (GREEN)**

```ts
// apps/financas/src/lib/auth.ts
/**
 * Factory do Better Auth para o Worker de finanças. Login social Google,
 * D1 nativo (env.DB, sem adapter de terceiro — @better-auth/kysely-adapter
 * detecta o binding por duck-typing e monta seu próprio D1SqliteDialect).
 * Single-user: databaseHooks.user.create.before é a 1ª de duas camadas de
 * allowlist (a 2ª, sobre sessão já existente, é decidirAcesso em
 * session.ts).
 */
import { betterAuth } from 'better-auth'
import { APIError } from 'better-auth/api'

export type AuthBindings = {
  DB: D1Database
  BETTER_AUTH_URL: string
  BETTER_AUTH_SECRET: string
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  ALLOWED_EMAIL: string
}

export type Auth = ReturnType<typeof betterAuth>

/**
 * A mensagem do APIError VIRA o código de erro na URL: o callback faz
 * result.error.split(' ').join('_') e redireciona para
 * <errorCallbackURL>?error=<mensagem>. Por isso é slug: minúsculo, sem
 * acento, sem espaço.
 */
export const CODIGO_BARRADO = 'nao_autorizado'

/** Fail closed, igual ao requireAccess que saiu: allowlist vazia barra todo mundo. */
export function isAllowedEmail(email: unknown, permitido: string): boolean {
  const alvo = (permitido ?? '').trim().toLowerCase()
  if (alvo.length === 0) return false
  return typeof email === 'string' && email.trim().toLowerCase() === alvo
}

export function assertEmailPermitido(email: unknown, permitido: string): void {
  if (!isAllowedEmail(email, permitido)) {
    throw new APIError('FORBIDDEN', { message: CODIGO_BARRADO })
  }
}

/**
 * Memoização por identidade do objeto `env`. Motivo: o teto do free tier é
 * 10 ms de CPU por invocação, e construir a instância envolve montar
 * schemas zod e o pipeline de plugins. WeakMap (e não variável solta)
 * porque o env do teste é um objeto diferente do env de produção: chaveado
 * pelo objeto, um não envenena o outro, e nada vaza quando o isolate morre.
 * env tem identidade estável entre requests do mesmo isolate — medido
 * (spike S6b) contra um Worker real via SELF.fetch.
 */
const instancias = new WeakMap<AuthBindings, Auth>()

export function getAuth(env: AuthBindings): Auth {
  const quente = instancias.get(env)
  if (quente) return quente
  const nova = createAuth(env)
  instancias.set(env, nova)
  return nova
}

export function createAuth(env: AuthBindings): Auth {
  return betterAuth({
    // Binding cru: o adapter Kysely detecta D1 por duck-typing
    // ('batch' in db && 'exec' in db && 'prepare' in db) e monta o
    // D1SqliteDialect interno. Não existe adapter para instalar.
    database: env.DB,

    // OBRIGATÓRIOS e EXPLÍCITOS. @better-auth/core procura o segredo em
    // process.env/Deno.env/globalThis.__env__ — nenhum existe no Worker,
    // e a falta lança BetterAuthError no boot. Não há fallback.
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,

    // O secure/prefixo __Secure- do cookie sai do baseURL começar com
    // https:// — isProduction é SEMPRE falso no Worker (não há NODE_ENV).
    // Por isso baseURL não é opcional aqui.

    telemetry: { enabled: false },
    emailAndPassword: { enabled: false },

    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        prompt: 'select_account',
      },
    },

    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            assertEmailPermitido(user.email, env.ALLOWED_EMAIL)
            return { data: user }
          },
        },
      },
    },
  })
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm --filter @piluvitu/financas exec vitest run src/lib/auth.test.ts`
Esperado: todos os testes verdes (pure table, hook lançando, memoização, bloqueio real com 0 linhas, controle positivo com 1 linha em cada tabela).

- [ ] **Step 5: Adicionar `nodejs_compat` ao `wrangler.jsonc` (precaução, não correção de bug)**

Em `apps/financas/wrangler.jsonc`, logo abaixo de `"compatibility_date"`:

```jsonc
  "compatibility_date": "2026-07-01",
  // Medido (spike S3): NÃO é obrigatório para este stack subir ou rodar
  // nesta compatibility_date — node:crypto e node:async_hooks já são
  // módulos nativos do runtime aqui. O flag só silencia 2 warnings de
  // build do wrangler ("wasn't found on the file system but is built
  // into node") e protege contra o comportamento não ser garantido em
  // compatibility_date/versões de workerd futuras. Não pesa no bundle
  // (resolução de módulo nativo, não polyfill JS — medido: mesmo
  // gzip com e sem o flag).
  "compatibility_flags": ["nodejs_compat"],
```

- [ ] **Step 6: Medir o bundle real e registrar o número**

Run: `pnpm --filter @piluvitu/financas exec wrangler deploy --dry-run`
Esperado: saída sem os 2 warnings de `node:crypto`/`node:async_hooks` (silenciados pelo flag), `Total Upload: ... / gzip: ...` próximo de **330 KiB** (medido no spike: 330,17 KiB) — bem abaixo do gate de ~1 MB.

- [ ] **Step 7: Lint**

Run: `pnpm --filter @piluvitu/financas lint`
Esperado: sem erros de `tsc --noEmit`.

- [ ] **Step 8: Commit**

```bash
git add apps/financas/package.json pnpm-lock.yaml apps/financas/src/lib/auth.ts apps/financas/src/lib/auth.test.ts apps/financas/wrangler.jsonc
git commit -m "$(cat <<'EOF'
feat(financas): factory Better Auth (getAuth/createAuth) + allowlist na criação (camada 1)

databaseHooks.user.create.before lança APIError FORBIDDEN antes do
primeiro INSERT quando o e-mail não bate com ALLOWED_EMAIL — provado por
teste que dirige o fluxo OAuth real (signInSocial + callback com
globalThis.fetch mockado) e confere 0 linhas em user/account depois do
bloqueio. compatibility_flags: nodejs_compat entra por precaução (medido
que não é obrigatório nesta compatibility_date).
EOF
)"
```

---

### Task 3: Troca do middleware — `session.ts` (camada 2) + `index.ts` + remoção do Access

**Files:**

- Create: `apps/financas/src/lib/session.ts`
- Test: `apps/financas/src/lib/session.test.ts`
- Modify: `apps/financas/src/index.ts`
- Modify: `apps/financas/src/index.test.ts`
- Delete: `apps/financas/src/lib/access.ts`
- Delete: `apps/financas/src/lib/access.test.ts`
- Modify: `apps/financas/wrangler.jsonc`
- Create: `apps/financas/.dev.vars.example`

**Interfaces:**

- Consumes: `getAuth`, `isAllowedEmail`, `AuthBindings`, `Auth` de `./auth` (Task 2); `errJson` de `./envelope` (existente).
- Produces:
  - `export type Decisao = { ok: true } | { ok: false; status: 401 | 403; code: string; message: string }` — usado só internamente e nos testes.
  - `export function decidirAcesso(sessao, permitido: string): Decisao` — consumido pelos testes desta task; não é importado por `index.ts` (fica encapsulado em `requireSession()`).
  - `export function isRotaDeAuth(path: string): boolean` — consumido por `index.ts`.
  - `export function requireSession(): MiddlewareHandler<{ Bindings: AuthBindings }>` — consumido por `index.ts`.
  - `Bindings` em `index.ts` passa a ser `AuthBindings` (mesmo shape) — nenhuma task depois desta lê `Bindings` além da própria SPA (que não importa tipos do Worker).

- [ ] **Step 1: Escrever `src/lib/session.test.ts` (RED)**

```ts
// apps/financas/src/lib/session.test.ts
import { env } from 'cloudflare:test'
import { betterAuth } from 'better-auth'
import { Hono } from 'hono'
import { describe, expect, test } from 'vitest'
import type { AuthBindings } from './auth'
import { decidirAcesso, isRotaDeAuth, requireSession } from './session'

const PERMITIDO = 'dono@exemplo.com'

describe('decidirAcesso — matriz pura', () => {
  test('sessão nula é 401 not_authenticated', () => {
    expect(decidirAcesso(null, PERMITIDO)).toMatchObject({
      ok: false,
      status: 401,
      code: 'not_authenticated',
    })
  })

  test('sessão sem user é 401 not_authenticated', () => {
    expect(decidirAcesso({}, PERMITIDO)).toMatchObject({
      ok: false,
      status: 401,
      code: 'not_authenticated',
    })
  })

  test('e-mail fora da allowlist é 403 email_not_allowed', () => {
    expect(
      decidirAcesso({ user: { email: 'invasor@gmail.com' } }, PERMITIDO),
    ).toMatchObject({ ok: false, status: 403, code: 'email_not_allowed' })
  })

  test('e-mail permitido, caixa e espaço não importam', () => {
    expect(
      decidirAcesso({ user: { email: ' Dono@Exemplo.COM ' } }, PERMITIDO),
    ).toEqual({ ok: true })
  })

  test('ALLOWED_EMAIL vazio barra até o próprio dono (fail closed)', () => {
    expect(decidirAcesso({ user: { email: PERMITIDO } }, '')).toMatchObject({
      ok: false,
      status: 403,
      code: 'email_not_allowed',
    })
  })
})

describe('isRotaDeAuth', () => {
  test('casa o path exato e qualquer sub-rota de /api/auth', () => {
    expect(isRotaDeAuth('/api/auth')).toBe(true)
    expect(isRotaDeAuth('/api/auth/callback/google')).toBe(true)
    expect(isRotaDeAuth('/api/auth/get-session')).toBe(true)
  })

  test('não casa outras rotas de /api', () => {
    expect(isRotaDeAuth('/api/accounts')).toBe(false)
    expect(isRotaDeAuth('/api/authx')).toBe(false)
  })
})

const BASE_URL_TESTE = 'http://localhost:8787'
const SECRET_TESTE = 'a'.repeat(32)

function appProtegido() {
  const app = new Hono<{ Bindings: AuthBindings }>()
  app.use('*', requireSession())
  app.get('/protegido', (c) => c.json({ visto: true }))
  return app
}

type CorpoErro = {
  ok: boolean
  data: null
  notifications: Array<{ code: string; type: string }>
}

describe('requireSession — integração HTTP', () => {
  test('sem cookie responde 401 not_authenticated com envelope', async () => {
    const testEnv: AuthBindings = {
      DB: env.DB,
      BETTER_AUTH_URL: BASE_URL_TESTE,
      BETTER_AUTH_SECRET: SECRET_TESTE,
      GOOGLE_CLIENT_ID: 'x',
      GOOGLE_CLIENT_SECRET: 'y',
      ALLOWED_EMAIL: PERMITIDO,
    }

    const res = await appProtegido().request('/protegido', {}, testEnv)
    expect(res.status).toBe(401)
    const body = (await res.json()) as CorpoErro
    expect(body.ok).toBe(false)
    expect(body.notifications[0].code).toBe('not_authenticated')
  })

  test('sessão válida com e-mail FORA da allowlist é barrada com 403 — camada 2, independente do hook de criação', async () => {
    // Instância SÓ deste teste, com emailAndPassword ligado e SEM o hook
    // de allowlist — simula um usuário que entrou por QUALQUER caminho
    // fora do hook de criação (seed manual, bug futuro, config trocada
    // temporariamente). Produção mantém emailAndPassword desligado
    // (ver auth.ts); isto é técnica de teste, medida funcionando no
    // spike S6a (signUpEmail devolve um set-cookie real e assinado).
    const authDeTeste = betterAuth({
      database: env.DB,
      baseURL: BASE_URL_TESTE,
      secret: SECRET_TESTE,
      emailAndPassword: { enabled: true },
    })

    const cadastro = await authDeTeste.api.signUpEmail({
      body: {
        email: 'invasor@gmail.com',
        password: 'senha-forte-123',
        name: 'Invasor',
      },
      asResponse: true,
    })
    const cookie = cadastro.headers.getSetCookie()[0]?.split(';')[0]
    if (!cookie) throw new Error('signUpEmail não devolveu cookie de sessão')

    const testEnv: AuthBindings = {
      DB: env.DB,
      BETTER_AUTH_URL: BASE_URL_TESTE,
      BETTER_AUTH_SECRET: SECRET_TESTE,
      GOOGLE_CLIENT_ID: 'client-id-de-teste',
      GOOGLE_CLIENT_SECRET: 'client-secret-de-teste',
      ALLOWED_EMAIL: PERMITIDO, // dono, NÃO invasor@gmail.com
    }

    const res = await appProtegido().request(
      '/protegido',
      { headers: { cookie } },
      testEnv,
    )
    expect(res.status).toBe(403)
    const body = (await res.json()) as CorpoErro
    expect(body.notifications[0].code).toBe('email_not_allowed')
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm --filter @piluvitu/financas exec vitest run src/lib/session.test.ts`
Esperado: FAIL — `Cannot find module './session'` (arquivo ainda não existe).

- [ ] **Step 3: Criar `src/lib/session.ts` (GREEN)**

```ts
// apps/financas/src/lib/session.ts
/**
 * Camada 2 da allowlist: barra o USO de uma sessão já existente cujo
 * e-mail não está em ALLOWED_EMAIL. Independente do hook de criação
 * (auth.ts#assertEmailPermitido) — o Better Auth não tem consciência de
 * allowlist fora do hook (medido: spike S6a, sessão de e-mail fora da
 * lista, criada por fora do hook, valida normalmente no getSession).
 */
import type { MiddlewareHandler } from 'hono'
import { getAuth, isAllowedEmail, type Auth, type AuthBindings } from './auth'
import { errJson } from './envelope'

export type Decisao =
  | { ok: true }
  | { ok: false; status: 401 | 403; code: string; message: string }

/**
 * Isolada do runtime do Better Auth e do Hono de propósito: é o que
 * permite provar "sessão existe mas o e-mail é outro" com um teste barato
 * (ver session.test.ts), sem depender de HTTP.
 */
export function decidirAcesso(
  sessao: { user?: { email?: string | null } } | null | undefined,
  permitido: string,
): Decisao {
  if (!sessao?.user) {
    return {
      ok: false,
      status: 401,
      code: 'not_authenticated',
      message: 'requisição sem sessão válida',
    }
  }
  if (!isAllowedEmail(sessao.user.email, permitido)) {
    return {
      ok: false,
      status: 403,
      code: 'email_not_allowed',
      message: 'este e-mail não tem acesso ao aplicativo',
    }
  }
  return { ok: true }
}

/** '/api/auth' também, não só '/api/auth/…' — senão o path exato cai na guarda. */
export function isRotaDeAuth(path: string): boolean {
  return path === '/api/auth' || path.startsWith('/api/auth/')
}

/**
 * Substitui requireAccess. Módulo single-user: nada downstream lê a
 * identidade, então ela NÃO vai para o contexto do Hono — o tipo continua
 * limpo nas rotas de domínio, que não mudam uma linha.
 */
export function requireSession(): MiddlewareHandler<{
  Bindings: AuthBindings
}> {
  return async (c, next) => {
    let sessao: Awaited<ReturnType<Auth['api']['getSession']>>
    try {
      sessao = await getAuth(c.env).api.getSession({
        headers: c.req.raw.headers,
      })
    } catch (err) {
      // getSession vai ao D1. Sem este catch o erro vazaria como 500 sem
      // envelope, e api<T>() na SPA levantaria 'invalid_envelope' —
      // sintoma sem relação nenhuma com a causa.
      console.error('getSession falhou', err)
      return errJson(
        503,
        'auth_unavailable',
        'não foi possível validar a sessão agora',
      )
    }

    const d = decidirAcesso(sessao, c.env.ALLOWED_EMAIL)
    if (!d.ok) return errJson(d.status, d.code, d.message)
    await next()
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passa (só `session.test.ts`, `index.ts` ainda usa Access)**

Run: `pnpm --filter @piluvitu/financas exec vitest run src/lib/session.test.ts`
Esperado: todos os testes verdes, incluindo a sessão forjada com e-mail fora da allowlist barrada com 403.

- [ ] **Step 5: Reescrever `src/index.ts` (troca a montagem)**

```ts
// apps/financas/src/index.ts
import { Hono } from 'hono'
import { type AuthBindings, getAuth } from './lib/auth'
import { errJson, okJson } from './lib/envelope'
import { isRotaDeAuth, requireSession } from './lib/session'
import { accountsRoutes } from './routes/accounts'
import { categoriesRoutes } from './routes/categories'
import { debtsRoutes } from './routes/debts'
import { installmentPlansRoutes } from './routes/installments'
import { payeesRoutes } from './routes/payees'
import { reportsRoutes } from './routes/reports'
import { transactionsRoutes } from './routes/transactions'

export type Bindings = AuthBindings

const app = new Hono<{ Bindings: Bindings }>()

/**
 * DUAS exceções à guarda, ambas EXPLÍCITAS:
 *  - /api/health: sondado por monitor externo, que não tem cookie.
 *  - /api/auth/*: é o próprio fluxo de login. Barrar aqui é deadlock —
 *    ninguém consegue autenticar porque não está autenticado.
 */
app.use('/api/*', async (c, next) => {
  if (c.req.path === '/api/health') return next()
  if (isRotaDeAuth(c.req.path)) return next()
  return requireSession()(c, next)
})

app.get('/api/health', () => okJson({ status: 'up' }))

// Só GET e POST: são os únicos métodos que o Better Auth usa. Precisa vir
// ACIMA do catch-all — a regra do marcador vale igual aqui.
app.on(['GET', 'POST'], '/api/auth/*', (c) => getAuth(c.env).handler(c.req.raw))

app.route('/api', accountsRoutes)
app.route('/api', transactionsRoutes)
app.route('/api/installment-plans', installmentPlansRoutes)
app.route('/api/debts', debtsRoutes)
app.route('/api/reports', reportsRoutes)
app.route('/api/payees', payeesRoutes)
app.route('/api/categories', categoriesRoutes)

// Catch-all do /api: 404 também sai no envelope. Fora de /api quem responde é
// o Static Assets (SPA), que roda antes do Worker.
// SEMPRE POR ÚLTIMO — no Hono a ordem de registro decide. Qualquer
// app.route('/api', ...) registrado DEPOIS desta linha fica inalcançável.
app.all('/api/*', () => errJson(404, 'not_found', 'rota não encontrada'))

export default app
```

- [ ] **Step 6: Reescrever `src/index.test.ts`**

```ts
// apps/financas/src/index.test.ts
import { env, SELF } from 'cloudflare:test'
import { describe, expect, test } from 'vitest'
import app, { type Bindings } from './index'
import type { Envelope } from './lib/envelope'

describe('worker financas — bindings', () => {
  test('expõe o binding D1 "DB" e ele responde a uma query', async () => {
    expect(env.DB).toBeDefined()
    const row = await env.DB.prepare('SELECT 1 AS um').first<{ um: number }>()
    expect(row?.um).toBe(1)
  })

  test('expõe o binding ASSETS apontando para ./web/dist', async () => {
    const res = await env.ASSETS.fetch(
      'https://financas.piluvitu.com.br/index.html',
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
  })

  test('GET /api/health devolve o envelope (via SELF, env real do wrangler.jsonc)', async () => {
    const res = await SELF.fetch('https://financas.piluvitu.com.br/api/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      ok: true,
      data: { status: 'up' },
      notifications: [],
    })
  })

  test('rota desconhecida sob /api sem cookie de sessão responde 401 (guarda do Better Auth na frente do catch-all)', async () => {
    const res = await SELF.fetch(
      'https://financas.piluvitu.com.br/api/nao-existe',
    )
    expect(res.status).toBe(401)
  })
})

// Sem DB e sem rede: estes casos não precisam de sessão real.
const authTestEnv = {
  DB: env.DB,
  BETTER_AUTH_URL: 'http://localhost:8787',
  BETTER_AUTH_SECRET: 'a'.repeat(32),
  GOOGLE_CLIENT_ID: 'client-id-de-teste',
  GOOGLE_CLIENT_SECRET: 'client-secret-de-teste',
  ALLOWED_EMAIL: 'dono@exemplo.com',
} as unknown as Bindings

type CorpoErro = {
  ok: boolean
  data: null
  notifications: Array<{ code: string }>
}

describe('worker de finanças', () => {
  test('GET /api/health é público (não exige sessão)', async () => {
    const res = await app.request('/api/health', {}, authTestEnv)
    expect(res.status).toBe(200)

    const body = (await res.json()) as Envelope<{ status: string }>
    expect(body.ok).toBe(true)
    expect(body.data).toEqual({ status: 'up' })
    expect(body.notifications).toEqual([])
  })

  test('GET /api/accounts sem cookie de sessão responde 401 not_authenticated', async () => {
    const res = await app.request('/api/accounts', {}, authTestEnv)
    expect(res.status).toBe(401)
    expect(((await res.json()) as CorpoErro).notifications[0].code).toBe(
      'not_authenticated',
    )
  })

  test('GET /api/accounts com cookie de sessão inexistente responde 401 not_authenticated', async () => {
    // Formato real (medido, spike S6a): '<token>.<assinatura>'. Um par que
    // nunca foi emitido por getAuth() não bate com nenhuma linha de
    // session — getSession() devolve null (não lança), decidirAcesso trata
    // igual a "sem sessão".
    const res = await app.request(
      '/api/accounts',
      {
        headers: {
          cookie:
            'better-auth.session_token=token-que-nao-existe.assinatura-que-nao-bate',
        },
      },
      authTestEnv,
    )
    expect(res.status).toBe(401)
    expect(((await res.json()) as CorpoErro).notifications[0].code).toBe(
      'not_authenticated',
    )
  })

  test('/api/auth/* não é barrado pela guarda de sessão', async () => {
    const res = await app.request('/api/auth/get-session', {}, authTestEnv)
    // Não é a nossa guarda que responde: se fosse, seria 401 not_authenticated
    // no nosso envelope. O Better Auth responde por conta própria, fora do
    // envelope { ok, data, notifications }.
    expect(res.status).not.toBe(401)
  })

  test('rota /api inexistente devolve envelope JSON, não texto puro', async () => {
    const res = await app.request(
      '/api/health',
      { method: 'POST' },
      authTestEnv,
    )
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toBe(
      'application/json; charset=utf-8',
    )
    expect(((await res.json()) as CorpoErro).notifications[0].code).toBe(
      'not_found',
    )
  })
})
```

- [ ] **Step 7: Apagar `access.ts`/`access.test.ts` e trocar as `vars` do `wrangler.jsonc`**

Run: `git rm apps/financas/src/lib/access.ts apps/financas/src/lib/access.test.ts`

Em `apps/financas/wrangler.jsonc`, substituir o bloco `"vars"` inteiro:

```jsonc
  "vars": {
    // Não é conveniência: no Worker isProduction é sempre falso (não há
    // NODE_ENV), então é o https:// deste valor que liga o `secure` e o
    // prefixo __Secure- do cookie de sessão.
    "BETTER_AUTH_URL": "https://financas.piluvitu.com.br",

    // Single-user. Vazio barra todo mundo (fail closed), igual ao
    // ACCESS_ALLOWED_EMAILS que saiu.
    "ALLOWED_EMAIL": "paulo.tspi@gmail.com",
  },
```

`BETTER_AUTH_SECRET`/`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` **não** entram em `vars` — são segredos, configurados via `wrangler secret put` (Task 5) e localmente via `.dev.vars`.

- [ ] **Step 8: Criar `apps/financas/.dev.vars.example`**

```
BETTER_AUTH_URL=http://localhost:5273
BETTER_AUTH_SECRET=troque-por-openssl-rand-base64-32
GOOGLE_CLIENT_ID=troque-pelo-client-id-do-google-cloud
GOOGLE_CLIENT_SECRET=troque-pelo-client-secret-do-google-cloud
```

- [ ] **Step 9: Regenerar os tipos de binding**

Run: `pnpm --filter @piluvitu/financas cf-typegen`
Esperado: `apps/financas/worker-configuration.d.ts` regenerado, `interface Env` passando a incluir `BETTER_AUTH_URL`/`ALLOWED_EMAIL` (as vars) — não é comando de migration, é geração de tipos a partir do `wrangler.jsonc`, seguro de rodar.

- [ ] **Step 10: Rodar a suíte inteira do Worker e confirmar que passa**

Run: `pnpm --filter @piluvitu/financas test`
Esperado: **todos** os arquivos verdes, incluindo os 7 arquivos de teste de rota **sem nenhuma edição** (`accounts.test.ts`, `transactions.test.ts`, `installments.test.ts`, `debts.test.ts`, `payees.test.ts`, `categories.test.ts`, `reports.test.ts`) — é a prova de que a troca não vazou para o domínio.

- [ ] **Step 11: Lint**

Run: `pnpm --filter @piluvitu/financas lint`
Esperado: sem erros.

- [ ] **Step 12: Commit**

```bash
git add apps/financas/src/lib/session.ts apps/financas/src/lib/session.test.ts apps/financas/src/index.ts apps/financas/src/index.test.ts apps/financas/wrangler.jsonc apps/financas/.dev.vars.example apps/financas/worker-configuration.d.ts
git rm apps/financas/src/lib/access.ts apps/financas/src/lib/access.test.ts
git commit -m "$(cat <<'EOF'
feat(financas): troca o middleware de Cloudflare Access para Better Auth (camada 2 da allowlist)

requireSession() substitui requireAccess(): getSession() + decidirAcesso()
barram por e-mail a cada request, independente de como a sessão nasceu —
provado com um cookie forjado (signUpEmail numa instância de teste sem o
hook de criação) validado contra uma allowlist diferente. Catálogo de
erros perde invalid_token/invalid_audience/token_expired/jwks_unavailable
e ganha auth_unavailable (503, D1 fora do ar durante getSession).
access.ts/access.test.ts removidos. Os 7 arquivos de teste de rota não
mudam uma linha.
EOF
)"
```

---

### Task 4: SPA — cliente Better Auth, `Gate.tsx`, integração em `App.tsx`

**Files:**

- Create: `apps/financas/web/src/auth-client.ts`
- Create: `apps/financas/web/src/Gate.tsx`
- Test: `apps/financas/web/src/Gate.test.tsx`
- Modify: `apps/financas/web/src/App.tsx`
- Test: `apps/financas/web/src/App.test.tsx`
- Modify: `apps/financas/web/package.json`

**Interfaces:**

- Consumes: `CODIGO_BARRADO = 'nao_autorizado'` (Task 2, replicado como literal em `mensagemDeErro` — a SPA não importa código do Worker através da fronteira de bundle, mesma convenção de `web/src/lib/dates.ts` ser espelho e não import).
- Produces: `export function mensagemDeErro(codigo: string | null): string | null`, `export function Gate({ children }: { children: ReactNode })`, `export const authClient`, `export const { useSession, signIn, signOut }` de `auth-client.ts` — consumidos por `App.tsx`.

- [ ] **Step 1: Adicionar `better-auth` ao `web/package.json`**

Em `apps/financas/web/package.json`, dentro de `"dependencies"`:

```jsonc
    "@piluvitu/tools": "workspace:*",
    "better-auth": "1.6.25",
    "react": "^19.2.0",
```

Run: `pnpm install`

- [ ] **Step 2: Escrever `web/src/Gate.test.tsx` (RED)**

```tsx
// apps/financas/web/src/Gate.test.tsx
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { Gate, mensagemDeErro } from './Gate'

const { fetchFake } = vi.hoisted(() => ({ fetchFake: vi.fn() }))

vi.mock('./auth-client', async () => {
  const { createAuthClient } = await import('better-auth/react')
  const client = createAuthClient({
    fetchOptions: { customFetchImpl: fetchFake },
  })
  return {
    authClient: client,
    useSession: client.useSession,
    signIn: client.signIn,
    signOut: client.signOut,
  }
})

function respostaSessao(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('mensagemDeErro', () => {
  test('null quando não há código na URL', () => {
    expect(mensagemDeErro(null)).toBeNull()
  })

  test('mensagem amigável para nao_autorizado', () => {
    expect(mensagemDeErro('nao_autorizado')).toBe(
      'Esta conta do Google não tem acesso a este aplicativo.',
    )
  })

  test('mensagem genérica com o código para qualquer outro erro', () => {
    expect(mensagemDeErro('outro_erro')).toBe(
      'Não foi possível entrar (outro_erro).',
    )
  })
})

describe('Gate', () => {
  test('enquanto pending, não renderiza o conteúdo protegido nem a tela de login', () => {
    fetchFake.mockImplementation(() => new Promise(() => {})) // nunca resolve
    render(
      <Gate>
        <p>SEGREDO</p>
      </Gate>,
    )
    expect(screen.getByText('carregando…')).toBeDefined()
    expect(screen.queryByText('SEGREDO')).toBeNull()
    expect(screen.queryByText('Entrar com Google')).toBeNull()
  })

  test('sem sessão mostra a tela de login, sem o conteúdo protegido', async () => {
    fetchFake.mockResolvedValue(respostaSessao(null))
    render(
      <Gate>
        <p>SEGREDO</p>
      </Gate>,
    )
    await waitFor(() =>
      expect(screen.getByText('Entrar com Google')).toBeDefined(),
    )
    expect(screen.queryByText('SEGREDO')).toBeNull()
  })

  test('com sessão válida renderiza o conteúdo protegido', async () => {
    fetchFake.mockResolvedValue(
      respostaSessao({
        user: { id: 'u1', email: 'dono@exemplo.com', name: 'Dono' },
        session: {
          id: 's1',
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        },
      }),
    )
    render(
      <Gate>
        <p>SEGREDO</p>
      </Gate>,
    )
    await waitFor(() => expect(screen.getByText('SEGREDO')).toBeDefined())
    expect(screen.queryByText('Entrar com Google')).toBeNull()
  })

  test('?error=nao_autorizado renderiza a mensagem em role="alert"', async () => {
    fetchFake.mockResolvedValue(respostaSessao(null))
    window.history.pushState({}, '', '/login?error=nao_autorizado')
    render(
      <Gate>
        <p>SEGREDO</p>
      </Gate>,
    )
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        'Esta conta do Google não tem acesso a este aplicativo.',
      ),
    )
  })
})
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `pnpm --filter @piluvitu/financas-web exec vitest run src/Gate.test.tsx`
Esperado: FAIL — `Cannot find module './Gate'` (nem `Gate.tsx` nem `auth-client.ts` existem ainda).

- [ ] **Step 4: Criar `web/src/auth-client.ts` e `web/src/Gate.tsx` (GREEN)**

```ts
// apps/financas/web/src/auth-client.ts
import { createAuthClient } from 'better-auth/react'

// SEM baseURL de propósito: sem argumento, resolve para
// window.location.origin + '/api/auth' — onde o Worker monta o handler.
// O cliente também seta credentials: 'include' sozinho.
export const authClient = createAuthClient()
export const { useSession, signIn, signOut } = authClient
```

```tsx
// apps/financas/web/src/Gate.tsx
import type { ReactNode } from 'react'
import { signIn, useSession } from './auth-client'

export function mensagemDeErro(codigo: string | null): string | null {
  if (codigo === null) return null
  if (codigo === 'nao_autorizado')
    return 'Esta conta do Google não tem acesso a este aplicativo.'
  return `Não foi possível entrar (${codigo}).`
}

export function Gate({ children }: { children: ReactNode }) {
  const { data: sessao, isPending } = useSession()

  // A ORDEM É A GUARDA. isPending PRIMEIRO: o primeiro render é sempre
  // pending. Testar !sessao antes pisca a tela de login pra quem já está
  // logado.
  if (isPending) return <p aria-busy="true">carregando…</p>

  // Gate por !sessao, NUNCA por error: um blip de rede (erro que não é
  // 401) preserva o data anterior no átomo — derrubar por error
  // deslogaria o dono à toa.
  if (!sessao) {
    const erro = mensagemDeErro(
      new URLSearchParams(window.location.search).get('error'),
    )
    return (
      <main>
        <h1>Finanças</h1>
        {erro !== null && <p role="alert">{erro}</p>}
        <button
          onClick={() =>
            signIn.social({
              provider: 'google',
              callbackURL: '/',
              // PATH, não hash: o redirect de erro monta
              // `${errorURL}?error=…` — com '/#/login' a query cairia
              // dentro do hash e location.search ficaria vazio.
              errorCallbackURL: '/login',
            })
          }
        >
          Entrar com Google
        </button>
      </main>
    )
  }

  return <>{children}</>
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `pnpm --filter @piluvitu/financas-web exec vitest run src/Gate.test.tsx`
Esperado: todos os testes verdes.

- [ ] **Step 6: Escrever `web/src/App.test.tsx` (RED)**

```tsx
// apps/financas/web/src/App.test.tsx
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { App } from './App'

vi.mock('./auth-client', () => ({
  useSession: () => ({
    data: {
      user: { id: 'u1', email: 'dono@exemplo.com', name: 'Dono' },
      session: {},
    },
    isPending: false,
  }),
  signIn: { social: vi.fn() },
  signOut: vi.fn(),
}))

function mockFetchVazio() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ ok: true, data: [], notifications: [] }),
    }),
  )
}

afterEach(() => {
  window.location.hash = ''
  vi.unstubAllGlobals()
})

describe('App — roteamento por hash com Gate autenticado', () => {
  test('mostra o e-mail da sessão no cabeçalho', async () => {
    mockFetchVazio()
    render(<App />)
    await waitFor(() =>
      expect(screen.getByText('dono@exemplo.com')).toBeDefined(),
    )
  })

  test('hash default (#/contas) mostra a tela Contas', async () => {
    mockFetchVazio()
    render(<App />)
    await waitFor(() => expect(screen.getByText('Contas')).toBeDefined())
  })

  test('#/dividas mostra a tela Dívidas', async () => {
    mockFetchVazio()
    window.location.hash = '#/dividas'
    render(<App />)
    await waitFor(() => expect(screen.getByText('Dívidas')).toBeDefined())
  })

  test('#/comprometido mostra a tela Comprometido', async () => {
    mockFetchVazio()
    window.location.hash = '#/comprometido'
    render(<App />)
    await waitFor(() => expect(screen.getByText('Comprometido')).toBeDefined())
  })
})
```

- [ ] **Step 7: Rodar e confirmar que falha**

Run: `pnpm --filter @piluvitu/financas-web exec vitest run src/App.test.tsx`
Esperado: FAIL — não há e-mail nenhum no cabeçalho hoje (`App.tsx` ainda não usa `useSession`/`Gate`), `screen.getByText('dono@exemplo.com')` nunca resolve (timeout do `waitFor`).

- [ ] **Step 8: Reescrever `web/src/App.tsx` (GREEN)**

```tsx
// apps/financas/web/src/App.tsx
import { useEffect, useState } from 'react'
import { signOut, useSession } from './auth-client'
import { Gate } from './Gate'
import { todayInTeresina } from './lib/dates'
import { AccountsPage } from './pages/accounts'
import { CommitmentsPage } from './pages/commitments'
import { DebtDetailPage } from './pages/debt-detail'
import { DividasPage } from './pages/DividasPage'
import { NewEntryPage } from './pages/new-entry'

export function useHash(): string {
  const [hash, setHash] = useState(() => window.location.hash || '#/contas')
  useEffect(() => {
    const onHash = () => setHash(window.location.hash || '#/contas')
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return hash
}

/** Competência do mês corrente em Teresina (UTC−3, sem horário de verão). */
export function competenciaAtual(now: Date = new Date()): string {
  return todayInTeresina(now).slice(0, 7)
}

function AppShell() {
  const { data: sessao } = useSession()
  const hash = useHash()
  const debtId = hash.startsWith('#/dividas/')
    ? hash.slice('#/dividas/'.length)
    : null

  return (
    <>
      <header>
        <span>{sessao?.user.email}</span>
        <button onClick={() => signOut()}>Sair</button>
      </header>
      <nav>
        <a href="#/contas">Contas</a>
        <a href="#/dividas">Dívidas</a>
        <a href="#/lancar">Lançar</a>
        <a href="#/comprometido">Comprometido</a>
      </nav>
      {debtId ? (
        <DebtDetailPage debtId={debtId} />
      ) : hash === '#/dividas' || hash === '#/dividas/' ? (
        <DividasPage />
      ) : hash.startsWith('#/comprometido') ? (
        <CommitmentsPage from={competenciaAtual()} />
      ) : hash.startsWith('#/lancar') ? (
        <NewEntryPage />
      ) : (
        <AccountsPage />
      )}
    </>
  )
}

export function App() {
  return (
    <Gate>
      <AppShell />
    </Gate>
  )
}
```

- [ ] **Step 9: Rodar e confirmar que passa**

Run: `pnpm --filter @piluvitu/financas-web exec vitest run src/App.test.tsx`
Esperado: todos os testes verdes.

- [ ] **Step 10: Rodar a suíte inteira da SPA**

Run: `pnpm --filter @piluvitu/financas-web test`
Esperado: **todos** os arquivos verdes — os 8 arquivos de teste de tela existentes (que renderizam as páginas diretamente, não `App`) continuam intactos, mais `Gate.test.tsx` e `App.test.tsx` novos.

- [ ] **Step 11: Lint**

Run: `pnpm --filter @piluvitu/financas-web lint`
Esperado: sem erros de `tsc --noEmit`.

- [ ] **Step 12: Commit**

```bash
git add apps/financas/web/package.json pnpm-lock.yaml apps/financas/web/src/auth-client.ts apps/financas/web/src/Gate.tsx apps/financas/web/src/Gate.test.tsx apps/financas/web/src/App.tsx apps/financas/web/src/App.test.tsx
git commit -m "$(cat <<'EOF'
feat(financas-web): Gate de login com Google (Better Auth) na SPA

authClient sem baseURL (resolve para o próprio host + /api/auth). Gate
prioriza isPending sobre !sessao pra não piscar a tela de login em quem
já está logado, e nunca gateia por `error` do átomo (só por ausência de
sessão) pra não deslogar o dono num blip de rede. App.tsx passa a mostrar
e-mail + Sair no cabeçalho autenticado. Testes usam vi.mock('./auth-client')
com um client real (customFetchImpl), não um mock manual da API do hook.
EOF
)"
```

---

### Task 5: Deploy e documentação

**Files:**

- Modify: `apps/financas/CLAUDE.md`

**Interfaces:**

- Consumes: todo o trabalho das Tasks 1-4 (nenhuma interface de código nova produzida aqui — é documentação + operação manual).
- Produces: nenhuma (última task da fatia).

- [ ] **Step 1: Rodar a suíte inteira como gate de regressão antes de documentar**

Run: `pnpm --filter @piluvitu/financas test && pnpm --filter @piluvitu/financas-web test`
Esperado: **todos** os arquivos verdes nos dois pacotes — Worker e SPA.

- [ ] **Step 2: Reescrever a seção "Autenticação" em `apps/financas/CLAUDE.md`**

Substituir a seção `## Autenticação — Cloudflare Access` inteira (do heading até o parágrafo que antecede `## Datas, fuso e ids`) por:

```markdown
## Autenticação — Better Auth (Google)

Zero _policy_ externa: o login roda **dentro do Worker**, em `/api/auth/*`, montado acima do catch-all. Duas camadas independentes fazem o papel que o Access fazia sozinho:

- **Camada 1 — `databaseHooks.user.create.before`** (`src/lib/auth.ts`): lança `APIError('FORBIDDEN', { message: 'nao_autorizado' })` antes do primeiro `INSERT` quando o e-mail não bate com `ALLOWED_EMAIL`. O usuário barrado loga normal no Google, volta pro callback, e é redirecionado com `?error=nao_autorizado` — **nada é gravado** em `user`/`account`.
- **Camada 2 — `requireSession()`/`decidirAcesso()`** (`src/lib/session.ts`): confere o e-mail da sessão a cada request em `/api/*`. Protege o **uso**, não a criação — necessária porque o Better Auth não sabe nada sobre allowlist fora do hook de criação (uma sessão de e-mail fora da lista, se a linha `user` tivesse entrado por qualquer outro caminho, seria validada normalmente pelo `getSession`).

- **Montagem:** `src/index.ts` aplica `requireSession()` em `/api/*` com duas exceções explícitas — `/api/health` (monitor externo sem cookie) e `/api/auth/*` (o próprio fluxo de login; barrar seria deadlock). `app.on(['GET','POST'], '/api/auth/*', ...)` fica **acima** do catch-all (`// SEMPRE POR ÚLTIMO`), mesma regra de sempre.
- **`env.DB` → `betterAuth()`:** factory `getAuth(env)` memoizada por `WeakMap` (chave = identidade do objeto `env`), porque `betterAuth()` quer o binding na construção mas em Worker o binding só existe por requisição. `@better-auth/kysely-adapter` detecta `env.DB` por duck-typing e monta seu próprio `D1SqliteDialect` — nenhum adapter de terceiro.
- **`nodejs_compat`:** ligado em `wrangler.jsonc` por precaução (silencia 2 warnings de build do `node:crypto`/`node:async_hooks`) — **não é obrigatório** para este stack subir ou rodar nesta `compatibility_date`; medido funcionando sem o flag (signup, hash de senha, D1, callback OAuth completo).
- **Vars:** `BETTER_AUTH_URL` (o `https://` liga `secure`/prefixo `__Secure-` do cookie — `isProduction` nunca é `true` no Worker) e `ALLOWED_EMAIL` (single-user, vazio barra todo mundo — fail closed). **Secrets** (`wrangler secret put`): `BETTER_AUTH_SECRET` (≥32 chars), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — `GOOGLE_CLIENT_ID` é secret e não var pela regra "tudo do Google é secret", mesmo aparecendo em claro na URL de autorização.
- **Local:** `apps/financas/.dev.vars` (gitignorado — `**/.dev.vars` já cobre) com os 4 valores. Template em `.dev.vars.example`.
- **Testes:** o hook de bloqueio é provado dirigindo o fluxo OAuth real (`signInSocial` → callback → hook), com `globalThis.fetch` sobrescrito só para o token endpoint do Google e um `id_token` com **forma** de JWT (o provider Google decodifica via `jose.decodeJwt` sem checar assinatura — não é preciso assinar de verdade). A camada 2 é provada com um cookie de sessão **forjado de verdade**: `auth.api.signUpEmail` numa instância de teste com `emailAndPassword` ligado (só em teste; produção mantém desligado) devolve um `set-cookie` real e assinado, validável contra uma `requireSession()` configurada com allowlist diferente.

⚠️ **`/api/auth/*` não passa pelo envelope `{ok,data,notifications}`, de propósito** — as respostas são as do próprio Better Auth. `api<T>()` da SPA nunca deve ser usado nessas rotas.

⚠️ **Sem header `Origin`, o Better Auth responde 403 `MISSING_OR_NULL_ORIGIN` fora do envelope.** Todo `POST`/teste para `/api/auth/*` precisa do header.
```

- [ ] **Step 3: Atualizar o catálogo de códigos**

Na seção `## Envelope de resposta`, trocar a linha `Códigos em uso: ...` por:

```markdown
Códigos em uso: `not_authenticated`, `email_not_allowed`, `auth_unavailable`, `not_found`, `invalid_json`, `invalid_scope`, `invalid_account`, `constraint_violation`, `invalid_transfer`, `invalid_entry`, `invalid_limit`, `invalid_query`, `over_allocation`.
```

(`invalid_token`, `invalid_audience`, `token_expired`, `jwks_unavailable` saem — eram específicos do Access; `auth_unavailable` entra — `getSession()` toca D1, e D1 fora do ar sem `try/catch` vazaria como 500 sem envelope.)

- [ ] **Step 4: Corrigir o checklist de deploy §6**

Na seção `## Deploy`, substituir a subseção `### 1. Aplicação no Cloudflare Access` inteira por:

```markdown
### 1. Google OAuth Client (uma vez — reaproveita o client da área de admin)

No **Google Cloud Console → APIs & Services → Credentials**, no OAuth client **Web application** já usado pela área de admin, em **Authorized redirect URIs → ADD URI** (adicionar, nunca substituir — a área de admin quebra):
```

https://financas.piluvitu.com.br/api/auth/callback/google
http://localhost:5273/api/auth/callback/google
http://localhost:8787/api/auth/callback/google

```

**Remover a Application `financas` do Cloudflare Zero Trust, se existir** — enquanto ela existir, o Access barra a requisição antes do Worker rodar, e `/api/auth/*` (sem `Cf-Access-Jwt-Assertion`) nunca chega no Better Auth.
```

E, dentro do checklist manual (antigo final da seção `### 6`), trocar:

```diff
- [ ] `https://financas.piluvitu.com.br` redireciona para o login do Google do Access (não abre direto).
- [ ] Login com `paulo.tspi@gmail.com` entra e mostra a tela **Contas**.
- [ ] Login com outra conta Google é **negado** pelo Access.
- [ ] `curl -s -o /dev/null -w '%{http_code}\n' https://financas.piluvitu.com.br/api/health` devolve **302** ou **403** (sem JWT o Access barra antes do Worker responder — devolver **200** significa que a policy não está protegendo /api/*).
```

por:

```markdown
- [ ] `https://financas.piluvitu.com.br` carrega a SPA, que mostra a **própria** tela "Entrar com Google" (não redireciona sozinho).
- [ ] Login com `paulo.tspi@gmail.com` entra e mostra a tela **Contas**, com o e-mail no cabeçalho.
- [ ] Login com **outra conta Google** volta em `/login?error=nao_autorizado` com a mensagem "Esta conta do Google não tem acesso a este aplicativo." — e no D1, `SELECT count(*) FROM user` continua **1** (nenhuma linha órfã do login recusado).
- [ ] `curl -s -o /dev/null -w '%{http_code}\n' https://financas.piluvitu.com.br/api/health` devolve **200** (o Access não está mais na frente — devolver 302/403 aqui seria sinal de Application do Access esquecida ativa).
- [ ] `curl -s -o /dev/null -w '%{http_code}\n' https://financas.piluvitu.com.br/api/accounts` sem cookie devolve **401**.
```

- [ ] **Step 5: Commit da documentação**

```bash
git add apps/financas/CLAUDE.md
git commit -m "$(cat <<'EOF'
docs(financas): CLAUDE.md reflete Better Auth (Google) no lugar do Cloudflare Access

Seção de autenticação reescrita (2 camadas, factory memoizada, nodejs_compat
não é obrigatório), catálogo de códigos atualizado (4 saem, 1 entra) e
checklist de deploy §6 corrigido — os itens que dependiam do Access
invertem de resultado (200 no /api/health em vez de 302/403, etc.).
EOF
)"
```

- [ ] **Step 6 — AÇÕES MANUAIS (informadas aqui, não executadas por este plano)**

Comandos e passos abaixo são exclusivamente para o dono do repo rodar manualmente, na ordem. Nenhum destes é executado como parte da implementação deste plano.

**a) Migration em produção (forward-only — checar antes de aplicar):**

```bash
pnpm --filter @piluvitu/financas exec wrangler d1 migrations list piluvitu-financas --remote
pnpm --filter @piluvitu/financas exec wrangler d1 migrations apply piluvitu-financas --remote
```

Esperado: `0001_financas_init.sql` (já aplicada) e `0002_better_auth.sql` (nova) listadas como aplicadas.

**b) Secrets em produção:**

```bash
pnpm --filter @piluvitu/financas exec wrangler secret put BETTER_AUTH_SECRET
pnpm --filter @piluvitu/financas exec wrangler secret put GOOGLE_CLIENT_ID
pnpm --filter @piluvitu/financas exec wrangler secret put GOOGLE_CLIENT_SECRET
```

**c) Deploy:**

```bash
pnpm --filter @piluvitu/financas run deploy
```

**d) Checklist manual pós-deploy** — rodar do celular Android **e** do MacBook (§6 do `CLAUDE.md`, já atualizado no Step 4 acima), incluindo o teste destrutivo: entrar com uma segunda conta Google, confirmar `/login?error=nao_autorizado` **e** `SELECT count(*) FROM user` continuando **1** no D1 de produção.
