# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Tech Stack

- **Next.js 16** (App Router), **React 19**, **TypeScript** strict mode
- **Tailwind CSS 4** + **shadcn/ui** (New York style, CSS variables, slate base)
- **Keystatic 0.5** — GitHub-based CMS; content stored as YAML in `content/`
- **TanStack Query 5** — data fetching (dev.to API)
- **Font Awesome 7** (`free-brands-svg-icons`, `free-solid-svg-icons`)
- **Storybook 10** — component documentation and manual UI verification
- **Vercel** — hosting with ISR; no CI/CD workflows in `.github/workflows/`

## Commands

All commands run from the repository root using **pnpm**.

| Command | Purpose |
|---|---|
| `pnpm dev` | Dev server at http://localhost:3000 (webpack) |
| `pnpm dev:turbo` | Dev server with Turbopack |
| `pnpm build` | Production build + type validation |
| `pnpm lint` | ESLint (flat config) |
| `pnpm style-fix` | ESLint auto-fix |
| `pnpm prettier:check` | Check Prettier formatting |
| `pnpm prettier:fix` | Auto-format (also runs via Husky pre-commit hook) |
| `pnpm storybook` | Storybook at port 6006 |

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

| Path | Purpose |
|---|---|
| `components/ui/` | shadcn/ui primitives (15 components) |
| `components/` | Page-level components (bio, cards, email form, visit card) |
| `lib/` | Server utilities: Keystatic readers, dev.to client, icon mapping |
| `hooks/` | Client hooks — `useArticleData.ts` (TanStack Query for dev.to) |
| `mocks/` | Type definitions and fallback data |
| `stories/` | Storybook stories |
| `content/` | Keystatic CMS content (YAML) |

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
2. `hooks/useArticleData.ts` fetches dev.to articles client-side via TanStack Query; username from `NEXT_PUBLIC_DEVTO_USERNAME`.
3. The visit card (`components/profile-visit-card.tsx`) opens on triple-click of the avatar, showing a 3D animated card with cells configured in Keystatic.

### Font Awesome in the CMS

The icon picker in Keystatic is a custom field. Available icons are defined in `lib/visit-card-fontawesome.ts` (`VISIT_CARD_FA_ICON_MAP`, `VISIT_CARD_FA_SELECT_OPTIONS`). To add a new icon: import it in that map, add it to `keystatic.config.ts`, and add an entry to the select options. The factory `fontawesomeIconSelectField()` in `lib/keystatic-fontawesome-icon-select-field.tsx` **must not** be in a `'use client'` file — it runs server-side.

### Remote images

Permitted image hosts are configured in `next.config.mjs` (`images.remotePatterns`). Adding a new external image host requires updating that list.

### Theme

Custom `--success` / `--success-foreground` CSS variables in `app/globals.css` expose `text-success` via Tailwind. Used for positive metric indicators (e.g., article reactions > 0).

## Environment variables

See `.env.example`. Key variables:

- `NEXT_PUBLIC_DEVTO_USERNAME` — dev.to username for article fetching
- `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` — reCAPTCHA v3 for email form
- `KEYSTATIC_GITHUB_CLIENT_ID`, `KEYSTATIC_GITHUB_CLIENT_SECRET`, `KEYSTATIC_SECRET`, `NEXT_PUBLIC_KEYSTATIC_GITHUB_APP_SLUG` — Keystatic GitHub OAuth
- `KEYSTATIC_GITHUB_REPO` — target repo (`owner/name`; defaults in `keystatic.config.ts`)
- `NEXT_PUBLIC_VISIT_CARD_HANDLE` — optional override for visit card dev.to handle

## Keystatic & Vercel deployment

Each **Save** in Keystatic commits directly to the active branch. If editing on `main`, it triggers a Vercel production deploy. To iterate without publishing: create a separate branch in Keystatic, preview via Vercel preview URL, then open a PR to `main`.

## Import alias

`@/*` maps to the repository root (configured in `tsconfig.json`).
