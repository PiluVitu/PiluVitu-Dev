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

Códigos em uso: `not_authenticated`, `invalid_token`, `invalid_audience`, `token_expired`, `jwks_unavailable`, `email_not_allowed`, `not_found`.

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
