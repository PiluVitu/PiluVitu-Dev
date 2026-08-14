# ramielle — fatia ② : as rotas de votação, com paridade provada — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portar para o `apps/ramielle` as **7 rotas de votação que só dependem do D1**, com o JSON de saída **idêntico ao da API Go** — provado por vetor dourado gerado pelo próprio Go, não por leitura.

**Architecture:** Domínio puro em `src/domain/`, rotas Hono finas em `src/routes/`, com os guards `requireAuth`/`requireAdmin` da fatia ①. A camada que decide esta fatia é a de **serialização**: o `apps/web` já consome a Go, e qualquer desvio de shape quebra a tela em silêncio.

**Tech Stack:** TypeScript, Hono, D1, Vitest com `@cloudflare/vitest-pool-workers`. Web Crypto (`crypto.subtle`) para o desempate.

---

## Onde esta fatia se encaixa

`docs/superpowers/specs/2026-07-28-ramielle-promeia-design.md` §8/§9.4. A fatia ① pôs o Worker de pé (D1, schema da votação, login Google, guards, CORS). Esta é a ②.

**Ao fim desta fatia, nada em produção muda.** O `apps/web` continua falando com a Go. O ramielle responde as rotas de votação e ninguém as chama ainda.

### O recorte: 7 das 9 rotas

⚠️ **A fatia ① dizia "10 rotas". São 9** (contadas em `apps/api/internal/router/router.go`). Dessas, **duas dependem de serviço externo** e ficam para a fatia ③:

| Rota                                   | Guard | Fatia                       |
| -------------------------------------- | ----- | --------------------------- |
| `GET /votacao/sessions`                | auth  | **②**                       |
| `GET /votacao/sessions/{id}`           | auth  | **②**                       |
| `POST /votacao/sessions/{id}/votes`    | auth  | **②**                       |
| `GET /votacao/sessions/{id}/results`   | auth  | **②**                       |
| `GET /votacao/sessions/{id}/votes`     | admin | **②**                       |
| `POST /votacao/sessions/{id}/close`    | admin | **②**                       |
| `POST /votacao/sessions/{id}/tiebreak` | admin | **②**                       |
| `GET /votacao/categorias`              | auth  | ③ (Google Sheets)           |
| `POST /votacao/sessions`               | admin | ③ (Sheets + sorteio + TMDb) |

**Consequência aceita:** sem `POST /sessions`, esta fatia não consegue criar sessão pela API. Os testes semeiam o D1 direto — o que é o certo de qualquer forma para provar paridade, porque fixa o estado de entrada em vez de depender de outra rota.

⚠️ **O gatilho de backup no `close` fica para a fatia ③.** O Go dispara `Backuper.Run(ctx, "session_close")` numa goroutine depois de fechar. Aqui a rota **não** dispara nada — o backup do D1 é outro mecanismo (`scripts/backup-d1.sh`, export lógico), não o `VACUUM INTO`→Drive do Go. Não invente um substituto nesta fatia.

---

## Contexto medido (2026-07-29) — os dois achados que decidem a fatia

### ⚠️ Achado 1: `VotingSession` e `SessionMovie` viajam em **PascalCase**

`apps/api/internal/votacao/sessions.go:11-21` e `movies.go:9-19` declaram as structs **sem nenhuma tag `json:`**. O Go então serializa com os nomes dos campos:

```json
{
  "ID": 7,
  "Title": "Sessão de maio",
  "Status": "open",
  "CreatedBy": 1,
  "CreatedAt": "2026-05-19T12:00:00Z",
  "ClosedAt": null,
  "WinnerMovieID": null,
  "WinnerMethod": null,
  "SortOptionsJSON": "{}"
}
```

E o `apps/web` **já depende disso**: `apps/web/lib/votacao/types.ts` declara `VotingSession.ID`, `.Title`, `.CreatedBy`, `.SortOptionsJSON`… em PascalCase.

⚠️ **O resto da API é snake_case** (`has_voted`, `voted_movie_ids`, `movie_id`, `total_votes`), porque esses handlers montam `map[string]any` com chaves explícitas. **A API mistura as duas convenções, e essa mistura é o contrato.** Um implementador TS vai querer "padronizar" tudo para snake_case por instinto — e o `apps/web` quebraria **em silêncio**, porque `res.json()` é `any` e o TypeScript não confere nada em runtime.

### ⚠️ Achado 2: o formato de `CreatedAt` muda entre Go e D1

No Go, `CreatedAt` é `time.Time`, e `encoding/json` o serializa em **RFC3339** (`"2026-05-19T12:00:00Z"`).

No D1, a coluna é `TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP` (migration `0001`), e o `CURRENT_TIMESTAMP` do SQLite produz **`"2026-05-19 12:00:00"`** — separador **espaço**, sem `T` e sem `Z`.

Devolver o valor cru quebra o cliente: `new Date("2026-05-19 12:00:00")` é aceito pelo V8 mas **rejeitado pelo Safari** (`Invalid Date`), e o `apps/web` renderiza essa data no `SessionCard`. É a mesma classe de armadilha do fuso que este projeto já mediu três vezes: só aparece em um dos ambientes.

**Decisão:** normalizar na saída (`toIsoUtc`), nunca confiar no formato de armazenamento. E, em toda escrita nova desta fatia, gravar já em ISO — mas **sem alterar a migration `0001`** (forward-only; e o `DEFAULT` continua lá para quem inserir sem passar o campo).

---

## Global Constraints

- **O shape do JSON é contrato com o `apps/web`.** PascalCase onde a Go usa PascalCase, snake_case onde ela usa snake_case. Provado por vetor dourado (Task 1), não por leitura.
- **Envelope único** `{ok, data, notifications}`. `notifications` é `[]`, nunca `null`.
- **Os códigos de erro são os que o `apps/web` já trata.** Não invente: `invalid_id`, `session_not_found`, `session_closed`, `session_not_open`, `movie_not_in_session`, `invalid_json`, `invalid_entropy`, `no_tie`, `winner_already_set`, `not_authenticated`, `admin_only`, `internal_error`.
- **Colocation:** teste no mesmo diretório do fonte.
- **Migration forward-only** no D1; índice não é alterável, só dropado (irreversível).
- **Teto de 100 bound params por statement** no D1.
- **Teto de ~10 ms de CPU por invocação** no free tier — `getAuth` sempre memoizado, nunca `createAuth`.
- **A mensagem de erro é o produto.** Nunca vazar `D1_ERROR`/`SQLITE_CONSTRAINT` cru.
- **Relógio injetado** (`now?: Date`), nunca mockado globalmente.
- **Teste que não pode falhar é o defeito mais recorrente deste projeto.** Verifique por mutação.
- ⚠️ **O `git` do shell é interceptado por um wrapper (`rtk`) que devolve saída FALSA** — use `/usr/bin/git`; para pnpm, formas com `--filter`.

---

## File Structure

| Arquivo                                  | Responsabilidade                                                                                     |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `src/lib/dates.ts` (+teste)              | `nowIsoUtc(now?)`, `toIsoUtc(valorDoSqlite)`                                                         |
| `src/lib/wire.ts` (+teste)               | Os tipos de FIO (PascalCase) e as funções `sessionToWire`/`movieToWire`                              |
| `src/domain/sessions.ts` (+teste)        | Ler sessão, listar, ler filmes da sessão                                                             |
| `src/domain/votes.ts` (+teste)           | `replaceUserVotes`, `getUserVotes`, `listVotesBySession`, `countVoters`, `listSessionVotesWithUsers` |
| `src/domain/tally.ts` (+teste)           | `tallyVotes`, `computeTopMovies` — puro, sem D1                                                      |
| `src/domain/tiebreak.ts` (+teste)        | `tiebreakSeed`, `pickTiebreakIndex` — puro, com vetor dourado                                        |
| `src/routes/votacao.ts` (+teste)         | As 7 rotas                                                                                           |
| `src/routes/__fixtures__/go-parity.json` | Vetores dourados gerados pelo Go                                                                     |
| `src/index.ts`                           | Montagem                                                                                             |

---

### Task 1: A camada de fio — PascalCase, timestamp, e o vetor dourado

Esta task existe porque é onde a fatia pode falhar em silêncio. Ela não entrega rota nenhuma; entrega a **prova** de que o shape bate.

**Files:**

- Create: `apps/ramielle/src/lib/dates.ts`, `dates.test.ts`
- Create: `apps/ramielle/src/lib/wire.ts`, `wire.test.ts`
- Create: `apps/ramielle/src/routes/__fixtures__/go-parity.json`

**Interfaces produzidas:**

- `nowIsoUtc(now?: Date): string` — `'2026-05-19T12:00:00Z'`
- `toIsoUtc(valor: string): string` — normaliza o que vier do SQLite
- `type WireSession` / `type WireMovie` — os tipos PascalCase
- `sessionToWire(row): WireSession` / `movieToWire(row): WireMovie`

- [ ] **Step 1: Gerar o vetor dourado a partir do Go de verdade**

Crie um programa Go descartável (fora do repo, ex.: `/tmp/parity/main.go`) que importe `github.com/PiluVitu/api/internal/votacao`, monte um `VotingSession` e um `SessionMovie` com valores fixos, e imprima `json.Marshal` de cada um. Rode com `/usr/local/go/bin/go run`.

⚠️ **Use os valores exatos abaixo** — eles cobrem os campos nulos e os não-nulos:

```go
s := votacao.VotingSession{
    ID: 7, Title: "Sessão de maio", Status: "open", CreatedBy: 1,
    CreatedAt: time.Date(2026, 5, 19, 12, 0, 0, 0, time.UTC),
    ClosedAt: nil, WinnerMovieID: nil, WinnerMethod: nil,
    SortOptionsJSON: "{}",
}
```

e uma segunda com `ClosedAt`/`WinnerMovieID`/`WinnerMethod` preenchidos (`2026-05-20T18:30:00Z`, `42`, `"roulette"`). Idem para `SessionMovie`, uma com `TMDbID`/`SheetNumber` nulos e outra preenchida.

Grave a saída **literal** em `src/routes/__fixtures__/go-parity.json`, no formato:

```json
{
  "_gerado_por": "go run contra apps/api/internal/votacao — NÃO editar à mão",
  "sessionAberta": { ... },
  "sessionFechada": { ... },
  "filmeSemTmdb": { ... },
  "filmeComTmdb": { ... }
}
```

⚠️ **Se o `go run` não puder rodar, PARE e reporte BLOCKED.** Não escreva o fixture à mão a partir do que você leu no código — o valor inteiro deste vetor é ele vir da execução real. Um fixture escrito à mão prova só que você e o teste concordam.

- [ ] **Step 2: `dates.ts` — teste primeiro**

```ts
import { nowIsoUtc, toIsoUtc } from './dates'

describe('nowIsoUtc', () => {
  it('formata em ISO-8601 UTC com Z e sem milissegundos', () => {
    expect(nowIsoUtc(new Date('2026-05-19T12:00:00.456Z'))).toBe(
      '2026-05-19T12:00:00Z',
    )
  })
  it('sem argumento usa o relógio e devolve o mesmo formato', () => {
    expect(nowIsoUtc()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
  })
})

describe('toIsoUtc', () => {
  it('converte o formato do CURRENT_TIMESTAMP do SQLite', () => {
    // ⚠️ MEDIDO: o CURRENT_TIMESTAMP do SQLite grava com ESPAÇO, sem T e sem Z.
    // `new Date('2026-05-19 12:00:00')` é aceito pelo V8 e REJEITADO pelo
    // Safari (Invalid Date) — e o apps/web renderiza esta data no SessionCard.
    expect(toIsoUtc('2026-05-19 12:00:00')).toBe('2026-05-19T12:00:00Z')
  })
  it('deixa passar o que já está em ISO com Z', () => {
    expect(toIsoUtc('2026-05-19T12:00:00Z')).toBe('2026-05-19T12:00:00Z')
  })
  it('normaliza ISO com milissegundos para o formato sem eles', () => {
    expect(toIsoUtc('2026-05-19T12:00:00.123Z')).toBe('2026-05-19T12:00:00Z')
  })
  it('recusa string vazia em vez de devolver Invalid Date', () => {
    expect(() => toIsoUtc('')).toThrow(RangeError)
  })
  it('recusa lixo em vez de devolver Invalid Date', () => {
    // Devolver a string 'Invalid Date' pro cliente seria pior que falhar alto:
    // a tela renderizaria isso como se fosse uma data.
    expect(() => toIsoUtc('nao-e-data')).toThrow(RangeError)
  })
})
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `pnpm --filter @piluvitu/ramielle exec vitest run src/lib/dates.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 4: Implementar `dates.ts`**

```ts
/**
 * Datas de fio, no formato que a API Go emite.
 *
 * ⚠️ MEDIDO: no Go, `CreatedAt` é `time.Time` e o `encoding/json` serializa em
 * RFC3339 (`2026-05-19T12:00:00Z`). No D1 a coluna é TEXT com
 * `DEFAULT CURRENT_TIMESTAMP`, e o CURRENT_TIMESTAMP do SQLite grava
 * `2026-05-19 12:00:00` — separador ESPAÇO, sem T e sem Z. Devolver o valor
 * cru quebra o cliente: `new Date('2026-05-19 12:00:00')` é aceito pelo V8 e
 * REJEITADO pelo Safari (Invalid Date), e o apps/web renderiza essa data.
 * Mesma classe de armadilha do fuso que este projeto já mediu três vezes:
 * só aparece em um dos ambientes.
 */

/** Instante atual (ou o injetado) em `YYYY-MM-DDTHH:MM:SSZ`. */
export function nowIsoUtc(now: Date = new Date()): string {
  return `${now.toISOString().slice(0, 19)}Z`
}

/** Normaliza o que veio do SQLite para o formato de fio. */
export function toIsoUtc(valor: string): string {
  const bruto = (valor ?? '').trim()
  if (bruto === '') {
    throw new RangeError(
      'data vazia — o D1 devolveu uma coluna de data em branco',
    )
  }
  // O `T` fecha a lacuna do CURRENT_TIMESTAMP; o `Z` fecha a de fuso ausente
  // (o SQLite grava UTC, mas sem dizer).
  const comT = bruto.includes('T') ? bruto : bruto.replace(' ', 'T')
  const comZone = /[Zz]$|[+-]\d{2}:?\d{2}$/.test(comT) ? comT : `${comT}Z`
  const d = new Date(comZone)
  if (Number.isNaN(d.getTime())) {
    throw new RangeError(
      `data inválida vinda do banco: ${JSON.stringify(valor)}`,
    )
  }
  return nowIsoUtc(d)
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `pnpm --filter @piluvitu/ramielle exec vitest run src/lib/dates.test.ts`

- [ ] **Step 6: `wire.ts` — o teste é o vetor dourado**

Escreva `wire.test.ts` importando o fixture do Step 1 e afirmando **igualdade estrutural exata** (`toEqual`, nunca `toMatchObject`) entre a saída de `sessionToWire`/`movieToWire` e cada entrada do vetor. Monte a linha de entrada como ela sai do D1 (snake_case, timestamp no formato do SQLite).

Acrescente uma asserção que é a que pega o instinto errado:

```ts
it('as chaves são PascalCase, exatamente como a Go emite', () => {
  // ⚠️ NÃO "padronizar" para snake_case. As structs do Go (sessions.go:11-21,
  // movies.go:9-19) não têm tag `json:`, então o encoding/json usa o nome do
  // campo — e apps/web/lib/votacao/types.ts JÁ declara VotingSession.ID,
  // .Title, .CreatedBy em PascalCase. O resto da API é snake_case porque
  // aqueles handlers montam map[string]any com chaves explícitas. A mistura
  // é o contrato. Trocar quebra a tela EM SILÊNCIO: res.json() é `any`.
  const chaves = Object.keys(sessionToWire(linha))
  expect(chaves).toEqual([
    'ID',
    'Title',
    'Status',
    'CreatedBy',
    'CreatedAt',
    'ClosedAt',
    'WinnerMovieID',
    'WinnerMethod',
    'SortOptionsJSON',
  ])
})
```

⚠️ **`toEqual` sobre `Object.keys` também fixa a ORDEM** das chaves. Isso é de propósito: `JSON.stringify` respeita ordem de inserção, e um diff byte a byte contra o Go só fecha se a ordem bater.

- [ ] **Step 7: Implementar `wire.ts`**

Tipos `WireSession`/`WireMovie` espelhando `apps/web/lib/votacao/types.ts` (leia o arquivo — ele é o contrato do consumidor), e as duas funções convertendo a linha do D1. Regras:

- `ClosedAt`, `WinnerMovieID`, `WinnerMethod`, `TMDbID`, `SheetNumber` são `null` quando ausentes — **nunca `undefined`** (`undefined` some do JSON; o Go emite `null`).
- `WasWatched` é **boolean** no fio, e `INTEGER 0|1` no banco.
- `CreatedAt`/`ClosedAt` passam por `toIsoUtc`.
- `PosterURL` é `string` (nunca `null`) — o Go declara `PosterURL string`, e uma coluna `NULL` vira `""`.

- [ ] **Step 8: Rodar, verificar por mutação, commitar**

Mutação obrigatória: troque uma chave de `sessionToWire` para snake_case (ex.: `ID` → `id`). O teste do vetor dourado **e** o de chaves têm que falhar. Reverta e confirme `/usr/bin/git status --porcelain` vazio.

```bash
/usr/bin/git commit -m "feat(ramielle): camada de fio com paridade PascalCase provada contra o Go"
```

---

### Task 2: Domínio de leitura + `GET /votacao/sessions` e `GET /votacao/sessions/{id}`

**Files:**

- Create: `src/domain/sessions.ts`, `sessions.test.ts`
- Create: `src/routes/votacao.ts`, `votacao.test.ts`
- Modify: `src/index.ts` (montar acima do catch-all)

**Interfaces:** `getVotingSession(db, id)`, `listVotingSessions(db, {limit, offset})`, `getSessionMovies(db, sessionId)`.

- [ ] **Step 1: Domínio — teste primeiro**

Semeie o D1 direto (`INSERT`) e cubra: sessão inexistente devolve `null` (não lança); listagem respeita `limit`/`offset` e ordena por **`id DESC`**; filmes vêm ordenados de forma estável.

⚠️ **CORREÇÃO (2026-07-29): o rascunho deste plano dizia `created_at DESC`, citando o índice `idx_voting_sessions_created`. Errado nas duas pontas** — MEDIDO em `apps/api/internal/votacao/sessions.go:52`: o Go ordena por `id DESC` e **não usa** aquele índice (a PK já é ordenada). E a divergência não é cosmética: a fatia ④ importa o histórico do SQLite da Go escrevendo `created_at` explícito, e aí os dois critérios dão listas diferentes. O teste de ordem precisa de um caso onde `created_at` esteja em ordem INVERSA ao `id` — senão os dois critérios são indistinguíveis e o teste não prova nada.

⚠️ **O Store do Go também CLAMPA, além do `atoiOr` do handler** (`sessions.go:45-50`): `limit <= 0 || limit > 100` vira 20, e `offset < 0` vira 0. Então `?limit=500` devolve **20**. Sem o teto, um `?limit=100000` vira scan grande no D1, onde "rows read" conta linha escaneada. As guardas moram no domínio, como no Go — não na rota.

⚠️ **`ListVotingSessions` do Go usa `limit`/`offset` com defaults 20/0** (`sessions.go:154-156`, via `atoiOr`). Query malformada (`?limit=abc`) cai no default, **não** dá 400 — paridade.

- [ ] **Step 2: Implementar o domínio**

Sem `SELECT *`: liste as colunas. Todo `SELECT` de listagem leva `LIMIT` — no D1 "rows read" conta linha **escaneada**, e listagem sem teto queima cota.

- [ ] **Step 3: As duas rotas**

```
GET /votacao/sessions        → requireAuth  → 200 {sessions: WireSession[]}
GET /votacao/sessions/{id}   → requireAuth  → 200 {session, movies, has_voted, voted_movie_ids}
```

- `id` não numérico ou `<= 0` ⇒ **400 `invalid_id`** (o Go faz `ParseInt` e recusa `id <= 0` em `parseID`).
  ⚠️ **`GetSession` do Go NÃO checa `id <= 0`** — ele só faz `ParseInt` (`sessions.go:167-172`). Um `id=0` cai no `session_not_found` (404), não em `invalid_id`. **Mantenha essa diferença** — é o comportamento observável.
- sessão inexistente ⇒ **404 `session_not_found`**.
- `has_voted` é `voted_movie_ids.length > 0`; `voted_movie_ids` é `[]` quando não votou (**nunca `null`**).

- [ ] **Step 4: Testes de rota**

Cubra os dois caminhos felizes, o 400, o 404, e — o que fecha a paridade — que o corpo de `session`/`movies` bate com o vetor dourado da Task 1. Cubra também 401 sem cookie (o guard já existe; prove que está aplicado nestas rotas).

- [ ] **Step 5: Rodar, mutar (troque `DESC` por `ASC` na listagem; o teste de ordem tem que falhar), commitar**

---

### Task 3: `POST /votacao/sessions/{id}/votes` — voto de aprovação

O voto **substitui** o conjunto inteiro do usuário na sessão. Editável até fechar. Conjunto vazio limpa os votos.

**Files:** `src/domain/votes.ts` (+teste), `src/routes/votacao.ts` (modificar), teste de rota.

- [ ] **Step 1: `replaceUserVotes` — teste primeiro**

Regras, todas do Go (`votes.go:26-67` + `internal/votacao/votes.go`):

- Apaga os votos do usuário naquela sessão e insere os novos, **atomicamente** — no D1 isso é `db.batch()`, que faz rollback real da sequência inteira.
- Um `movie_id` que não pertence à sessão ⇒ erro `movie_not_in_session` (**valide antes**, com um `SELECT id FROM session_movies WHERE session_id = ?`, e não deixe a FK estourar: a mensagem do D1 não é acionável).
- Array vazio ⇒ apaga tudo e não insere nada; devolve `[]`.
- Ids repetidos no corpo ⇒ o `UNIQUE (session_id, user_id, movie_id)` barraria; **deduplique antes** para não transformar um corpo tolerável num 500.

⚠️ **Teto de 100 bound params por statement.** O `INSERT` multi-row de `votes` tem 3 colunas bound (`session_id`, `user_id`, `movie_id`) ⇒ **33 linhas por statement**. Uma sessão tem no máximo uma dezena de filmes, então na prática nunca chunka — mas escreva o chunking mesmo assim e teste-o com um lote acima do teto, porque o custo de descobrir isso em produção é uma sessão de votação perdida.

- [ ] **Step 2: A rota**

Ordem das checagens **importa** e é a do Go:

1. `id` inválido ⇒ 400 `invalid_id`
2. sessão inexistente ⇒ 404 `session_not_found`
3. sessão `closed` ⇒ **409 `session_closed`**
4. corpo não-JSON ⇒ 400 `invalid_json`
5. filme fora da sessão ⇒ **400 `movie_not_in_session`**

⚠️ **A checagem de sessão fechada vem ANTES de ler o corpo** — o Go carrega a sessão, checa `Status == "closed"`, e só então decodifica. Um teste com corpo inválido numa sessão fechada tem que devolver **409**, não 400. É observável, e é o tipo de coisa que uma reimplementação "limpa" inverte.

Resposta: `200 {voted_movie_ids: number[]}` **com notificação de sucesso** — o Go usa `httpx.DataMsg(..., httpx.Success("Voto registrado."))`.

⚠️ **`lib/envelope.ts` só tem `okJson`/`errJson` de uma notificação.** Acrescente o que faltar (ex.: um segundo parâmetro de notificações em `okJson`, ou `okJsonMsg`) — **e note que o `apps/web` descarta `notifications` no caminho feliz** (`call<T>()` devolve `data`), então isso é paridade de contrato, não de comportamento de tela.

- [ ] **Step 3: Testes, mutação (inverta a ordem 3↔4 e prove que o teste de "corpo inválido em sessão fechada ⇒ 409" falha), commit**

---

### Task 4: Apuração — `GET /results` e `POST /close`

**Files:** `src/domain/tally.ts` (+teste, puro), `src/domain/votes.ts` (estender), rotas.

- [ ] **Step 1: `tally.ts` — porte de `internal/votacao/results.go`**

```ts
export function tallyVotes(votes: { movieId: number }[]): Map<number, number>
export function computeTopMovies(votes: { movieId: number }[]): {
  ids: number[]
  max: number
}
```

`computeTopMovies` devolve os ids que **empatam no topo**, ordenados asc, e a contagem. `ids.length >= 2` é empate; `=== 1` é vencedor claro; vazio quando não há voto.

- [ ] **Step 2: `GET /results`**

`200 {results: [{movie_id, count}], total_votes, total_voters}` — **snake_case aqui** (o handler monta o map com chaves explícitas).

⚠️ **A ordenação é `count` DESC, depois `movie_id` ASC** (`votes.go:144-150`). Reproduza exatamente: um empate de contagem desempata pelo menor `movie_id`. Teste com um caso que só passa se as duas chaves estiverem certas (dois filmes com a mesma contagem e ids fora de ordem).

`total_votes` é o **número de linhas** em `votes` (não de eleitores); `total_voters` é `COUNT(DISTINCT user_id)`. São números diferentes de propósito — o voto de aprovação deixa uma pessoa votar em vários filmes.

- [ ] **Step 3: `POST /close` (admin)**

Grava `closed_at`; o vencedor sai do tally **só quando há topo único**. **Empate deixa `winner_movie_id` nulo** — o desempate é a roleta da Task 5, não um critério determinístico.

Quando há vencedor, grava também `winner_method = 'votes'`.

- sessão que não está aberta ⇒ **404 `session_not_open`** (não 409 — é o código que o Go usa).
- Resposta: `200 {winner_movie_id: number | null}`.

⚠️ **NÃO dispare backup** — ver o recorte no topo deste plano.

- [ ] **Step 4: Testes, mutação (faça `close` escolher o menor id no empate em vez de deixar `null`; o teste de empate tem que falhar), commit**

---

### Task 5: `POST /tiebreak` — o desempate provably-fair, bit a bit

A parte mais delicada da fatia: o resultado precisa ser **auditável**, o que significa que a mesma entrada tem que produzir o mesmo vencedor no Go e no ramielle.

**Files:** `src/domain/tiebreak.ts` (+teste), rota, e um segundo vetor dourado.

- [ ] **Step 1: Gerar o vetor dourado do desempate a partir do Go**

Estenda o programa Go descartável da Task 1 para imprimir, para entradas fixas:

- `hex(TiebreakSeed(clientEntropy, serverNonce, sessionID, tiedIDs))`
- `PickTiebreakIndex(seed, n)` para vários `n` (2, 3, 5, 8 — inclua uma potência de 2, que é onde o cálculo do limite pode dar errado)

Entradas fixas sugeridas: `clientEntropy = bytes de "00112233445566778899aabbccddeeff"`, `serverNonce = bytes de "ffeeddccbbaa99887766554433221100"`, `sessionID = 7`, `tiedIDs = [42, 7, 19]` (**fora de ordem de propósito** — o seed ordena internamente).

Grave em `__fixtures__/go-parity.json` sob `tiebreak`. ⚠️ **Se o `go run` não puder rodar, PARE e reporte BLOCKED** — um vetor escrito à mão não prova paridade.

- [ ] **Step 2: `tiebreak.ts` — teste primeiro, contra o vetor**

O teste afirma que `tiebreakSeed(...)` em hex é **exatamente** a string do vetor, e que `pickTiebreakIndex` devolve os mesmos índices.

- [ ] **Step 3: Implementar**

Porte de `internal/votacao/tiebreak.go`:

- `tiebreakSeed`: SHA-256 sobre `clientEntropy || serverNonce || uint64BE(sessionID) || uint64BE(id)...` com os **ids ordenados asc** antes de escrever. Use `crypto.subtle.digest('SHA-256', ...)` (assíncrono no Worker).
- `pickTiebreakIndex`: rejection sampling em janelas de **32 bits big-endian**; `limit = floor(2^32 / n) * n`. ⚠️ **O Go mantém `limit` em `uint64` de propósito**, porque para `n` potência de 2 ele vale exatamente `2^32` e um `uint32` daria 0. Em TS use `Number` (é seguro até 2^53) e **não** operadores bitwise de 32 bits, que truncariam. Quando os bytes acabam, re-hash e continua.

- [ ] **Step 4: A rota (admin)**

Ordem das checagens, do Go (`votes.go:172-233`):

1. `id` inválido ⇒ 400 `invalid_id`
2. corpo não-JSON ⇒ 400 `invalid_json`
3. `entropy` não-hex **ou com menos de 16 bytes** ⇒ 400 `invalid_entropy`
4. sessão inexistente ⇒ 404 `session_not_found`
5. sessão **não** fechada ⇒ 409 `session_not_closed`
6. menos de 2 empatados ⇒ **422 `no_tie`**
7. já tem vencedor ⇒ 409 `winner_already_set`

Grava a linha de auditoria em `tiebreaks` (`tied_ids_json`, `client_entropy`, `server_nonce`, `winner_movie_id`, `triggered_by`) **e** o vencedor com `winner_method='roulette'`.

Resposta: `200 {winner_movie_id, tied_movie_ids, server_nonce}` + notificação de sucesso.

⚠️ **`server_nonce` sai em hex e é o que torna o sorteio auditável** — sem ele, ninguém consegue recomputar. Não o omita "por segurança": ele é público por design.

- [ ] **Step 5: Testes**

Além dos 7 códigos: um teste que semeia empate, chama a rota **com entropia fixa**, e afirma que o vencedor é o que o vetor dourado prevê. E um que confirma que a linha de auditoria foi gravada com o nonce que a resposta devolveu (senão a auditoria não fecha).

- [ ] **Step 6: Mutação (remova o `sort` dos ids dentro do seed; o teste do vetor tem que falhar, porque `tiedIDs` está fora de ordem de propósito), commit**

---

### Task 6: `GET /sessions/{id}/votes` (admin), montagem e documentação

**Files:** `src/domain/votes.ts` (estender), `src/routes/votacao.ts`, `src/index.ts`, `apps/ramielle/CLAUDE.md`.

- [ ] **Step 1: `listSessionVotesWithUsers`**

`JOIN votes ⋈ users ⋈ session_movies`, devolvendo `user_id`, `user_name`, `user_email`, `movie_id`, `movie_title`, `category`, `created_at` — **snake_case**, e `created_at` por `toIsoUtc`.

⚠️ **Esta rota quebra o anonimato do voto — é admin-only, e é o único lugar da API que liga pessoa a voto.** O guard `requireAdmin` não é detalhe de implementação aqui; é a única coisa entre o e-mail de quem votou e qualquer pessoa logada. Escreva o teste de 403 com conta não-admin **antes** do caminho feliz.

Resposta: `200 {votes: [...], total: number}`.

- [ ] **Step 2: Montagem**

Todas as 7 rotas montadas em `src/index.ts` **acima** do catch-all. Prove por execução (um teste que monta o app real e confirma que uma rota de votação responde, não cai no 404 genérico), não por leitura.

- [ ] **Step 3: `apps/ramielle/CLAUDE.md`**

Acrescente (sem repetir o que já está lá):

- **A mistura de convenções é o contrato**: PascalCase em `VotingSession`/`SessionMovie` (structs Go sem tag `json:`), snake_case no resto. Com o ponteiro para o vetor dourado.
- **O formato de `CreatedAt`**: o `CURRENT_TIMESTAMP` do SQLite grava com espaço e o Safari rejeita; por isso `toIsoUtc` na saída.
- **Voto de aprovação**: substitui o conjunto, editável até fechar, `total_votes` ≠ `total_voters`.
- **Empate não é resolvido no `close`** — fica `null` até a roleta.
- **O desempate é auditável** e o `server_nonce` é público por design.
- **`GET /sessions/{id}/votes` quebra o anonimato** e é admin-only.
- As duas rotas que ficaram para a fatia ③ e por quê.
- A contagem de testes atualizada.

- [ ] **Step 4: Verificação final**

```bash
pnpm --filter @piluvitu/ramielle run lint
pnpm --filter @piluvitu/ramielle run test
/usr/bin/git status --porcelain
```

Confirme que as suítes dos outros workspaces **não mudaram de número** — esta fatia não toca nada fora de `apps/ramielle`.

---

## Estado ao fim desta fatia

**Funciona:** as 7 rotas de votação que só dependem do D1, com o JSON provado idêntico ao da Go por vetor dourado gerado pelo próprio Go.

**Não muda:** nada em produção. O `apps/web` continua na Go.

**Próximo:** fatia ③ — Sheets, TMDb, o sorteio, `POST /sessions`, `GET /categorias`, e o admin (`/users`, `/backups`).
