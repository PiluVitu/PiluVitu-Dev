# CLAUDE.md — `apps/web` (frontend)

Guidance for the **Next.js web app** (`@piluvitu/web`). O Claude Code carrega este arquivo **junto** com o `CLAUDE.md` da raiz — aqui ficam só os detalhes do frontend; orquestração/monorepo/CI estão na raiz.

## Tech Stack

- **Next.js 16** (App Router), **React 19**, **TypeScript** strict mode
- **Tailwind CSS 4** + **shadcn/ui** (New York style, CSS variables, slate base)
- **Keystatic 0.5 (reader-only)** — lê o conteúdo YAML em `content/` no build/ISR via `@keystatic/core/reader` (`lib/keystatic-reader.ts` → `lib/site-content.ts`). O **editor** `/keystatic` foi removido no slice ⑤; a edição agora é no `/admin` unificado.
- **TanStack Query 5** — data fetching (dev.to API)
- **Font Awesome 7** (`free-brands-svg-icons`, `free-solid-svg-icons`)
- **Storybook 10** — component documentation and manual UI verification
- **Vercel** — hosting do frontend com ISR

## Commands (web)

Os comandos canônicos (`make dev-web`, `pnpm --filter @piluvitu/web …`) estão na raiz. Específico do web:

- **Type checking without full build:** `pnpm exec tsc --noEmit` (de `apps/web/`)
- **Recommended order before commit/PR:** `pnpm prettier:fix` → `pnpm lint` → `make test` → `pnpm --filter @piluvitu/web build`

**⚠️ Gotcha — Vercel é mais estrita que o build local com `implicit-any` em callbacks de libs de terceiro.** O `tsc`/`next build` LOCAL pode passar, mas o **install fresco da Vercel** (`--frozen-lockfile`) resolve o tipo do param como `any` quando ele vem de um `.d.ts` de terceiro — e aí `next build` quebra com `Parameter 'x' implicitly has an 'any' type` (já mordeu 2×: `onCreateEditor` do `@uiw/react-codemirror`/`@codemirror/*`, e a camera story). **Regra:** sempre **anote explicitamente** o param desses callbacks (ex.: `onCreateEditor={(view: EditorView) => …}`), não confie na inferência. Build local verde NÃO garante o da Vercel nesse caso.

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
- **Editor (DS V2 reskin):** `/admin/posts/{novo,[slug]}` — título grande no topo, área de conteúdo com abas **Editar / Dividir / Pré-visualizar** (`components/admin/posts/editor-tabs.tsx`) + toolbar de markdown (`mdx-toolbar.tsx`, age no `EditorView` do CodeMirror via `lib/admin/mdx-toolbar-actions.ts` puro), e sidebar em cards (`sidebar-card.tsx`): **Publicação** (`post-publish-card.tsx`: toggle Publicado=`!draft`, Data, Leitura `readingTimeMinutes`, Salvar alterações), **Metadados** (`post-meta-card.tsx`: Slug + Resumo), **Tags** (`TagArrayInput`), **Imagem de capa** (`cover-image-card.tsx`: dropzone que faz upload via a rota de mídia + Biblioteca + path manual). `readingTimeMinutes` é editável e auto-sugerido (`lib/admin/reading-time.ts` `estimateReadingTime`, ~200 palavras/min) quando vazio. O `mdx-editor` (CodeMirror) esconde os nº de linha e expõe o `EditorView` via `onReady`. O `post-frontmatter-form` foi removido (substituído pelos cards). IO/preview MDX e render público intactos. Slice ③. TinaCMS retired.
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

### Votação de Filmes — UI (`/votacao`)

> O **backend** da votação (Go API: store, schema, auth, sorteio, TMDb, backup, endpoints) está em `apps/api/CLAUDE.md`. Aqui é só o frontend.

- **Visual (DS V2):** lista e detalhe usam `PageTopBar` (← voltar + "Tema"). `SessionStatusBadge` = pílula "● Aberta" ciano (`bg-primary`) / "Encerrada" outline. `SessionCard` é um card V2 (título + "criada em…" mono + badge). `ResultsList` renderiza cada filme como uma **barra preenchida pelo percentual** (div absoluto com `width:%`), tonalizada por estado via tokens semânticos: `--win` (roxo, vencedor/🎲 desempate), `--ok` (verde, "seu voto"), `--warn` (âmbar, "Empate"), com badges combinando. Callout de empate usa `--warn`. Verificado por E2E (`votacao.e2e.ts`, contexto isolado com mocks).
- **Rotas:** `/votacao` (lista + login state), `/votacao/[id]` (detalhe + votar + resultados quando fechada + botão admin pra encerrar), `/votacao/admin` (painel admin — só admin enxerga).
- **Painel admin (`/votacao/admin`):** dashboard com 4 seções — **Nova sessão** (`CreateSessionForm`), **Sessões** (`components/votacao/sessions-manager.tsx`: lista, encerrar inline, e expandir "Ver votos" pra ver quem votou em quê — lazy via `useAdminSessionVotes`), **Usuários** (`components/votacao/admin/users-table.tsx`) e **Backups** (`components/votacao/admin/backups-panel.tsx`: disparar manual + histórico). Componentes de exibição em `components/votacao/admin/` são puros (recebem dados por prop, têm stories); o wiring (hooks `use-admin-*`) fica na page/SessionsManager. As queries admin são gated por `is_admin` (`enabled`) pra não dispararem pra não-admin. (No slice ⑤ o painel migrou pra `/admin/sessoes` e `/votacao/admin` virou redirect — ver "Admin unificado".)
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

> A **lógica pura** (algoritmos CPF/CNPJ/Base64/JWT/JSON/UUID + PRNG/entropia/roleta) mora em `packages/tools` (`@piluvitu/tools`) — ver `packages/tools/CLAUDE.md`. Aqui é só a UI React e o registro.

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

#### Módulo de entropia + roleta (UI)

- **Lógica pura:** vive em `@piluvitu/tools` (`packages/tools/src`) — ver `packages/tools/CLAUDE.md`.
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
- **Slice ③ (Posts + editor MDX):** `/admin/posts` (tabela) + editor full-page `/admin/posts/{novo,[slug]}` — **Editor (DS V2 reskin):** título grande no topo (`aria-label="Título"`), área de conteúdo com abas **Editar / Dividir / Pré-visualizar** (`components/admin/posts/editor-tabs.tsx`) + toolbar de markdown (`mdx-toolbar.tsx`, age no `EditorView` do CodeMirror via `lib/admin/mdx-toolbar-actions.ts` puro), e sidebar em cards (`sidebar-card.tsx`): **Publicação** (`post-publish-card.tsx`: toggle Publicado=`!draft`, Data, Leitura `readingTimeMinutes`, Salvar alterações), **Metadados** (`post-meta-card.tsx`: Slug + Resumo), **Tags** (`TagArrayInput`), **Imagem de capa** (`cover-image-card.tsx`: dropzone que faz upload via a rota de mídia + Biblioteca + path manual). `readingTimeMinutes` é editável e auto-sugerido (`lib/admin/reading-time.ts` `estimateReadingTime`, ~200 palavras/min) quando vazio. O `mdx-editor` (CodeMirror) esconde os nº de linha e expõe o `EditorView` via `onReady`. O `post-frontmatter-form` foi removido (substituído pelos cards). Preview fiel: `POST /api/admin/posts/preview` roda `serialize` reusando o pipeline MDX compartilhado; client `MDXRemote` + mermaid. IO single-file MDX no `piluvitu-blog` via token linkado: `lib/admin/post-io.ts` (`gray-matter`; preserva keys de frontmatter desconhecidas; rastreia filename p/ não orfanar no edit), schema `lib/admin/post-schema.ts`, rotas `app/api/admin/posts/*` (escrita via engine `repo:'blog'` + `revalidateTag('blog-posts','max')`). Pipeline MDX compartilhado extraído pra `lib/mdx/{mdx-plugins.ts,mdx-components.tsx}` (página pública + preview renderizam idêntico). Requer a GitHub App do Keystatic instalada no `piluvitu-blog`. **TinaCMS aposentado** (`tina/` + `public/cms/` + devDeps removidos; build = `next build`).
- **Slice ④ (Mídia):** `/admin/midia` — biblioteca de imagens (grid + upload + apagar) que grava binário em `public/media/` do repo do site via a engine `commitBinary` (`lib/admin/git-write.ts`, **base64 passthrough — NÃO re-encoda** como o `commitFile`, que corromperia bytes). IO `lib/admin/media-io.ts` (`listMedia` via Octokit getContent filtrando `png/jpe?g/webp/svg/gif`; `sanitizeFilename` slugify+ext; `uniqueFilename` auto-sufixo `-1/-2`); `lib/admin/media-url.ts` `mediaRawUrl()` (client-safe, sem imports de server) mapeia `/media/*` → raw GitHub URL pro **preview imediato** (antes do redeploy; o valor salvo no campo é `/media/<file>`, servido pela Vercel só após o deploy). Rotas `app/api/admin/media/*` (GET list, POST upload, DELETE `[name]` com guard anti path-traversal) — valida ext **e** contentType contra allowlist, ≤4 MB (limite de body serverless). Hooks `hooks/admin/media/*` (`useMediaList` + `useMediaMutations` + `fileToUpload(file)` → `{filename,base64,contentType}`). Componentes `components/admin/media/*` (`MediaCard`, `MediaGrid` com filtros PNG·JPG·WEBP·SVG + dimensões decodadas client-side, `MediaPickerDialog`). `<ImageField>` (`components/admin/content/image-field.tsx`, preview + path/URL manual + botão "Biblioteca" abrindo o picker) substitui o `TextField` nos campos de imagem de projeto (`projectLogo`/`image`), carreira (`image`), social (`image`), perfil (`avatarSrc`) e post (`coverImage`). Sem processamento de imagem (sobe como está; o `next/image` faz o sizing na entrega pública). Spec/plano: `docs/superpowers/{specs,plans}/2026-06-04-admin-unificado-midia-slice4*`.
- **Slice ⑤ (Votação na shell + delete do editor Keystatic):** o painel admin da votação migrou pro shell em **`/admin/sessoes`** (`app/(admin)/admin/sessoes/page.tsx`) reusando os componentes DS V2 existentes (`CreateSessionForm`/`SessionsManager`/`UsersTable`/`BackupsPanel`) — sem gate próprio (o `(admin)/layout.tsx` já barra não-admin). `/votacao/admin` virou **redirect** pra `/admin/sessoes`; a votação **pública** (`/votacao`, `/votacao/[id]`) e os controles de admin na detail (encerrar + roleta de desempate) ficam intocados. O **editor Keystatic foi removido** (`app/keystatic`, `app/api/keystatic`, `lib/keystatic-fa-icon-picker-input.tsx`, `lib/keystatic-fontawesome-icon-select-field.tsx`, deps diretas `@keystatic/next` + `@keystar/ui`, e 2 envs só-editor (`KEYSTATIC_SECRET` + `NEXT_PUBLIC_KEYSTATIC_GITHUB_APP_SLUG`); `KEYSTATIC_GITHUB_CLIENT_ID/_SECRET` continuam (admin connect)); o **reader permanece** (`@keystatic/core` + `lib/keystatic-reader.ts` + `lib/site-content.ts`) alimentando o site público, e o `keystatic.config.ts` foi simplificado (campo FA custom → `fields.select`). Spec/plano: `docs/superpowers/{specs,plans}/2026-06-04-admin-unificado-votacao-slice5*`.

### Atelier (distribuição via LLM local)

O editor de posts (`/admin/posts/{novo,[slug]}`) traz dois widgets de IA montados diretamente no `PostEditor`:

- **Botão "Corrigir texto"** (`components/admin/posts/proofread-button.tsx`) — aparece na barra acima do CodeMirror (tab Editar/Dividir). Faz `POST /admin/llm/proofread` na Go API com `{ text: body }`, recebe `{ corrected }` e abre um dialog **"Revisão da IA"** com um diff inline word-level (`lib/admin/atelier/word-diff.ts`, algoritmo LCS): remoções em vermelho tachado, adições em verde. O editor pode **Aplicar** (substitui o body, toast "Texto corrigido aplicado.") ou **Rejeitar** (fecha sem alterar). Depende do **túnel local + Ollama** estar rodando; se o endpoint falhar, exibe `toast.error` e fecha (degrada graciosamente). Hook: `useProofread` (`hooks/admin/atelier/use-proofread.ts`).

- **Card "Distribuição"** (`components/admin/posts/distribution-panel.tsx`) — aparece na sidebar quando `fm.slug` é não-vazio. Publica o artigo em múltiplos canais via a Go API:
  - `POST /admin/distribution/proposals` — gera propostas de conteúdo por plataforma (`targets[]`): artigos para republicação cross-post (dev.to, Hashnode — `kind: 'article_crosspost'`) e chamadas sociais curtas (Bluesky, Mastodon — `kind: 'social_hook'`, com contador de caracteres). As chamadas sociais são editáveis em `<Textarea>` inline.
  - `POST /admin/llm/refine` — refina o texto de uma plataforma com instrução livre (campo "instrução" + botão "Refinar IA").
  - `POST /admin/distribution/<slug>/publish` — publica os targets selecionados (checkboxes por plataforma) e devolve targets atualizados com `status: 'posted' | 'failed'` e `remote_url`. Status é exibido inline: ✅ link clicável ("publicado"), ❌ falhou (tooltip com erro), ⏳ pendente. Botão "Publicar selecionadas" → toast "Publicação concluída.". Depende do túnel/Ollama + credenciais de plataforma configuradas na Go API; falhas exibem `toast.error`.

- **API client:** `lib/admin/atelier/api.ts` — chama `apiBase` (mesma base da votação, `NEXT_PUBLIC_API_URL`) com `credentials: 'include'` e desembrulha o envelope `{ok,data,notifications}` via `ApiError`. Metadados de plataforma (labels, charLimit) em `lib/admin/atelier/platform-meta.ts`.

- **Spec/plano:** `docs/superpowers/{specs,plans}/2026-06-10-distribuicao-fase1-*`. Endpoints Go: ver `apps/api/CLAUDE.md`.

- **E2E colocado:** `apps/web/app/(admin)/admin/posts/atelier.e2e.ts` — testa os 3 fluxos: (1) clicar "Corrigir texto" → dialog abre com diff → "Aplicar" fecha + toast; (2) "Rejeitar" fecha sem aplicar; (3) preencher o slug → card Distribuição aparece → "Gerar propostas" → dev.to e Bluesky renderizam → "Publicar selecionadas" → links ✅ aparecem. Todos os endpoints são mockados com `page.route('**/...')` host-agnóstico (padrão do repo).

## Colocation rules

A lei de colocation (teste/story no mesmo diretório do fonte; E2E `.e2e.ts` ao lado da rota) está na raiz (`CLAUDE.md`). No web: `bio.tsx` → `bio.test.tsx` + `bio.stories.tsx`; `page.tsx` → `page.test.tsx` + `page.stories.tsx`; lib TS pura → só `*.test.ts`.

## Environment variables (web)

Fonte: `apps/web/.env.example`. Cadastrar na Vercel (ver seção CI/CD na raiz). Domínios de prod + same-site cookie: ver `apps/api/CLAUDE.md`.

- `NEXT_PUBLIC_DEVTO_USERNAME` — dev.to username for article fetching
- `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` — reCAPTCHA v3 for email form
- `KEYSTATIC_GITHUB_CLIENT_ID`, `KEYSTATIC_GITHUB_CLIENT_SECRET` — OAuth da GitHub App (reusada) que o **/admin** usa pra "Conectar GitHub" e commitar conteúdo (`lib/admin/github-oauth.ts`). **Continuam necessárias** (não remover da Vercel). O editor Keystatic que também as usava saiu no slice ⑤, mas o admin permanece.
- (removidas no slice ⑤) `KEYSTATIC_SECRET`, `NEXT_PUBLIC_KEYSTATIC_GITHUB_APP_SLUG` — eram exclusivas do editor Keystatic (sessão + app slug do editor); sem uso após a remoção. **Remover da Vercel.**
- `KEYSTATIC_GITHUB_REPO` — target repo (`owner/name`; defaults in `keystatic.config.ts`)
- `NEXT_PUBLIC_VISIT_CARD_HANDLE` — optional override for visit card dev.to handle
- `BLOG_REPO_TOKEN` — GitHub fine-grained PAT with `Contents: read` on `piluvitu-blog`
- `BLOG_REPO_OWNER` — GitHub org/user owning the blog repo (default: `PiluVitu`)
- `BLOG_REPO_NAME` — blog content repo name (default: `piluvitu-blog`)
- `ADMIN_TOKEN_SECRET` — chave (≥32 chars) que cifra o cookie do token GitHub linkado do admin unificado (`/admin`). Gere com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
- `NEXT_PUBLIC_API_URL` — base URL da Go API consumida pelo front (default `http://localhost:8080`).

## Edição de conteúdo & deploy (Vercel)

A edição de conteúdo agora é no **`/admin` unificado** (slices ①–⑤): cada save commita direto na `main` via o token GitHub linkado, disparando um deploy de produção na Vercel (publish = redeploy). O **editor Keystatic foi removido**; o `@keystatic/core` permanece só como **reader** (lê o YAML de `content/` no build/ISR). Pra iterar sem publicar, use uma branch + Preview da Vercel, depois PR pra `main`. Config da Vercel (Root Directory, build command, env): ver seção CI/CD na raiz.

## Import alias

`@/*` mapeia pra **raiz do app web** (`apps/web`) — `paths: { "@/*": ["./*"] }` em `apps/web/tsconfig.json`. Ex.: `@/components/...` → `apps/web/components/...`.
