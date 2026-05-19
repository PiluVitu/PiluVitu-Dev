# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Tech Stack

- **Next.js 16** (App Router), **React 19**, **TypeScript** strict mode
- **Tailwind CSS 4** + **shadcn/ui** (New York style, CSS variables, slate base)
- **Keystatic 0.5** — GitHub-based CMS; content stored as YAML in `content/` (site config, socials, careers, projects)
- **TinaCMS 3** (devDep) — blog editor only; generates admin UI at `public/admin/`; content stored in private repo `PiluVitu/piluvitu-blog`
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
| `make dev-api`                          | Só a Go API em http://localhost:8080     |
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

## Architecture

### App Router structure

- `app/(site)/` — main site layout and page sections
- `app/api/keystatic/` — Keystatic CMS API routes
- `app/keystatic/` — Keystatic editor UI + `/icon-preview` page (shows all selectable FA icons)
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

### Font Awesome in the CMS

The icon picker in Keystatic is a custom field. Available icons are defined in `lib/visit-card-fontawesome.ts` (`VISIT_CARD_FA_ICON_MAP`, `VISIT_CARD_FA_SELECT_OPTIONS`). To add a new icon: import it in that map, add it to `keystatic.config.ts`, and add an entry to the select options. The factory `fontawesomeIconSelectField()` in `lib/keystatic-fontawesome-icon-select-field.tsx` **must not** be in a `'use client'` file — it runs server-side.

### Remote images

Permitted image hosts are configured in `next.config.mjs` (`images.remotePatterns`). Adding a new external image host requires updating that list.

### Theme

Custom `--success` / `--success-foreground` CSS variables in `app/globals.css` expose `text-success` via Tailwind. Used for positive metric indicators (e.g., article reactions > 0).

### Blog (TinaCMS)

- **Content repo**: `PiluVitu/piluvitu-blog` (private) — MDX files at `content/posts/*.mdx`
- **Editor**: access at `/admin` after `pnpm tina:build` generates `public/admin/` static files
- **Setup**: create project at https://app.tina.io pointing at `PiluVitu/piluvitu-blog`, copy `NEXT_PUBLIC_TINA_CLIENT_ID` + `TINA_TOKEN` to `.env.local`
- **Reading posts server-side**: `lib/blog-posts.ts` — Octokit reads files from `piluvitu-blog`, parses MDX frontmatter, returns typed `BlogPost[]`
- **Individual post route**: `app/(site)/posts/[slug]/page.tsx` — MDX rendered with `next-mdx-remote/rsc`, code syntax via `rehype-pretty-code`, mermaid via client-side `components/mdx/mermaid-block.tsx`
- **Mermaid in posts**: write fenced code block with lang `mermaid` — renders as interactive SVG diagram client-side
- **Drafts**: set `draft: true` in frontmatter — hidden in production, visible in Next.js draft mode
- **ISR**: posts revalidated every 30 min (tag `blog-posts`). After publishing, wait up to 30 min or trigger on-demand revalidation.
- **Vercel build command**: change to `pnpm tina:build` (runs `tinacms build && next build`)

### Key directories (updated)

| Path                        | Purpose                                                 |
| --------------------------- | ------------------------------------------------------- |
| `components/mdx/`           | MDX custom components (MermaidBlock, etc.)              |
| `app/(site)/posts/[slug]/`  | Individual blog post route                              |
| `lib/blog-posts.ts`         | Server reader for posts from piluvitu-blog repo         |
| `lib/article-feed.ts`       | Unified ArticleCardView type + devto/blog adapters      |
| `tina/config.tsx`           | TinaCMS schema (posts collection) + slug preview button |
| `components/kanban/`        | Kanban board: Board, Column, Card, modais, headers      |
| `app/(site)/tasks/`         | Rota `/tasks` — Mini Kanban PWA                         |
| `hooks/use-kanban-store.ts` | Reducer Kanban + persistência localStorage              |
| `lib/kanban-schema.ts`      | Tipos TypeScript + schema Zod + TAG_COLORS              |
| `lib/kanban-export.ts`      | Export (download JSON) + parseImport (validação Zod)    |

### Mini Kanban PWA (`/tasks`)

- **Rota:** `app/(site)/tasks/page.tsx` dentro do layout do site
- **Estado:** `useKanbanStore` (`hooks/use-kanban-store.ts`) — `useReducer` + `localStorage` (chave `"kanban-state"`)
- **Drag and drop:** `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`
- **PWA:** `public/manifest.json` + `public/sw.js` + `public/icons/icon.svg`; SW registrado via `useEffect` em `KanbanBoard`
- **Export/Import:** `lib/kanban-export.ts` — download JSON / validação Zod antes de importar
- **E2E:** `e2e/kanban.spec.ts` cobre todos os fluxos críticos (criar coluna, criar card, editar, tags, links, deletar, export/import)

### Votação de Filmes (`/votacao`)

- **Status:** em construção (Fase 3 concluída: Sheets reader + sorteio puro; Fase 2 entregou Auth Google; Fase 1 entregou DB + store + volume Docker).
- **Design:** `docs/plans/2026-05-19-votacao-filmes-design.md`
- **Plano Fase 1:** `docs/plans/2026-05-19-votacao-fase1-plan.md`
- **Persistência:** SQLite (`modernc.org/sqlite`, puro Go, sem CGo) em `/data/votacao.db` dentro do container Go API, volume Docker `api-data`.
- **Schema embutido:** `apps/api/internal/votacao/schema.sql` aplicado idempotentemente no startup via `//go:embed` (CREATE TABLE IF NOT EXISTS).
- **Store por entidade:** `users.go`, `sessions.go`, `movies.go`, `votes.go`, `backups.go` — todos no pacote `internal/votacao`. Testes colocated (`*_test.go`), `helper_test.go` com `newTestStore()`.
- **Tabelas:** `users` (Google OAuth + admin allowlist), `voting_sessions` (open/closed + winner), `session_movies` (categoria UNIQUE por sessão), `votes` (UNIQUE por session+user), `backups` (Drive metadata).
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

### Tools dashboard (`/tools`)

- **Rota:** `app/(site)/tools/page.tsx` (landing) + `app/(site)/tools/[slug]/page.tsx` por ferramenta
- **Registro central:** `lib/tools-registry.ts` — array `TOOLS` com `{ slug, title, description, icon, group }`. Adicionar ferramenta = 1 entrada no registry + 1 página + 1 componente.
- **Separação lógica/UI:** `lib/tools/*` contém **TypeScript puro, sem React/Next/DOM**. Funções puras testáveis em Jest e portáveis para CLI futura. `components/tools/*` contém os componentes React que usam as libs.
- **Testes:** Jest cobre `lib/tools/*` (algoritmos CPF/CNPJ, Base64, JWT, JSON, UUID). Rodar com `pnpm test`.
- **E2E:** `e2e/tools.spec.ts` cobre fluxos críticos de cada ferramenta.
- **Ferramentas v1:** QR Reader (câmera, `@zxing/browser`), QR Generator (`qrcode`), CPF, CNPJ, JSON, Base64, JWT decode, UUID v4.
- **Como adicionar uma nova ferramenta:**
  1. Criar `lib/tools/<slug>.ts` com lógica pura + `lib/tools/<slug>.test.ts`
  2. Criar `components/tools/<slug>-tool.tsx` (UI React)
  3. Criar `components/tools/<slug>-tool.stories.tsx`
  4. Adicionar entrada em `lib/tools-registry.ts`
  5. Criar `app/(site)/tools/<slug>/page.tsx`
  6. Adicionar casos no `e2e/tools.spec.ts`

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
- **Tests:** colocated `*_test.go` files, run with `make test-go` or `cd apps/api && go test ./...`
- **Build:** `make build-api` → `bin/api`, `make build-cli` → `bin/piluvitu`

## Environment variables

See `.env.example`. Key variables:

- `NEXT_PUBLIC_DEVTO_USERNAME` — dev.to username for article fetching
- `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` — reCAPTCHA v3 for email form
- `KEYSTATIC_GITHUB_CLIENT_ID`, `KEYSTATIC_GITHUB_CLIENT_SECRET`, `KEYSTATIC_SECRET`, `NEXT_PUBLIC_KEYSTATIC_GITHUB_APP_SLUG` — Keystatic GitHub OAuth
- `KEYSTATIC_GITHUB_REPO` — target repo (`owner/name`; defaults in `keystatic.config.ts`)
- `NEXT_PUBLIC_VISIT_CARD_HANDLE` — optional override for visit card dev.to handle
- `NEXT_PUBLIC_TINA_CLIENT_ID`, `TINA_TOKEN` — TinaCMS Cloud credentials (from app.tina.io)
- `BLOG_REPO_TOKEN` — GitHub fine-grained PAT with `Contents: read` on `piluvitu-blog`
- `BLOG_REPO_OWNER` — GitHub org/user owning the blog repo (default: `PiluVitu`)
- `BLOG_REPO_NAME` — blog content repo name (default: `piluvitu-blog`)
- `SQLITE_PATH` — caminho do arquivo SQLite usado pela feature `votacao` (default `/data/votacao.db` dentro do container Go API)
- `CORS_ALLOWED_ORIGINS` — origins permitidos pela Go API (csv); default `http://localhost:3333,https://piluvitu.com.br`
- `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URL` — OAuth Client ID type "Web application" do Google Cloud Console. Redirect URL precisa estar registrada no console e bater 1:1 com a env.
- `WEB_REDIRECT_URL` — pra onde o browser vai depois do callback bem-sucedido (default `http://localhost:3333/votacao`).
- `ADMIN_EMAILS` — CSV de e-mails admin. Comparação case-insensitive contra o e-mail do ID token.
- `SESSION_COOKIE_SECURE` — `true` em produção (HTTPS), `false` em dev local (HTTP).
- `GOOGLE_APPLICATION_CREDENTIALS` — caminho do JSON da Service Account dentro do container (default `/secrets/google-sa.json`).
- `GSHEETS_MOVIES_SPREADSHEET_ID` — ID da planilha (extraído da URL do Sheets). Sem isso o gsheets fica desligado.
- `GSHEETS_MOVIES_RANGE` — A1 notation. Default `A2:F` (pula header).

## Keystatic & Vercel deployment

Each **Save** in Keystatic commits directly to the active branch. If editing on `main`, it triggers a Vercel production deploy. To iterate without publishing: create a separate branch in Keystatic, preview via Vercel preview URL, then open a PR to `main`.

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

| Comando             | Faz o quê                                                 |
| ------------------- | --------------------------------------------------------- |
| `make tunnel-up`    | Sobe api + web + cloudflared (build + detached)           |
| `make tunnel-down`  | Derruba tudo                                              |
| `make tunnel-logs`  | Tail do log do cloudflared (útil pra debug de conexão)    |
| `make compose-up`   | Sobe só api + web (sem expor publicamente)                |

Depois de `make tunnel-up`, a API responde em `https://api.SEUDOMINIO.com`. Esse valor vai em `NEXT_PUBLIC_API_URL` na Vercel.

### Limitações conhecidas

- A API só fica online enquanto seu Mac/PC estiver com o Docker rodando.
- URL **persiste** entre restarts (é o mesmo subdomínio Cloudflare), então não precisa atualizar a Vercel a cada `docker compose down/up`.
- Quando migrar pra Cloud Run, basta cadastrar as variáveis GCP no GitHub (o workflow `deploy-api.yml` já está pronto) e mudar `NEXT_PUBLIC_API_URL` na Vercel pra URL do Cloud Run.

## CI / CD

### Workflows GitHub Actions

| Workflow              | Trigger                                              | Faz o quê                                                                                                                |
| --------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `ci.yml`              | PR + push em `main`                                  | Em paralelo: web (`lint` + `tsc --noEmit` + `jest` + `next build`) e api (`go vet` + `go test -race` + `go build`).      |
| `deploy-api.yml`      | push em `main` que toca `apps/api/**` + dispatch     | Build da imagem com `apps/api/Dockerfile`, push pra Artifact Registry, deploy no Cloud Run (min=0, max=3, 256Mi, 1 vCPU). |
| `trivy.yml`           | push/PR em `main` + cron semanal                     | Scan de filesystem, secrets (estrito) e misconfig — sobe SARIF pra aba Security.                                          |

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
- **Build Command:** `pnpm tina:build` (ou `pnpm build` se não estiver usando TinaCMS)
- **Output Directory:** `.next` (default)
- **Node version:** 22.x
- **Env vars:** copiar de `apps/web/.env.example` (todas as `NEXT_PUBLIC_*`, `TINA_TOKEN`, `BLOG_REPO_*`, `KEYSTATIC_*`)
- **NEXT_PUBLIC_API_URL:** apontar pra URL do Cloud Run depois do primeiro deploy
