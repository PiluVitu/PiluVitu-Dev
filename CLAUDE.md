# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Tech Stack

- **Next.js 16** (App Router), **React 19**, **TypeScript** strict mode
- **Tailwind CSS 4** + **shadcn/ui** (New York style, CSS variables, slate base)
- **Keystatic 0.5 (reader-only)** — lê o conteúdo YAML em `content/` no build/ISR via `@keystatic/core/reader` (`lib/keystatic-reader.ts` → `lib/site-content.ts`). O **editor** `/keystatic` foi removido no slice ⑤; a edição agora é no `/admin` unificado.
- **TanStack Query 5** — data fetching (dev.to API)
- **Font Awesome 7** (`free-brands-svg-icons`, `free-solid-svg-icons`)
- **Storybook 10** — component documentation and manual UI verification
- **Vercel** — hosting do frontend com ISR
- **Cloudflare Tunnel** — exposição pública atual da Go API rodando localmente via Docker (ver seção "Hosting da API")
- **Google Cloud Run** — destino futuro da Go API; workflow `deploy-api.yml` pronto, fica skipado até `GCP_PROJECT_ID` ser cadastrado em Variables
- **GitHub Actions** — CI (`ci.yml`) bloqueia PR; `deploy-api.yml` aguarda credenciais GCP; `trivy.yml` para scan de segurança

## Dependency security policy

- **pnpm ≥ 11 required.** pnpm 11 blocks lifecycle scripts by default (supply-chain defense).
- **Adding a dependency that needs install scripts:** add it explicitly to `allowBuilds` in `pnpm-workspace.yaml`. Never set `dangerouslyAllowAllBuilds: true`.
- **`minimumReleaseAge: 1440`** (set in `pnpm-workspace.yaml`): pnpm skips versions published less than 24 h ago, giving the community time to detect and report malicious releases.
- Run `pnpm audit` periodically and before releases.

## Commands

Todos os comandos rodam da raiz do monorepo usando **pnpm** ou **make**.

| Comando                                 | Propósito                                |
| --------------------------------------- | ---------------------------------------- |
| `make dev`                              | Dev server web + Go API em paralelo      |
| `make dev-web`                          | Só o Next.js em http://localhost:3333    |
| `make dev-api`                          | Go API com **hot reload** (air)          |
| `make stop`                             | Libera as portas 8081/3333 se travarem   |
| `make build-api`                        | Compila binário Go API em bin/api        |
| `make build-cli`                        | Compila CLI Go em bin/piluvitu           |
| `make test`                             | Todos os testes (pnpm -r test + go test) |
| `make lint`                             | ESLint + go vet                          |
| `pnpm --filter @piluvitu/web dev`       | Dev Next.js direto                       |
| `pnpm --filter @piluvitu/web build`     | Build Next.js                            |
| `pnpm --filter @piluvitu/web storybook` | Storybook em 6017                        |
| `pnpm --filter @piluvitu/web test:e2e`  | Playwright E2E                           |
| `pnpm -r test`                          | Testes de todos os workspaces            |

**Type checking without full build:** `pnpm exec tsc --noEmit` (from `apps/web/`)

**Recommended order before commit/PR:** `pnpm prettier:fix` → `pnpm lint` → `make test` → `pnpm --filter @piluvitu/web build`

### Go hot reload (air)

`make dev-api` roda a Go API via [air](https://github.com/air-verse/air) (config em `apps/api/.air.toml`), que recompila a cada `.go` salvo e — diferente do `go run` — é dono do ciclo de vida do binário: manda SIGINT + kill no processo a cada rebuild e na saída, liberando a `:8081` limpinha no Ctrl+C. air roda via `go run github.com/air-verse/air@latest` (sem instalar nada global, fora do `go.mod` da API). O binário compilado e o SQLite de dev ficam em `apps/api/tmp/` (gitignored); por isso `clean_on_exit = false` (não apagar o `votacao.db`). Editar o `.env` ainda exige restart (ele é carregado no launch). Hot reload é só dev nativo no host — em Docker a API roda o binário do `Dockerfile`. Se uma porta ficar presa após um crash, `make stop` mata o que estiver escutando em 8081/3333 (macOS/BSD-safe).

### Pre-commit hook (lint-staged)

`.husky/pre-commit` roda **`pnpm exec lint-staged`** — formata/linta só os arquivos staged (antes era `prettier --write "**/*"`, que varria o repo inteiro incluindo `.next/`). Configs em dois níveis (lint-staged usa a mais próxima de cada arquivo, com cwd no diretório dela):

- **Root `package.json`** → `*.{js,ts,tsx,json,md,css}: prettier --write` (arquivos da raiz / fora de apps/web). `prettier` + `prettier-plugin-tailwindcss` estão nas devDeps do root pra resolverem onde o hook roda.
- **`apps/web/package.json`** → `*.{ts,tsx}: [eslint --fix, prettier --write]` e demais assets só prettier. Fica em apps/web (não no root) porque o ESLint 9 flat config (`eslint.config.mjs`) e o plugin tailwind precisam resolver com cwd em apps/web.

Os scripts `prettier:fix` / `lint` seguem pra formatação/lint full manual (e CI).

## Architecture

### App Router structure

- `app/(site)/` — main site layout and page sections
- `app/layout.tsx` — root layout with metadata
- `app/[opengraph|twitter]-image.tsx` — dynamic OG images

### Key directories

| Path             | Purpose                                                          |
| ---------------- | ---------------------------------------------------------------- |
| `components/ui/` | shadcn/ui primitives (15 components)                             |
| `components/`    | Page-level components (bio, cards, email form, visit card)       |
| `lib/`           | Server utilities: Keystatic readers, dev.to client, icon mapping |
| `hooks/`         | Client hooks — `useArticleData.ts` (TanStack Query for dev.to)   |
| `mocks/`         | Type definitions and fallback data                               |
| `stories/`       | Storybook stories                                                |
| `content/`       | Keystatic CMS content (YAML)                                     |

### Content structure (Keystatic YAML)

**Singletons:**

- `content/site/profile/` — display name, avatar, role, bio, company
- `content/site/visit-card/` — up to 8 cells for the 3D card (triple-click avatar)

**Collections:**

- `content/socials/*/` — social links with order, icon mode, FA icon or image
- `content/carreiras/*/` — career history entries
- `content/projects/*/` — project showcase entries

### Data flow

1. Server components call readers in `lib/site-content.ts` (`getSiteProfile()`, `getSocials()`, `getCarreiras()`, `getProjects()`, `getVisitCard()`) — these read Keystatic YAML at build/request time.
2. `lib/blog-posts.ts` (`getBlogPosts()`, `getBlogPost()`) fetches MDX posts from the private `PiluVitu/piluvitu-blog` repo at build/ISR time via `@octokit/rest` using `BLOG_REPO_TOKEN`. Posts are cached 30 min (ISR tag `blog-posts`).
3. `lib/article-feed.ts` provides `ArticleCardView` — a unified type for both dev.to and blog posts. `devToToView()` and `blogPostToView()` convert each source. `mergeFeed()` merges and sorts by date.
4. `hooks/useArticleData.ts` fetches dev.to articles client-side via TanStack Query; merged with server-fetched blog posts in `ArticleSection`.
5. The visit card (`components/profile-visit-card.tsx`) opens on triple-click of the avatar, showing a 3D animated card with cells configured in Keystatic.

### Font Awesome no conteúdo

Os ícones disponíveis vivem em `lib/visit-card-fontawesome.ts` (`VISIT_CARD_FA_ICON_MAP`, `VISIT_CARD_FA_SELECT_OPTIONS`). O `keystatic.config.ts` usa `fields.select({ options: VISIT_CARD_FA_SELECT_OPTIONS })` no campo `fontawesomeIcon` (o reader valida contra as opções). A **edição** do ícone é no `/admin/socials` (DS V2, com seu próprio picker `fa-icon-select`). Para adicionar um ícone novo: importe-o no map e adicione uma entrada nas select options. (O antigo campo custom `fontawesomeIconSelectField()` + a página `/keystatic/icon-preview` foram removidos no slice ⑤.)

### Remote images

Permitted image hosts are configured in `next.config.mjs` (`images.remotePatterns`). Adding a new external image host requires updating that list.

### Theme

O tema é o **Design System V2 "Cloud (cyan)"** — dark-first, acento ciano. Os valores vivem em `app/globals.css` (`:root` = variante light derivada, `.dark` = "Cloud" dark) mapeados sobre os tokens shadcn existentes: a cor de marca do V2 (ciano `#38bdf8`) entra como `--primary` (atenção: no shadcn `--accent` é o hover bg, não a marca). **Dark é o padrão** via `next-themes` (`defaultTheme="dark"` em `app/(site)/layout.tsx`); o `mode-toggle` alterna pro light.

- **Fontes:** Plus Jakarta Sans (corpo/títulos, `--font-sans`) + JetBrains Mono (labels/datas/tags, `--font-mono`), via `next/font` no `app/layout.tsx`. O fallback fica aninhado no `var()` (`var(--font-plus-jakarta, ui-sans-serif, …)`) pra sobreviver onde o RootLayout não roda (ex.: Storybook).
- **Tokens semânticos (votação):** `--ok` (sucesso/seu voto), `--warn` (empate/atenção), `--win` (vencedor) expostos como `text-ok`/`bg-warn`/`text-win` etc. `--success`/`--success-foreground` são mantidos como espelho de `--ok` (compat com usos existentes de `text-success`).
- **Marca translúcida:** `--color-accent-soft` / `--color-accent-line` (estáticos sky-400, não derivam de `--primary`) → `bg-accent-soft` / `border-accent-line`.
- **Forma:** `--radius` 18px (cards macios), `--radius-pill` 999px (`rounded-pill`), `--shadow-ds` (`shadow-ds`).
- **Verificação visual:** story `components/design-tokens.stories.tsx` (paleta/tipografia/forma).
- **Spec/plano:** `docs/superpowers/specs/2026-06-02-design-system-v2-foundation-design.md` + `docs/superpowers/plans/2026-06-02-design-system-v2-foundation.md`. Escopo entregue = **fundação** (tokens + fontes); reskin página a página fica pra depois.

### Home V2 (DS V2 reskin)

A home (`/`) foi completamente reskinada para o DS V2. **Layout (`page.tsx`):** scroll da página inteira (sem overflow independente de coluna) — a coluna esquerda do perfil (`col-span-4`) é `xl:sticky xl:top-10 xl:self-start` e fica fixa por todo o scroll (é mais baixa que a viewport), enquanto a direita (`col-span-8`) flui normalmente e é o que "rola". O grid usa `xl:items-start` (necessário pro sticky). O `HomeFooter` fica **fora** do grid, full-width, no fim do scroll (cobre as duas colunas) — não dentro da coluna direita. No mobile (`< xl`) tudo empilha em `flex flex-col`. Novos componentes: `SectionHeader` (título + ação + divider), `HomeFooter` (rodapé inline com mailto), cards V2 (`JobCard` com modal de "Atribuições", `ProjectCard` com subtitle, `ArticleCard` com métricas). Social strip com email icon → mailto. O container raiz usa `2xl:max-w-[1180px]` + glow decorativo ciano fixo no topo (`--color-accent-soft` radial-gradient). Novos campos Keystatic: perfil (`availabilityOpen`/`availabilityLabel`/`location`/`disciplines`), carreira (`current`/`tags`), projeto (`subtitle`). Smoke test E2E em `app/(site)/home.e2e.ts`. Spec: `docs/superpowers/specs/2026-06-02-home-v2-reskin-design.md`.

### Blog (posts)

- **Content repo**: `PiluVitu/piluvitu-blog` (private) — MDX files at `content/posts/*.mdx`
- **Editor**: `/admin/posts` (DS V2 — CodeMirror MDX + faithful preview; slice ③). TinaCMS retired.
- **Reading posts server-side**: `lib/blog-posts.ts` — Octokit reads files from `piluvitu-blog`, parses MDX frontmatter, returns typed `BlogPost[]`
- **Individual post route**: `app/(site)/posts/[slug]/page.tsx` — MDX rendered with `next-mdx-remote/rsc`, code syntax via `rehype-pretty-code`, mermaid via client-side `components/mdx/mermaid-block.tsx`. **Visual (DS V2):** `PageTopBar` ("← Artigos"), hero com `~/blog/{slug}` (mono ciano) + título/excerpt/meta/tags + divider, footer com card do autor + "Voltar aos artigos". O conteúdo MDX usa a classe `.post-prose` (regras em `globals.css`): marcador quadrado ciano antes de `h2`, code-chip inline ciano, blockquote com borda ciano, e label da linguagem no topo-direito dos code blocks.
- **Mermaid in posts**: write fenced code block with lang `mermaid` — renders as interactive SVG diagram client-side
- **Drafts**: set `draft: true` in frontmatter — hidden in production, visible in Next.js draft mode
- **ISR**: posts revalidated every 30 min (tag `blog-posts`). After publishing, wait up to 30 min or trigger on-demand revalidation.

### Key directories (updated)

| Path                        | Purpose                                              |
| --------------------------- | ---------------------------------------------------- |
| `components/mdx/`           | MDX custom components (MermaidBlock, etc.)           |
| `app/(site)/posts/[slug]/`  | Individual blog post route                           |
| `lib/blog-posts.ts`         | Server reader for posts from piluvitu-blog repo      |
| `lib/article-feed.ts`       | Unified ArticleCardView type + devto/blog adapters   |
| `components/kanban/`        | Kanban board: Board, Column, Card, modais, headers   |
| `app/(site)/tasks/`         | Rota `/tasks` — Mini Kanban PWA                      |
| `hooks/use-kanban-store.ts` | Reducer Kanban + persistência localStorage           |
| `lib/kanban-schema.ts`      | Tipos TypeScript + schema Zod + TAG_COLORS           |
| `lib/kanban-export.ts`      | Export (download JSON) + parseImport (validação Zod) |

### Mini Kanban PWA (`/tasks`)

- **Rota:** `app/(site)/tasks/page.tsx` dentro do layout do site
- **Estado:** `useKanbanStore` (`hooks/use-kanban-store.ts`) — `useReducer` + `localStorage` (chave `"kanban-state"`)
- **Drag and drop:** `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`
- **PWA:** `public/manifest.json` + `public/sw.js` + `public/icons/icon.svg`; SW registrado via `useEffect` em `KanbanBoard`
- **Export/Import:** `lib/kanban-export.ts` — download JSON / validação Zod antes de importar
- **E2E:** `e2e/kanban.spec.ts` cobre todos os fluxos críticos (criar coluna, criar card, editar, tags, links, deletar, export/import)

### Votação de Filmes (`/votacao`)

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

#### Auth Google (`internal/auth`)

- **Fluxo:** `GET /auth/google/login` gera state CSRF (cookie HttpOnly Lax, 10 min) e redireciona pro Google. `GET /auth/google/callback` valida state, troca code, valida ID token via `google.golang.org/api/idtoken`, dá upsert no `users` aplicando `ADMIN_EMAILS` (case-insensitive), grava `user_id` na sessão scs, redireciona pra `WEB_REDIRECT_URL`. `GET /auth/me` retorna o user logado (JSON) ou 401. `POST /auth/logout` destrói a sessão (204).
- **Sessões:** `alexedwards/scs/v2` com `sqlite3store`. A tabela `sessions(token TEXT PRIMARY KEY, data BLOB NOT NULL, expiry REAL NOT NULL)` + índice em `expiry` é criada idempotentemente por `auth.NewSessionManager` (o pacote `sqlite3store` só faz SELECT/REPLACE/DELETE, não cria a tabela). Cookie `piluvitu_session`, HttpOnly, SameSite=Lax, lifetime 7 dias. `SESSION_COOKIE_SECURE=true` em produção (Cloud Run/Tunnel).
- **Middleware:** `auth.RequireAuth(sm, store)` e `auth.RequireAdmin(sm, store)` — anexam `*votacao.User` em `r.Context()` (`auth.UserFromContext`). Não-logado → 401. Não-admin → 403.
- **Testabilidade:** `TokenExchanger` + `IDTokenVerifier` são interfaces. Em produção: `auth.NewGoogleTokenExchanger(cfg)` (wrapper sobre `*oauth2.Config` por causa do variadic `AuthCodeURL`) e `auth.NewGoogleIDTokenVerifier()`. Em testes: `stubExchanger`/`stubVerifier` em `internal/auth/helper_test.go`.
- **CORS:** `AllowCredentials: true` (necessário pro cookie de sessão atravessar fetch do Next.js). Origens explícitas via `CORS_ALLOWED_ORIGINS`, sem `*`.

#### Sheets reader + sorteio (`internal/gsheets`, `internal/votacao/sortear.go`)

- **gsheets.Client:** wrapper sobre `google.golang.org/api/sheets/v4`. Constructor de prod (`NewClient`) usa Application Default Credentials (Service Account JSON via `GOOGLE_APPLICATION_CREDENTIALS`). Constructor de teste (`NewClientWithService`) recebe um `*sheets.Service` já configurado — usado nos testes apontando pra um `httptest.Server` com fixtures JSON (`option.WithEndpoint(srv.URL) + option.WithoutAuthentication()`).
- **ReadMovies:** lê o range `GSHEETS_MOVIES_RANGE` da planilha `GSHEETS_MOVIES_SPREADSHEET_ID` e retorna `[]votacao.SheetMovie`. Linhas sem título ou categoria são puladas. Categoria é normalizada pra lowercase + trim. Tipo aceita "filme"/"série" (case-insensitive); default `filme`. Watched aceita "sim/yes/true/1" case-insensitive.
- **GetCategories:** retorna lista deduplicada e ordenada de categorias presentes na planilha — usado pelo modal "Nova votação" no front (Fase 7).
- **SortOnePerCategory (`internal/votacao/sortear.go`):** função pura. Filtra por `Types` / `IncludeWatched` / `Categories`, agrupa por categoria, sorteia 1 por grupo. Categorias iteradas em ordem alfabética → saída estável. Determinístico com `*rand.Rand` injetado. Retorna `ErrNoCandidates` se nenhum sobrevive aos filtros. 9 testes em `sortear_test.go` cobrem happy path, todos os filtros, sem candidatos, determinismo e ordenação.
- **Direção de dependência:** `SheetMovie` mora em `internal/votacao/` (domínio); `gsheets` importa `votacao` pra retornar o tipo. One-way dep.
- **Secret mount:** `infra/secrets/google-sa.json` é montado em `/secrets:ro` dentro do container (bind path `./secrets` no compose). Compose não falha se o arquivo não existir; quem usa gsheets em runtime é que vai dar erro. Em `main.go`, o cliente só é construído se `GSHEETS_MOVIES_SPREADSHEET_ID` estiver setado, e falhas de construção apenas logam — não abortam o startup.

#### TMDb + handlers de sessions (`internal/tmdb`, `internal/handlers/votacao`)

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

#### Backup + Cron (`internal/gdrive`, `internal/backup`, `internal/handlers/admin`)

- **gdrive.Client:** wrapper sobre `google.golang.org/api/drive/v3`. `Upload` (multipart, scope drive.file) + `Rotate` (lista por createdTime desc, deleta os antigos além do `keep`). Test seam: `NewClientWithService` aceita um `*drive.Service` apontado pra `httptest.Server`.
- **backup.Runner:** `Run(ctx, trigger)` faz `VACUUM INTO` num arquivo temp, sobe via `gdrive.Uploader`, insere row em `backups` (com `trigger_type` "cron"/"manual"/"session_close"), chama Rotate. Falhas propagam.
- **backup.Start:** registra `func(ctx)` no `robfig/cron/v3` com o spec dado. Tarefa roda em goroutine separada do scheduler; runs longos não bloqueiam ticks.
- **handlers/admin:** `POST /admin/backup` (RequireAdmin) dispara `Runner.Run(ctx, "manual")` síncrono. `GET /admin/backups` (RequireAdmin) retorna últimos 50 do `backups` table. `GET /admin/users` (RequireAdmin) lista todos os usuários (`Store.ListUsers`, shape controlado: id/name/email/picture/is_admin/created_at, sem `google_sub`).
- **session_close trigger:** `CloseSession` (em `handlers/votacao/votes.go`), após fechar com sucesso, dispara `Runner.Run` async via goroutine com timeout de 30s. Falha do backup é logada, não bloqueia a resposta.
- **Wiring opcional:** `runner` só é construído no `main.go` se `GDRIVE_BACKUP_FOLDER_ID` setado. Sem isso, /admin/backup responde 503 e o cron não inicia.

#### UI Votação (`apps/web/app/(site)/votacao`)

- **Visual (DS V2):** lista e detalhe usam `PageTopBar` (← voltar + "Tema"). `SessionStatusBadge` = pílula "● Aberta" ciano (`bg-primary`) / "Encerrada" outline. `SessionCard` é um card V2 (título + "criada em…" mono + badge). `ResultsList` renderiza cada filme como uma **barra preenchida pelo percentual** (div absoluto com `width:%`), tonalizada por estado via tokens semânticos: `--win` (roxo, vencedor/🎲 desempate), `--ok` (verde, "seu voto"), `--warn` (âmbar, "Empate"), com badges combinando. Callout de empate usa `--warn`. Verificado por E2E (`votacao.e2e.ts`, contexto isolado com mocks).
- **Rotas:** `/votacao` (lista + login state), `/votacao/[id]` (detalhe + votar + resultados quando fechada + botão admin pra encerrar), `/votacao/admin` (painel admin — só admin enxerga).
- **Painel admin (`/votacao/admin`):** dashboard com 4 seções — **Nova sessão** (`CreateSessionForm`), **Sessões** (`components/votacao/sessions-manager.tsx`: lista, encerrar inline, e expandir "Ver votos" pra ver quem votou em quê — lazy via `useAdminSessionVotes`), **Usuários** (`components/votacao/admin/users-table.tsx`) e **Backups** (`components/votacao/admin/backups-panel.tsx`: disparar manual + histórico). Componentes de exibição em `components/votacao/admin/` são puros (recebem dados por prop, têm stories); o wiring (hooks `use-admin-*`) fica na page/SessionsManager. As queries admin são gated por `is_admin` (`enabled`) pra não dispararem pra não-admin.
- **API client:** `apps/web/lib/votacao/api-client.ts` faz fetch com `credentials: 'include'` contra `NEXT_PUBLIC_API_URL` (default `http://localhost:8080`). Para login, o componente `<LoginButton>` faz navegação top-level pro endpoint `/auth/google/login` da API.
- **Envelope + erros no front:** `call<T>()` desembrulha o envelope `{ok,data,notifications}` e retorna `data` direto (por isso os hooks/types continuam consumindo o shape "cru"). Em falha, lança `ApiError` (exporta `status`, `code`, `notifications` e um `.message` pt-BR limpo, tirado da primeira notification de erro). Componentes mostram erro via `toast.error(errorMessage(err))` — `errorMessage()` cobre `ApiError`, `Error` e desconhecidos. Nunca usar `String(err)` (vaza o `Error: 409 Conflict: {...}`).
- **Voto de aprovação (multi-seleção):** `<VoteSection votedMovieIds>` mantém um `Set<number>` (pré-populado com `voted_movie_ids`), cada `<MovieCard>` é um toggle, e o botão `Votar (N)` envia o array inteiro via `useVoteMutation` (`votacaoApi.vote(id, movieIds[])`). Cards aprovados ganham anel `ring-success` + badge "Seu voto". Editável até a sessão fechar; o toast de sucesso é "Voto registrado". Em sessão encerrada, `<ResultsList votedMovieIds>` marca cada linha aprovada com a tag "seu voto". Cores usam o token `--color-success` (exposto em `@theme` no `globals.css`).
- **Vencedor / empate / desempate na roleta (sessão encerrada):** `lib/votacao/results.ts` `analyzeResults(results)` (puro, testado em Jest) deriva `{winnerMovieId, topMovieIds, isTie, topCount}` do tally. `<ResultsList>` mostra o selo **🏆 Vencedor** no único topo, um callout + selos "Empate" nos empatados, e **🎲 Vencedor no desempate** quando `winner_method === 'roulette'`. O runoff foi removido (`RunoffButton`/`useCreateRunoff` saíram). No lugar, `<TiebreakRoulette sessionId movies>` (em `components/votacao/`) só é montado pra admin na sessão fechada (evita fetch de results em sessão aberta); se `analyzeResults` acusa empate, captura entropia da câmera (`<CameraEntropyCapture data-testid="capture-entropy">`), chama `useCreateTiebreak` (`POST /tiebreak`), gira a `<RouletteWheel>` até o vencedor e dá o toast "Vencedor do desempate: …".
- **E2E mocks (`votacao.e2e.ts`):** `page.route()` usa globs host-agnósticos (`**/auth/me`, `**/votacao/sessions`, …) pra casar com qualquer `NEXT_PUBLIC_API_URL`, e os corpos mockados seguem o envelope (`envelope(data, notes)` / `errorEnvelope(code, msg)`). Não hardcodar `localhost:8080` — quebrava quando a porta da API mudava.
- **TanStack Query:** hooks em `apps/web/hooks/votacao/`. Queries para me/list/detail/results; mutations para vote (array de `movie_ids`)/create/close/tiebreak (`use-create-tiebreak.ts`). `onSuccess` invalida queries pra refletir mudança imediata.
- **Componentes:** `apps/web/components/votacao/` (MovieCard, VoteSection, ResultsList, TiebreakRoulette, SessionCard, SessionStatusBadge, CreateSessionForm, LoginButton, LogoutButton).
- **Next/Image:** posters do TMDb (`image.tmdb.org/t/p/w500/...`) — `image.tmdb.org` registrado em `next.config.mjs` `images.remotePatterns`.
- **E2E (`votacao.e2e.ts`):** stories Storybook em cada componente (`apps/web/components/votacao/*.stories.tsx`) e E2E Playwright (mocks host-agnósticos via `page.route('**/...')`, dispensando API real). Cobre listagem, voto único, voto de aprovação multi-seleção (assert no body `{movie_ids:[]}`) e desempate na roleta (força o caminho crypto-only via `page.addInitScript` rejeitando `getUserMedia`, sem câmera no CI).

### Tools dashboard (`/tools`)

- **Visual (DS V2):** landing e páginas de ferramenta usam o DS V2 — `PageTopBar` (← voltar + toggle "Tema"), hero com linha de terminal `$ ~/tools`, `SectionHeader` (label mono + contador + régua) por grupo, e `ToolCard`/`ToolPageShell` com ícone `bg-accent-soft text-primary`. O `PageTopBar` (`components/page-top-bar.tsx`) é compartilhado pelas sub-páginas (tools/posts/votação). O `ModeToggle` é uma pílula "Tema".
- **Rota:** `app/(site)/tools/page.tsx` (landing) + `app/(site)/tools/[slug]/page.tsx` por ferramenta
- **Registro central:** `lib/tools-registry.ts` — array `TOOLS` com `{ slug, title, description, icon, group }`. Adicionar ferramenta = 1 entrada no registry + 1 página + 1 componente.
- **Separação lógica/UI:** `lib/tools/*` contém **TypeScript puro, sem React/Next/DOM**. Funções puras testáveis em Jest e portáveis para CLI futura. `components/tools/*` contém os componentes React que usam as libs.
- **Testes:** Jest cobre `lib/tools/*` (algoritmos CPF/CNPJ, Base64, JWT, JSON, UUID). Rodar com `pnpm test`.
- **E2E:** `e2e/tools.spec.ts` cobre fluxos críticos de cada ferramenta.
- **Ferramentas v1:** QR Reader (câmera, `@zxing/browser`), QR Generator (`qrcode`), CPF, CNPJ, JSON, Base64, JWT decode, UUID v4, **Roleta / Sorteio** (`/tools/roleta` — sorteio com entropia da câmera).
- **Como adicionar uma nova ferramenta:**
  1. Criar `lib/tools/<slug>.ts` com lógica pura + `lib/tools/<slug>.test.ts`
  2. Criar `components/tools/<slug>-tool.tsx` (UI React)
  3. Criar `components/tools/<slug>-tool.stories.tsx`
  4. Adicionar entrada em `lib/tools-registry.ts`
  5. Criar `app/(site)/tools/<slug>/page.tsx`
  6. Adicionar casos no `e2e/tools.spec.ts`

#### Módulo de entropia + roleta

- **Lógica pura (`@piluvitu/tools`, `packages/tools/src`):** `prng` (PRNG determinístico sfc32 + `seedFromBytes`), `entropy` (`toHex`/`fromHex`, `cryptoRandomBytes`, `mixEntropy`/`mixEntropyHex` — digest SHA-256 que **sempre** dobra um sample fresco de CSPRNG, então nunca fica mais fraco que `crypto.getRandomValues` mesmo com fonte de baixa entropia), `roleta` (`normalizeOptions`, `drawWinnerIndex` — sorteio puro determinístico a partir de um digest hex). Exportados via subpaths (`@piluvitu/tools/prng|entropy|roleta`). Testados em Jest/jsdom (`jest.setup.ts` injeta `webcrypto` pra `crypto.subtle`).
- **UI (`apps/web`):** `hooks/use-camera-entropy.ts` captura alguns frames da webcam, hasheia localmente com `crypto.getRandomValues` num digest de 32 bytes e **descarta a imagem** — só o hash sai do hook; sem câmera/permissão cai no fallback crypto-only (ainda seguro). `components/entropy/roulette-wheel.tsx` (roda conic-gradient que pousa no vencedor passado pelo caller) e `components/entropy/camera-entropy-capture.tsx` (UI de consentimento + botão `data-testid="capture-entropy"`). `lib/log.ts` é um logger client leve (nunca recebe imagem crua, só hash/metadata).
- **Tool `/tools/roleta`:** `components/tools/roleta-tool.tsx` (textarea de opções → gira com entropia da câmera ou só com aleatório do browser) + entrada `roleta` em `lib/tools-registry.ts` (ícone `faDharmachakra`). E2E em `tools.e2e.ts` usa o caminho crypto-only (sem câmera no CI).

### Admin unificado (`/admin`)

- **Rota:** `app/(admin)/admin/` — shell DS V2 (sidebar + top bar + dashboard) num route group próprio (`app/(admin)/layout.tsx` provê ThemeProvider dark + ReactQueryProvider + Toaster, sem o layout do site). Slice ① (Fundação) entregue; formulários de conteúdo, editor MDX, mídia e a dobra da votação vêm nos slices ②–⑤. Spec: `docs/superpowers/specs/2026-06-03-admin-unificado-fundacao-design.md`; plano: `docs/superpowers/plans/2026-06-03-admin-unificado-fundacao.md`.
- **Auth (2 camadas):** gate de UI **client-side** via `useCurrentUser()` (`is_admin`, mesma sessão Google da votação — a API Go **não** é tocada). A fronteira real de escrita é o **token GitHub linkado**: o GitHub só deixa commitar quem é colaborador do repo.
- **Conectar GitHub:** reusa a GitHub App do Keystatic. `GET /api/admin/github/login` → authorize (com `state` CSRF) → `GET /callback` troca o code e **sela o token** (`lib/admin/token-cookie.ts`, AES-256-GCM via `crypto` nativo) no cookie httpOnly `piluvitu_admin_gh`. `GET /status` e `POST /unlink` completam o fluxo. Origem dos redirects é validada por allowlist (`lib/admin/github-oauth.ts` `adminOAuthOrigin`) contra Host-header injection. Requer `ADMIN_TOKEN_SECRET` e o Callback URL `…/api/admin/github/callback` registrado na App.
- **Menu de conta (top bar):** o pill do perfil no `AdminTopBar` é um dropdown (`components/admin/account-menu.tsx`, componente puro + story; o wiring com `useCurrentUser`/`useGithubLink` fica no top bar) que mostra identidade (nome/email), o **status da conexão GitHub** (🟢 conectado como @login / 🟠 não conectado) com Conectar (`/api/admin/github/login`) ou Desconectar (`POST /unlink`), e o **Sair** (também na sidebar). É o lar do status do GitHub no dia a dia; estruturado em seções pra acomodar itens futuros. O `GithubLinkBanner` no dashboard agora só aparece quando **desconectado** (CTA de setup inicial).
- **Escrita no git:** `lib/admin/git-write.ts` `commitFile({ repo: 'site' | 'blog', path, content, message })` — Octokit (import dinâmico, pacote ESM-only) com o token linkado; `getContent` p/ sha → `createOrUpdateFileContents`; retry único com refresh em 401 (devolve `refreshed` p/ re-selar o cookie). Commit direto na `main`. Engine pronta na Fundação; os formulários dos próximos slices a consomem.
- **Stats:** `GET /api/admin/stats` (`export const dynamic = 'force-dynamic'`) devolve contagens agregadas (públicas) + `recentPosts`; **títulos/slugs de rascunho só aparecem com o cookie `piluvitu_admin_gh` válido**. Alimenta os stat cards; a contagem de sessões vem da API Go client-side (`hooks/admin/use-sessions-count.ts`).
- **⚠️ Monorepo path prefix (`lib/admin/site-paths.ts`):** o app web vive em `apps/web`, então TODO caminho do **repo do site** que o admin lê/grava via Octokit é relativo à **raiz do repo** e leva o prefixo `apps/web/` — use `sitePath('content/…')` / `sitePath('public/media')` (`SITE_PATH_PREFIX='apps/web'`). O Keystatic reader usa `process.cwd()` (=apps/web) e por isso fica com `content/…` sem prefixo; a engine do admin (Octokit) NÃO — esquecer o prefixo dá **404→502** ao ler. O repo do **blog** (`piluvitu-blog`) é single-package → posts NÃO usam prefixo. (Caminhos do site: registry `dir`, `readProfile`, `MEDIA_DIR`, `mediaRawUrl`, rota do perfil — todos já via `sitePath`/`SITE_PATH_PREFIX`.)
- **Slice ② (CRUD de coleções):** `/admin/projetos` (cards), `/admin/carreira` (tabela), `/admin/socials` (lista + picker FA), `/admin/perfil` (form singleton) — criar/editar (modal)/apagar/drag-reorder. Lê **live do GitHub** (`lib/admin/content-read.ts`: Octokit + `yaml` + Zod, token linkado), escreve via engine (`commitFile`/`deleteFile`/`commitFiles` atômico p/ reorder). Registry `lib/admin/content-registry.ts`; schemas Zod `lib/admin/content-schemas.ts`; serializer `lib/admin/content-yaml.ts` (block-literal `|` p/ multiline); rotas `app/api/admin/content/*` (auth-first, 404-narrowed conflict, slug imutável no edit, `maxDuration=30` + try/catch cobrindo o handler inteiro + `console.error` p/ erro nunca virar 502 opaco); hooks otimistas `hooks/admin/content/*`. **⚠️ Schema de leitura tolerante:** o Keystatic **omite campos opcionais vazios** no YAML (um `image` em branco some do arquivo), então em `content-schemas.ts` os campos opcionais usam `.default()` (`str→''`, `strArray→[]`, `bool→false`, `order→0`, `faIcon`/`linkColor` com default+refine) — campo ausente vira o vazio do tipo em vez de estourar `ZodError` (que vinha como 502). Só `slug` + nomes (`reqStr`) são obrigatórios. Ao adicionar um campo de conteúdo novo, faça-o opcional/`default` no schema senão entradas antigas quebram a leitura. Campos de imagem são input de texto (upload no slice ④). Site público segue lendo via `getKeystaticReader()` (intocado). Spec/plano: `docs/superpowers/{specs,plans}/2026-06-03-admin-unificado-colecoes-slice2*`.
- **Slice ③ (Posts + editor MDX):** `/admin/posts` (tabela) + editor full-page `/admin/posts/{novo,[slug]}` — CodeMirror (fonte MDX) + preview fiel (`POST /api/admin/posts/preview` roda `serialize` reusando o pipeline MDX compartilhado; client `MDXRemote` + mermaid). IO single-file MDX no `piluvitu-blog` via token linkado: `lib/admin/post-io.ts` (`gray-matter`; preserva keys de frontmatter desconhecidas; rastreia filename p/ não orfanar no edit), schema `lib/admin/post-schema.ts`, rotas `app/api/admin/posts/*` (escrita via engine `repo:'blog'` + `revalidateTag('blog-posts','max')`). Pipeline MDX compartilhado extraído pra `lib/mdx/{mdx-plugins.ts,mdx-components.tsx}` (página pública + preview renderizam idêntico). Requer a GitHub App do Keystatic instalada no `piluvitu-blog`. **TinaCMS aposentado** (`tina/` + `public/cms/` + devDeps removidos; build = `next build`).
- **Slice ④ (Mídia):** `/admin/midia` — biblioteca de imagens (grid + upload + apagar) que grava binário em `public/media/` do repo do site via a engine `commitBinary` (`lib/admin/git-write.ts`, **base64 passthrough — NÃO re-encoda** como o `commitFile`, que corromperia bytes). IO `lib/admin/media-io.ts` (`listMedia` via Octokit getContent filtrando `png/jpe?g/webp/svg/gif`; `sanitizeFilename` slugify+ext; `uniqueFilename` auto-sufixo `-1/-2`); `lib/admin/media-url.ts` `mediaRawUrl()` (client-safe, sem imports de server) mapeia `/media/*` → raw GitHub URL pro **preview imediato** (antes do redeploy; o valor salvo no campo é `/media/<file>`, servido pela Vercel só após o deploy). Rotas `app/api/admin/media/*` (GET list, POST upload, DELETE `[name]` com guard anti path-traversal) — valida ext **e** contentType contra allowlist, ≤4 MB (limite de body serverless). Hooks `hooks/admin/media/*` (`useMediaList` + `useMediaMutations` + `fileToUpload(file)` → `{filename,base64,contentType}`). Componentes `components/admin/media/*` (`MediaCard`, `MediaGrid` com filtros PNG·JPG·WEBP·SVG + dimensões decodadas client-side, `MediaPickerDialog`). `<ImageField>` (`components/admin/content/image-field.tsx`, preview + path/URL manual + botão "Biblioteca" abrindo o picker) substitui o `TextField` nos campos de imagem de projeto (`projectLogo`/`image`), carreira (`image`), social (`image`), perfil (`avatarSrc`) e post (`coverImage`). Sem processamento de imagem (sobe como está; o `next/image` faz o sizing na entrega pública). Spec/plano: `docs/superpowers/{specs,plans}/2026-06-04-admin-unificado-midia-slice4*`.
- **Slice ⑤ (Votação na shell + delete do editor Keystatic):** o painel admin da votação migrou pro shell em **`/admin/sessoes`** (`app/(admin)/admin/sessoes/page.tsx`) reusando os componentes DS V2 existentes (`CreateSessionForm`/`SessionsManager`/`UsersTable`/`BackupsPanel`) — sem gate próprio (o `(admin)/layout.tsx` já barra não-admin). `/votacao/admin` virou **redirect** pra `/admin/sessoes`; a votação **pública** (`/votacao`, `/votacao/[id]`) e os controles de admin na detail (encerrar + roleta de desempate) ficam intocados. O **editor Keystatic foi removido** (`app/keystatic`, `app/api/keystatic`, `lib/keystatic-fa-icon-picker-input.tsx`, `lib/keystatic-fontawesome-icon-select-field.tsx`, deps diretas `@keystatic/next` + `@keystar/ui`, e 2 envs só-editor (`KEYSTATIC_SECRET` + `NEXT_PUBLIC_KEYSTATIC_GITHUB_APP_SLUG`); `KEYSTATIC_GITHUB_CLIENT_ID/_SECRET` continuam (admin connect)); o **reader permanece** (`@keystatic/core` + `lib/keystatic-reader.ts` + `lib/site-content.ts`) alimentando o site público, e o `keystatic.config.ts` foi simplificado (campo FA custom → `fields.select`). Spec/plano: `docs/superpowers/{specs,plans}/2026-06-04-admin-unificado-votacao-slice5*`.

## Colocation rules (lei do projeto)

Todo teste e story fica no mesmo diretório do arquivo fonte. Jamais em `stories/` ou `e2e/` separados.

| Camada           | Fonte      | Teste           | Story              |
| ---------------- | ---------- | --------------- | ------------------ |
| Componente React | `bio.tsx`  | `bio.test.tsx`  | `bio.stories.tsx`  |
| Página Next.js   | `page.tsx` | `page.test.tsx` | `page.stories.tsx` |
| Lib TS pura      | `cpf.ts`   | `cpf.test.ts`   | —                  |
| Handler Go       | `tools.go` | `tools_test.go` | —                  |
| Lib Go pura      | `cpf.go`   | `cpf_test.go`   | —                  |

E2E files use `.e2e.ts` extension and live next to the route they test (e.g., `app/(site)/tasks/kanban.e2e.ts`).

## Go API (apps/api)

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

## Environment variables

**Fonte única para a API:** `apps/api/.env` (ignorado pelo git, valores de **DEV**). Carregado em dois caminhos:

- `make dev-api` — o target carrega o `.env` via `set -a; . ./.env; set +a` antes do air. Roda em dev (localhost:8081, cookie sem Secure).
- `docker compose` (em `infra/`) — `env_file: ../apps/api/.env` injeta as vars no container, **mas o bloco `environment:` do service `api` sobrescreve com os valores de PROD** (`GOOGLE_OAUTH_REDIRECT_URL=https://promeia.piluvitu.com.br/...`, `WEB_REDIRECT_URL=https://piluvitu.com.br/votacao`, `SESSION_COOKIE_SECURE=true`, `CORS_ALLOWED_ORIGINS=https://piluvitu.com.br`, + paths internos `/data` e `/secrets`). Assim `make dev` fica dev e `make tunnel-up`/`compose-up` (container) sai em prod, sem togglar o `.env`.

**Domínios de prod:** web `https://piluvitu.com.br` (Vercel) + API `https://promeia.piluvitu.com.br` (Cloudflare Tunnel). São o **mesmo domínio registrável** (`piluvitu.com.br`) → web↔API são same-site → o cookie de sessão `SameSite=Lax` é enviado nos `fetch(credentials:'include')` sem precisar de `SameSite=None`. (DNS do `piluvitu.com.br` migrado da Vercel pra Cloudflare; site segue hospedado na Vercel.)

Na Vercel cadastrar `NEXT_PUBLIC_API_URL=https://promeia.piluvitu.com.br`. No Google Console registrar `https://promeia.piluvitu.com.br/auth/google/callback`.

See `.env.example`. Key variables:

- `NEXT_PUBLIC_DEVTO_USERNAME` — dev.to username for article fetching
- `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` — reCAPTCHA v3 for email form
- `KEYSTATIC_GITHUB_CLIENT_ID`, `KEYSTATIC_GITHUB_CLIENT_SECRET` — OAuth da GitHub App (reusada) que o **/admin** usa pra "Conectar GitHub" e commitar conteúdo (`lib/admin/github-oauth.ts`). **Continuam necessárias** (não remover da Vercel). O editor Keystatic que também as usava saiu no slice ⑤, mas o admin permanece.
- (removidas no slice ⑤) `KEYSTATIC_SECRET`, `NEXT_PUBLIC_KEYSTATIC_GITHUB_APP_SLUG` — eram exclusivas do editor Keystatic (sessão + app slug do editor); sem uso após a remoção. **Remover da Vercel.**
- `KEYSTATIC_GITHUB_REPO` — target repo (`owner/name`; defaults in `keystatic.config.ts`)
- `NEXT_PUBLIC_VISIT_CARD_HANDLE` — optional override for visit card dev.to handle
- `BLOG_REPO_TOKEN` — GitHub fine-grained PAT with `Contents: read` on `piluvitu-blog`
- `BLOG_REPO_OWNER` — GitHub org/user owning the blog repo (default: `PiluVitu`)
- `BLOG_REPO_NAME` — blog content repo name (default: `piluvitu-blog`)
- `SQLITE_PATH` — caminho do arquivo SQLite usado pela feature `votacao` (default `/data/votacao.db` dentro do container Go API)
- `CORS_ALLOWED_ORIGINS` — origins permitidos pela Go API (csv); default `http://localhost:3333,https://piluvitu.com.br`
- `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URL` — OAuth Client ID type "Web application" do Google Cloud Console. Redirect URL precisa estar registrada no console e bater 1:1 com a env.
- `WEB_REDIRECT_URL` — pra onde o browser vai depois do callback bem-sucedido (default `http://localhost:3333/votacao`).
- `ADMIN_EMAILS` — CSV de e-mails admin. Comparação case-insensitive contra o e-mail do ID token.
- `ADMIN_TOKEN_SECRET` — chave (≥32 chars) que cifra o cookie do token GitHub linkado do admin unificado (`/admin`). Gere com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

- `SESSION_COOKIE_SECURE` — `true` em produção (HTTPS), `false` em dev local (HTTP).
- `GOOGLE_APPLICATION_CREDENTIALS` — caminho do JSON da Service Account dentro do container (default `/secrets/google-sa.json`).
- `GSHEETS_MOVIES_SPREADSHEET_ID` — ID da planilha (extraído da URL do Sheets). Sem isso o gsheets fica desligado.
- `GSHEETS_MOVIES_RANGE` — A1 notation. Default `A2:F` (pula header).
- `TMDB_API_KEY` — chave do TMDb (https://themoviedb.org/settings/api). Vazio → pôsteres desabilitados.
- `GDRIVE_BACKUP_FOLDER_ID` — ID da pasta Drive onde os snapshots vão. Vazio → backup desabilitado.
- `GDRIVE_BACKUP_KEEP` — quantos backups mais recentes manter (default 30).
- `BACKUP_CRON` — cron spec 5-fields (default `0 3 * * *` — 03:00 local).
- `NEXT_PUBLIC_API_URL` — base URL da Go API consumida pelo front (default `http://localhost:8080`).

## Edição de conteúdo & deploy (Vercel)

A edição de conteúdo agora é no **`/admin` unificado** (slices ①–⑤): cada save commita direto na `main` via o token GitHub linkado, disparando um deploy de produção na Vercel (publish = redeploy). O **editor Keystatic foi removido**; o `@keystatic/core` permanece só como **reader** (lê o YAML de `content/` no build/ISR). Pra iterar sem publicar, use uma branch + Preview da Vercel, depois PR pra `main`.

## Import alias

`@/*` maps to the repository root (configured in `tsconfig.json`).

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

## CI / CD

### Workflows GitHub Actions

| Workflow         | Trigger                                          | Faz o quê                                                                                                                 |
| ---------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`         | PR + push em `main`                              | Em paralelo: web (`lint` + `tsc --noEmit` + `jest` + `next build`) e api (`go vet` + `go test -race` + `go build`).       |
| `deploy-api.yml` | push em `main` que toca `apps/api/**` + dispatch | Build da imagem com `apps/api/Dockerfile`, push pra Artifact Registry, deploy no Cloud Run (min=0, max=3, 256Mi, 1 vCPU). |
| `trivy.yml`      | push/PR em `main` + cron semanal                 | Scan de filesystem, secrets (estrito) e misconfig — sobe SARIF pra aba Security.                                          |

### Secrets/Vars necessários no GitHub (Settings → Secrets and variables → Actions)

**Variables** (não são secretas, ficam em "Variables"):

- `GCP_PROJECT_ID` — ID do projeto GCP (ex.: `piluvitu-prod`)
- `GCP_REGION` — região do Cloud Run (ex.: `southamerica-east1`)
- `AR_REPOSITORY` — nome do repositório Artifact Registry (ex.: `api`)
- `CLOUD_RUN_SERVICE` — nome do serviço Cloud Run (ex.: `piluvitu-api`)

**Secrets**:

- `GCP_WORKLOAD_IDENTITY_PROVIDER` — recurso completo do provider WIF (`projects/NNN/locations/global/workloadIdentityPools/POOL/providers/PROVIDER`)
- `GCP_DEPLOY_SA_EMAIL` — e-mail da service account de deploy (ex.: `deployer@PROJECT.iam.gserviceaccount.com`)

### Vercel

- **Root Directory:** `apps/web`
- **Install Command:** `pnpm install --frozen-lockfile` (Vercel detecta `pnpm-workspace.yaml` na raiz automaticamente)
- **Build Command:** `pnpm build` (runs `next build`)
- **Output Directory:** `.next` (default)
- **Node version:** 22.x
- **Env vars:** copiar de `apps/web/.env.example` (todas as `NEXT_PUBLIC_*`, `BLOG_REPO_*`, `KEYSTATIC_GITHUB_REPO`, `KEYSTATIC_GITHUB_CLIENT_ID`, `KEYSTATIC_GITHUB_CLIENT_SECRET`, `ADMIN_TOKEN_SECRET`; apenas `KEYSTATIC_SECRET` e `NEXT_PUBLIC_KEYSTATIC_GITHUB_APP_SLUG` foram removidos no slice ⑤)
- **NEXT_PUBLIC_API_URL:** apontar pra URL do Cloud Run depois do primeiro deploy
