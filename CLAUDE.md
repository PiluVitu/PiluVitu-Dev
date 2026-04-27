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
- **Vercel** — hosting with ISR; no CI/CD workflows in `.github/workflows/`

## Commands

All commands run from the repository root using **pnpm**.

| Command               | Purpose                                           |
| --------------------- | ------------------------------------------------- |
| `pnpm dev`            | Dev server at http://localhost:3000 (webpack)     |
| `pnpm dev:turbo`      | Dev server with Turbopack                         |
| `pnpm build`          | Production build + type validation                |
| `pnpm lint`           | ESLint (flat config)                              |
| `pnpm style-fix`      | ESLint auto-fix                                   |
| `pnpm prettier:check` | Check Prettier formatting                         |
| `pnpm prettier:fix`   | Auto-format (also runs via Husky pre-commit hook) |
| `pnpm storybook`      | Storybook at port 6017                            |
| `pnpm tina:dev`       | Dev server + TinaCMS editor at /admin             |
| `pnpm tina:build`     | Build TinaCMS admin then Next.js (use on Vercel)  |

**Type checking without full build:** `pnpm exec tsc --noEmit`

**No test suite** — use Storybook for UI verification.

**Recommended order before commit/PR:** `pnpm prettier:fix` → `pnpm lint` → `pnpm build`

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

## Keystatic & Vercel deployment

Each **Save** in Keystatic commits directly to the active branch. If editing on `main`, it triggers a Vercel production deploy. To iterate without publishing: create a separate branch in Keystatic, preview via Vercel preview URL, then open a PR to `main`.

## Import alias

`@/*` maps to the repository root (configured in `tsconfig.json`).
