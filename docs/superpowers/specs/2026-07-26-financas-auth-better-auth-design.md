# Finanças — Troca de Autenticação: Cloudflare Access → Better Auth (Google)

**Data:** 2026-07-26
**Status:** Aprovado (design) — pronto para plano de implementação
**Escopo:** Trocar a camada de autenticação do Worker `apps/financas` (Cloudflare Access) por **Better Auth 1.6.25** com login social do Google, D1 nativo, single-user. Não mexe em domínio (`src/domain/*`), rotas (`src/routes/*`) nem nas 6 telas da SPA além do gate de entrada.
**Depende de:** Fatia ① (contas, transações, transferências, parcelamento, dívidas, payees, categorias, relatório de comprometido) — pronta e revisada, 188 testes Worker + 45 SPA verdes.
**Fonte de design:** `/tmp/desenho-auth.md` (desenho detalhado, escrito **antes** de qualquer medição) corrigido por `.superpowers/sdd/2026-07-25-financas-pj-fatia-1/spikes-better-auth.md` (6 pontos medidos por execução real contra Miniflare/D1 local). **Onde os dois divergem, os spikes ganham** — está anotado abaixo cada vez que isso acontece.

---

## 1. Objetivo e não-objetivos

**Objetivo:** o dono do repo consegue logar em `financas.piluvitu.com.br` com a própria conta Google, sem depender do Cloudflare Zero Trust, mantendo a mesma garantia de segurança que existe hoje (só um e-mail entra).

**Não-objetivos:**

- Multi-usuário, convite, papéis/permissões — o módulo continua single-user por design.
- E-mail/senha, 2FA, magic link — só Google OAuth.
- Reescrever domínio, rotas ou telas existentes — a troca é estritamente na camada de autenticação.
- Rodar a migration em produção ou executar `wrangler deploy` como parte do trabalho automatizado — isso é ato manual do dono (ver §11 do plano de implementação).

## 2. Por que o Access sai

O Cloudflare Access está na frente do Worker desde a fatia ①: JWT RS256 validado contra o JWKS do time, allowlist de e-mail na _policy_ do Zero Trust. Funciona, mas a _policy_ do Zero Trust exige verificação de cartão de crédito na conta Cloudflare — verificação que o dono não consegue completar. Com isso a _Application_ do Access fica inacessível para o próprio dono: ele não consegue nem entrar no dashboard para gerenciar a _policy_ que protege o próprio módulo. A troca não é sobre segurança do Access (que continua funcionando tecnicamente) — é sobre o dono ficar trancado fora da própria ferramenta de administração dela.

## 3. Arquitetura da troca

Better Auth roda **dentro do Worker**, não na frente dele. `/api/auth/*` vira uma rota como qualquer outra, montada acima do catch-all. Duas camadas substituem a policy única do Access:

1. **Hook de criação** (`databaseHooks.user.create.before`) — decide quem pode **virar usuário** no D1.
2. **Guarda de sessão** (`requireSession()`, montada em `/api/*`) — decide quem pode **usar** uma sessão já existente.

Essa separação em duas camadas é a peça central do design (§5) — o Access resolvia os dois problemas com uma _policy_ só; aqui são dois mecanismos independentes porque o Better Auth, uma vez emitida a sessão, não sabe nada sobre allowlist.

**Grátis, medido (S1, S2):** `better-auth@1.6.25` fala D1 nativamente (`database: env.DB`) — desde a 1.5 o `@better-auth/kysely-adapter` (dependência direta, escopo oficial do pacote) detecta o binding por duck-typing (`'batch' in db && 'exec' in db && 'prepare' in db`) e monta seu próprio `D1SqliteDialect` via `import()` dinâmico. Nenhum adapter de terceiro entra (nem `kysely-d1`, nem `better-auth-cloudflare`, nem `@better-auth/cloudflare` — este último não existe, 404 no registry). Instala limpo: nenhum pacote da árvore nova (`better-auth`, `@better-auth/*`, `better-call`, `jose`, `kysely`, `nanostores`, `zod`, etc.) declara lifecycle script de install — **zero entrada nova em `allowBuilds`** no `pnpm-workspace.yaml` (S1, confirmado escaneando `package.json` de toda a árvore transitiva).

`apps/financas/package.json` já tem `"better-auth": "1.6.25"` (sem `^`) e o `pnpm-lock.yaml` já foi atualizado — mudança feita durante os spikes, deixada **deliberadamente sem commit**. O plano de implementação parte daí, não readiciona a dependência.

⚠️ **Correção do desenho (S3): `nodejs_compat` NÃO é obrigatório para este stack bootar ou rodar no `compatibility_date` atual — só evita um aviso de build.** O desenho original afirmava que o Worker "nem sobe" sem o flag (`No such module "node:crypto"`); isso é falso nesta versão do workerd. Medido com o `wrangler.jsonc` real do projeto (hoje sem `compatibility_flags`): `betterAuth` importa, a instância constrói, `await auth.$context` resolve, `signUpEmail` (que dispara `hashPassword`/`scrypt` via `node:crypto`) funciona, e o fluxo OAuth completo (sign-in social → callback → hook) roda de ponta a ponta — tudo **sem** o flag. O único efeito observável da ausência é `wrangler deploy --dry-run` emitir 2 **warnings** de build (não erro): `node:async_hooks` e `node:crypto` "wasn't found on the file system but is built into node". O flag entra mesmo assim, como **precaução** — silencia os 2 warnings e protege contra o comportamento não estar garantido em `compatibility_date`/versões de workerd futuras — mas não é pré-requisito.

**Bundle real deste repo (S4):** `wrangler deploy --dry-run` com as 7 rotas reais + Better Auth montado dá **330,17 KiB gzip** (medido, não projeção sintética) — **~11% do teto de 3 MB**, folga de ~9x. Com ou sem `nodejs_compat` o número é idêntico (o flag é resolução de módulo nativo do runtime, não polyfill JS — não pesa nada). Baseline sem Better Auth: 27,66 KiB gzip. Delta atribuível à troca: ~302 KiB gzip.

## 4. Como o binding `env.DB` chega no `betterAuth()`

`betterAuth()` quer o binding no momento da construção, mas em Worker o binding só existe por requisição. Três padrões possíveis; escolhido o terceiro por convenção do repo (`src/domain/*` recebe `D1Database` por parâmetro, nunca lê `env` global — ler `env` de `cloudflare:workers` no escopo do módulo quebraria a testabilidade de `index.test.ts`, que injeta o binding via terceiro argumento de `app.request()`):

```ts
// src/lib/auth.ts
const instancias = new WeakMap<AuthBindings, Auth>()

export function getAuth(env: AuthBindings): Auth {
  const quente = instancias.get(env)
  if (quente) return quente
  const nova = createAuth(env)
  instancias.set(env, nova)
  return nova
}
```

**Medido, não hipótese (S6b):** o objeto `env` do Hono tem identidade **estável** entre requisições do mesmo isolate — confirmado com um Worker isolado dirigido via `SELF.fetch` (3 dispatches HTTP separados, não `app.request()` manual, que só testaria a própria referência do teste). A memoização por `WeakMap` acerta cache de verdade; não é decorativa. Motivo de existir: o teto do free tier é 10 ms de CPU por invocação, e construir a instância (schemas zod + pipeline de plugins) não é grátis.

`baseURL`/`secret` são obrigatórios e explícitos — `@better-auth/core` procura o segredo em `process.env`/`Deno.env`/`globalThis.__env__`, nenhum existe no Worker, e a falta lança no boot. O `secure`/prefixo `__Secure-` do cookie de sessão sai do `baseURL` começar com `https://` — `isProduction` é sempre falso no Worker (não há `NODE_ENV`), então não há fallback automático.

## 5. A allowlist e suas duas camadas (a parte crítica)

### Camada 1 — hook de criação

`databaseHooks.user.create.before` lançando `APIError('FORBIDDEN', { message: CODIGO_BARRADO })`. Alternativas descartadas com motivo: `hooks.before` + `createAuthMiddleware` não serve (a rota OAuth é `GET /callback/:id`, só tem `code`/`state` — o e-mail não existe ainda nesse ponto); o plugin `admin`/ban é tarde demais (checa em `session.create.before`, depois de `user`/`account` já existirem); retornar `false` em vez de lançar bloqueia por acidente (`createdUser.id` sobre `null` → `TypeError` → `?error=unable_to_create_user`, mensagem opaca); `disableSignUp` + seed tem pegadinha de `emailVerified` que trava o próprio dono. `CODIGO_BARRADO = 'nao_autorizado'` — a mensagem do `APIError` **vira o código de erro na URL** (`result.error.split(' ').join('_')`), por isso é slug: minúsculo, sem acento, sem espaço.

**O que o usuário barrado vê:** um **302**, não um JSON. Loga normal no Google (o Google não sabe de allowlist nenhuma), volta pra `GET /api/auth/callback/google`, o handler troca o code, lê o userinfo, chama `createOAuthUser` — o hook lança antes do primeiro `INSERT`. O navegador vai para `<errorCallbackURL>?error=nao_autorizado` (a SPA define `errorCallbackURL: '/login'`, ver §8). **Nada é gravado** — `createOAuthUser` cria `user` primeiro e `account` depois, dentro de uma transação lógica; o hook aborta antes de qualquer `INSERT`.

**Medido por execução, não hipótese (S5):** `auth.$context` existe e é uma `Promise` (quem acessa sem `await` pega o próprio `Promise` — erro fácil). O fluxo OAuth completo simulado (`signInSocial` → cookie de state/PKCE → callback com `globalThis.fetch` sobrescrito para o token endpoint do Google → hook) produz exatamente o comportamento previsto: `callback status 302 location …?error=nao_autorizado`, `user`/`account` em **0 linhas antes e depois**. Pegadinha medida: `getUserInfo` do provider Google **não chama o endpoint REST de userinfo** — decodifica o `id_token` via `jose.decodeJwt` sem checar assinatura; um `id_token` mockado só precisa ter **forma** de JWT (3 partes base64url), não assinatura válida.

### Camada 2 — guarda de sessão

O hook protege a **criação**; a guarda (`requireSession()` → `decidirAcesso()`, ambas em `session.ts`) protege o **uso**, comparando `sessao.user.email` contra `ALLOWED_EMAIL` a cada request. Isto **não é redundância** — é a única coisa que impede uma linha `user` que entrou por qualquer outro caminho (seed manual, bug futuro, config trocada) de logar livremente.

**Medido, não presumido (S6a):** um `user` criado com e-mail fora da allowlist **sem passar pelo hook** (via uma instância de teste separada, sem o hook de allowlist, técnica descrita em §7 do plano) recebe do Better Auth uma sessão **100% válida** — `get-session` devolve 200 com o e-mail estranho. O Better Auth **não tem consciência de allowlist nenhuma fora do hook de criação**. Sem `decidirAcesso()` conferindo o e-mail a cada request, essa sessão passaria livre por qualquer rota.

**Cookie, medido (S6a):** `better-auth.session_token=<token>.<assinatura>` — a parte antes do ponto é o mesmo valor gravado em `session.token` no D1; a parte depois é a assinatura HMAC, base64 URL-encoded. **Forjável em teste**: `auth.api.signInEmail`/`signUpEmail` (com `emailAndPassword: { enabled: true }` só numa instância de teste — produção mantém desligado) devolve um `set-cookie` real e assinado; replay funciona (`getSession` reconhece num segundo request). Isso é o que permite provar a camada 2 com uma sessão real, e não só com a função pura `decidirAcesso()`.

## 6. Migration `0002`

4 tabelas STRICT novas (`user`, `session`, `account`, `verification`), forward-only, sem `BEGIN`/`COMMIT` (D1 rejeita), mesmo estilo comentado do `0001`. **O DDL padrão do Better Auth usa o tipo `date`, inválido em tabela STRICT** (SQLite STRICT só aceita `INT/INTEGER/REAL/TEXT/BLOB/ANY` — `date` dá `Error: unknown datatype`). Resolução: `date → TEXT` (ISO-8601 UTC) e `emailVerified → INTEGER` (`0|1`). É seguro porque em SQLite o adapter roda com `supportsDates: false`/`supportsBooleans: false` — `@better-auth/core` já converte `Date → toISOString()` e `boolean → 1|0` na escrita e reverte na leitura; a migration só precisa aceitar o formato que o core já produz.

Exceção deliberada à convenção do módulo: colunas **camelCase** (`emailVerified`, `createdAt`, `userId`), não snake_case como as 10 tabelas do `0001` — é contrato da biblioteca, não escolha nossa; renomear exigiria mapear cada campo em `user: { fields: {...} }` e todo plugin futuro herdaria a mesma dívida.

**Mais corroborado do que o desenho supunha:** o desenho tratava esta migration como "hipótese até passar por teste" (nunca executada). Os spikes S2 e S5 **de fato escreveram e leram** contra essa mesma forma de DDL dentro do Miniflare (criação das 4 tabelas via `env.DB.batch()`, escrita real via `createOAuthUser`, leitura conferida por `SELECT`) — a estrutura já tem alguma validação por execução, não é só leitura de gerador. Ainda assim, o plano de implementação roda `src/schema.test.ts` como gate antes de qualquer `--remote` (migration em D1 é forward-only e imutável depois de aplicada remotamente).

## 7. Middleware de sessão — códigos que saem e entram

| Código              | Status | Situação                                                                                                                                                                                                                                             |
| ------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `invalid_token`     | 401    | **SAI** — não há JWT para malformar                                                                                                                                                                                                                  |
| `invalid_audience`  | 401    | **SAI** — não há `aud` (era a causa nº 1 de troubleshooting)                                                                                                                                                                                         |
| `token_expired`     | 401    | **SAI** — sessão expirada é indistinguível de ausente (`getSession` devolve `null` nos dois casos)                                                                                                                                                   |
| `jwks_unavailable`  | 503    | **SAI** — não há JWKS                                                                                                                                                                                                                                |
| `not_authenticated` | 401    | **FICA**, mesma semântica — a SPA não muda o que compara                                                                                                                                                                                             |
| `email_not_allowed` | 403    | **FICA**, mesmo status — agora é a 2ª trava, não a 1ª                                                                                                                                                                                                |
| `auth_unavailable`  | 503    | **ENTRA** — ocupa o slot do `jwks_unavailable`. `getSession()` toca o D1; sem `try/catch`, D1 fora do ar vazaria como 500 sem envelope, quebrando o contrato de `api<T>()` da SPA (que lançaria `invalid_envelope`, sintoma sem relação com a causa) |

Saldo: catálogo perde 4 códigos, ganha 1. `requireSession()` chama `getAuth(c.env).api.getSession({ headers: c.req.raw.headers })` dentro de um `try/catch`; `decidirAcesso(sessao, c.env.ALLOWED_EMAIL)` é a função pura que decide 401/403/ok — extraí-la como pura é o que permite provar a camada 2 sem depender só de cookie forjado.

**Montagem em `src/index.ts`:** duas exceções explícitas ao `requireSession()` em `/api/*` — `/api/health` (monitor externo sem cookie) e `/api/auth/*` (o próprio fluxo de login; barrar aqui é deadlock). `/api/auth/*` é montado **acima** do catch-all (`// SEMPRE POR ÚLTIMO`), que continua sendo o último `app.*` registrado — regra inalterada desde a fatia ①.

⚠️ Duas pegadinhas de teste/operação, herdadas do desenho: sem header `Origin`, o handler do Better Auth responde 403 `MISSING_OR_NULL_ORIGIN` **fora do envelope** — todo `POST`/teste para `/api/auth/*` precisa do header. E `/api/auth/*` nunca passa pelo envelope `{ok,data,notifications}` de propósito (as respostas são as do próprio Better Auth) — `api<T>()` da SPA nunca deve ser usado nessas rotas.

## 8. SPA

`web/src/auth-client.ts` — `createAuthClient()` sem `baseURL` (resolve sozinho para `window.location.origin + '/api/auth'`, que é onde o Worker monta o handler; `credentials: 'include'` também é automático). `web/src/api.ts` **não muda** — chamadas seguem relativas, `credentials: 'same-origin'` já basta.

`web/src/Gate.tsx` — guarda de topo + tela de login. Ordem importa: `isPending` primeiro (o primeiro render é sempre pending; testar `!sessao` antes pisca a tela de login pra quem já está logado), depois `!sessao` (nunca `error` — um blip de rede preserva `data` anterior no átomo do Better Auth, derrubar por `error` deslogaria o dono à toa). `signIn.social({ provider: 'google', callbackURL: '/', errorCallbackURL: '/login' })` — `/login` como **path**, não hash: o redirect de erro monta `${errorURL}?error=…`, e com `/#/login` a query cairia dentro do hash e `location.search` ficaria vazio. `App.tsx` envolve nav + as 5 telas no `<Gate>`; cabeçalho autenticado mostra `{sessao.user.email}` + `signOut()`.

## 9. Segredos e configuração

**Secrets** (`wrangler secret put`, 3): `BETTER_AUTH_SECRET` (≥32 chars, `openssl rand -base64 32`), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — `GOOGLE_CLIENT_ID` entra como secret (não var) pela regra mental única "tudo do Google é secret", mesmo aparecendo em claro na URL de autorização.

**Vars** (`wrangler.jsonc`, não-segredos, versionados): `BETTER_AUTH_URL` (produção: `https://financas.piluvitu.com.br` — o `https://` é o que liga `secure`/prefixo `__Secure-` do cookie, já que `isProduction` nunca é `true` no Worker) e `ALLOWED_EMAIL` (single-user; vazio barra todo mundo, fail closed, mesmo espírito do `ACCESS_ALLOWED_EMAILS` que sai). `ACCESS_TEAM_DOMAIN`/`ACCESS_AUD`/`ACCESS_ALLOWED_EMAILS` saem.

**Credenciais reaproveitadas:** o dono reaproveita o OAuth client Google da área de admin e **já registrou** as 3 redirect URIs (`https://financas.piluvitu.com.br/api/auth/callback/google`, `http://localhost:5273/...` e `http://localhost:8787/...`). `apps/financas/.dev.vars` já existe localmente com os valores reais; **`.dev.vars`/`**/.dev.vars`já estão no`.gitignore` (confirmado — ver §11, correção ao desenho).

**Cloudflare Access:** se a _Application_ `financas` ainda existir no Zero Trust, precisa ser removida/desabilitada antes do deploy — enquanto existir, ela barra a requisição **antes** do Worker rodar, e `/api/auth/*` (sem `Cf-Access-Jwt-Assertion`) nunca chega no Better Auth.

## 10. Riscos

| Risco                                                                   | Mitigação                                                                                                                                                                        |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Allowlist mal configurada em produção (`ALLOWED_EMAIL` vazio ou errado) | Fail closed nas duas camadas — `isAllowedEmail('', permitido)` e `isAllowedEmail(email, '')` sempre `false`                                                                      |
| `Application` do Access esquecida ativa no Zero Trust                   | Checklist de deploy (§9) inclui removê-la explicitamente antes de qualquer teste                                                                                                 |
| Migration `0002` errada em produção                                     | Forward-only, imutável após `--remote` — gate obrigatório: `src/schema.test.ts` verde + `db:migrate:local` antes de qualquer `--remote`                                          |
| Telemetria do Better Auth fazendo chamada de rede não pedida            | `telemetry: { enabled: false }` na config; verificar com `wrangler tail` no primeiro deploy real (import de `@better-auth/telemetry` é estático, fica no bundle mesmo desligado) |
| Bundle crescer além do teto com plugins futuros                         | 330,17 KiB gzip medido, ~11% do teto — folga de ~9x antes de precisar reavaliar                                                                                                  |

## 11. O que ficou incerto (e o que os spikes resolveram)

**Resolvido pelos spikes**, não mais em aberto: `nodejs_compat` não é bloqueante (S3); bundle real medido (S4); `auth.$context`/`createOAuthUser`/simulação de callback funcionam (S5); cookie forjável e `env` estável para o `WeakMap` (S6); nenhuma entrada em `allowBuilds` necessária (S1); `.dev.vars` **já** está no `.gitignore` — o desenho original afirmava o contrário (`.env`/`.env.local` só, linhas 32-33, sem `.dev.vars`), mas a árvore atual do repo já tem `.dev.vars` e `**/.dev.vars` no `.gitignore` — **não há step de gitignore no plano de implementação** por causa disso.

**Continua em aberto**, sem spike dedicado:

1. **Comportamento de `refetchOnWindowFocus` (default `true`) no meio de um formulário preenchido** (`new-entry.tsx`, `debt-detail.tsx`) — a sessão revalida ao voltar pra aba; não avaliado se isso interrompe um formulário em preenchimento.
2. **Chamada de rede real de telemetria** — `telemetry: { enabled: false }` está na config, mas o efeito só é confirmável com `wrangler tail` num deploy real (ver §10).
3. **Nulabilidade exata de cada coluna sob todo caminho de escrita** — S2/S5 validaram escrita via `createOAuthUser` e via `signInEmail`/`signUpEmail`; não há uma prova exaustiva coluna-a-coluna para todo plugin futuro que possa vir a escrever nessas tabelas.
4. **Path de "D1 fora do ar" (`auth_unavailable`, 503)** — o código existe e o motivo de existir está documentado (§7), mas não há teste automatizado forçando esse caminho (Miniflare não tem um jeito limpo de simular D1 indisponível sem introduzir um padrão de mock não usado em nenhum outro teste do módulo até hoje).

## 12. O que não muda

Os **7 arquivos de teste de rota** — `accounts.test.ts`, `transactions.test.ts`, `installments.test.ts`, `debts.test.ts`, `payees.test.ts`, `categories.test.ts`, `reports.test.ts` — **não são editados**. Eles já montam `new Hono()` só com o router, sem middleware de auth nenhum, e passam o binding via terceiro argumento de `app.request()`. Isso é a prova de que a troca de camada não vazou para o domínio: nada em `src/domain/*` ou `src/routes/*` sabe que a autenticação mudou de Access para Better Auth.
