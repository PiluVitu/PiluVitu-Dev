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

`src/routes/*.ts` exporta routers Hono montados com `app.route('/api', ...)` em `src/index.ts`. Todas as respostas passam por `okJson`/`errJson` (`src/lib/envelope.ts`). Rotas de contas: `GET /api/accounts` (aceita `?scope=PJ|PF` e `?archived=1`, e devolve cada conta com `balance_cents` anexado), `POST /api/accounts`, `POST /api/accounts/:id/archive` (`404 not_found` se a conta não existir ou já estiver arquivada).

Os testes de rota montam um `new Hono()` só com o router, **sem** o middleware do Access, e passam o binding via terceiro argumento de `app.request(path, init, { DB: env.DB })`.

Rotas de lançamentos: `GET /api/transactions` (`?account_id=`, `?from=`, `?to=`, `?limit=`), `POST /api/transactions`, `POST /api/transfers`. Erros de `CHECK`/`FOREIGN KEY` do D1 são reconhecidos por `/SQLITE_CONSTRAINT|constraint failed/i` e viram `422`; `RangeError` do domínio vira `422` com código próprio.

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

⚠️ **`RangeError` de `lib/dates.ts` precisa de tratamento explícito na rota, mesmo quando o domínio já tem seu próprio tipo de erro.** `createInstallmentPlan` lança `InstallmentPlanError` para as próprias validações (conta, `installments_count`, `total_cents`), mas `billCompetence`/`addMonthsToCompetence`/`competenceDueDate` (Task 5) lançam `RangeError` **puro** quando a data é calendarialmente inválida — e o `DATE_RE` da rota (`/^\d{4}-\d{2}-\d{2}$/`) só valida FORMATO, não calendário. Rastro concreto: `purchase_date: '2026-13-01'` passa no regex; `billCompetence` não valida o mês e devolve `'2026-13'` direto (dia 1 ≤ fechamento, sem roll-forward); a primeira iteração do loop de parcelas chama `addMonthsToCompetence('2026-13', 0)`, que rejeita com `RangeError` — **antes de qualquer `db.batch()`**, então não há escrita parcial. Sem um branch pro catch da rota, esse `RangeError` não casa com `InstallmentPlanError` nem com o regex de constraint do D1, e escapa cru pro handler default do Hono: **500 sem envelope**, quebrando o contrato 400/422. Corrigido replicando a convenção de `accounts.ts`/`transactions.ts` (que já tratam `RangeError` do próprio domínio) para `installments.ts`: `if (err instanceof RangeError) return errJson(422, 'constraint_violation', err.message)`. **Toda rota que chama função de `lib/dates.ts` a partir de um valor só validado por regex de formato (Tasks 9, 10, 14) precisa do mesmo branch** — validar formato não é o mesmo que validar calendário, e todo `RangeError` de domínio (seja de tipo próprio ou dos helpers compartilhados) tem que virar `422` com envelope, nunca vazar como `500` pelado. `debtsRoutes` (Task 9) não chama nenhuma função de `lib/dates.ts` além de `nowIsoUtc()` (que não valida nem lança) — datas como `paid_on`/`opened_at`/`incurred_on` são gravadas cruas, sem `billCompetence`/`addMonthsToCompetence`/`competenceDueDate` no caminho — então esse branch não se aplica aqui.

## Dívidas (`src/domain/debts.ts` + `src/routes/debts.ts`)

`debt_items` é **estoque** (dimensão patrimonial) e **nunca** gera lançamento; `debt_payments` é **fluxo** e gera **exatamente uma** `transaction`, elo 1:1 forçado por `uq_debt_payments_tx`. Os dois nunca se somam porque medem grandezas diferentes — a dupla contagem é estruturalmente impossível, não uma regra de relatório.

`payDebt()` roda **um único `db.batch()`**, com todos os UUIDs gerados antes:

1. `INSERT transactions` (19 colunas) — **só quando `kind='cash'`**. Sinal: `i_owe` → negativo, `owed_to_me` → positivo. `category_id` vem sempre de `SELECT id FROM categories WHERE slug='quitacao-divida'` (semeada na migration 0001 com `kind='debt_settlement'`) — nunca `income`/`expense`: classificar o recebimento como receita inflaria o faturamento e distorceria o cálculo do DAS.
2. `INSERT debt_payments`
3. N × `INSERT debt_payment_allocations`
4. `UPDATE debts SET status='settled'`, guardado por `EXISTS (debt_items)` + `NOT EXISTS (v_debt_item_balance … is_settled = 0)` — quitar o último item fecha a dívida sozinho.

Os tetos I1/I2 são dos **triggers** `trg_alloc_pagamento_teto` / `trg_alloc_item_teto`, não da aplicação — **MEDIDO**: os dois disparam de verdade contra o Miniflare local e devolvem `SQLITE_CONSTRAINT_TRIGGER`, o domínio relança como `OverAllocationError` e a rota traduz em **422 `over_allocation`**. Como `batch()` faz rollback real, a superalocação não deixa rastro: nem transaction, nem payment, nem alocação parcial (coberto por teste de regressão que conta as três tabelas antes/depois). Alocar **exatamente** até o teto passa.

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

Testes: `pnpm --filter @piluvitu/financas exec vitest run src/domain/debts.test.ts` cobre o cenário real (Steam Deck 280000 + MacBook 450000, pagos 100000 + 100000 + 394000 ⇒ MacBook quitado e Steam Deck com 136000 em aberto) e as três queries do §5.4 do spec (1× no caixa via `v_cashflow`, 1× na dívida via `v_debt_item_balance`, 0× em `transactions` com categoria `expense`).

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
