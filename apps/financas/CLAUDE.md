# CLAUDE.md — apps/financas

## Migrations (D1)

O schema vive em `migrations/`, aplicado pelo `wrangler d1 migrations`. O
`0001_financas_init.sql` cria as 10 tabelas **STRICT**, os índices (quase todos
parciais), os 2 triggers de teto de alocação, as 2 views e o seed de categorias.

| Comando                                              | Efeito                                                  |
| ---------------------------------------------------- | ------------------------------------------------------- |
| `pnpm --filter @piluvitu/financas db:migrate:local`  | aplica no estado local do Miniflare (`.wrangler/state`) |
| `pnpm --filter @piluvitu/financas db:migrate:remote` | aplica no D1 de produção                                |
| `pnpm --filter @piluvitu/financas db:migrate:list`   | lista o que ainda não foi aplicado                      |

Direto pelo wrangler, se preferir:

```bash
pnpm --filter @piluvitu/financas exec wrangler d1 migrations apply piluvitu-financas --local
pnpm --filter @piluvitu/financas exec wrangler d1 migrations apply piluvitu-financas --remote
```

⚠️ **Forward-only: não existe down migration no D1.** Depois que uma migration
rodou com `--remote`, ela é imutável — corrigir schema significa escrever
`0002_*.sql`, nunca editar a anterior. Enquanto só rodou local, dá para editar o
`0001`, mas é preciso zerar o estado antes (`rm -rf apps/financas/.wrangler/state/v3/d1`),
senão o wrangler considera a migration já aplicada e não a reexecuta.

⚠️ **Índice no D1 não pode ser alterado** — só dropado (irreversível) e recriado.
Por isso `imported_id` / `import_source` e o `uq_tx_imported` nascem já no `0001`,
mesmo o import sendo fatia ②.

⚠️ **Sem `BEGIN`/`COMMIT`/`SAVEPOINT`** na migration: o D1 rejeita. Atomicidade em
runtime é via `db.batch()`, que faz rollback real da sequência inteira quando um
statement aborta (inclusive por `RAISE(ABORT)` de trigger).

⚠️ **`CREATE TABLE`: um `CHECK`/`UNIQUE` de tabela (não preso a uma coluna) tem
que vir DEPOIS de todas as column-defs.** A gramática do SQLite (== SQL padrão)
é `column-def* table-constraint*` — uma vez que aparece um table-constraint
solto, nenhuma column-def pode vir depois. MEDIDO com `sqlite3` 3.51.0 e com D1
local: um `CHECK` solto seguido de mais uma coluna dá exatamente
`near "<próxima-coluna>": syntax error`. As tabelas `transactions` e
`debt_payments` tiveram CHECKs de tabela reposicionados para o fim por causa
disso — mesma lógica, mesmas colunas, mesma ordem entre colunas, só a POSIÇÃO
das linhas de CHECK mudou pro único lugar em que a gramática aceita.

### `0002_better_auth.sql` — tabelas do Better Auth

Migration independente do `better-auth` estar instalado/configurado (é só SQL):
cria `user`, `session`, `account`, `verification` — as 4 tabelas core do Better
Auth 1.6.25 (sem plugin), singular e **camelCase** (`emailVerified`, `userId`,
`createdAt`), de propósito diferentes das 10 tabelas plural/snake_case do
`0001` — o nome das colunas é contrato da biblioteca, não escolha do módulo.
`session.userId`/`account.userId` têm `REFERENCES user(id) ON DELETE CASCADE`
— apagar o `user` (single-user: só existe uma linha em regime normal) derruba
sessões e vínculos OAuth junto.

⚠️ **O tipo `date` do gerador (`npx auth@latest generate`) não existe em
`STRICT`** — vira `unknown datatype`. Adaptado à mão para `TEXT` (ISO-8601 UTC)
e `emailVerified` para `INTEGER` (`0|1`): seguro porque o adapter D1 do Better
Auth roda com `supportsDates:false`/`supportsBooleans:false`, então o core já
converte `Date→toISOString()` e `boolean→1|0` antes de escrever, e reverte na
leitura.

⚠️ **ACHADO, MEDIDO contra o Miniflare local: coluna `TEXT` em tabela `STRICT`
NÃO rejeita `INTEGER` — ela CONVERTE.** `INSERT INTO user (..., createdAt, ...)
VALUES (..., 12345, ...)` teve sucesso e gravou `'12345.0'` (`typeof` `text`).
Bate com a regra documentada do SQLite (sqlite.org/stricttables.html): coluna
`TEXT` aplica o equivalente a `CAST(x AS TEXT)` em `INTEGER`/`REAL` recebido,
só rejeita `BLOB` ou o que não converte. A direção que REALMENTE rejeita (e
que a suíte usa, tanto no `0001` quanto no `0002`) é `TEXT` não-numérico
dentro de coluna `INTEGER` (`'STRICT recusa texto em coluna INTEGER'` no
`0001`, `'STRICT recusa TEXT não-numérico em coluna INTEGER (user.emailVerified)'`
no `0002`) — mensagem real `cannot store TEXT value in INTEGER column`. Vale
para qualquer coluna `TEXT` nova (`0002` ou futura): não escrever teste que
espera `STRICT` barrar número em coluna `TEXT`, porque o SQLite não barra.

### Testes de schema

`src/schema.test.ts` roda 100% local no Miniflare via
`@cloudflare/vitest-pool-workers` — sem secret e sem `wrangler login`.
`vitest.config.ts` lê as migrations com `readD1Migrations()` e injeta em
`env.TEST_MIGRATIONS`; `src/test-setup.ts` roda `reset()` seguido de
`applyD1Migrations(env.DB, env.TEST_MIGRATIONS)` num `beforeEach` global.
A opção `isolatedStorage` **não existe mais na 0.18.x** — o isolamento é
explícito, e como `reset()` apaga também a tabela de controle das migrations,
a ordem reset → reaplicar é obrigatória.

```bash
pnpm --filter @piluvitu/financas exec vitest run src/schema.test.ts
```

Depois, aplicar de fato:

```bash
pnpm --filter @piluvitu/financas db:migrate:local
pnpm --filter @piluvitu/financas db:migrate:remote
```

## Envelope de resposta

Toda rota JSON responde no formato único `{ "ok": bool, "data": <payload>|null, "notifications": [{type,code,message,field?}] }`. Helpers em `src/lib/envelope.ts`: `okJson(data, status = 200)` e `errJson(status, code, message, field?)`. `notifications` nunca serializa como `null` — é `[]` quando vazio; `field` nunca serializa como `null` — a chave simplesmente some do JSON quando ausente.

**Este shape não busca mais paridade com o Go** (`apps/api/internal/httpx/respond.go`). Decisão do dono do repo: a API em Go vai ser reescrita em TS rodando em Worker, então "casar com o Go" deixou de ser critério de design — o envelope se justifica pelos méritos daqui. Duas decisões concretas, cada uma com motivo próprio:

- **`field` existe.** As Tasks 6, 7, 9 e 14 têm formulários com validação real — conta `credit_card` sem `closing_day`, alocação acima do teto do item, `amount_cents` zero, parcelas fora de 1..360. Poder dizer _qual_ campo ofendeu é diferença de UI de verdade, e o tipo `Notification` é importado por várias tasks: alargar agora é barato, alargar no meio da execução do plano é mudança quebrando contrato.
- **`'success'` NÃO entra em `NotificationKind`.** É especulativo: a SPA decide o toast de sucesso pelo `ok: true` da própria resposta, sem precisar de uma notification carregando isso. Se algum dia fizer falta de verdade, entra com motivo concreto — não antes.

Códigos em uso: `not_authenticated`, `email_not_allowed`, `auth_unavailable`, `not_found`, `invalid_json`, `invalid_scope`, `invalid_account`, `constraint_violation`, `invalid_transfer`, `invalid_entry`, `invalid_limit`, `invalid_query`, `over_allocation`.

## Autenticação — Better Auth (Task 3, `requireAccess`/Cloudflare Access removidos)

O Cloudflare Access saiu por completo (`src/lib/access.ts`/`access.test.ts` deletados na Task 3) — Zero Trust exigia cartão de crédito pra verificação e o dono não tem como. No lugar: **Better Auth** com login social Google (`src/lib/auth.ts`, Task 2) + um segundo guard sobre a sessão (`src/lib/session.ts`, Task 3). Duas camadas de allowlist, propósitos diferentes:

1. **Camada 1 — criação:** `databaseHooks.user.create.before` em `auth.ts` barra o e-mail **antes** do primeiro `INSERT` (ver seção _Better Auth — factory_ abaixo).
2. **Camada 2 — uso:** `decidirAcesso` em `session.ts` barra a cada request, **independente de como a sessão nasceu**. Necessária porque o Better Auth não tem noção de allowlist fora do hook de criação — uma sessão que já existe para um e-mail desautorizado (allowlist trocada depois do login, seed manual, bug futuro) é emitida e validada normalmente pelo `getSession()`. Provado em `session.test.ts` com um cookie **genuinamente válido**: uma segunda instância `betterAuth()` só do teste, com `emailAndPassword` ligado e **sem** o hook de criação, gera um usuário/sessão reais via `signUpEmail` (cookie assinado de verdade) para um e-mail fora da allowlist — `requireSession()` barra com 403 mesmo assim, **e o MESMO cookie reusado com a allowlist trocada pro e-mail dele chega na rota com 200** (fix round 1 — controle positivo, prova que `decidirAcesso` de fato lê/compara o e-mail, não só rejeita por padrão).

`src/lib/session.ts` exporta:

- **`decidirAcesso(sessao, permitido): Decisao`** — pura, sem HTTP nem D1. `Decisao = { ok: true } | { ok: false; status: 401 | 403; code; message }`. Sessão nula/sem `user` → 401 `not_authenticated`; e-mail fora da allowlist (via `isAllowedEmail` de `auth.ts`, case-insensitive, fail-closed) → 403 `email_not_allowed`.
- **`isRotaDeAuth(path): boolean`** — casa `/api/auth` exato e qualquer `/api/auth/*`.
- **`requireSession(): MiddlewareHandler<{ Bindings: AuthBindings }>`** — chama `getAuth(c.env).api.getSession({ headers: c.req.raw.headers })`, aplica `decidirAcesso` contra `c.env.ALLOWED_EMAIL`. **Não usa `createAuth` diretamente** (custa CPU, teto de 10 ms/invocação no free tier — sempre `getAuth`, memoizado). A identidade da sessão **não vai para o contexto do Hono**: módulo single-user, nada downstream precisa ler quem está logado, o que mantém as rotas de domínio (`accounts.ts`, `transactions.ts`, etc.) sem mudar uma linha de tipo.
- **`getSession()` pode falhar** (vai ao D1) — sem `try/catch` o erro vazaria como `500` sem envelope, e `api<T>()` na SPA levantaria `invalid_envelope` (sintoma sem relação com a causa real). `requireSession` captura e devolve `503 auth_unavailable`.

**Montagem em `src/index.ts`:** `Bindings = AuthBindings` (era `{ DB, ACCESS_TEAM_DOMAIN, ACCESS_AUD, ACCESS_ALLOWED_EMAILS }`, ver `auth.ts` pra shape completo). O middleware em `/api/*` tem DUAS exceções explícitas: `/api/health` (monitor externo sem cookie) e `isRotaDeAuth(c.req.path)` (o próprio fluxo de login — barrar aqui é deadlock, ninguém autentica porque não está autenticado). `app.on(['GET', 'POST'], '/api/auth/*', (c) => getAuth(c.env).handler(c.req.raw))` delega pro handler nativo do Better Auth — só GET/POST porque são os únicos métodos que ele usa — e precisa ficar **acima** do catch-all, mesma regra de sempre (`app.all('/api/*')` **SEMPRE por último**, ordem de registro decide no Hono).

⚠️ **Catálogo de erros mudou.** `invalid_token`/`invalid_audience`/`token_expired`/`jwks_unavailable` (específicos da verificação de JWT do Access) saíram junto com `access.ts`. Entrou `auth_unavailable` (503, D1 fora do ar durante `getSession`). `not_authenticated`/`email_not_allowed` continuam, agora emitidos por `session.ts` em vez de `access.ts`.

- **Testes:** `pnpm --filter @piluvitu/financas exec vitest run src/lib/session.test.ts` (10/10) — matriz pura de `decidirAcesso`, `isRotaDeAuth`, e três casos de integração HTTP via `app.request()`:
  - sem cookie → 401;
  - cookie genuinamente válido de e-mail fora da allowlist → 403, **e o MESMO cookie reusado com `ALLOWED_EMAIL` igual ao e-mail da sessão → 200 `{ visto: true }`** (fix round 1, controle positivo — sem ele nenhum teste da suíte provava que uma sessão permitida chega na rota: toda asserção HTTP era rejeição ou rota isenta, e um `await next()` trocado por um `return errJson(...)` passaria por todos os 401/403 e só quebraria aqui; MEDIDO por mutação);
  - D1 indisponível durante `getSession` → 503 `auth_unavailable`, não 500 sem envelope (fix round 1; precisa de um cookie com assinatura VÁLIDA — um cookie malformado é rejeitado por HMAC local antes de tocar o D1, então nunca exercitaria um `DB` quebrado).

  `src/index.test.ts` cobre a montagem: `/api/health` público, `/api/accounts` sem cookie → 401, cookie com token/assinatura que não bate com nenhuma linha real → 401 (não lança — `getSession()` devolve `null` para um cookie bem-formado mas inexistente), `/api/auth/*` não passa pela nossa guarda — MEDIDO: `GET /api/auth/get-session` sem cookie devolve `200` com corpo `null` cru (nem `{session:null}`, nem o nosso envelope); `expect(status).not.toBe(401)` (versão original) também passaria com um `500`/`503` de verdade, então a asserção foi trocada por `200` + corpo `null` (fix round 1).

## Better Auth — factory (`src/lib/auth.ts`) — Task 2, CONECTADA na Task 3

- **`getAuth(env)` / `createAuth(env)`** — `createAuth` monta `betterAuth({ database: env.DB, ... })`; `getAuth` memoiza por **identidade do objeto `env`** (`WeakMap<AuthBindings, Auth>`, nunca uma variável solta), porque montar os schemas zod e o pipeline de plugins custa CPU e o teto do free tier é 10 ms/invocação. `env` tem identidade estável entre requests do mesmo isolate (medido, spike S6b, via `SELF.fetch`); um `WeakMap` também evita que o `env` sintético dos testes envenene a instância de produção.
- **`database: env.DB` direto, sem adapter de terceiro** — MEDIDO: o adapter Kysely embutido do Better Auth detecta o binding D1 por duck-typing (`'batch' in db && 'exec' in db && 'prepare' in db`) e monta seu próprio `D1SqliteDialect`. Escrita e leitura reais confirmadas contra o D1 do Miniflare.
- ⚠️ **`createAuth` lança explicitamente se `BETTER_AUTH_SECRET` estiver vazio (fix round 1) — o Better Auth, sozinho, NÃO faria isso.** MEDIDO contra o pacote instalado (`create-context.mjs:70-80`): sem secret, ele cai pro default hardcoded `'better-auth-secret-12345678901234567890'` (publicado no próprio pacote) e só lançaria depois se `isProduction` fosse `true` — nunca, num Worker (mesmo fato do bullet de rate limit abaixo). Esquecer `wrangler secret put BETTER_AUTH_SECRET` publicaria em produção assinando toda sessão/cookie de state OAuth com uma constante pública, sem erro nem log — deploy e login pareceriam saudáveis. `baseURL` ausente **não** ganhou guard equivalente: a lib só emite `logger.warn` (não fatal pra ela), mas quebra o cookie same-site em produção (ver _Deploy_ → Custom Domain). Coberto em `auth.test.ts` (`createAuth — guard explícito de BETTER_AUTH_SECRET`, 3 casos).
- **Allowlist single-user, camada 1 de 2:** `databaseHooks.user.create.before` chama `assertEmailPermitido(user.email, env.ALLOWED_EMAIL)`, que lança `APIError('FORBIDDEN', { message: CODIGO_BARRADO })` (`CODIGO_BARRADO = 'nao_autorizado'`) **antes do primeiro `INSERT`** quando o e-mail não bate. MEDIDO: e-mail fora da allowlist termina em `302` com `?error=nao_autorizado` e **zero linhas** em `user`/`account` — nenhuma linha órfã. `isAllowedEmail` é fail-closed, igual ao `requireAccess` que este módulo substitui: `ALLOWED_EMAIL` vazio barra todo mundo.
- **Camada 2 implementada na Task 3.** Better Auth não tem noção de allowlist fora do hook de criação — se uma sessão já existe para um e-mail desautorizado (ex.: allowlist trocada depois do login), ela é emitida e validada normalmente. `session.ts#decidirAcesso` é o segundo guard, sobre sessão já existente — ver seção _Autenticação — Better Auth_ acima.
- **`nodejs_compat`** entrou em `wrangler.jsonc` por precaução, não correção de bug. **Verificado na Task 3** (Step 12, com `src/index.ts` importando `getAuth` e o `better-auth` de fato no grafo publicado): `wrangler deploy --dry-run` não emite nenhum warning de `node:async_hooks`/`node:crypto` mesmo com o bundle contendo esses imports (confirmado grepando o bundle gerado em `--outdir`) — a flag está silenciando os warnings de verdade, não é um dry-run vazio de propósito nenhum.
- **Rate limiting: OFF por default num Worker, ligado explicitamente aqui.** O default do Better Auth é `enabled: options.rateLimit?.enabled ?? isProduction` (`node_modules/better-auth/dist/context/create-context.mjs:171`) — e `isProduction` é sempre `false` num Worker (não há `NODE_ENV`, mesmo raciocínio do bullet de `baseURL`/cookie acima). Sem `rateLimit.enabled: true` explícito em `createAuth`, o rate limit ficaria DESLIGADO em produção pra sempre, e `POST /api/auth/sign-in/social`/`GET /api/auth/get-session` virariam escrita/leitura de D1 sem throttle — um script sem sessão nenhuma esgota a cota diária (100k D1 writes/dia, 100k Worker requests/dia) e derruba o próprio módulo do dono. `window: 60` (segundos) / `max: 20` é escolha deliberada desta task, documentada em código; `storage: 'memory'` porque `'database'` pediria uma tabela `rateLimit` nova (migration `0003` — fora de escopo de correção pontual, migration aqui é forward-only).
  - ⚠️ **`storage: 'memory'` é POR ISOLATE, não é um contador global.** Sob carga a Cloudflare pode subir mais de um isolate do mesmo Worker (colos diferentes, ou até o mesmo colo) — cada um com seu próprio `Map` em memória. Um atacante cujas requisições batem em N isolates recebe, na prática, N vezes o teto configurado. É mitigação PARCIAL (eleva o custo de um script ingênuo batendo num isolate só), não um teto rígido — não tratar como airtight.
  - ⚠️ **Resolução de IP não é automática — precisa de `advanced.ipAddress.ipAddressHeaders: ['cf-connecting-ip']`.** A lista default de headers do Better Auth pra achar o IP do cliente é só `['x-forwarded-for']` (`@better-auth/core/dist/utils/ip.mjs`), que NÃO inclui `cf-connecting-ip`. MEDIDO: sem essa linha, `auth.handler` loga "Rate limiting could not determine a client IP and is falling back to a single shared per-path bucket" — vira um balde ÚNICO e GLOBAL por rota, compartilhado pelo dono e por qualquer atacante, não "por IP" nenhum (o que tornaria falsa a frase "aperta o atacante, não trava o dono" do bullet acima). `CF-Connecting-IP` é o header correto aqui porque este Worker atende requisição pública direto — a borda da Cloudflare seta esse header e sobrescreve antes do Worker rodar, o requisitante externo não consegue forjá-lo (`X-Forwarded-For` não tem essa garantia). Confirmado em teste: sem a linha, o warning aparece mesmo passando `cf-connecting-ip` na requisição sintética; com ela, some.
  - ⚠️ **`window: 60`/`max: 20` NÃO governa `/sign-in/*`.** O Better Auth tem uma regra especial embutida por prefixo de rota, com precedência sobre a config: `/sign-in` roda com **window 10 / max 3** (`rate-limiter/index.mjs:370-383`, aplicada em `:288-291`). A proteção real do login social é mais apertada que os números configurados, e não vem deles — o bloco acima cobre o resto (`get-session`, `callback`). Não reescrever esses valores achando que afrouxam ou apertam o login.
  - ⚠️ **O `Map` do `storage: 'memory'` é singleton de MÓDULO, não por instância** (`rate-limiter/index.mjs:6`) — `reset()` do `cloudflare:test` zera o D1, não ele, e `createAuth()` novo não ganha balde novo. Testes do mesmo arquivo que batem em `/sign-in*` através de `auth.handler()` reusando o mesmo IP sintético **acumulam contagem entre si** contra o teto de 3-por-10s acima. Hoje é inofensivo (3 chamadas no total), mas teste novo nas Tasks 3/4 que reuse `203.0.113.7` pode falhar de forma intermitente e fácil de diagnosticar errado — variar o IP por teste é a saída. O `onRequestRateLimit` só roda no `onRequest` do router (`api/index.mjs:168`), então chamada direta a `auth.api.*()` não conta.
- **`AuthBindings`** (`DB` + `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ALLOWED_EMAIL`). Desde a Task 3: `BETTER_AUTH_URL`/`ALLOWED_EMAIL` (não são segredos) foram promovidas pra `vars` em `wrangler.jsonc`; `BETTER_AUTH_SECRET`/`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` continuam **fora** de `vars` (são segredos) — localmente vêm de `.dev.vars` (gitignored; `.dev.vars.example` documenta as chaves sem valor real), em produção via `wrangler secret put` (Task 5).
- ⚠️ **`ALLOWED_EMAIL` é UM e-mail só — NUNCA CSV, ao contrário do `ACCESS_ALLOWED_EMAILS` que saiu.** `isAllowedEmail` compara STRING INTEIRA: um valor `"dono@exemplo.com,outro@exemplo.com"` não casa com nada, nem com o dono. Continua fail-closed (não é brecha), mas o sintoma é indistinguível de "o login do Google quebrou" — não carregar esse hábito do módulo anterior pra cá. Coberto por linha de teste dedicada em `auth.test.ts`.
- **Bundle medido na Task 3, com o import ligado (`src/index.ts` → `getAuth` → `better-auth` de fato no grafo publicado):** `wrangler deploy --dry-run` mede **332,34 KiB gzip / 1926,25 KiB total** — bate com a faixa de ~330 KiB estimada no spike, contra os 27,66 KiB gzip de quando `better-auth` ainda era tree-shaken inteiro (Task 2). MUITO abaixo do teto de 3 MB do Worker de qualquer forma.

⚠️ **`export type Auth = ReturnType<typeof betterAuth>` (a forma óbvia, e a que o brief original descrevia) NÃO compila.** Sem `betterAuth` aplicado a nenhum argumento, `ReturnType` resolve pro genérico na constraint mais larga, `Auth<BetterAuthOptions>`. A config literal passada dentro de `createAuth` é mais específica que `BetterAuthOptions` (`database` obrigatório onde lá é opcional), e `Auth<T>` usa `T` em posição contravariante (via `DBAdapter<T>`/`PluginContext<T>`). MEDIDO nas DUAS direções (`tsc --noEmit` contra um arquivo de teste descartável): `Auth<{...literal...}>` não é atribuível a `Auth<BetterAuthOptions>` (`$context` incompatível) **e a volta também falha** (`Auth<BetterAuthOptions>` não é atribuível a `Auth<{...literal}>` — `database` opcional lá, obrigatório aqui). **Não é subtipo/supertipo, é invariância: os dois tipos são MUTUAMENTE não-atribuíveis** — `Auth` (este alias) não é "mais preciso" no sentido de subtipagem, é um tipo incomparável ao genérico largo. Consequência prática: uma segunda instância ou um mock tipado como `ReturnType<typeof betterAuth>` cru NÃO se atribui a `Auth`, mesmo sendo "outro Better Auth" — só serve pra algo que veio de `createAuth`/`betterAuth` com esta MESMA config literal. Correção usada: `export type Auth = ReturnType<typeof createAuth>` (a referência a `createAuth`, declarada mais abaixo no arquivo, funciona por hoisting de tipo) — e `createAuth` perde a anotação de retorno explícita `: Auth`, porque anotá-la criaria referência circular (`Auth` dependeria do próprio tipo que anota `createAuth`). Qualquer código futuro que precise do tipo de uma instância Better Auth construída por uma factory local deve seguir o mesmo padrão: tipar a partir de `ReturnType<typeof suaFactory>`, nunca de `ReturnType<typeof betterAuth>` cru.

⚠️ **`cloudflare:test` NÃO exporta `fetchMock` na versão instalada** (`@cloudflare/vitest-pool-workers@0.18.8`, também a mais recente publicada no npm nesta data) — MEDIDO grepando `fetchmock` (case-insensitive) em todo o pacote (`types/` e `dist/`): zero ocorrências. `import { fetchMock } from 'cloudflare:test'` importa `undefined` sem erro de módulo (o binding sintético não é ESM estrito o bastante pra recusar em tempo de link) e só quebra no primeiro uso (`fetchMock.activate is not a function`). Substituto usado em `src/lib/auth.test.ts` (`tentarLoginGoogle`, ver acima) e em `src/lib/session.test.ts` (mock de fetch não é necessário lá — `signUpEmail` não sai da rede): sobrescrever `globalThis.fetch` diretamente com um handler que intercepta só a URL específica esperada e delega o resto pro `fetch` original, restaurado num `finally`. Funciona porque o teste importa `./auth` diretamente (não via `SELF`/service binding), então roda no MESMO isolate — a sobrescrita do global é visível pro módulo sob teste. Esta nota morava em `src/lib/access.test.ts` (deletado na Task 3, junto com o Cloudflare Access); o padrão sobrevive porque `auth.test.ts` o usa. Se uma Task futura precisar mockar `fetch` de novo, usar o mesmo padrão em vez de tentar `fetchMock` de novo.

- **Testes (`src/lib/auth.test.ts`, 22/22):** tabela pura de `isAllowedEmail` (inclui `permitido: undefined` — binding não setada é `undefined` em runtime, não `''`, é o que valida o `?? ''` load-bearing da função; e `permitido` em formato CSV, provando o fail-closed do bullet acima), `assertEmailPermitido` lançando/não lançando, memoização por `toBe` (mesmo objeto `env` ⇒ mesma instância; `env` diferente ⇒ instância diferente — prova de referência, não só "as duas chamadas devolveram algo"), e o bloqueio real via `auth.api.signInSocial` + `auth.handler` num fluxo OAuth simulado de ponta a ponta: cookie de state/PKCE gerado de verdade pelo Better Auth, só o token endpoint do Google mockado via `globalThis.fetch` (restaurado em `finally`), `id_token` só precisa ter FORMA de JWT porque `getUserInfo` do provider Google decodifica via `jose.decodeJwt` sem checar assinatura (medido, spike S5) — sem depender de nenhuma API interna não documentada. Os três casos de bloqueio/liberação contam linhas em `user`/`account` direto no D1 (0 quando barrado, 1/1 no controle positivo), não só o status HTTP — inclusive o terceiro caso, que troca `ALLOWED_EMAIL` pra outro valor e reafirma o MESMO e-mail permitido de antes, provando que o hook lê `env.ALLOWED_EMAIL` de verdade (não uma constante interna: confirmado por mutação — hardcodar o e-mail no hook faz só ESTE teste falhar, os outros 21 continuam verdes). Fix round 1 acrescentou 3 testes pro guard de `BETTER_AUTH_SECRET` explícito em `createAuth` (ver bullet do bundle/rate limit acima): secret vazio lança, secret `undefined` em runtime lança, secret presente não lança.

```bash
pnpm --filter @piluvitu/financas exec vitest run src/lib/auth.test.ts
```

## Datas, fuso e ids (`src/lib/dates.ts`, `src/lib/ids.ts`)

- **Teresina é UTC−3 fixo** (Piauí não adota horário de verão desde 2019). `todayInTeresina()` subtrai 3 h antes de cortar o `YYYY-MM-DD` — sem isso, um lançamento feito às 22h do dia 31 sairia com a data do dia 1 do mês seguinte, porque `toISOString()` é UTC. Offset constante, não `Intl.DateTimeFormat`: resolver fuso custa CPU e o teto do free tier é **10 ms por invocação**.
- **Três formatos, um por pergunta:** data local `YYYY-MM-DD` (`purchase_date`, `due_date`), competência `YYYY-MM` (`bill_competence`) e timestamp UTC `YYYY-MM-DDTHH:MM:SSZ` (`created_at`, `updated_at`, via `nowIsoUtc()`). Todos ordenam lexicograficamente == cronologicamente, que é o que faz os índices do §5.2 funcionarem.
- **Competência é o mês em que a fatura FECHA.** `billCompetence('2026-07-28', 25) === '2026-08'`. Dia de fechamento/vencimento maior que o tamanho do mês é aparado (fecha 31 ⇒ fecha 28 em fevereiro, 30 em abril). A aritmética de competência (`addMonthsToCompetence`) é feita em inteiros, sem `Date`, para não haver fuso no meio.
- **Relógio injetado, não mockado:** `todayInTeresina(now?)` e `nowIsoUtc(now?)` recebem um `Date` opcional. Os testes passam o instante; mock de `Date` global dentro do workerd é frágil e vaza entre testes do mesmo arquivo.
- **`newId()` é `crypto.randomUUID()`**: toda PK é TEXT porque o binding do D1 devolve INTEGER como `Number` (52 bits) e não há `last_insert_rowid()` confiável entre statements de um `batch()`.

⚠️ **A SPA tem seu PRÓPRIO `todayInTeresina` — `web/src/lib/dates.ts`, espelho deste arquivo, não um import dele.** O Worker e a SPA são dois runtimes/bundles diferentes (`src/lib/dates.ts` roda no Worker; a SPA não pode importar através dessa fronteira), então a mesma conta (subtrair `TERESINA_OFFSET_MS` antes de cortar `YYYY-MM-DD`) precisa existir nos dois lugares. **Ela existia, mas só era chamada pelo próprio teste** — as quatro telas que precisavam de uma data default (`new-entry.tsx`, `debt-detail.tsx`, `NovoItemForm.tsx`, `DividasPage.tsx`) usavam `new Date().toISOString().slice(0, 10)` (UTC cru), enquanto só `App.tsx#competenciaAtual` fazia a subtração — duplicada ali, não centralizada. Sintoma: lançar às 22h de Teresina (01h UTC do dia seguinte) gravava a data de amanhã; num cartão que fecha nesse dia, a compra caía numa fatura inteira à frente — bug relatado no próprio checklist de deploy (§6). Corrigido: os quatro call sites e `competenciaAtual` agora chamam `todayInTeresina()` de `web/src/lib/dates.ts` — um lugar só. Teste: relógio fixado em `01:00 UTC` (22h do dia anterior em Teresina) via `vi.useFakeTimers({ toFake: ['Date'] })` (**não** `useFakeTimers()` puro — isso também congelaria `setTimeout`, e `waitFor`/`userEvent` do Testing Library dependem de timers reais por baixo).

## Domínio

Cada arquivo de `src/domain/` recebe o `D1Database` por parâmetro (nunca lê `env` global) — é o que deixa os testes rodarem contra o D1 do Miniflare sem subir o Worker.

- **`accounts.ts`** — `createAccount` / `listAccounts` / `accountBalances` / `archiveAccount`.
  - `createAccount` valida em TS que `kind='credit_card'` traz `closing_day` e `due_day` e lança `RangeError`. O `CHECK` do schema barra igual, mas a mensagem do D1 ("CHECK constraint failed") não é acionável; a rota transforma o `RangeError` em `422 invalid_account`.
  - `accountBalances` é **uma** query com `GROUP BY`: `opening_balance_cents + SUM(amount_cents)`, com `LEFT JOIN` (conta sem lançamento devolve o saldo de abertura) e `t.parent_id IS NULL` (rateio guarda o valor cheio no pai e repete nas filhas — somar os dois dobraria o saldo).
  - `archiveAccount` é soft delete (`archived_at`); `listAccounts` esconde arquivadas por padrão e as devolve com `includeArchived: true`.
- **`transactions.ts`** — `createTransaction` / `createTransfer` / `listTransactions`. O livro-caixa é uma tabela só; os relatórios se separam por filtro, não por tabela.
  - `createTransaction` lê `kind` e `closing_day` da conta e **deriva** `bill_competence` via `billCompetence(purchase_date, closing_day)` quando a conta é `credit_card` e o input não trouxe competência. Conta que não é cartão grava `NULL` — só cartão tem fatura. Competência informada explicitamente vence a derivação.
  - `createTransfer` é o mecanismo anti-dupla-contagem nº 1: **duas** linhas (saída negativa na origem, entrada positiva no destino) com o **mesmo `transfer_id`**, num único `db.batch()` — se a segunda perna falhar, o D1 reverte a primeira e não sobra meia transferência. As duas nascem com `settled_at` preenchido e `bill_competence` NULL. `v_cashflow` filtra `transfer_id IS NULL`, então o consolidado ignora a transferência enquanto o saldo de cada conta reflete os dois lados.
  - `listTransactions` sempre aplica `LIMIT` (default 200, teto 500): no D1 "rows read" conta linha **escaneada**, e listagem sem teto queima cota.
  - Valor 0 e moeda ≠ BRL sem `amount_original_cents`/`fx_rate_ppm` são barrados pelos `CHECK` do schema, de propósito — a rota traduz o `D1_ERROR` em `422`, nunca `500`.

⚠️ **Convenção de módulo: toda rota de transição de estado devolve `404 not_found` quando `meta.changes === 0`.** `archiveAccount(db, id)` devolve `Promise<boolean>` — `true` só quando o `UPDATE` de fato tocou uma linha (`res.meta.changes > 0`), lido do `D1Result` devolvido por `.run()`. Um id inexistente e um id já arquivado casam com `WHERE id = ? AND archived_at IS NULL` zero vezes: sem checar `meta.changes`, os dois ficam indistinguíveis de um arquivamento novo e bem-sucedido, e a rota responderia `200` para os três casos. A rota (`src/routes/accounts.ts`) traduz `false` em `errJson(404, 'not_found', ...)` e só devolve `200` quando a transição realmente aconteceu.

- **Por que `boolean` e não uma exceção:** id-não-encontrado numa transição de estado é um resultado esperado da chamada, não um erro de programação — diferente do `RangeError` de `createAccount` (que sinaliza entrada inválida) ou do `constraint_violation` (erro cru do D1). Devolver `boolean` mantém essas duas categorias visualmente separadas no call site da rota: `if (!ok) return errJson(404, ...)` para "não mudou nada", `try/catch` só para "algo está errado com a entrada". Tasks 7–14 que implementarem sua própria rota de transição de estado (cancelar parcelamento, quitar dívida, marcar fatura como paga, etc.) devem seguir o mesmo padrão: função de domínio devolve `boolean` a partir de `meta.changes`, rota traduz `false` em `404 not_found`.

## Rotas

`src/routes/*.ts` exporta routers Hono montados com `app.route('/api', ...)` em `src/index.ts`. Todas as respostas passam por `okJson`/`errJson` (`src/lib/envelope.ts`). Rotas de contas: `GET /api/accounts` (aceita `?scope=PJ|PF` e `?archived=1`, e devolve cada conta com `balance_cents` anexado), `POST /api/accounts`, `POST /api/accounts/:id/archive` (`404 not_found` se a conta não existir ou já estiver arquivada). `POST /api/accounts` tem caller na SPA desde o formulário "Nova conta" em `accounts.tsx` (ver seção _SPA_) — antes existia só a rota, sem UI, o que travava toda a cadeia de aceitação (sem `credit_card` não dá pra parcelar; sem conta nenhuma, `debt-detail.tsx` barra pagamento de dívida por falta de opção no `<select>`).

Os testes de rota montam um `new Hono()` só com o router, **sem** o middleware do Access, e passam o binding via terceiro argumento de `app.request(path, init, { DB: env.DB })`.

Rotas de lançamentos: `GET /api/transactions` (`?account_id=`, `?from=`, `?to=`, `?limit=`), `POST /api/transactions`, `POST /api/transfers`. Erros de `CHECK`/`FOREIGN KEY` do D1 são reconhecidos por `/SQLITE_CONSTRAINT|constraint failed/i` e viram `422`; `RangeError` do domínio vira `422` com código próprio.

⚠️ **`constraint_violation` nunca devolve o texto cru do D1 pro usuário.** A mensagem nativa (ex.: `"D1_ERROR: FOREIGN KEY constraint failed: SQLITE_CONSTRAINT_FOREIGNKEY"` ou `"D1_ERROR: CHECK constraint failed: closing_day BETWEEN 1 AND 31: SQLITE_CONSTRAINT_CHECK"`) expõe nome de coluna/tabela e não diz o que fazer — renderizada crua num `role="alert"` da SPA, é ilegível pro dono do repo. `src/lib/errors.ts#friendlyConstraintMessage(raw)` traduz os casos hoje ALCANÇÁVEIS (FK em registro inexistente, CHECK de cartão de crédito, gatilho de teto de alocação I1/I2) pra frase em pt-BR; um catch-all genérico cobre o resto sem inventar detalhe não confirmado. A mensagem crua não é descartada — `logConstraintError(context, raw)` manda pro `console.error` (visível via `wrangler tail`) antes de traduzir. Usado em `routes/accounts.ts`, `routes/transactions.ts` (`/transactions` e `/transfers`), `routes/installments.ts`, `routes/debts.ts#mapError` e `domain/debts.ts#translateD1Error` (que também cura a mensagem de `OverAllocationError`, code `over_allocation` — mesmo princípio, gatilho em vez de CHECK/FK). Toda rota nova que capturar `SQLITE_CONSTRAINT|constraint failed` deve passar a mensagem por `friendlyConstraintMessage` antes de `errJson`, nunca `e.message` direto.

## Parcelamento de cartão

`POST /api/installment-plans` → `src/routes/installments.ts` (`installmentPlansRoutes`, montado acima do catch-all) → `createInstallmentPlan` em `src/domain/installments.ts`.

**Cada parcela materializa uma `transaction`** com `settled_at NULL` e `bill_competence` preenchida — parcela é _prevista_ até a fatura ser paga. `installments` guarda só o cronograma (`seq`, `due_date`, `transaction_id`).

- `first_competence` = `billCompetence(purchase_date, account.closing_day)`
- competência da parcela _i_ = `addMonthsToCompetence(first_competence, i)`
- `due_date` da parcela _i_ = `competenceDueDate(<competência>, account.due_day)`
- valores = `splitInstallments(total_cents, count)` do `@piluvitu/tools/money` (resto nas **primeiras**: R$ 100 em 3x = 3334+3333+3333); gravados com **sinal negativo** em `transactions.amount_cents`

**Um único `db.batch()`** (rollback real), dimensionado pelo teto de **100 bound params por statement** (o teto documentado de 50 queries/invocação não se reproduziu quando medido):

| Tabela              | Colunas bound | Linhas/statement    |
| ------------------- | ------------- | ------------------- |
| `installment_plans` | 13            | 1 (statement único) |
| `transactions`      | 19            | **5** (95 params)   |
| `installments`      | 5             | **20** (100 params) |

`installments.created_at` **não é bound**: sai de `strftime('%Y-%m-%dT%H:%M:%fZ','now')` no próprio SQL — é o que mantém a linha em 5 colunas em vez de 6. Consequência: o payload de criação devolve `Installment` sem `created_at`.

Plano de 60x = 1 + 12 + 3 = **16 statements** num batch só (coberto por teste de regressão que espia `db.batch`).

**Recusas** (`InstallmentPlanError` → 422): conta inexistente/arquivada, conta com `kind <> 'credit_card'`, cartão sem `closing_day`/`due_day` → `invalid_account`; `installments_count` fora de 1..360, `total_cents <= 0`, conta não-BRL → `constraint_violation`. Corpo malformado ou campo faltando → **400** `invalid_json`.

**Convenção de módulo:** `installmentPlansRoutes` usa o mesmo `type Env = { Bindings: { DB: D1Database } }` local de `accounts.ts`/`transactions.ts` (não importa `Bindings` de `../index`) — evita import circular valor↔tipo entre a rota e `src/index.ts` mantendo o mesmo shape.

⚠️ **`is_business` trafega como `0 | 1` (número), nunca `boolean`, em toda rota — as duas rotas (`transactions.ts`, `installments.ts`) precisam concordar no mesmo wire type porque a SPA usa o MESMO helper (`new-entry.tsx`) para montar o corpo dos dois `POST`s.** `routes/installments.ts` comparava `body.is_business === true`; como a SPA manda `isBusiness ? 1 : 0` (número, igual ao que `routes/transactions.ts` sempre aceitou), `1 === true` é `false` em JS e todo plano de parcelas gravava `is_business = 0` mesmo com "PJ" marcado — silencioso, `201`, sem aviso. É a coluna que sustenta toda a separação PJ/PF (`transactions.is_business`, ver §5.2/schema), então o bug corrompia dado real sem deixar rastro. Corrigido normalizando na rota (`body.is_business === true || body.is_business === 1 ? 1 : 0`, aceita os dois por segurança) e alinhando `NewInstallmentPlan.is_business` para `0 | 1` — mesmo tipo de `NewTransaction.is_business` (`domain/transactions.ts`). Coberto por `routes/installments.test.ts` (posta `is_business: 1` e lê a coluna de volta do D1).

⚠️ **`RangeError` de `lib/dates.ts` precisa de tratamento explícito na rota, mesmo quando o domínio já tem seu próprio tipo de erro.** `createInstallmentPlan` lança `InstallmentPlanError` para as próprias validações (conta, `installments_count`, `total_cents`), mas `billCompetence`/`addMonthsToCompetence`/`competenceDueDate` (Task 5) lançam `RangeError` **puro** quando a data é calendarialmente inválida — e o `DATE_RE` da rota (`/^\d{4}-\d{2}-\d{2}$/`) só valida FORMATO, não calendário. Rastro concreto: `purchase_date: '2026-13-01'` passa no regex; `billCompetence` não valida o mês e devolve `'2026-13'` direto (dia 1 ≤ fechamento, sem roll-forward); a primeira iteração do loop de parcelas chama `addMonthsToCompetence('2026-13', 0)`, que rejeita com `RangeError` — **antes de qualquer `db.batch()`**, então não há escrita parcial. Sem um branch pro catch da rota, esse `RangeError` não casa com `InstallmentPlanError` nem com o regex de constraint do D1, e escapa cru pro handler default do Hono: **500 sem envelope**, quebrando o contrato 400/422. Corrigido replicando a convenção de `accounts.ts`/`transactions.ts` (que já tratam `RangeError` do próprio domínio) para `installments.ts`: `if (err instanceof RangeError) return errJson(422, 'constraint_violation', err.message)`.

**Toda rota que chama função de `lib/dates.ts` a partir de um valor só validado por regex de formato precisa do mesmo branch — mas o status HTTP depende de ONDE o valor mora, não da task:**

- **Body (Tasks 6-8 — `accounts.ts`, `transactions.ts`, `installments.ts`):** `422` (`constraint_violation`/`invalid_entry`). O valor calendarialmente inválido veio de um campo do corpo da requisição.
- **Query string (Task 10 — `reports.ts`):** `400 invalid_query`, **não** `422`. `commitments()` valida `from`/`months` a partir de `c.req.query(...)`, e o catálogo trata query malformada como `400` em toda a API (mesmo padrão de `status`/`direction` inválidos em `GET /api/debts`) — ver ⚠️ na seção _Relatório de comprometido_ mais abaixo, que é a fonte de verdade sobre esse caso.
- **Task 9 (`debtsRoutes`) e Task 14 (`payeesRoutes`/`categoriesRoutes`) não chamam nenhuma função de `lib/dates.ts` que lance `RangeError`** — só `nowIsoUtc()` (que não valida nem lança); datas como `paid_on`/`opened_at`/`incurred_on` são gravadas cruas, sem `billCompetence`/`addMonthsToCompetence`/`competenceDueDate` no caminho. O branch não se aplica a nenhuma das duas rotas.

## Dívidas (`src/domain/debts.ts` + `src/routes/debts.ts`)

`debt_items` é **estoque** (dimensão patrimonial) e **nunca** gera lançamento; `debt_payments` é **fluxo** e gera **exatamente uma** `transaction`, elo 1:1 forçado por `uq_debt_payments_tx`. Os dois nunca se somam porque medem grandezas diferentes — a dupla contagem é estruturalmente impossível, não uma regra de relatório.

`payDebt()` roda **um único `db.batch()`**, com todos os UUIDs gerados antes:

1. `INSERT transactions` (19 colunas) — **só quando `kind='cash'`**. Sinal: `i_owe` → negativo, `owed_to_me` → positivo. `category_id` vem sempre de `SELECT id FROM categories WHERE slug='quitacao-divida'` (semeada na migration 0001 com `kind='debt_settlement'`) — nunca `income`/`expense`: classificar o recebimento como receita inflaria o faturamento e distorceria o cálculo do DAS.
2. `INSERT debt_payments`
3. N × `INSERT debt_payment_allocations`
4. `UPDATE debts SET status='settled'`, guardado por `EXISTS (debt_items)` + `NOT EXISTS (v_debt_item_balance … is_settled = 0)` — quitar o último item fecha a dívida sozinho.

Os tetos I1/I2 são dos **triggers** `trg_alloc_pagamento_teto` / `trg_alloc_item_teto`, não da aplicação — **MEDIDO**: os dois disparam de verdade contra o Miniflare local e devolvem `SQLITE_CONSTRAINT_TRIGGER`, o domínio relança como `OverAllocationError` e a rota traduz em **422 `over_allocation`**. Como `batch()` faz rollback real, a superalocação não deixa rastro: nem transaction, nem payment, nem alocação parcial (coberto por teste de regressão que conta as três tabelas antes/depois). Alocar **exatamente** até o teto passa.

⚠️ **`payDebt()` recusa `kind='cash'` numa conta `credit_card` — LIMITAÇÃO DELIBERADA desta fatia, não descuido.** O passo 1 acima hardcoda `settled_at = paid_on` e `bill_competence = null` incondicionalmente; essa regra só é verdade para dinheiro/conta corrente, onde o pagamento sai do caixa na hora. Numa conta de cartão, a compra ainda cairia numa fatura em aberto — gravar como já liquidada apagaria a obrigação de dentro de `commitments()` (que só soma fatura `settled_at IS NULL`) sem o dinheiro ter saído de fato, enquanto o saldo da dívida já teria caído: a mesma obrigação desaparece dos dois lados da tela que o projeto existe pra mostrar. **Pagar dívida com cartão é caso de uso real** (a compra em nome de outra pessoa, paga no meu cartão, quitando parte de uma dívida) — só não está implementado aqui: precisaria que o pagamento materializasse uma parcela prevista (como `createInstallmentPlan`), não uma transaction já liquidada. Fica para uma fatia futura. `payDebt` valida a `kind` da conta com um `SELECT` antes do `batch()` e rejeita com `InvalidPaymentError('invalid_account', …)` → **422 `invalid_account`** (mesmo código já usado para "`kind='cash'` sem `account_id`"); a SPA (`debt-detail.tsx`) filtra `credit_card` do `<select>` de pagamento pra não oferecer uma opção que o servidor sempre recusa.

⚠️ **`addDebtItem` REABRE a dívida quando ela já estava `settled`, na mesma `db.batch()` do `INSERT`.** Sem isto, um item adicionado depois da dívida ter sido dada como quitada ficava PRESO: a dívida continuava `status='settled'`, então `commitments()` (que só soma `status='open'`) nunca mostrava o valor novo, e o `UPDATE … WHERE status='open'` de quitação do `payDebt` nunca mais disparava pra essa dívida — item aberto, dívida travada em quitada, para sempre. Escolha (entre reabrir vs. recusar com 422 e esconder o formulário): **reabrir**, porque é o que o usuário quer ao adicionar um item numa dívida que ele achava fechada — a alternativa empurra um passo manual ("reabra a dívida primeiro") pra um estado que a própria ação de adicionar item já deixa óbvio. `UPDATE debts SET status='open', settled_at=NULL … WHERE id=? AND status='settled'` é a segunda statement do mesmo batch do `INSERT debt_items`; vira no-op (0 `changes`) quando a dívida já está `open` (ou `written_off`, que fica fora do escopo desta fatia — não é reaberta automaticamente).

Teto de 100 bound params por statement: com 19 colunas, um `INSERT` multi-row de `transactions` cabe **5 linhas por statement**; `installments` (5 colunas) cabe 20. `payDebt` sempre insere 1 linha por statement (nunca multi-row) porque cada pagamento gera no máximo 1 `transaction`.

**`GET /api/debts` inclui `payee_name`** (Task 14, `JOIN payees p ON p.id = d.payee_id` em `listDebts`) — antes só devolvia `payee_id`, o que deixava a listagem sem como mostrar "Pai" sem um segundo round-trip. `JOIN`, não `LEFT JOIN`: `debts.payee_id` é `NOT NULL REFERENCES payees(id)`, então toda dívida tem payee de verdade.

| Rota                           | Sucesso | Erros                                                                                                         |
| ------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------- |
| `GET /api/debts`               | 200     | 400 `invalid_query`                                                                                           |
| `POST /api/debts`              | 201     | 400 `invalid_json`                                                                                            |
| `GET /api/debts/:id`           | 200     | 404 `not_found`                                                                                               |
| `POST /api/debts/:id/items`    | 201     | 400 `invalid_json`, 422 `constraint_violation`                                                                |
| `POST /api/debts/:id/payments` | 201     | 400 `invalid_json`, 404 `not_found`, 422 `invalid_account`, 422 `over_allocation`, 422 `constraint_violation` |

`kind='cash'` **exige** `account_id` (senão 422 `invalid_account`); `offset` e `forgiven` **recusam** `account_id` e não criam lançamento nenhum.

**Convenção de módulo:** `debtsRoutes`, como `installmentPlansRoutes`, usa `type Env = { Bindings: { DB: D1Database } }` local — não importa `Bindings` de `../index`.

Testes: `pnpm --filter @piluvitu/financas exec vitest run src/domain/debts.test.ts` cobre o cenário real (Steam Deck 280000 + MacBook 450000, pagos 100000 + 100000 + 394000 ⇒ MacBook quitado e Steam Deck com 136000 em aberto), as três queries do §5.4 do spec (1× no caixa via `v_cashflow`, 1× na dívida via `v_debt_item_balance`, 0× em `transactions` com categoria `expense`), a recusa de pagamento em conta `credit_card` e a reabertura de dívida `settled` por `addDebtItem` (item novo → dívida volta a `open` → segundo `payDebt` quita de novo). `src/domain/reports.test.ts` tem o teste que liga as duas pontas — `payDebt()` e `commitments()` — que faltava: reduzir o comprometido exatamente pelo valor alocado, 1 linha no caixa, 0 como `expense`.

## Payees e categorias (`src/domain/payees.ts` + `src/routes/payees.ts` + `src/routes/categories.ts`)

- **`normalizeName()`** gera `payees.norm_name`: caixa alta, sem acento (`\p{M}` sobre a forma `NFD` — cobre qualquer diacrítico combinante, não só o range fixo `U+0300..U+036F`, e sem caractere combinante literal na fonte do arquivo), sem sufixo de maquininha (`PAGSEGURO`, `CIELO`, `STONE`, etc.) e sem `CIDADE UF` no fim. É a chave de matching de estabelecimento que o import da fatia ② vai usar — nasce já nesta fatia porque `idx_payees_norm` (migration `0001`) é um índice do D1, e **índice do D1 não é alterável**, só dropado (irreversível) e recriado. Limitação conhecida e documentada no código: cidade de nome composto deixa resíduo (`'SAO'` sobrando em `'MERCADO X SAO LUIS MA'`), porque só o último token de cidade é cortado.
- **`createPayee`/`listPayees`** (`src/domain/payees.ts`) são o CRUD mínimo sobre a tabela `payees` do `0001` — sem deduplicação por `norm_name` (o índice é normal, não `UNIQUE`; dedupe fica para a fatia de import).
- **`GET|POST /api/payees`** e **`GET /api/categories`**, montados em `src/index.ts` **acima** da linha `// SEMPRE POR ÚLTIMO`, mesma regra de todas as rotas anteriores. `payeesRoutes`/`categoriesRoutes` usam o `type Env = { Bindings: { DB: D1Database } }` local — convenção das cinco rotas irmãs (`accounts`, `transactions`, `installments`, `debts`, `reports`), evita ciclo de import com `../index`.
- **`GET /api/categories`** é o que torna medível o gap de ~R$ 1.000/mês da PJ: os slugs `das`, `contador`, `inss` e `pro-labore`, semeados pela migration `0001`, não podiam ser lidos por API nenhuma antes desta task. Aceita `?kind=income|expense|transfer|debt_settlement`; a categoria `quitacao-divida` (`kind='debt_settlement'`, já consumida por `payDebt()`) sai junto.
- Nenhum código de erro novo: `invalid_json`/`invalid_query`/`constraint_violation` já estavam no catálogo abaixo. `POST /api/payees` usa `422 constraint_violation` tanto para `name` vazio quanto para `kind` fora do enum (não `400 invalid_json` como `debtsRoutes` faz para campo obrigatório ausente) — decisão desta rota, coberta por teste.

Testes: `pnpm --filter @piluvitu/financas exec vitest run src/domain/payees.test.ts src/routes/payees.test.ts src/routes/categories.test.ts`.

## Relatório de comprometido (`src/domain/reports.ts` + `src/routes/reports.ts`)

`GET /api/reports/commitments?from=YYYY-MM&months=N&fixed_net_cents=` é a tela que justifica o projeto: "dos próximos N meses, quanto já está comprometido". `commitments(db, { from, months, fixed_net_cents })` devolve `{ competences, rows, totals, fixed_net_cents, pct_of_fixed_net }` — uma matriz conta×competência, não uma lista.

**O denominador do `%` é o líquido SEM freela — `DEFAULT_FIXED_NET_CENTS = 360000` (R$ 3.600), nunca o líquido bom (R$ 5.300).** O freela é volátil; medir contra o líquido com freela (que só existe em mês bom) esconderia exatamente o risco que a tela existe pra mostrar — R$ 2.628 de essenciais parecem 48% contra R$ 5.480 mas são 73% contra R$ 3.600. `fixed_net_cents` é parâmetro (a rota aceita `?fixed_net_cents=` e usa `DEFAULT_FIXED_NET_CENTS` como default), não hardcode dentro da query — precisa dar pra recalcular se o piso mudar sem tocar em código.

Duas fontes somadas na mesma célula `(account_id, competence)`:

- **Parcelas previstas** (`transactions.settled_at IS NULL`): fatura ainda não paga é dinheiro que ainda vai sair. `bill_competence IS NOT NULL` — lançamento previsto sem competência de fatura não sabe em qual mês cair, e chutar seria mentir. `transfer_id IS NULL AND parent_id IS NULL`, mesmo motivo anti-dupla-contagem de `v_cashflow`: perna de transferência e filha de rateio repetem o valor. Célula é `-SUM(amount_cents)` (a tela mostra "quanto vou pagar", positivo) e o `HAVING SUM(...) < 0` descarta célula que virou saldo de entrada (estorno maior que a parcela).
- **Dívida aberta que eu devo** (`debts.status = 'open' AND direction = 'i_owe'`, saldo via `v_debt_item_balance`): cai **inteira na primeira competência da janela** (`cells[0]`), não na data em que foi contraída. Motivo: nesta fatia `debts` não tem coluna de vencimento/cronograma — distribuir seria invenção. Colocar tudo no mês mais próximo é a leitura conservadora (erra para "comprometido demais", nunca para "de menos"). `owed_to_me` não entra — o que me devem não é compromisso meu.

Conta sem nenhuma célula na janela **não aparece** na lista de `rows` (nem como linha zerada) — o `Map` só ganha entrada quando alguma query encontra algo pra somar nela.

⚠️ **Esta é a única rota que traduz `RangeError` em `400`, não `422`.** O padrão de `installments.ts`/`accounts.ts` (ver ⚠️ acima) é `422 constraint_violation`, porque lá o `RangeError` vem de um CAMPO DE CORPO calendarialmente inválido (ex.: `purchase_date: '2026-13-01'`). Aqui as duas validações de `commitments()` (`from` fora do formato `YYYY-MM`, `months` fora de 1..24) são sobre **query string**, não corpo — por isso `400 invalid_query`, coerente com o resto do catálogo (`status`/`direction` inválidos em `GET /api/debts` também são `400 invalid_query`). O branch `if (err instanceof RangeError)` continua obrigatório do mesmo jeito: sem ele, `addMonthsToCompetence` chamado dentro de `commitments()` vazaria como `500` sem envelope.

Testes: `pnpm --filter @piluvitu/financas exec vitest run src/domain/reports.test.ts` cobre liquidação (`settled_at` preenchido não conta), virada de ano (`from: '2026-11'` cruzando pra `2027-01`), separação de transferência/rateio, e o cálculo do `%` batendo contra `360000` (nunca contra o líquido com freela). `src/routes/reports.test.ts` monta só `reportsRoutes` (sem Access, padrão das Tasks 6-9) e cobre o contrato HTTP: 200 com envelope, `fixed_net_cents` customizável via query, e os três casos de `400 invalid_query` (`from` ausente, `from` malformado, `months=0`/não numérico).

## SPA (`apps/financas/web`)

Segundo pacote pnpm da frente (`@piluvitu/financas-web`), **Vite + React 19 + TS**, buildado em `web/dist` (gerado, `.gitignore`) e servido pelo Worker via Static Assets — não é hospedado à parte, não tem `NEXT_PUBLIC_API_URL`/base URL configurável: UI e API vivem no mesmo host (`financas.piluvitu.com.br`), então `src/api.ts` chama `fetch(path)` direto com `path` já incluindo `/api`.

- **Roteamento é `location.hash`, sem lib de router.** `useHash()` em `src/App.tsx` escuta `hashchange` e decide a tela por prefixo de string (`#/contas`, `#/dividas`, `#/dividas/:id`, `#/lancar`, `#/comprometido`; `#/contas` é o default). Isso é o que permite `not_found_handling: single-page-application` no `wrangler.jsonc` funcionar sem nenhuma rota de servidor: um F5 em `#/comprometido` bate no fallback `index.html` do Assets porque o hash nunca vai pro servidor — um router de path real (`/comprometido`) exigiria que o Worker soubesse servir `index.html` para qualquer path desconhecido, que é exatamente o que `single-page-application` já faz, mas testar isso é o item do checklist de deploy que prova a integração.
- **`src/api.ts`** — um único helper genérico `api<T>(path, init)`. Lê o envelope (`{ ok, data, notifications }`, mesmo shape do backend), e quando `ok: false` lança `ApiError(status, code, message)` pegando a primeira notification `type: 'error'` (com fallback pra primeira notification, seja qual for o tipo). Resposta sem JSON ou sem `ok: boolean` vira `ApiError` com `code: 'invalid_envelope'` em vez de estourar cru — a UI nunca vê um `SyntaxError` de `.json()`.
- **Cinco telas em `src/pages/`:** `accounts.tsx` (Contas — tela inicial; lista **e** cadastra: formulário "Nova conta" postando pra `POST /api/accounts`, `closing_day`/`due_day` só aparecem quando `kind === 'credit_card'`, com a mesma validação client-side do `CHECK` do schema antes de gastar um round-trip), `DividasPage.tsx` (lista de dívidas) + `debt-detail.tsx` (detalhe de uma dívida: itens, pagamento com alocação por item, usa `NovoItemForm.tsx`; o `<select>` de conta do pagamento filtra `credit_card` — `payDebt` sempre recusa, ver seção _Dívidas_), `new-entry.tsx` (Lançar — lançamento simples e parcelado), `commitments.tsx` (Comprometido — a matriz de `GET /api/reports/commitments`).
- **`src/lib/dates.ts`** — `todayInTeresina()`, espelho do helper de mesmo nome no Worker (ver seção _Datas, fuso e ids_ acima). Usado por `App.tsx#competenciaAtual` e pelos quatro formulários que default a data pro dia corrente.
- **Testes:** Vitest + `jsdom` + Testing Library (`@testing-library/react` + `user-event`), colocation (`accounts.test.tsx` ao lado de `accounts.tsx`, etc.). `src/test/setup.ts` importa `@testing-library/jest-dom/vitest` e roda `cleanup()` num `afterEach` global — **obrigatório porque `vite.config.ts` não liga `globals: true`**; sem esse setup, o DOM de um teste vaza pro próximo. `vite.config.ts` roda `test.environment: 'jsdom'` no mesmo arquivo de config do build (`defineConfig` de `vitest/config`, não de `vite` puro) — um `vite.config.ts` só para as duas coisas.
- **`optimizeDeps: { exclude: ['@piluvitu/tools'] }`** no `vite.config.ts`: `@piluvitu/tools` é fonte TS linkada pelo workspace pnpm, não um pacote publicado com `dist/` — sem o `exclude`, o pré-bundle do Vite tenta tratar como dependência normal e falha tentando resolver `.ts` fora de um projeto TS.
- **Dev:** `pnpm --filter @piluvitu/financas-web dev` sobe o Vite em `:5273` com `server.proxy['/api'] → http://127.0.0.1:8787` (onde `wrangler dev` escuta) — evita CORS em desenvolvimento sem precisar de header nenhum. Em produção não existe proxy: o Worker serve os dois.
- **45 testes** (8 arquivos) cobrindo as 5 telas + `api.ts` + `App.tsx` (roteamento por hash) + `lib/dates.ts`.

## CI

`.github/workflows/ci.yml` tem um terceiro job, `financas`, paralelo a `web` e `api` (não altera os outros dois). Sequência dentro do job — **a ordem importa**:

1. Instala deps (`pnpm install --frozen-lockfile`).
2. Typecheck do Worker e do SPA (`pnpm --filter @piluvitu/financas run lint` / `--filter @piluvitu/financas-web run lint` — os dois são só `tsc --noEmit`, não há ESLint nesta frente ainda).
3. **Build do SPA ANTES dos testes do Worker.** O binding `ASSETS` do `wrangler.jsonc` (`directory: './web/dist'`) precisa que `web/dist` exista com um `index.html` — Miniflare lê esse binding ao subir o Worker sob teste, e `web/dist` é gerado e está no `.gitignore`. Em clone limpo (CI é sempre clone limpo), rodar os testes do Worker antes do build do SPA quebra com o diretório ausente. Na prática o `package.json` de `@piluvitu/financas` já tem um `pretest` que builda o SPA (`pnpm --filter @piluvitu/financas-web build`) antes de `vitest run` — o que faz esse passo funcionar mesmo isolado — mas o step explícito no CI documenta a dependência e builda o SPA também para o próprio `Typecheck (spa)`/`Test (spa)` rodarem sobre um `dist/` fresco, sem depender do efeito colateral do `pretest` de outro pacote.
4. Testes do Worker (`pnpm --filter @piluvitu/financas run test` — Miniflare + D1 local via `@cloudflare/vitest-pool-workers`, sem secret, sem `wrangler login`) e do SPA (`pnpm --filter @piluvitu/financas-web run test`).

Não há job de deploy no CI: a fatia ① publica manualmente (`wrangler deploy`) e a migration em produção é ato deliberado — ver _Deploy_ abaixo.

`pnpm -r lint` e `pnpm -r test`, rodados da raiz, já cobrem as duas frentes novas automaticamente — `apps/financas/package.json` e `apps/financas/web/package.json` declaram `lint`/`test` desde as Tasks 2/11. **Lembrete que já rendeu bug noutra ocasião: `pnpm -r <script>` pula em silêncio um workspace que não declara o script** (`@piluvitu/tools` não declara `lint`, por exemplo — `pnpm -r lint` roda em "4 of 5 workspace projects" de propósito). Ao adicionar comando novo num workflow, confirme que o `package.json` do pacote-alvo realmente tem esse script antes de assumir que o CI vai executá-lo.

## Deploy

Não há job de deploy automatizado — publicar é ato manual (`wrangler deploy`), e a migration em produção idem: **forward-only, sem down migration, então quem decide quando rodar é uma pessoa, não um workflow.**

### 1. Cloudflare Access — REMOVIDO na Task 3

Os passos que existiam aqui (criar a Application no Zero Trust, copiar o AUD Tag, preencher `vars.ACCESS_AUD` em `wrangler.jsonc`) não se aplicam mais — `src/lib/access.ts` foi deletado e `wrangler.jsonc` não tem `ACCESS_AUD`/`ACCESS_TEAM_DOMAIN`/`ACCESS_ALLOWED_EMAILS` desde a Task 3. No lugar: `vars.BETTER_AUTH_URL`/`vars.ALLOWED_EMAIL` (já preenchidos com valores reais, não placeholder) + os três segredos do Better Auth. Provisionar o **OAuth Client no Google Cloud Console** (tipo Web application, redirect URI `https://financas.piluvitu.com.br/api/auth/callback/google`) e publicar `BETTER_AUTH_SECRET`/`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` em produção via `wrangler secret put <NOME>` é escopo da **Task 5** — não feito ainda. Sem esses três segredos configurados no Cloudflare, `wrangler deploy` publica normalmente e a quebra só aparece em runtime: faltando `BETTER_AUTH_SECRET`, o **guard explícito de `createAuth`** (`auth.ts`) lança um `Error` comum — mensagem `BETTER_AUTH_SECRET ausente — configure via ...`, **não** `BetterAuthError` — no primeiro request que tocar `/api/auth/*`; faltando client id/secret do Google, o login social fica indisponível. O guard existe porque o Better Auth **não** falha sozinho nesse caso: ele cai num secret default publicado no código-fonte da própria lib e só lançaria se `isProduction` fosse `true`, o que nunca acontece num Worker.

⚠️ **Esse `Error` sai como `500 Internal Server Error` em texto puro, sem o envelope** — `/api/auth/*` é a única rota isenta do `try/catch` de `requireSession` (as demais chamam `getAuth` dentro dele e virariam `503 auth_unavailable` com envelope). A mensagem só vai para o log do servidor, não para o cliente: ao investigar, procurar por `BETTER_AUTH_SECRET ausente` no `wrangler tail`, não por `BetterAuthError`.

### 2. Migration em produção (rodar manualmente — nunca automatizar)

```bash
pnpm --filter @piluvitu/financas exec wrangler d1 migrations list piluvitu-financas --remote
pnpm --filter @piluvitu/financas exec wrangler d1 migrations apply piluvitu-financas --remote
```

Esperado: `0001_financas_init.sql` aplicada. Sem down migration — se o schema sair errado, a correção é uma migration nova (`0002_*.sql`), nunca editar a `0001` depois de rodada com `--remote`. Índice no D1 também não é alterável, só dropado (irreversível) e recriado.

### 3. Publicar o Worker

```bash
pnpm --filter @piluvitu/financas run deploy
```

O script builda o SPA antes (`build:web`) e roda `wrangler deploy` em seguida — o `web/dist` publicado é sempre o do commit atual, nunca um build velho. Saída esperada: o binding `DB` e os assets de `web/dist` listados pelo wrangler.

### 4. Custom Domain (dashboard, uma vez)

**Workers & Pages → `financas` → Settings → Domains & Routes → Add → Custom Domain:** `financas.piluvitu.com.br`.

**Obrigatório, não preferência.** Em `*.workers.dev` o domínio registrável passa a ser diferente do da zona `piluvitu.com.br` — o contexto do cookie de sessão do Better Auth vira cross-site, `SameSite=Lax` deixa de ser enviado, e **a quebra só aparece em produção** (local e preview usam `BETTER_AUTH_URL=http://localhost:...`, mesmo site, e nunca reproduzem). `SameSite=None` não é solução: Safari (ITP) e Firefox (ETP) bloqueiam cookie de terceiro por padrão e o Chrome não — testar só no Chrome passa e engana. Mesmo raciocínio de antes (era sobre o cookie do Access), continua valendo — cookie de sessão same-site é requisito independente de qual mecanismo de auth está por trás.

### 5. Checklist de verificação manual pós-deploy

⚠️ **Os três primeiros itens abaixo descrevem o fluxo do Cloudflare Access (removido na Task 3) e ainda não foram reescritos para o Better Auth** — a UI de login própria é escopo da Task 4 (SPA: login e guarda), ainda não implementada nesta task. Não usar como estão até a Task 4/5 atualizar este checklist.

Rodar na ordem, do celular Android **e** do MacBook (cobre os dois motores de cookie/JS que importam aqui):

- [ ] ~~`https://financas.piluvitu.com.br` redireciona para o login do Google do Access (não abre direto).~~ — obsoleto, ver ⚠️ acima.
- [ ] ~~Login com `paulo.tspi@gmail.com` entra e mostra a tela **Contas**.~~ — reescrever para o fluxo de login do Better Auth (Task 4).
- [ ] ~~Login com outra conta Google é **negado** pelo Access.~~ — reescrever: agora é `email_not_allowed` (403) via `decidirAcesso`, ou bloqueio no próprio cadastro via `assertEmailPermitido` (302 `?error=nao_autorizado`).
- [ ] `curl -s -o /dev/null -w '%{http_code}\n' https://financas.piluvitu.com.br/api/health` devolve **200** (rota pública, sem guarda — ver `isRotaDeAuth`/exceção em `src/index.ts`; devolver 401 aqui seria bug, não o oposto de antes).
- [ ] `index.html` e os assets carregam sem erro de CSP/404 no console (Static Assets servindo `web/dist`).
- [ ] Recarregar em `#/comprometido` com F5 volta pra mesma tela (prova o `not_found_handling: single-page-application`).
- [ ] Criar a conta **Nubank cartão** (`credit_card`, fecha 25, vence 05) e ver `fecha 25 · vence 05` no card.
- [ ] Lançar uma compra em **10×** de R$ 1.000 nesse cartão em 28/07 e conferir que a 1ª parcela caiu em **`2026-08`** (compra depois do fechamento).
- [ ] Somar as 10 parcelas na tela e bater **exatamente** R$ 1.000,00 (resto nas primeiras).
- [ ] Cadastrar a dívida do **Pai** (R$ 1.360 em aberto) com os itens **MacBook Air** e **Steam Deck**.
- [ ] Registrar um pagamento dividido entre os dois itens e ver a alocação listada por item.
- [ ] Tentar alocar **mais** do que o item comporta e confirmar: mensagem de erro **e nada gravado** — nem pagamento, nem lançamento no caixa (recarregar a página para conferir).
- [ ] Alocar **exatamente** até o teto do item e confirmar que passa (o trigger não dá falso positivo).
- [ ] Tela **Comprometido**: a matriz mostra 6 competências, o TOTAL bate com a soma das colunas, e o `%` usa **R$ 3.600** como denominador (não R$ 5.480).
- [ ] Competência acima de 50% aparece em **vermelho**.
- [ ] Fazer uma transferência entre duas contas próprias e confirmar que ela **não** aparece no Comprometido.
- [ ] Lançar às 22h do dia 31 (horário de Teresina, UTC−3) e confirmar que a data gravada é **dia 31**, não dia 1 do mês seguinte.
- [ ] No dashboard do D1, conferir `rows written` do dia dentro do esperado (~dezenas), não milhares.
