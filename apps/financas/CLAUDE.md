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

Códigos em uso: `not_authenticated`, `invalid_token`, `invalid_audience`, `token_expired`, `jwks_unavailable`, `email_not_allowed`, `not_found`, `invalid_json`, `invalid_scope`, `invalid_account`, `constraint_violation`, `invalid_transfer`, `invalid_entry`, `invalid_limit`, `invalid_query`, `over_allocation`.

## Autenticação — Cloudflare Access

Zero linha de login própria: o Access fica na frente do Worker (Google OAuth + allowlist) e injeta o header `Cf-Access-Jwt-Assertion`. `src/lib/access.ts` **não confia na existência do header** — valida assinatura RS256, `aud`, `iss` (`https://<teamDomain>`) e `exp` contra o JWKS de `https://<teamDomain>/cdn-cgi/access/certs`, e depois confere o e-mail contra a allowlist (case-insensitive, e **fail closed**: allowlist vazia barra todo mundo).

- **O cache de JWKS não é opcional.** Esse fetch consome **1 dos 50 subrequests** da invocação e custa **50–150 ms**. O cache vive no escopo do módulo, indexado por `teamDomain`, com TTL de 1 h. Quando o `kid` do token não está no cache quente, o JWKS é refetchado **uma vez** antes de rejeitar — senão uma rotação de chave da Cloudflare derrubaria o acesso por até um TTL inteiro.
- **Montagem:** `src/index.ts` aplica o middleware em `/api/*` com uma exceção explícita para `/api/health` (sondado por monitor externo, que não tem JWT). Um catch-all `app.all('/api/*')` garante que 404 também saia no envelope — **e precisa continuar sendo o ÚLTIMO `app.*` registrado**: no Hono a ordem de registro decide, e qualquer `app.route('/api', ...)` das Tasks 6-10 registrado depois dele fica inalcançável.
- **Vars:** `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` (Application Audience Tag da app no Zero Trust) e `ACCESS_ALLOWED_EMAILS` (CSV). Não são segredos — ficam em `vars` no `wrangler.jsonc`. `ACCESS_AUD` fica com um placeholder até a Task 15; antes de qualquer `wrangler deploy`, trocar pelo AUD Tag real (Zero Trust → Access → Applications → app do `financas.piluvitu.com.br` → Overview) — com o placeholder, toda requisição de produção cai em 401 `invalid_audience`.
- **Testes:** o JWT é assinado de verdade dentro do teste (par RSA via `crypto.subtle`) e a resposta do JWKS é servida sobrescrevendo `globalThis.fetch` (ver nota de desvio abaixo). Cada caso usa um `teamDomain` diferente de propósito — é assim que os testes ficam isolados apesar do cache de módulo.

⚠️ **`cloudflare:test` NÃO exporta `fetchMock` na versão instalada** (`@cloudflare/vitest-pool-workers@0.18.8`, também a mais recente publicada no npm nesta data) — MEDIDO grepando `fetchmock` (case-insensitive) em todo o pacote (`types/` e `dist/`): zero ocorrências. `import { fetchMock } from 'cloudflare:test'` importa `undefined` sem erro de módulo (o binding sintético não é ESM estrito o bastante pra recusar em tempo de link) e só quebra no primeiro uso (`fetchMock.activate is not a function`). Substituto usado em `src/lib/access.test.ts`: sobrescrever `globalThis.fetch` diretamente com um dispatcher que atende uma fila de respostas por domínio (FIFO, uma resposta por chamada — replica a semântica de um interceptor do undici consumido uma vez). Funciona porque o teste importa `./access` diretamente (não via `SELF`/service binding), então roda no MESMO isolate — a sobrescrita do global é visível pro módulo sob teste. A verificação de assinatura RS256 continua rodando de verdade via WebCrypto; só a resposta HTTP do JWKS é substituída. Se uma Task futura precisar mockar `fetch` de novo (ex.: chamada a uma API externa), usar o mesmo padrão em vez de tentar `fetchMock` de novo.

⚠️ **TS `JsonWebKey` built-in não tem `kid`** — o dict da WebCrypto API é mais enxuto que o JWK de verdade (RFC 7517), que é o que o JWKS do Access devolve. Em `access.test.ts`, o tipo usado para as chaves de teste é `JsonWebKey & { kid: string }`, não o `JsonWebKey` puro.

⚠️ **TS 5.7+ tornou `Uint8Array` genérico** (`Uint8Array<TArrayBuffer>`, default `ArrayBufferLike`) — uma função anotada só como `: Uint8Array` (sem o parâmetro) devolve o tipo mais largo `ArrayBufferLike`, que NÃO satisfaz `BufferSource` exigido por `crypto.subtle.verify`/`sign`. `bytesDeB64url` em `access.ts` é anotada como `Uint8Array<ArrayBuffer>` por causa disso.

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

### 1. Aplicação no Cloudflare Access (uma vez, antes do primeiro deploy)

No dashboard **Zero Trust → Access → Applications → Add an application → Self-hosted**:

1. **Application name:** `financas`.
2. **Session Duration:** `24 hours`.
3. **Public hostname:** `financas.piluvitu.com.br` (zona `piluvitu.com.br` — precisa já existir na conta Cloudflare).
4. **Identity providers:** Google.
5. **Policy** `dono` — Action **Allow**, regra **Include → Emails → `paulo.tspi@gmail.com`**. Allowlist de **exatamente um** e-mail — nunca "Everyone in domain": o módulo é single-user por design.
6. Na aba **Overview** da Application recém-criada, copiar o **Application Audience (AUD) Tag** (64 caracteres hex) e confirmar o **team domain** (`<team>.cloudflareaccess.com`).

### 2. Preencher `wrangler.jsonc`

`vars.ACCESS_AUD` nasceu com o placeholder `"trocar-pelo-aud-tag-da-application-do-access"` (Task 4) — **precisa virar o AUD Tag real do passo anterior antes de qualquer deploy**. `vars` não é bloco de secret (o segredo é a _policy_ do Access, não estes identificadores), então o valor fica versionado normalmente.

⚠️ **Se `ACCESS_AUD` continuar com o placeholder em produção, `verifyAccessJwt` (`src/lib/access.ts`) rejeita TODO JWT do Access com `401 invalid_audience`** (não 403 — só `email_not_allowed`, quando o e-mail autenticado não está na allowlist, é `403`). O sintoma na prática é indistinguível de "o Google login não está funcionando": o usuário loga normal no Google, o Access emite o JWT, e o Worker devolve 401 mesmo assim. Conferir este valor é o primeiro passo de qualquer troubleshooting de acesso negado.

### 3. Migration em produção (rodar manualmente — nunca automatizar)

```bash
pnpm --filter @piluvitu/financas exec wrangler d1 migrations list piluvitu-financas --remote
pnpm --filter @piluvitu/financas exec wrangler d1 migrations apply piluvitu-financas --remote
```

Esperado: `0001_financas_init.sql` aplicada. Sem down migration — se o schema sair errado, a correção é uma migration nova (`0002_*.sql`), nunca editar a `0001` depois de rodada com `--remote`. Índice no D1 também não é alterável, só dropado (irreversível) e recriado.

### 4. Publicar o Worker

```bash
pnpm --filter @piluvitu/financas run deploy
```

O script builda o SPA antes (`build:web`) e roda `wrangler deploy` em seguida — o `web/dist` publicado é sempre o do commit atual, nunca um build velho. Saída esperada: o binding `DB` e os assets de `web/dist` listados pelo wrangler.

### 5. Custom Domain (dashboard, uma vez)

**Workers & Pages → `financas` → Settings → Domains & Routes → Add → Custom Domain:** `financas.piluvitu.com.br`.

**Obrigatório, não preferência.** Em `*.workers.dev` o domínio registrável passa a ser diferente do da zona `piluvitu.com.br` — o contexto do cookie de sessão do Access vira cross-site, `SameSite=Lax` deixa de ser enviado, e **a quebra só aparece em produção** (local e preview nunca reproduzem, porque não passam pelo Access). `SameSite=None` não é solução: Safari (ITP) e Firefox (ETP) bloqueiam cookie de terceiro por padrão e o Chrome não — testar só no Chrome passa e engana.

### 6. Checklist de verificação manual pós-deploy

Rodar na ordem, do celular Android **e** do MacBook (cobre os dois motores de cookie/JS que importam aqui):

- [ ] `https://financas.piluvitu.com.br` redireciona para o login do Google do Access (não abre direto).
- [ ] Login com `paulo.tspi@gmail.com` entra e mostra a tela **Contas**.
- [ ] Login com outra conta Google é **negado** pelo Access.
- [ ] `curl -s -o /dev/null -w '%{http_code}\n' https://financas.piluvitu.com.br/api/health` devolve **302** ou **403** (sem JWT o Access barra antes do Worker responder — devolver **200** significa que a policy não está protegendo `/api/*`).
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
