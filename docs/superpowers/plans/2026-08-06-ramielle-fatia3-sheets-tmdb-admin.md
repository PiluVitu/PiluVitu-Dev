# ramielle — fatia ③ : Sheets, TMDb, sorteio e admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar a superfície de rotas do `apps/ramielle` — as **2 rotas de votação que dependem de serviço externo** (Google Sheets, TMDb) e as **3 do admin** — para que a fatia ④ possa fazer o cutover e desligar a Go.

**Architecture:** Cliente do Sheets autenticado por **JWT RS256 assinado com `crypto.subtle`** (não há disco nem ADC num Worker), sorteio como função pura, TMDb fail-soft. As rotas do admin são CRUD sobre o D1, exceto o backup, que **não tem análogo** e é decisão de produto.

**Tech Stack:** TypeScript, Hono, D1, WebCrypto (`RSASSA-PKCS1-v1_5`/SHA-256), Vitest com `@cloudflare/vitest-pool-workers`.

---

## Onde esta fatia se encaixa

`docs/superpowers/specs/2026-07-28-ramielle-promeia-design.md` §8/§9.4. A ① pôs o Worker de pé (D1, schema, login Google, guards, CORS); a ② portou as 7 rotas de votação que só dependem do D1 (**247 testes**). Esta é a ③.

**Ao fim desta fatia, nada em produção muda.** O `apps/web` continua na Go. O cutover é a ④.

### O recorte: as 5 rotas que faltam

| Rota                      | Guard | Depende de                           |
| ------------------------- | ----- | ------------------------------------ |
| `GET /votacao/categorias` | auth  | Google Sheets                        |
| `POST /votacao/sessions`  | admin | Sheets + sorteio + TMDb              |
| `GET /admin/users`        | admin | só D1                                |
| `GET /admin/backups`      | admin | só D1                                |
| `POST /admin/backup`      | admin | **não tem análogo — ver §Decisão 3** |

⚠️ **As rotas `/admin/llm/*` e `/admin/distribution/*` da Go NÃO entram aqui.** Elas são do fluxo de artigo, e o spec (§7.2) manda a inferência ir para o **promeia** e o estado para o ramielle — trabalho de uma fatia própria, depois do cutover.

⚠️ **A allowlist do admin (spec §7) JÁ ESTÁ FEITA** desde a fatia ①: `isAdminEmail` + `ADMIN_EMAILS`, recalculado a cada request. Não reimplementar.

---

## Contexto MEDIDO (2026-08-06) — spike rodado antes de planejar

A revisão final da fatia ② mandou medir antes de planejar, não durante. Foi feito, contra a service account e a planilha reais.

### ✅ Incógnita 1 — o WebCrypto dá conta do JWT RS256: **SIM**

`crypto.subtle.importKey('pkcs8', <chave da service account>, {name:'RSASSA-PKCS1-v1_5', hash:'SHA-256'})` importa a chave sem erro, e `crypto.subtle.sign` produz assinatura de **256 bytes**. JWT de 3 partes montado. **Nenhuma biblioteca é necessária** — nem `jose`, nem `googleapis`.

### ✅ Incógnita 2 — a cadeia completa funciona, e é rápida o bastante

| Passo                                                                              | Resultado                                                     |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `POST` no `token_uri` com `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer` | **200**, `token_type: Bearer`, `expires_in: 3599`, **503 ms** |
| `GET` em `sheets.googleapis.com/v4/spreadsheets/{id}/values/{range}`               | **200**, **965 ms**                                           |

### ✅ Incógnita 3 — o fan-out do TMDb é pequeno: **no máximo 11**

Era o risco de o desenho "sorteia e enriquece tudo numa requisição" não sobreviver ao porte. **Não é.** Medido na planilha real:

| Medida                                                         | Valor    |
| -------------------------------------------------------------- | -------- |
| Linhas cruas no range `A2:F`                                   | **1001** |
| Linhas **usáveis** (≥5 colunas, título e categoria não vazios) | **256**  |
| Linhas descartadas                                             | **745**  |
| **Categorias distintas**                                       | **11**   |
| Linhas não assistidas                                          | 206      |
| Categorias entre as não assistidas                             | **11**   |
| Larguras de linha observadas                                   | 5 e 6    |

As categorias são: `animação`, `aventura`, `ação`, `comédia`, `crime / investigação`, `documentário`, `drama`, `ficção científica`, `romance`, `suspense`, `terror`.

**Consequência:** `POST /sessions` sorteia **1 filme por categoria** ⇒ no máximo **11** buscas no TMDb. O orçamento estimado da requisição inteira é ~500 ms (token) + ~965 ms (sheets) + ~300 ms (TMDb em paralelo) ≈ **2 s** — folgado para um Worker. **O desenho da Go sobrevive ao porte; não reprojete para job assíncrono.**

⚠️ **745 de 1001 linhas são descartadas — isso é NORMAL, não defeito.** O `parseRow` do Go (`gsheets/movies.go:52`) exige `len(row) >= 5` e título/categoria não vazios; a planilha tem muita linha curta ou incompleta. Um porte que "consertasse" isso mudaria o conjunto sorteável em produção.

⚠️ **O mapeamento de colunas é `A=Nº, B=Título, C=Filme/Série, D=Gênero, E=Assistido?, F=Nota`.** A **categoria é a coluna D (índice 3)**, não a B. Um porte que lesse o índice 1 como categoria produziria 255 "categorias" que na verdade são títulos de filme — foi exatamente o erro do primeiro spike, e ele passa despercebido porque o resultado _parece_ uma lista plausível.

---

## As três decisões que este plano toma

**1. A credencial vira um secret, não um arquivo.** A Go lê `infra/secrets/google-sa.json` do disco via `GOOGLE_APPLICATION_CREDENTIALS`. Num Worker não há disco. O JSON inteiro entra como **um secret** (`GOOGLE_SA_JSON`), lido e parseado em runtime.

**2. O access token é cacheado por isolate, com margem.** Ele vale 3599 s e custa ~500 ms. Cachear num módulo (mesmo padrão de memoização do `getAuth`) evita pagar isso a cada request. ⚠️ **O cache é POR ISOLATE**, como o `storage: 'memory'` do rate limit já documentado — não é global, e não deve ser tratado como tal. Renove com **5 minutos de margem** antes do `exp`.

**3. `POST /admin/backup` NÃO é portado — devolve `503 backup_disabled`.** A Go faz `VACUUM INTO` + upload pro Drive; **o D1 não tem `VACUUM INTO`**, e o backup do D1 neste monorepo já é outro mecanismo (`scripts/backup-d1.sh`, export lógico + rotação, rodado por `launchd`). Portar seria inventar um terceiro caminho.

⚠️ **`backup_disabled` (503) é o código que a PRÓPRIA Go usa** quando o `Runner` não está configurado (`handlers/admin/backup.go:12`) — então o `apps/web` já sabe tratá-lo. Não é um código novo, é o caminho degradado que já existe. `GET /admin/backups` **é** portado (lê a tabela `backups`, que continua existindo e guarda o histórico importado na ④).

---

## Global Constraints

- **O shape do JSON é contrato com o `apps/web`.** PascalCase em `VotingSession`/`SessionMovie` (use `sessionToWire`/`movieToWire` de `src/lib/wire.ts`), snake_case no resto. A mistura é o contrato.
- **As MENSAGENS de erro também são contrato** — a fatia ② descobriu isso do jeito difícil: `apps/web` usa `primary.message` num `toast.error`. Copie a string do `httpx.Error` correspondente **exatamente**, maiúscula e ponto final inclusos.
- **`httpx.Success` do Go não emite `code`** (`json:"code,omitempty"`). Notificação de sucesso é `{type:'success', message:'...'}`, sem `code`.
- **Códigos de erro desta fatia** (os dois primeiros são novos, e vêm da Go): `sheets_disabled` (503), `no_candidates` (422), `invalid_json` (400), `backup_disabled` (503), `internal_error` (500), mais os já existentes.
- **Colocation:** teste no mesmo diretório do fonte.
- **Teto de 100 bound params por statement** no D1.
- **Nunca vazar `D1_ERROR`/`SQLITE_*` cru** — e, novo nesta fatia: **nunca logar nem devolver a chave privada, o access token, ou o JWT**.
- **Relógio injetado** (`now?: Date`), nunca mockado globalmente — o cache de token depende disso para ser testável.
- **Teste que não pode falhar é o defeito mais recorrente deste projeto.** Verifique por mutação.
- ⚠️ **O `git` do shell é interceptado por um wrapper (`rtk`) com saída FALSA** — use `/usr/bin/git`; para pnpm, formas com `--filter`.

---

### Task 1: Autenticação Google — JWT RS256 e o access token

A peça que a fatia ② previu como a mais dura. O spike já provou que funciona; esta task a torna código testado.

**Files:** `src/lib/google-auth.ts` (+teste)

**Interfaces produzidas:**

- `type ServiceAccount = { client_email: string; private_key: string; token_uri: string }`
- `parseServiceAccount(json: string): ServiceAccount` — lança `Error` acionável se faltar campo
- `assinarJwt(sa, scope, now?): Promise<string>`
- `getAccessToken(sa, scope, deps?): Promise<string>` — com cache por isolate

- [ ] **Step 1: Teste primeiro — o que dá para testar sem rede**

```ts
describe('parseServiceAccount', () => {
  it('recusa JSON inválido com mensagem acionável', () => {
    expect(() => parseServiceAccount('{')).toThrow(/GOOGLE_SA_JSON/)
  })
  it('recusa JSON válido sem os campos obrigatórios', () => {
    expect(() => parseServiceAccount('{"client_email":"a@b.c"}')).toThrow(
      /private_key/,
    )
  })
  it('aceita e devolve os três campos', () => {
    /* ... */
  })
})

describe('assinarJwt', () => {
  it('produz um JWT de 3 partes com header RS256 e as claims certas', async () => {
    // Chave de TESTE gerada no próprio teste com crypto.subtle.generateKey +
    // exportKey('pkcs8') — NUNCA a chave real. O teste prova o formato e as
    // claims, não a identidade.
    const jwt = await assinarJwt(
      saDeTeste,
      'escopo/teste',
      new Date('2026-08-06T12:00:00Z'),
    )
    const [h, c] = jwt.split('.')
    expect(jwt.split('.')).toHaveLength(3)
    expect(JSON.parse(atob(h.replace(/-/g, '+').replace(/_/g, '/')))).toEqual({
      alg: 'RS256',
      typ: 'JWT',
    })
    const claims = JSON.parse(atob(c.replace(/-/g, '+').replace(/_/g, '/')))
    expect(claims.iss).toBe(saDeTeste.client_email)
    expect(claims.aud).toBe(saDeTeste.token_uri)
    expect(claims.scope).toBe('escopo/teste')
    // exp = iat + 3600, e iat sai do relógio INJETADO
    expect(claims.iat).toBe(
      Math.floor(Date.parse('2026-08-06T12:00:00Z') / 1000),
    )
    expect(claims.exp).toBe(claims.iat + 3600)
  })
})
```

⚠️ **Gere a chave de teste dentro do próprio teste** (`crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5', modulusLength:2048, publicExponent:new Uint8Array([1,0,1]), hash:'SHA-256'}, true, ['sign','verify'])` + `exportKey('pkcs8')` + envelope PEM). **Nunca** commite chave real, nem de teste com aparência de real.

⚠️ **Um teste que verifica a assinatura de verdade vale muito mais que um que só conta as partes**: exporte também a chave pública e use `crypto.subtle.verify` para confirmar que a assinatura fecha sobre `header.claims`. Sem isso, uma implementação que assinasse a string errada passaria.

- [ ] **Step 2: Rodar e confirmar que falha; Step 3: implementar**

`assinarJwt` monta `base64url(header) + '.' + base64url(claims)`, assina com `RSASSA-PKCS1-v1_5`, e concatena `base64url(assinatura)`.

⚠️ **`base64url` não é `btoa`** — troque `+`→`-`, `/`→`_`, e remova o `=` de padding. Um JWT com padding é rejeitado pelo Google.

⚠️ **A chave PEM tem `\n` literais quando vem de um JSON** — o `JSON.parse` já os converte; não faça `.replace(/\\n/g,'\n')` em cima disso (dupla conversão), e não confie que veio limpo: remova todo whitespace do miolo antes do `atob`.

- [ ] **Step 4: `getAccessToken` com cache por isolate**

```ts
// Cache POR ISOLATE, não global — mesma natureza do `storage: 'memory'` do
// rate limit já documentado no CLAUDE.md. Sob carga a Cloudflare pode subir
// mais de um isolate, e cada um paga seu próprio token. Isso é aceitável
// (um token por isolate por hora), mas não trate como cache global.
```

Chave do cache: `client_email + '\n' + scope`. Renove com **5 min de margem** antes do `exp` — o relógio é **injetado**, e é isso que torna a expiração testável sem esperar uma hora.

Teste: primeira chamada faz `fetch`; segunda, dentro da validade, **não** faz (espie o `fetch`); avançando o relógio para dentro da margem, faz de novo.

⚠️ **O token endpoint pode falhar.** `400`/`401` com `{"error":"invalid_grant"}` é o caso real de relógio fora de sincronia ou chave revogada — traduza para uma mensagem acionável, **sem** ecoar o corpo cru (ele pode conter detalhe da credencial).

- [ ] **Step 5: Verificar por mutação**

Faça `base64url` deixar o `=` de padding. O teste de `crypto.subtle.verify` continua passando (a assinatura é sobre a mesma entrada), mas **acrescente um teste que afirma que nenhuma das 3 partes contém `=`, `+` ou `/`** — e prove que ele falha com a mutação. Sem esse teste, o defeito só apareceria contra o Google real.

- [ ] **Step 6: Commit**

---

### Task 2: Cliente do Sheets e `GET /votacao/categorias`

**Files:** `src/lib/gsheets.ts` (+teste), `src/routes/votacao.ts` (modificar), teste de rota

**Interfaces:** `type SheetMovie = {number, title, type: 'filme'|'serie', category, watched}`; `parseRow(row: unknown[]): SheetMovie | null`; `readMovies(cfg, deps?): Promise<SheetMovie[]>`; `getCategories(cfg, deps?): Promise<string[]>`

- [ ] **Step 1: `parseRow` — teste primeiro, e é aqui que a fatia acerta ou erra**

Porte de `gsheets/movies.go:52-69`. As regras, todas medidas:

- **`len(row) < 5` ⇒ descarta.** (Larguras observadas na planilha real: 5 e 6.)
- **Coluna B (índice 1) é o TÍTULO; coluna D (índice 3) é a CATEGORIA.** ⚠️ Trocar as duas produz uma lista de "categorias" que parece plausível — 255 títulos de filme — e passa despercebido.
- Título vazio (após `trim`) ⇒ descarta. Categoria vazia ⇒ descarta.
- **Categoria vai para minúscula** (`toLowerCase` + `trim`).
- `number` = `parseInt` da coluna A, **tolerante** — o Go ignora o erro (`number, _ := strconv.Atoi`), então lixo vira `0`, não descarte.
- `type`: `'serie'` quando o cru (minúsculo, trimado) é `serie` **ou `série`** (com acento — a planilha real usa a forma acentuada); qualquer outra coisa vira `'filme'`.
- `watched`: `true` para `sim`, `yes`, `true`, `1` (case-insensitive); qualquer outra coisa, `false`.

Teste com uma linha real da planilha: `["1","(500) Dias com Ela","Filme","Romance","FALSE"]` ⇒ `{number:1, title:'(500) Dias com Ela', type:'filme', category:'romance', watched:false}`.

⚠️ **Escreva um teste que fixa o descarte em massa**: uma lista com 4 linhas, sendo 1 curta (`len<5`), 1 sem título, 1 sem categoria e 1 boa ⇒ `readMovies` devolve **1**. É o que impede alguém de "consertar" a tolerância e mudar o conjunto sorteável em produção.

- [ ] **Step 2: `getCategories`**

Deduplica as categorias das linhas usáveis e ordena. ⚠️ **A ordenação do Go é `slices.Sort` sobre `string`, que é ordem de BYTE (UTF-8), não `localeCompare`.** Com acento isso importa: `ação` e `animação` ordenam diferente nos dois critérios. Use comparação de código de unidade (o `sort()` default do JS sobre strings), **não** `localeCompare`. Teste com as categorias reais medidas, incluindo as acentuadas.

- [ ] **Step 3: A rota `GET /votacao/categorias` (auth)**

`200 {categories: string[]}`.

⚠️ **Sheets desligado ⇒ 503 `sheets_disabled`** — na Go, o cliente só é construído se `GSHEETS_MOVIES_SPREADSHEET_ID` estiver setado, e o handler responde 503 quando ele é `nil` (`handlers/votacao/categorias.go`). Aqui: se `GOOGLE_SA_JSON` ou `GSHEETS_MOVIES_SPREADSHEET_ID` faltarem, **503**, não 500. Copie a mensagem da Go.

⚠️ **Falha do Sheets ⇒ 502**, não 500 (o Go usa `StatusBadGateway`). Leia o handler e copie o par código/mensagem.

- [ ] **Step 4: Testes de rota, com `fetch` mockado**

⚠️ **Nunca chame o Google de verdade num teste.** Mocke `globalThis.fetch` interceptando só as URLs esperadas e delegando o resto, restaurando num `finally` — o mesmo padrão que `lib/auth.test.ts` já usa (o `fetchMock` do `cloudflare:test` **não existe** na versão instalada; isso já foi medido).

- [ ] **Step 5: Mutação (troque o índice 3 pelo 1 na categoria — o teste da linha real tem que falhar), commit**

---

### Task 3: O sorteio — função pura

**Files:** `src/domain/sortear.ts` (+teste)

Porte de `apps/api/internal/votacao/sortear.go`. **Leia o arquivo.**

- [ ] **Step 1: Teste primeiro**

`sortOnePerCategory(movies, {types, includeWatched, categories}, rng)`:

- Filtra por `types` (vazio = todos), por `includeWatched` (false = só não assistidos), por `categories` (vazio = todas).
- Agrupa por categoria e sorteia **1 por grupo**.
- ⚠️ **As categorias são iteradas em ordem alfabética** — é o que torna a saída **estável** e o teste determinístico.
- ⚠️ **`rng` é INJETADO.** O Go recebe um `*rand.Rand`; aqui receba uma função `() => number` (mesma forma de `Math.random`). Um teste com `rng` fixo tem que produzir sempre a mesma escolha — sem isso, o teste não pode falhar por causa da lógica de seleção.
- Nenhum candidato sobrevive aos filtros ⇒ erro `no_candidates`.

Os 9 casos do teste do Go (`sortear_test.go`) são o alvo: caminho feliz, cada filtro isolado, sem candidatos, determinismo e ordenação.

- [ ] **Step 2–4: Implementar, rodar, mutar (remova a ordenação alfabética das categorias e prove que o teste de determinismo falha), commit**

---

### Task 4: TMDb e `POST /votacao/sessions`

**Files:** `src/lib/tmdb.ts` (+teste), `src/domain/sessions.ts` (estender), `src/routes/votacao.ts`, testes

- [ ] **Step 1: `searchPoster` — fail-soft é o ponto**

Porte de `internal/tmdb/search.go`. `GET /search/movie` ou `/search/tv` (mídia `serie` ⇒ `tv`).

⚠️ **Fail-soft: `404` ou `results` vazio devolve `('', 0)` — NÃO é erro.** Só `5xx`, `4xx` (≠404) ou parse quebrado propaga. Um porte que trate "não achei pôster" como falha derruba a criação de sessão inteira por causa de um filme obscuro.

Pôster final = `https://image.tmdb.org/t/p/w500` + `poster_path`.

⚠️ **Sem `TMDB_API_KEY` a busca é desligada** — a sessão é criada **sem pôsteres**, não com erro.

- [ ] **Step 2: `insertSessionMovies` com chunking**

⚠️ **Teto de 100 bound params.** `session_movies` tem 8 colunas bound (`session_id`, `category`, `title`, `type`, `poster_url`, `tmdb_id`, `was_watched`, `sheet_number`) ⇒ **12 linhas por statement**. Com 11 categorias medidas nunca chunka na prática — **escreva e teste o chunking mesmo assim**, com um lote acima do teto. O padrão existe em `voteInsertStatements`; siga-o.

Tudo num `db.batch()` (rollback real): a sessão e seus filmes, ou nada.

- [ ] **Step 3: A rota `POST /votacao/sessions` (admin)**

Corpo: `{title, types, include_watched, categories}` (`CreateSessionBody` em `apps/web/lib/votacao/types.ts`).

Ordem das checagens, do Go (`handlers/votacao/sessions.go`) — ⚠️ e lembre: **o guard é middleware e roda antes de tudo**:

1. corpo não-JSON **ou `title` vazio** ⇒ 400 `invalid_json`
2. Sheets desligado ⇒ 503 `sheets_disabled`
3. falha do Sheets ⇒ 502
4. nenhum filme sobrevive aos filtros ⇒ **422 `no_candidates`**

`created_by` sai do usuário do contexto (o `VotacaoUser` que o guard já põe lá).

⚠️ **As buscas do TMDb são em PARALELO com teto de concorrência 5 e timeout de 3 s cada** (o Go usa `errgroup` com `SetLimit(5)`). Medido: no máximo 11 buscas. Use `Promise.allSettled` com um semáforo simples — e **uma busca que falha não derruba a sessão** (fail-soft do Step 1).

Resposta: a sessão criada, **via `sessionToWire`** (PascalCase — contrato).

- [ ] **Step 4: Testes**

Caminho feliz com `fetch` mockado (Sheets + TMDb), os quatro erros, e o chunking. **Um teste que prova que uma falha do TMDb não derruba a criação** — é o coração do fail-soft.

- [ ] **Step 5: Mutação (faça o erro do TMDb propagar; o teste de fail-soft tem que falhar), commit**

---

### Task 5: `GET /admin/users`, `GET /admin/backups`, `POST /admin/backup`

**Files:** `src/domain/admin.ts` (+teste), `src/routes/admin.ts` (+teste), `src/index.ts`

- [ ] **Step 1: `listUsers` e `listBackups`**

`listUsers` devolve **todos** os usuários. Shape controlado: `id`, `name`, `email`, `picture`, `is_admin`, `created_at` — ⚠️ **`google_sub` NUNCA sai** (o Go o omite de propósito, montando um `map[string]any` explícito em `handlers/admin/users.go`). `created_at` por `toIsoUtc`.

`listBackups` devolve os **50** mais recentes da tabela `backups`.

⚠️ **Ordenação, nos DOIS:** `ORDER BY created_at DESC, id DESC`. O desempate por `id DESC` não é decoração — sem ele, linhas criadas no mesmo segundo saem em ordem indefinida. (`internal/votacao/users.go:52`, `internal/votacao/backups.go:56`.)

⚠️ **`ListBackups` do Go trava o limite:** `if limit <= 0 || limit > 200 { limit = 50 }` (`backups.go:51`). O handler passa 50, então na prática é sempre 50 — mas porte o clamp, não só o 50.

⚠️⚠️ **A ARMADILHA DESTA TASK — as duas rotas têm convenções de wire OPOSTAS, e a intuição de "deixar consistente" quebra a produção.** `/admin/users` é `snake_case` porque o handler Go monta um `map[string]any` à mão; `/admin/backups` é **`PascalCase`** porque o handler devolve o `[]Backup` **direto** e o struct `Backup` **não tem nenhuma tag `json`**. O contrato que o `apps/web` já consome (`apps/web/lib/votacao/types.ts:98-105`, renderizado campo a campo em `components/votacao/admin/backups-panel.tsx`):

```ts
export interface Backup {
  ID: number
  DriveFileID: string
  DriveFileName: string
  SizeBytes: number
  TriggerType: 'cron' | 'manual' | 'session_close'
  CreatedAt: string
}
```

Emitir `drive_file_name` em vez de `DriveFileName` **quebra o `/admin/sessoes` em produção** — a tabela renderiza `undefined` em toda linha, sem erro nenhum. Afirme as chaves PascalCase literalmente no teste.

- [ ] **Step 2: As três rotas (todas `requireAdmin`)**

- `GET /admin/users` ⇒ `200 {users: [...]}`
- `GET /admin/backups` ⇒ `200 {backups: [...]}`
- `POST /admin/backup` ⇒ **503 `backup_disabled`**, sempre, com a mensagem da Go. ⚠️ Não é stub preguiçoso: é o caminho degradado que a própria Go tem quando o `Runner` não está configurado, e o `apps/web` já o trata. Comente **por quê** (o D1 não tem `VACUUM INTO`; o backup deste monorepo é `scripts/backup-d1.sh`).

- [ ] **Step 3: Testes**

401 sem cookie e 403 com conta não-admin **para as três**; o shape de `users` sem `google_sub` (asserção **negativa** sobre o JSON serializado); as chaves **PascalCase** de `backups` afirmadas literalmente; o teto de 50 em `backups`; e o 503 fixo do `POST /admin/backup`.

⚠️ **Lição medida na T3 desta fatia:** um teste que injeta valores INDISTINGUÍVEIS não consegue observar ORDEM. Para o `ORDER BY created_at DESC, id DESC`, use linhas com `created_at` IGUAL e `id` diferente — senão o desempate por `id` passa sem ser exercido.

- [ ] **Step 4: Montagem acima do catch-all, provada por execução; mutação (`requireAdmin`→`requireAuth` numa delas; o 403 tem que falhar); commit**

---

### Task 6: Documentação e fechamento da fatia

**Files:** `apps/ramielle/CLAUDE.md`, `wrangler.jsonc`, `.dev.vars.example`, `CLAUDE.md` da raiz

- [ ] **Step 1: Configuração**

Acrescente a `.dev.vars.example` e documente: `GOOGLE_SA_JSON` (**secret**, o JSON inteiro da service account), `GSHEETS_MOVIES_SPREADSHEET_ID`, `GSHEETS_MOVIES_RANGE` (default `A2:F`), `TMDB_API_KEY` (**secret**).

⚠️ **`GOOGLE_SA_JSON` e `TMDB_API_KEY` são SECRETS** (`wrangler secret put`), nunca `vars` do `wrangler.jsonc` — `vars` fica em texto claro no arquivo commitado.

- [ ] **Step 2: `apps/ramielle/CLAUDE.md`**

Sem repetir o que já está lá (fonte única — aponte). Cubra:

- **Os números medidos do spike** (1001 linhas cruas ⇒ 256 usáveis ⇒ **11 categorias**; token 503 ms; sheets 965 ms; fan-out máximo do TMDb = 11), e que foi **isso** que provou que o desenho síncrono da Go sobrevive ao porte.
- **O mapeamento de colunas** (`A=Nº, B=Título, C=Tipo, D=Gênero, E=Assistido`) e ⚠️ que a categoria é a **D**, não a B — com o registro de que ler a B produz 255 "categorias" que parecem plausíveis.
- **745 de 1001 linhas descartadas é normal**, não defeito.
- **A ordenação das categorias é por BYTE**, não `localeCompare` — importa com acento.
- **JWT RS256 com `crypto.subtle`, sem biblioteca**; o cache de token é **por isolate**, com 5 min de margem.
- **`POST /admin/backup` responde 503 `backup_disabled` de propósito** — o D1 não tem `VACUUM INTO`, e o backup é `scripts/backup-d1.sh`. Com o ponteiro para a decisão.
- **Fail-soft do TMDb**: sem pôster não é erro.
- A contagem de testes **atualizada** (conte, não assuma).
- ⚠️ **Pendências do dono**: cadastrar `GOOGLE_SA_JSON` e `TMDB_API_KEY` como secrets; e **conferir que a service account tem acesso de leitura à planilha** (ela já tem — o spike leu 1001 linhas em 2026-08-06).

- [ ] **Step 3: Verificação final**

Os dois gates, e confirme que as suítes dos outros workspaces **não mudaram de número**.

---

## Estado ao fim desta fatia

**Funciona:** as 9 rotas de `/votacao` e as 3 de `/admin` do ramielle, com paridade de shape, código e mensagem contra a Go.

**Não muda:** nada em produção. O `apps/web` continua na Go.

**Próximo:** fatia ④ — o cutover. Repontar o `apps/web`, verificar CORS **em produção**, importar o histórico do SQLite da Go (⚠️ é aqui que `users.google_sub` precisa bater — ver a decisão registrada na fatia ①), e desligar a Go. Só depois disso `promeia.piluvitu.com.br` fica livre para o serviço Python.
