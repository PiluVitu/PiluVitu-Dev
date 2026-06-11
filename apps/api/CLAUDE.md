# CLAUDE.md — `apps/api` (Go API)

Guidance for the **Go API** (`github.com/PiluVitu/api`). O Claude Code carrega este arquivo **junto** com o `CLAUDE.md` da raiz — aqui ficam só os detalhes da API; orquestração/monorepo/CI estão na raiz. O **frontend** que consome esta API está em `apps/web/CLAUDE.md`.

## Tech Stack (API)

- **Go 1.23**, módulo `github.com/PiluVitu/api`
- **chi v5** — HTTP router
- **SQLite** via `modernc.org/sqlite` (puro Go, sem CGo)
- **cobra** — CLI (`piluvitu <tool> <subcommand>`)
- **Cloudflare Tunnel** — exposição pública atual (ver "Hosting da API"); destino futuro **Google Cloud Run** (`deploy-api.yml` pronto na raiz)

## Commands (API)

Canônicos (`make dev-api`, `make build-api`, `make build-cli`) na raiz. Específicos:

- **Tests:** `make test-go` ou `cd apps/api && go test ./...`
- **Build:** `make build-api` → `bin/api`; `make build-cli` → `bin/piluvitu`

### Go hot reload (air)

`make dev-api` roda a Go API via [air](https://github.com/air-verse/air) (config em `apps/api/.air.toml`), que recompila a cada `.go` salvo e — diferente do `go run` — é dono do ciclo de vida do binário: manda SIGINT + kill no processo a cada rebuild e na saída, liberando a `:8081` limpinha no Ctrl+C. air roda via `go run github.com/air-verse/air@latest` (sem instalar nada global, fora do `go.mod` da API). O binário compilado e o SQLite de dev ficam em `apps/api/tmp/` (gitignored); por isso `clean_on_exit = false` (não apagar o `votacao.db`). Editar o `.env` ainda exige restart (ele é carregado no launch). Hot reload é só dev nativo no host — em Docker a API roda o binário do `Dockerfile`. Se uma porta ficar presa após um crash, `make stop` mata o que estiver escutando em 8081/3333 (macOS/BSD-safe).

## Go API overview

- **Module:** `github.com/PiluVitu/api`, Go 1.23
- **HTTP router:** chi v5 — 13 endpoints under `/tools` + `/health` (DB-aware)
- **Router DI:** `router.New(router.Deps{DB: store.DB()})` — `Deps` injeta o `*sql.DB` usado pelo health check; testes podem passar `Deps{}` para subir sem DB.
- **CORS:** `github.com/go-chi/cors` middleware. Origins permitidos lidos de `CORS_ALLOWED_ORIGINS` (csv) ou caem no default (`http://localhost:3333,https://piluvitu.com.br`). Defaults definidos em `internal/router/router.go`.
- **Persistência:** SQLite via `modernc.org/sqlite` (puro Go, sem CGo). Volume Docker `api-data` montado em `/data`. Path configurável via env `SQLITE_PATH` (default `/data/votacao.db`). Schema aplicado idempotentemente em `votacao.NewStore`.
- **CLI:** cobra — `piluvitu <tool> <subcommand>` (e.g., `piluvitu cpf validate "123"`)
- **Layer rules:** `internal/tools/` is pure Go (no HTTP, no cobra); `internal/handlers/` delegates to it; `internal/votacao/` é o pacote de domínio (Store + entidades); `cmd/` only parses args
- **Response envelope (`internal/httpx`):** TODA rota JSON responde no formato único `{ "ok": bool, "data": <payload>|null, "notifications": [{type,code,message,field?}] }`. Mensagens (erros, avisos, confirmações) vivem SEMPRE em `notifications` — nunca solte um body cru. Helpers: `httpx.Data(w, status, payload)` (sucesso), `httpx.DataMsg(w, status, payload, notes...)` (sucesso + toast), `httpx.Error(w, status, code, msg)` (1 erro), `httpx.Errors(w, status, notes...)` (validação multi-campo). `notifications` serializa como `[]` (nunca `null`). `code` é snake_case estável (`already_voted`, `not_authenticated`, `admin_only`, `session_not_found`, `no_candidates`, `sheets_disabled`, `invalid_json`, `internal_error`, …); `message` é pt-BR voltada ao usuário. Login/Callback (`/auth/google/*`) continuam sendo REDIRECTS no caminho feliz; só os erros deles usam o envelope. `GET /health` é a única exceção (mantém `{"ok":true,"db":"up"}` pros health checks de infra). Respostas que antes eram 204 (logout, voto, backup) agora são 200/201 com envelope.
- **Logging estruturado (`internal/logging`):** a API usa `log/slog` — `cmd/api/main.go` chama `initLogger()` no startup, que escolhe `JSONHandler` em prod e `TextHandler` em dev (mesmo sinal do cookie: `SESSION_COOKIE_SECURE=true` ⇒ prod). O router adiciona `middleware.RequestID` + `logging.Middleware(slog.Default())`, que anexa um logger por request (enriquecido com `request_id`, e `user_id` quando disponível) ao `r.Context()`. `logging.FromContext(ctx)` recupera esse logger (nunca panica — cai em `slog.Default()` se o middleware não rodou). Erros logam no ponto da falha (ex.: ramos `internal_error` em `votes.go`) com `err` + ids + `code`. O evento `tiebreak_draw` é logado e também persistido na tabela `tiebreaks`.
- **Tests:** colocated `*_test.go` files, run with `make test-go` or `cd apps/api && go test ./...`. Testes de handler decodam o envelope: ver `internal/handlers/votacao/envelope_test.go` (`unwrap(t, rec, &target)`) e `internal/httpx/respond_test.go`.
- **Build:** `make build-api` → `bin/api`, `make build-cli` → `bin/piluvitu`

## Votação de Filmes — backend

> A **UI** (Next.js: páginas, hooks TanStack Query, componentes) está em `apps/web/CLAUDE.md`. Aqui é só o backend Go.

- **Status:** entregue (Fase 8 concluída: Storybook + E2E mocada).
- **Design:** `docs/plans/2026-05-19-votacao-filmes-design.md`
- **Plano Fase 1:** `docs/plans/2026-05-19-votacao-fase1-plan.md`
- **Persistência:** SQLite (`modernc.org/sqlite`, puro Go, sem CGo) em `/data/votacao.db` dentro do container Go API, volume Docker `api-data`.
- **Schema embutido:** `apps/api/internal/votacao/schema.sql` aplicado idempotentemente no startup via `//go:embed` (CREATE TABLE IF NOT EXISTS).
- **Store por entidade:** `users.go`, `sessions.go`, `movies.go`, `votes.go`, `backups.go`, `tiebreaks.go` — todos no pacote `internal/votacao`. Testes colocated (`*_test.go`), `helper_test.go` com `newTestStore()`.
- **Tabelas:** `users` (Google OAuth + admin allowlist), `voting_sessions` (open/closed + `winner_movie_id` + `winner_method`), `session_movies` (categoria UNIQUE por sessão), `votes` (UNIQUE por `(session_id,user_id,movie_id)` — voto de aprovação), `backups` (Drive metadata), `tiebreaks` (auditoria provably-fair do desempate na roleta).
- **Migration idempotente no startup:** `votacao.NewStore` aplica `schema.sql` e chama `migrate()`, que faz rebuild idempotente do `votes` (UNIQUE antigo `(session_id,user_id)` → novo `(session_id,user_id,movie_id)`) e add-column de `winner_method`. Não é rodada pelo agente; roda sozinha no deploy. Em dev, pra começar limpo: `rm apps/api/tmp/votacao.db`.
- **Health check:** `GET /health` retorna `{"ok":true,"db":"up"|"down"}` baseado em `db.PingContext` (timeout 2s); fallback `{"ok":true}` quando `Deps.DB` é `nil` (usado em testes).
- **Próximas fases:** auth Google OAuth (Fase 2), Sheets reader + sorteio (Fase 3), TMDb + sessions handlers (Fase 4), votes + close + results (Fase 5), Drive backup + cron (Fase 6), Next.js UI (Fase 7), polimento (Fase 8).

### Auth Google (`internal/auth`)

- **Fluxo:** `GET /auth/google/login` gera state CSRF (cookie HttpOnly Lax, 10 min) e redireciona pro Google. `GET /auth/google/callback` valida state, troca code, valida ID token via `google.golang.org/api/idtoken`, dá upsert no `users` aplicando `ADMIN_EMAILS` (case-insensitive), grava `user_id` na sessão scs, redireciona pra `WEB_REDIRECT_URL`. `GET /auth/me` retorna o user logado (JSON) ou 401. `POST /auth/logout` destrói a sessão (204).
- **Sessões:** `alexedwards/scs/v2` com `sqlite3store`. A tabela `sessions(token TEXT PRIMARY KEY, data BLOB NOT NULL, expiry REAL NOT NULL)` + índice em `expiry` é criada idempotentemente por `auth.NewSessionManager` (o pacote `sqlite3store` só faz SELECT/REPLACE/DELETE, não cria a tabela). Cookie `piluvitu_session`, HttpOnly, SameSite=Lax, lifetime 7 dias. `SESSION_COOKIE_SECURE=true` em produção (Cloud Run/Tunnel).
- **Middleware:** `auth.RequireAuth(sm, store)` e `auth.RequireAdmin(sm, store)` — anexam `*votacao.User` em `r.Context()` (`auth.UserFromContext`). Não-logado → 401. Não-admin → 403.
- **Testabilidade:** `TokenExchanger` + `IDTokenVerifier` são interfaces. Em produção: `auth.NewGoogleTokenExchanger(cfg)` (wrapper sobre `*oauth2.Config` por causa do variadic `AuthCodeURL`) e `auth.NewGoogleIDTokenVerifier()`. Em testes: `stubExchanger`/`stubVerifier` em `internal/auth/helper_test.go`.
- **CORS:** `AllowCredentials: true` (necessário pro cookie de sessão atravessar fetch do Next.js). Origens explícitas via `CORS_ALLOWED_ORIGINS`, sem `*`.

### Sheets reader + sorteio (`internal/gsheets`, `internal/votacao/sortear.go`)

- **gsheets.Client:** wrapper sobre `google.golang.org/api/sheets/v4`. Constructor de prod (`NewClient`) usa Application Default Credentials (Service Account JSON via `GOOGLE_APPLICATION_CREDENTIALS`). Constructor de teste (`NewClientWithService`) recebe um `*sheets.Service` já configurado — usado nos testes apontando pra um `httptest.Server` com fixtures JSON (`option.WithEndpoint(srv.URL) + option.WithoutAuthentication()`).
- **ReadMovies:** lê o range `GSHEETS_MOVIES_RANGE` da planilha `GSHEETS_MOVIES_SPREADSHEET_ID` e retorna `[]votacao.SheetMovie`. Linhas sem título ou categoria são puladas. Categoria é normalizada pra lowercase + trim. Tipo aceita "filme"/"série" (case-insensitive); default `filme`. Watched aceita "sim/yes/true/1" case-insensitive.
- **GetCategories:** retorna lista deduplicada e ordenada de categorias presentes na planilha — usado pelo modal "Nova votação" no front (Fase 7).
- **SortOnePerCategory (`internal/votacao/sortear.go`):** função pura. Filtra por `Types` / `IncludeWatched` / `Categories`, agrupa por categoria, sorteia 1 por grupo. Categorias iteradas em ordem alfabética → saída estável. Determinístico com `*rand.Rand` injetado. Retorna `ErrNoCandidates` se nenhum sobrevive aos filtros. 9 testes em `sortear_test.go` cobrem happy path, todos os filtros, sem candidatos, determinismo e ordenação.
- **Direção de dependência:** `SheetMovie` mora em `internal/votacao/` (domínio); `gsheets` importa `votacao` pra retornar o tipo. One-way dep.
- **Secret mount:** `infra/secrets/google-sa.json` é montado em `/secrets:ro` dentro do container (bind path `./secrets` no compose). Compose não falha se o arquivo não existir; quem usa gsheets em runtime é que vai dar erro. Em `main.go`, o cliente só é construído se `GSHEETS_MOVIES_SPREADSHEET_ID` estiver setado, e falhas de construção apenas logam — não abortam o startup.

### TMDb + handlers de sessions (`internal/tmdb`, `internal/handlers/votacao`)

- **tmdb.Client (`SearchPoster`):** GET TMDb v3 `/search/movie` ou `/search/tv` (média serie → tv). Fail-soft: 404 ou results vazio → `("", 0, nil)`. Apenas 5xx, 4xx (≠404) ou erro de parse propaga. Pôster final = `https://image.tmdb.org/t/p/w500` + `poster_path`.
- **handlers/votacao.Handlers (mounted em `/votacao/*`):**
  - `GetCategorias` (GET, RequireAuth) — `SheetsReader.GetCategories`. 503 se sheets desligado, 502 se Sheets falha.
  - `CreateSession` (POST, RequireAdmin) — lê Sheets → `votacao.SortOnePerCategory` → `fetchPosters` paralelo (errgroup limit=5, timeout 3s/each) → grava session + session_movies. 422 se nenhum filme bate filtros. 400 se title vazio ou JSON inválido. 502 se sheets falha. Aplica `auth.UserFromContext` pro `created_by`.
  - `ListSessions` (GET, RequireAuth) — paginação via `?limit` (default 20) e `?offset` (default 0).
  - `GetSession` (GET, RequireAuth) — retorna `{session, movies, has_voted, voted_movie_ids}`. 404 se não existir.
- **Sub-interfaces:** `SheetsReader` (`GetCategories`, `ReadMovies`) e `PosterSearcher` (`SearchPoster`) ficam no pacote `handlers/votacao`. Desacoplam testes dos pacotes concretos `gsheets`/`tmdb`. Stubs em `*_test.go`.
- **auth.WithUserForTests:** helper exportado em `internal/auth/middleware.go` que outros pacotes usam pra plantar um `*votacao.User` no ctx do request nos testes (mesma chave que `RequireAuth` usa).
- **Wiring opcional:** `gsheets.Client` e `tmdb.Client` só são construídos no `main.go` se `GSHEETS_MOVIES_SPREADSHEET_ID` e `TMDB_API_KEY` estiverem setados, respectivamente. Sem eles os handlers respondem 503 (categorias) ou criam sessões sem pôsteres (CreateSession).
- **Voto de aprovação (`POST /votacao/sessions/{id}/votes`, RequireAuth):** body `{"movie_ids": [<int>...]}`. **Substitui** o conjunto inteiro de votos do usuário na sessão (editável até fechar) — não é mais um voto único. Store: `ReplaceUserVotes` (delete + reinsert na mesma tx), `GetUserVotes`, `CountVoters`. `votes` é `UNIQUE(session_id,user_id,movie_id)`. Retorna `{"voted_movie_ids":[...]}`.
- **Fechar (`POST /votacao/sessions/{id}/close`, RequireAdmin):** grava `closed_at`; o vencedor sai do tally só quando há topo único — **empate deixa `winner_movie_id` nulo** (sem desempate determinístico; `ComputeWinner` foi removido). 404 se sessão já estava fechada. Retorna `{"winner_movie_id": id|null}`. O desempate de empates vira a roleta (abaixo).
- **Resultados (`GET /votacao/sessions/{id}/results`, RequireAuth):** retorna `{"results":[{movie_id,count},...], "total_votes":N, "total_voters":M}` ordenado por count desc + movie_id asc. `total_voters` = nº de usuários distintos que votaram (≠ `total_votes`, pois aprovação permite vários votos por usuário).
- **GetSession inclui `has_voted` e `voted_movie_ids`** quando o caller está autenticado. `voted_movie_ids` (array) vem de `Store.GetUserVotes(session, user)` e diz QUAIS filmes o usuário aprovou — o front usa pra pré-selecionar e destacar os cards escolhidos.
- **Quem votou em quê (`GET /votacao/sessions/{id}/votes`, RequireAdmin):** retorna `{"votes":[{user_id,user_name,user_email,movie_id,movie_title,category,created_at}], "total":N}`. Vem de `Store.ListSessionVotesWithUsers` (JOIN votes⋈users⋈session_movies). Quebra o anonimato — admin-only. Mesma rota tem POST (votar, RequireAuth) e GET (este, RequireAdmin).
- **Desempate na roleta (`POST /votacao/sessions/{id}/tiebreak`, RequireAdmin):** substitui o runoff (removido — `/runoff`, `CreateRunoff`, `ComputeTopMovies` saíram). A sessão precisa estar `closed` e com empate no topo. Body `{"entropy":"<hex>"}` (digest derivado de uma foto da câmera processada no browser — só o hash trafega). O server mistura essa entropia com `crypto/rand`, escolhe um índice **sem viés** entre os empatados via `votacao.PickTiebreakIndex` (rejection sampling), grava o vencedor com `winner_method='roulette'` e insere uma linha em `tiebreaks` (`tied_ids_json`, `client_entropy`, `server_nonce`, `winner_movie_id`) pra auditoria provably-fair. Loga/persiste o evento `tiebreak_draw`. Retorna `{"winner_movie_id":id, "tied_movie_ids":[...], "server_nonce":"..."}`.

### Backup + Cron (`internal/gdrive`, `internal/backup`, `internal/handlers/admin`)

- **gdrive.Client:** wrapper sobre `google.golang.org/api/drive/v3`. `Upload` (multipart, scope drive.file) + `Rotate` (lista por createdTime desc, deleta os antigos além do `keep`). Test seam: `NewClientWithService` aceita um `*drive.Service` apontado pra `httptest.Server`.
- **backup.Runner:** `Run(ctx, trigger)` faz `VACUUM INTO` num arquivo temp, sobe via `gdrive.Uploader`, insere row em `backups` (com `trigger_type` "cron"/"manual"/"session_close"), chama Rotate. Falhas propagam.
- **backup.Start:** registra `func(ctx)` no `robfig/cron/v3` com o spec dado. Tarefa roda em goroutine separada do scheduler; runs longos não bloqueiam ticks.
- **handlers/admin:** `POST /admin/backup` (RequireAdmin) dispara `Runner.Run(ctx, "manual")` síncrono. `GET /admin/backups` (RequireAdmin) retorna últimos 50 do `backups` table. `GET /admin/users` (RequireAdmin) lista todos os usuários (`Store.ListUsers`, shape controlado: id/name/email/picture/is_admin/created_at, sem `google_sub`).
- **session_close trigger:** `CloseSession` (em `handlers/votacao/votes.go`), após fechar com sucesso, dispara `Runner.Run` async via goroutine com timeout de 30s. Falha do backup é logada, não bloqueia a resposta.
- **Wiring opcional:** `runner` só é construído no `main.go` se `GDRIVE_BACKUP_FOLDER_ID` setado. Sem isso, /admin/backup responde 503 e o cron não inicia.

## Colocation rules

A lei de colocation está na raiz (`CLAUDE.md`). No Go: teste colocated `*_test.go` ao lado do fonte (handler `tools.go` → `tools_test.go`; lib pura `cpf.go` → `cpf_test.go`).

## Environment variables (API)

**Fonte única para a API:** `apps/api/.env` (ignorado pelo git, valores de **DEV**). Carregado em dois caminhos:

- `make dev-api` — o target carrega o `.env` via `set -a; . ./.env; set +a` antes do air. Roda em dev (localhost:8081, cookie sem Secure).
- `docker compose` (em `infra/`) — `env_file: ../apps/api/.env` injeta as vars no container, **mas o bloco `environment:` do service `api` sobrescreve com os valores de PROD** (`GOOGLE_OAUTH_REDIRECT_URL=https://promeia.piluvitu.com.br/...`, `WEB_REDIRECT_URL=https://piluvitu.com.br/votacao`, `SESSION_COOKIE_SECURE=true`, `CORS_ALLOWED_ORIGINS=https://piluvitu.com.br`, + paths internos `/data` e `/secrets`). Assim `make dev` fica dev e `make tunnel-up`/`compose-up` (container) sai em prod, sem togglar o `.env`.

**Domínios de prod:** web `https://piluvitu.com.br` (Vercel) + API `https://promeia.piluvitu.com.br` (Cloudflare Tunnel). São o **mesmo domínio registrável** (`piluvitu.com.br`) → web↔API são same-site → o cookie de sessão `SameSite=Lax` é enviado nos `fetch(credentials:'include')` sem precisar de `SameSite=None`. (DNS do `piluvitu.com.br` migrado da Vercel pra Cloudflare; site segue hospedado na Vercel.)

Na Vercel cadastrar `NEXT_PUBLIC_API_URL=https://promeia.piluvitu.com.br`. No Google Console registrar `https://promeia.piluvitu.com.br/auth/google/callback`.

See `apps/api/.env.example`. Key variables:

- `SQLITE_PATH` — caminho do arquivo SQLite usado pela feature `votacao` (default `/data/votacao.db` dentro do container Go API)
- `CORS_ALLOWED_ORIGINS` — origins permitidos pela Go API (csv); default `http://localhost:3333,https://piluvitu.com.br`
- `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URL` — OAuth Client ID type "Web application" do Google Cloud Console. Redirect URL precisa estar registrada no console e bater 1:1 com a env.
- `WEB_REDIRECT_URL` — pra onde o browser vai depois do callback bem-sucedido (default `http://localhost:3333/votacao`).
- `ADMIN_EMAILS` — CSV de e-mails admin. Comparação case-insensitive contra o e-mail do ID token.
- `SESSION_COOKIE_SECURE` — `true` em produção (HTTPS), `false` em dev local (HTTP).
- `GOOGLE_APPLICATION_CREDENTIALS` — caminho do JSON da Service Account dentro do container (default `/secrets/google-sa.json`).
- `GSHEETS_MOVIES_SPREADSHEET_ID` — ID da planilha (extraído da URL do Sheets). Sem isso o gsheets fica desligado.
- `GSHEETS_MOVIES_RANGE` — A1 notation. Default `A2:F` (pula header).
- `TMDB_API_KEY` — chave do TMDb (https://themoviedb.org/settings/api). Vazio → pôsteres desabilitados.
- `GDRIVE_BACKUP_FOLDER_ID` — ID da pasta Drive onde os snapshots vão. Vazio → backup desabilitado.
- `GDRIVE_BACKUP_KEEP` — quantos backups mais recentes manter (default 30).
- `BACKUP_CRON` — cron spec 5-fields (default `0 3 * * *` — 03:00 local).

> O front consome a API via `NEXT_PUBLIC_API_URL` — env do **web** (ver `apps/web/CLAUDE.md`).

### LLM local + Distribuição (`internal/llm`, `internal/distribution`)

**Objetivo:** corrigir/refinar texto via Ollama local e republicar artigos em plataformas externas, com estado persistido em SQLite.

#### Endpoints (todos `RequireAdmin`)

| Método | Rota                                 | O que faz                                                                                    |
| ------ | ------------------------------------ | -------------------------------------------------------------------------------------------- |
| `POST` | `/admin/llm/proofread`               | Corrige typos/gramática do texto (preserva Markdown/MDX)                                     |
| `POST` | `/admin/llm/refine`                  | Refina uma chamada de rede social conforme instrução                                         |
| `POST` | `/admin/distribution/proposals`      | Gera propostas de distribuição (corpo do artigo + hooks sociais via LLM), persiste em SQLite |
| `GET`  | `/admin/distribution/{slug}`         | Lista o estado atual dos alvos de distribuição de um post                                    |
| `POST` | `/admin/distribution/{slug}/publish` | Posta nos adapters selecionados (idempotente — pula alvos já `posted`)                       |

**Fail-soft:** ausência de env desliga a feature (503 no endpoint, sem abortar o boot). `distH` fica `nil` quando nenhum adapter está configurado; o router não registra as rotas nesse caso.

**Proofread por blocos:** `Proofread` divide o markdown (`internal/llm/chunk.go` `splitBlocks` — remontagem byte-a-byte) e envia ao Ollama **só a prosa** (parágrafos/títulos/listas), corrigindo bloco a bloco; código cercado (```), tabelas, HTML/JSX, citações (`>`) e imagens passam **verbatim**. Evita o timeout de 120s em artigos longos e impede a LLM de alterar o que não é texto. `keep_alive=5m` no request mantém o modelo carregado entre os blocos.

#### Envs — LLM (Ollama)

- `OLLAMA_BASE_URL` — URL do Ollama (ex.: `http://localhost:11434`). Vazio ⇒ endpoints `/admin/llm/*` respondem 503.
- `OLLAMA_MODEL_PROOFREAD` — modelo de revisão (default `qwen2.5:7b-instruct`).
- `OLLAMA_MODEL_HOOKS` — modelo de geração de chamadas (default `qwen2.5:14b-instruct`).

> Ollama roda **nativo no Mac** (não Docker) para usar a GPU/Metal. Em Docker no macOS ele cai pra CPU.

#### Envs — Distribuição (todos opcionais; ausência desliga o adapter)

- `DEVTO_API_KEY` — dev.to API key (`article_crosspost` + canonical URL).
- `HASHNODE_API_TOKEN` + `HASHNODE_PUBLICATION_ID` — Hashnode GraphQL (`publishPost`).
- `BLUESKY_HANDLE` + `BLUESKY_APP_PASSWORD` — AT Protocol (`social_hook`, limite 300 chars).
- `MASTODON_INSTANCE_URL` + `MASTODON_ACCESS_TOKEN` — POST `/api/v1/statuses` (`social_hook`, limite 500 chars).

#### Tabela SQLite `distribution_targets`

Schema embutido em `internal/distribution/schema.sql` via `//go:embed`, aplicado **idempotentemente no boot** por `distribution.NewStore` (`CREATE TABLE IF NOT EXISTS`). Não há comando de migration manual — roda sozinho. Colunas principais: `slug`, `platform`, `kind` (`article_crosspost` | `social_hook`), `content`, `status` (`pending` | `posted` | `failed` | `skipped`), `remote_url`, `error`, `posted_at`. Chave única `(slug, platform)`.

#### Adapters MVP

| Adapter  | Kind                | Protocolo                                      |
| -------- | ------------------- | ---------------------------------------------- |
| dev.to   | `article_crosspost` | REST `POST /api/articles` + header `api-key`   |
| Hashnode | `article_crosspost` | GraphQL `publishPost` + header `Authorization` |
| Bluesky  | `social_hook`       | AT Protocol (`createSession` → `createRecord`) |
| Mastodon | `social_hook`       | REST `POST /api/v1/statuses` (Bearer)          |

Adapters futuros (X/Threads/LinkedIn/Instagram) implementam a interface `Publisher` (`Platform() string`, `Kind() Kind`, `Publish(ctx, Payload) (remoteURL, error)`) — nenhuma mudança no `Service` ou `main.go`.

## Hosting da API (Cloudflare Tunnel)

Enquanto o GCP não estiver provisionado, a Go API é exposta publicamente via Cloudflare Tunnel rodando como container ao lado da API.

### Setup inicial (uma vez só)

1. **Crie o tunnel na Cloudflare** — `dash.cloudflare.com` → Zero Trust → Networks → Tunnels → **Create a tunnel** → tipo `Cloudflared` → escolha um nome (ex.: `piluvitu-api`).
2. **Copie o token** que aparece na tela ("Install and run a connector") — é a string longa após `--token`.
3. **Adicione um Public Hostname** no mesmo tunnel:
   - Subdomain: `api`
   - Domain: (escolha seu domínio Cloudflare)
   - Service Type: `HTTP`
   - URL: `api:8080` (nome do serviço no Docker Compose, não `localhost`)
4. **Salve o token localmente**:
   ```bash
   cp infra/.env.example infra/.env
   # edite infra/.env e cole o token em CLOUDFLARE_TUNNEL_TOKEN
   ```

### Operação diária

| Comando            | Faz o quê                                              |
| ------------------ | ------------------------------------------------------ |
| `make tunnel-up`   | Sobe api + web + cloudflared (build + detached)        |
| `make tunnel-down` | Derruba tudo                                           |
| `make tunnel-logs` | Tail do log do cloudflared (útil pra debug de conexão) |
| `make compose-up`  | Sobe só api + web (sem expor publicamente)             |

Depois de `make tunnel-up`, a API responde em `https://api.SEUDOMINIO.com`. Esse valor vai em `NEXT_PUBLIC_API_URL` na Vercel.

### Limitações conhecidas

- A API só fica online enquanto seu Mac/PC estiver com o Docker rodando.
- URL **persiste** entre restarts (é o mesmo subdomínio Cloudflare), então não precisa atualizar a Vercel a cada `docker compose down/up`.
- Quando migrar pra Cloud Run, basta cadastrar as variáveis GCP no GitHub (o workflow `deploy-api.yml` já está pronto) e mudar `NEXT_PUBLIC_API_URL` na Vercel pra URL do Cloud Run.
