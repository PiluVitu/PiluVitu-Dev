# CLAUDE.md — `apps/ramielle`

Guidance para o Worker **ramielle** (`@piluvitu/ramielle`). O Claude Code carrega este arquivo **junto** com o `CLAUDE.md` da raiz — aqui ficam só os detalhes deste workspace; orquestração/monorepo/CI/dependency policy estão na raiz. Cada fato mora num único arquivo: onde um assunto já está documentado em `apps/financas/CLAUDE.md` ou `apps/api/CLAUDE.md`, este arquivo aponta pra lá em vez de repetir.

## O que é, e a regra de corte contra o promeia

`apps/ramielle` é um **Cloudflare Worker** (Hono + D1 SQLite) que está substituindo, fatia a fatia, a API Go (`apps/api`) — hoje: votação de filmes (auth Google, sessões de votação), auth do admin. Roda na borda da Cloudflare, sem disco persistente próprio; todo estado vive no D1.

**Regra de corte contra `apps/promeia`** (serviço Python que roda no Mac do dono): a pergunta decisiva é **"isto precisa de GPU, de um modelo de linguagem local, ou de um arquivo em disco?"**

- **Sim** ⇒ mora no `apps/promeia` (ex.: o insight financeiro via Ollama — precisa de GPU/Metal, que nenhum Worker/Container Cloudflare oferece; ver `apps/financas/CLAUDE.md` § _Insight de IA_ e `apps/promeia/CLAUDE.md`).
- **Não** ⇒ mora no ramielle (login, sessão, CRUD de votação — tudo isso é HTTP + SQL, sem nenhuma das três dependências acima).

## Estado desta fatia (① — auth)

Construído em tasks sequenciais, plano em `.superpowers/sdd/2026-07-28-ramielle-fatia1-auth/` (relatórios de task são gitignored — os achados que precisavam sobreviver foram trazidos pra este arquivo):

- **T1** — esqueleto do Worker (Hono + D1 + envelope `{ok,data,notifications}` + `/health`), D1 `piluvitu-ramielle` criado de verdade (`wrangler d1 create`), job `ramielle` no CI (`.github/workflows/ci.yml`).
- **T2** — `migrations/0001_votacao.sql`: schema da votação portado do Go (6 tabelas, 5 índices).
- **T3** — Better Auth com Google (`migrations/0002_better_auth.sql`, `src/lib/auth.ts`) — votação **LIVRE**, sem allowlist de acesso.
- **T4** — `GET /auth/me`, `POST /auth/logout`, guards `requireAuth`/`requireAdmin` (`src/lib/session.ts`), ponte `user`↔`users` (`src/domain/users.ts`).
- **T5** (esta) — CORS com credenciais + esta documentação.

**Nada em produção mudou nesta fatia.** `apps/web` continua falando com a API Go em `promeia.piluvitu.com.br` (ver `apps/api/CLAUDE.md`). O ramielle sobe, responde `/health` contra o D1, autentica com Google aceitando qualquer conta, distingue admin por `ADMIN_EMAILS` a cada request, e responde CORS com credenciais para `piluvitu.com.br` — tudo isso hoje só é alcançável localmente, até o dono completar as pendências no fim deste arquivo.

**Próximo (fatia ②):** as 10 rotas de votação, com paridade provada lado a lado contra o Go antes de qualquer cutover.

## Votação LIVRE × finanças fail-closed — desenhos OPOSTOS do MESMO Better Auth

`apps/ramielle` e `apps/financas` usam a mesma versão do Better Auth (`1.6.25`), com desenhos de acesso **opostos**. Confundir os dois é o defeito mais caro possível nesta fatia — copiar um pro outro não é um ajuste fino, é trocar o propósito do módulo:

|                             | `apps/financas`                                                                                                  | `apps/ramielle`                                                                                                                 |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Quem pode logar             | 1 e-mail só (`ALLOWED_EMAIL`, single-user)                                                                       | **qualquer conta Google** — a votação é pública, feita pra várias pessoas                                                       |
| Bloqueio no cadastro        | `databaseHooks.user.create.before` barra ANTES do primeiro `INSERT` (`apps/financas/CLAUDE.md` § _Autenticação_) | **nenhum hook** — `createAuth` (`src/lib/auth.ts`) não declara `databaseHooks` nenhum, de propósito                             |
| Formato da env de allowlist | `ALLOWED_EMAIL`: **1 e-mail só**, comparação de STRING INTEIRA (CSV não casa com nada)                           | `ADMIN_EMAILS`: **CSV de verdade** — `isAdminEmail` faz `.split(',')` + trim + lowercase por item, espelhando o Go (`apps/api`) |
| O que a env controla        | **ACESSO** — fora da lista, a pessoa nem entra                                                                   | **PRIVILÉGIO** — fora da lista, a pessoa entra e vota, só não é admin                                                           |

⚠️ **Copiar o hook de allowlist do finanças pra cá bloquearia todo mundo menos o dono e mataria a feature.** ⚠️ **Tirar o hook de lá abriria o finanças (single-user, fail-closed) pra qualquer conta Google.** A ausência do hook aqui é verificada por mutação em `src/lib/auth.test.ts`: reinserir o hook copiado do finanças derruba exatamente os 3 testes do describe "votação livre" (um e-mail fora de `ADMIN_EMAILS` completa o cadastro e grava 1 linha em `user`+`account`); os outros 20 testes do arquivo continuam verdes.

## `is_admin` é recalculado A CADA REQUEST — nunca gravado como verdade

`ADMIN_EMAILS` (CSV, `wrangler.jsonc#vars`) é lido a cada chamada, nunca no momento do cadastro. `src/lib/session.ts#resolveSession` chama `isAdminEmail(email, ADMIN_EMAILS)` a cada `requireAuth`/`requireAdmin` e passa o resultado pro `upsertVotacaoUser` (`src/domain/users.ts`), que **sempre sobrescreve** `is_admin` com o valor recebido — nunca faz merge preservando o que já estava gravado.

Consequência provada por teste (`session.test.ts`, describe "o caso que prova o desenho"): o **mesmo** cookie de sessão, com `ADMIN_EMAILS` trocado entre duas chamadas, muda de `403` pra `200` — sem novo login. Isso é diferente do `ALLOWED_EMAIL` do finanças por natureza, não só por formato: lá a allowlist também é avaliada a cada request (`decidirAcesso`, camada 2 do finanças), mas o que ela decide é ACESSO; aqui `ADMIN_EMAILS` decide PRIVILÉGIO dentro de um app que já é livre — o motivo estrutural é que o Better Auth não tem noção de allowlist fora do hook de criação, então um privilégio gravado no cadastro não acompanharia uma troca de `ADMIN_EMAILS` feita depois.

## Duas tabelas de usuário no mesmo D1

- **`user`** (singular, `migrations/0002_better_auth.sql`) — contrato da lib Better Auth. PK `TEXT`, uma linha por identidade autenticada, colunas camelCase (contrato da lib, não escolha deste projeto — mesma observação já registrada em `apps/financas/CLAUDE.md`).
- **`users`** (plural, `migrations/0001_votacao.sql`) — domínio da votação, portado 1:1 do schema Go. PK `INTEGER` (a que `votes`/`voting_sessions` referenciam via FK), `google_sub` UNIQUE, `is_admin`.

Nada na migration liga uma tabela na outra. **`src/domain/users.ts#upsertVotacaoUser` é a ponte** — chamada a cada request autenticado por `lib/session.ts`. Casa por `google_sub` (`INSERT ... ON CONFLICT(google_sub) DO UPDATE`), sempre sobrescreve `email`/`name`/`picture`/`is_admin` com o valor recebido (nunca merge com o que já estava no banco — mesma semântica do `UpsertUser` do Go), nunca toca `created_at` num update.

## A decisão da PK `INTEGER` + `RETURNING id` — medida na Task 2, não assumida

Ao contrário do finanças (PK `TEXT`/UUID via `crypto.randomUUID()` — lá porque o binding D1 devolve `INTEGER` como `Number` de 52 bits e não há `last_insert_rowid()` confiável entre statements de um `batch()`), o ramielle **manteve as PKs `INTEGER PRIMARY KEY AUTOINCREMENT`** do schema Go original. Motivo: `apps/web` já tipa `session_id`/`movie_id` como `number` (não `string`) em `lib/votacao/types.ts`, e os mocks E2E também — trocar pra UUID quebraria os dois sem necessidade. Esse motivo **não se aplica** ao finanças (schema novo, sem consumidor legado tipando `number`).

Essa decisão dependia de uma pergunta mensurável, não só de uma esperança: **`INSERT ... RETURNING id` funciona no D1?** Medido em `src/schema.test.ts` (describe "migration 0001 — RETURNING id"):

1. `INSERT INTO users (...) VALUES (...) RETURNING id` devolve um `id` tipo `number`, `> 0`.
2. Duas inserções sucessivas via `RETURNING id` devolvem ids **diferentes** entre si (autoincremento real, não um valor cacheado/repetido).

Os dois passaram — `RETURNING id` funciona no D1 local. `domain/users.ts#upsertVotacaoUser` usa exatamente esse mecanismo (`INSERT ... ON CONFLICT DO UPDATE ... RETURNING id`, seguido de um `SELECT` pra buscar as demais colunas — dois passos, não um `RETURNING` com colunas extras sobre `ON CONFLICT`, que nunca foi medido isoladamente e por isso não foi arriscado).

## `google_sub` guarda o `sub` REAL do Google — não o id interno do Better Auth

`getSession()` do Better Auth nunca expõe o claim `sub` bruto — só `sessao.user.id` (o id INTERNO da lib, TEXT PK de `user`). O `sub` de verdade fica em `account.accountId` (`providerId='google'`, migration `0002`).

`src/lib/session.ts#buscarGoogleSub` faz `SELECT accountId FROM account WHERE userId = ? AND providerId = 'google'` e usa esse valor como `google_sub`, com fallback pro `sessao.user.id` **só** quando não existe linha em `account` com `providerId='google'` (caminho que só acontece em teste, via a técnica `emailAndPassword`/`signUpEmail` — em produção o login é 100% Google, o fallback nunca dispara).

⚠️ **Por que isso importa pra valer, não é purismo de nome de coluna:** a fatia ④ (cutover) vai importar o histórico REAL de votação do SQLite da API Go, cujo `users.google_sub` já está preenchido com o `sub` do Google. Se o ramielle gravasse outro valor ali (o id interno do Better Auth, por exemplo), casar a importação por `google_sub` criaria uma **segunda linha** pra cada pessoa que já votou — usuário duplicado, votos antigos órfãos de identidade. Isto foi corrigido num fix round da Task 4 (a primeira versão gravava `sessao.user.id` puro); `domain/users.ts` documenta a decisão no topo do arquivo, apontando `lib/session.ts#buscarGoogleSub` como dono do "como resolver o valor" — não repetido em dois lugares.

## CORS com credenciais (Task 5)

`apps/web` mora em `piluvitu.com.br` (Vercel); o ramielle vai morar em `api.piluvitu.com.br` — origens **diferentes**. Sem CORS explícito com credenciais, o cookie de sessão do Better Auth nunca atravessa um `fetch(..., { credentials: 'include' })` do `apps/web`.

`src/lib/cors.ts` espelha `apps/api/internal/router/router.go` (`corsOptions`/`allowedOrigins`) nas **origens**, nas **credenciais** e na **leitura de `CORS_ALLOWED_ORIGINS`**: mesmo default (`http://localhost:3333,https://piluvitu.com.br`), mesmo CSV, `credentials: true`. `wrangler.jsonc#vars.CORS_ALLOWED_ORIGINS` declara explicitamente `https://piluvitu.com.br` (só produção, sem `localhost`) — mesma paridade que `infra/docker-compose.yml` da Go já faz pro ambiente de produção dela; não é obrigatório (o default do código já cobriria sozinho), mas deixa a origem de produção explícita em vez de depender só do fallback.

⚠️ **A lista de HEADERS não tem paridade com a Go — de propósito, não descuido.** MEDIDO contra `corsOptions()` do Go: ela inclui `Accept` em `AllowedHeaders` e expõe `Link` em `ExposedHeaders`; `cors.ts` só permite `Content-Type`/`Authorization` e não expõe nenhum header de resposta. Inofensivo hoje: `Accept` é um dos headers CORS-_safelisted_ do fetch spec (não precisa estar na lista pra ser enviado), e nenhuma rota do ramielle hoje emite `Link`. Reavaliar isto quando a fatia ② (rotas de votação) existir — se alguma resposta precisar que `apps/web` leia um header customizado via JS, ele precisa entrar em `exposeHeaders`, que hoje é vazio.

⚠️ **`Access-Control-Allow-Origin: '*'` é incompatível com credenciais** — o navegador recusa a resposta inteira quando os dois aparecem juntos. `origin` em `cors.ts` é **sempre** um array de origens explícitas, nunca a string `'*'` (o default do `hono/cors` quando nenhuma opção é passada) — o resolver de array do `hono/cors` nunca devolve `'*'`, só a origem exata que bateu ou nada, mesmo que `CORS_ALLOWED_ORIGINS` seja configurado por engano como o literal `"*"` (vira o array `['*']`, que nunca bate contra um header `Origin` real de um browser). `src/lib/cors.test.ts` tem a asserção negativa dedicada, inclusive pra esse caso de misconfiguração.

⚠️ **O CORS entra ANTES DE TUDO em `src/index.ts`** — `app.use('*', corsMiddleware<Bindings>())` é a primeira linha depois de `new Hono()`, acima do handler `/api/auth/*` do Better Auth e do catch-all. `app.use('*', ...)` casa com **qualquer** método (inclusive `OPTIONS`): se o catch-all estivesse registrado antes, um preflight `OPTIONS` pra `/api/auth/*` cairia no `404` dele em vez de ser respondido (`204`), e o login quebraria em produção sem mensagem útil nenhuma — só "CORS error" genérico no console do browser, sem indicar a causa real. `cors.test.ts` prova essa ordem contra o app real (`../index`, não só um app de teste isolado): preflight pra `/api/auth/sign-in/social` e pra `/api/auth/get-session` responde `204`, nunca `404`.

⚠️ **Esta fatia NÃO verifica CORS em produção** — a quebra de CORS só aparece lá (local é `localhost` dos dois lados, nunca reproduz o cenário cross-origin real). A verificação em produção é critério de aceitação da fatia ④ (cutover), não desta.

## Três achados MEDIDOS nas Tasks 2/3, registrados aqui porque os relatórios de task são gitignored

1. **Teste de `STRICT` tem que testar a direção que de fato REJEITA.** Uma coluna `TEXT` numa tabela `STRICT` **CONVERTE** um `INTEGER` recebido em vez de rejeitar (`12345` vira `'12345.0'`) — testar essa direção passa por acidente, sem provar nada. A direção que REALMENTE rejeita (usada em `schema.test.ts`) é `TEXT` não-numérico numa coluna `INTEGER`: mensagem real `cannot store TEXT value in INTEGER column`. Mesmo achado já documentado em `apps/financas/CLAUDE.md` § _Migrations_ — vale igual aqui, mesma versão de SQLite/D1.
2. **SQLite aceita FK apontando pra uma tabela criada DEPOIS.** `voting_sessions.winner_movie_id REFERENCES session_movies(id)` — `session_movies` é criada DEPOIS de `voting_sessions` no `0001_votacao.sql`, e isso não deu erro nenhum: FK é resolvida na primeira ESCRITA que a exercita, não no `CREATE TABLE`. Confirmado aplicando a migration inteira de uma vez (`12 commands executed successfully`, `--local`) sem precisar reordenar as tabelas.
3. **Nenhum `CHECK` do schema portado precisou reposicionar.** A gramática do SQLite (`column-def* table-constraint*` — um `CHECK`/`UNIQUE` de TABELA, não preso a uma coluna, tem que vir depois de todas as column-defs, senão é `syntax error`; já mordeu o finanças, ver `apps/financas/CLAUDE.md` § _Migrations_) nunca chegou a ser exercida aqui: todo `CHECK` do schema original é **column-level** (preso à própria coluna, ex. `status TEXT NOT NULL CHECK (...)`); só os 2 `UNIQUE` são de tabela, e já estavam na última posição antes do `0001_votacao.sql` ser escrito.

## Comandos

```bash
make dev-ramielle           # wrangler dev na porta 8788 (8787 já é do finanças)
make test-ramielle          # pnpm --filter @piluvitu/ramielle test

pnpm --filter @piluvitu/ramielle run lint     # tsc --noEmit
pnpm --filter @piluvitu/ramielle run test     # vitest run

# Migrations
pnpm --filter @piluvitu/ramielle exec wrangler d1 migrations apply piluvitu-ramielle --local
pnpm --filter @piluvitu/ramielle exec wrangler d1 migrations apply piluvitu-ramielle --remote
pnpm --filter @piluvitu/ramielle exec wrangler d1 migrations list piluvitu-ramielle --local
pnpm --filter @piluvitu/ramielle exec wrangler d1 migrations list piluvitu-ramielle --remote
```

**Contagem de testes: 86** (`vitest run`, 8 arquivos) — 5 `index.test.ts` + 10 `schema.test.ts` + 7 `domain/users.test.ts` + 23 `lib/auth.test.ts` + 19 `lib/cors.test.ts` (Task 5) + 8 `lib/envelope.test.ts` + 9 `lib/session.test.ts` + 5 `routes/auth.test.ts`, confirmado via `pnpm --filter @piluvitu/ramielle exec vitest run --reporter=json` (campo `numTotalTests`), não só o resumo condensado do terminal. Recontar antes de citar este número num relatório futuro.

## Pendências do dono — nada disto foi feito nesta fatia

- **Aplicar as migrations `0001`/`0002` em produção** (`--remote`, comando acima) — hoje só rodaram `--local`.
- **Cadastrar os secrets** (`wrangler secret put <NOME>`, do diretório `apps/ramielle`): `BETTER_AUTH_SECRET` (gerar com `openssl rand -base64 32`, nunca reusar o valor de `.dev.vars`), `ADMIN_EMAILS` (hoje está em `wrangler.jsonc#vars` com o e-mail do dono — mover pra secret ou atualizar o var se a lista crescer antes do primeiro deploy real), e **`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`**. ⚠️ **Estes dois NÃO são de um OAuth Client novo — são os valores do MESMO OAuth Client que hoje já serve a área de admin de outro app e a API Go** (ver bullet da redirect URI abaixo). Criar um client novo pro ramielle quebraria a premissa do bullet seguinte: um client novo não tem URI nenhuma pra preservar, e o aviso "adicionar, nunca substituir" perderia o sentido.
- **Criar o Custom Domain** `api.piluvitu.com.br` (dashboard: Workers & Pages → `piluvitu-ramielle` → Settings → Domains & Routes → Add → Custom Domain) — `wrangler.jsonc` já declara a rota (`routes: [{ pattern: "api.piluvitu.com.br", custom_domain: true }]`), falta o domínio existir de fato.
- **Registrar a redirect URI no Google Console, no MESMO OAuth Client do bullet acima**: `https://api.piluvitu.com.br/api/auth/callback/google`. ⚠️ **ADICIONAR, NUNCA SUBSTITUIR AS EXISTENTES** — é justamente por ser o mesmo client (não um novo) que esta URI é ADITIVA: ele hoje serve a área de admin de outro app **e** a API Go (`promeia.piluvitu.com.br/auth/google/callback`); remover uma URI existente quebra o que já está no ar.

## Nada em produção mudou nesta fatia

`apps/web` continua falando com a Go (`promeia.piluvitu.com.br`, ver `apps/api/CLAUDE.md`). Nenhuma tela, nenhum endpoint em produção mudou — tudo o que este arquivo descreve (auth, CORS, guards) só é alcançável localmente/via preview até o dono completar as pendências acima.
