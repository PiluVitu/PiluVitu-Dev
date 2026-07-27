# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Monorepo.** Este arquivo cobre só o que é **transversal** (orquestração, segurança de deps, colocation, CI/CD). Cada workspace tem seu próprio `CLAUDE.md` com os detalhes — quando mexer num app, o Claude Code carrega este + o do app. Não duplicar: cada fato mora num único arquivo.
>
> | Workspace        | `CLAUDE.md`                | Cobre                                                                                                                                |
> | ---------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
> | `apps/web`       | `apps/web/CLAUDE.md`       | Next.js/React frontend, conteúdo (Keystatic), tema, blog, `/tasks`, `/tools`, `/admin`, votação **UI**, deploy Vercel                |
> | `apps/api`       | `apps/api/CLAUDE.md`       | Go API (chi), votação **backend**, auth Google, Sheets/TMDb/Drive, envelope, logging, hosting (Cloudflare Tunnel)                    |
> | `apps/financas`  | `apps/financas/CLAUDE.md`  | Worker Cloudflare (Hono + D1 + Static Assets), SPA Vite/React, dívidas, parcelas, comprometido, Cloudflare Access, deploy `wrangler` |
> | `packages/tools` | `packages/tools/CLAUDE.md` | `@piluvitu/tools` — lógica pura (TS, sem React/DOM) compartilhada pelo `/tools`                                                      |
> | `packages/ui`    | `packages/ui/CLAUDE.md`    | `@piluvitu/ui` — design system compartilhado: tokens, `cn()`, 14 componentes shadcn/ui (New York/Radix), consumidos por `apps/web`   |

> **Regra de manutenção (global):** sempre que implementar uma nova tecnologia ou mudar um fluxo, atualize o `CLAUDE.md` **do workspace onde mexeu** (ou este, se for transversal) pra mantê-lo sempre atualizado.

## Tech Stack (visão geral)

Monorepo **pnpm** (workspaces) + **Go workspace** (`go.work`) com cinco frentes:

- **`apps/web`** — **Next.js 16** (App Router), **React 19**, **TypeScript** strict, **Tailwind CSS 4** + **shadcn/ui**. Consome os tokens **e os componentes** do design system compartilhado de **`packages/ui`** (`@piluvitu/ui`) via `@import`/`@source` em `app/globals.css` + imports `@piluvitu/ui/<componente>`. **Storybook 10**. Hospedado na **Vercel** com ISR. → detalhes em `apps/web/CLAUDE.md`.
- **`apps/api`** — **Go 1.23**, **chi v5**, **SQLite** (`modernc.org/sqlite`, puro Go, sem CGo). Exposto hoje via **Cloudflare Tunnel**; destino futuro **Google Cloud Run** (`deploy-api.yml` pronto, fica skipado até `GCP_PROJECT_ID` ser cadastrado em Variables). → detalhes em `apps/api/CLAUDE.md`.
- **`apps/financas`** — **Cloudflare Worker** (Hono + D1 SQLite) servindo uma **SPA Vite + React 19** por Static Assets, em `financas.piluvitu.com.br` atrás do **Cloudflare Access**. Testes com `@cloudflare/vitest-pool-workers` (Worker) e Vitest/jsdom (SPA). → detalhes em `apps/financas/CLAUDE.md`.
- **`packages/tools`** — **`@piluvitu/tools`**, biblioteca de lógica pura em TS consumida pelo web. → detalhes em `packages/tools/CLAUDE.md`.
- **`packages/ui`** — **`@piluvitu/ui`**, design system compartilhado (tokens + `cn()` + 14 componentes shadcn/ui, um export por subpath, sem barrel), hoje consumido só por `apps/web`; `apps/financas/web` entra na Task 4 do plano de design system. → detalhes em `packages/ui/CLAUDE.md`.
- **GitHub Actions** — CI (`ci.yml`) bloqueia PR; `deploy-api.yml` aguarda credenciais GCP; `trivy.yml` para scan de segurança.

## Dependency security policy

- **pnpm ≥ 11 required.** pnpm 11 blocks lifecycle scripts by default (supply-chain defense).
- **Adding a dependency that needs install scripts:** add it explicitly to `allowBuilds` in `pnpm-workspace.yaml`. Never set `dangerouslyAllowAllBuilds: true`.
- **`minimumReleaseAge: 1440`** (set in `pnpm-workspace.yaml`): pnpm skips versions published less than 24 h ago, giving the community time to detect and report malicious releases.
- Run `pnpm audit` periodically and before releases.

## Commands

Todos os comandos rodam da raiz do monorepo usando **pnpm** ou **make**.

| Comando                                 | Propósito                                               |
| --------------------------------------- | ------------------------------------------------------- |
| `make dev`                              | Dev server web + Go API + Storybook em paralelo (`-j3`) |
| `make dev-web`                          | Só o Next.js em http://localhost:3333                   |
| `make dev-api`                          | Go API com **hot reload** (air)                         |
| `make storybook`                        | Só o Storybook em http://localhost:6017                 |
| `make stop`                             | Libera as portas 8081/3333/6017 se travarem             |
| `make build-api`                        | Compila binário Go API em bin/api                       |
| `make build-cli`                        | Compila CLI Go em bin/piluvitu                          |
| `make test`                             | Todos os testes (pnpm -r test + go test)                |
| `make lint`                             | ESLint + go vet                                         |
| `pnpm --filter @piluvitu/web dev`       | Dev Next.js direto                                      |
| `pnpm --filter @piluvitu/web build`     | Build Next.js                                           |
| `pnpm --filter @piluvitu/web storybook` | Storybook em 6017                                       |
| `pnpm --filter @piluvitu/web test:e2e`  | Playwright E2E                                          |
| `pnpm -r test`                          | Testes de todos os workspaces                           |

**Type checking without full build:** `pnpm exec tsc --noEmit` (from `apps/web/`)

**Recommended order before commit/PR:** `pnpm prettier:fix` → `pnpm lint` → `make test` → `pnpm --filter @piluvitu/web build`

> Gotchas/comandos específicos de cada frente: **web** (incl. a pegadinha do `implicit-any` da Vercel) em `apps/web/CLAUDE.md`; **Go hot reload (air)** em `apps/api/CLAUDE.md`.

### Gate do design system: `scripts/check-tailwind-source.mjs`

Script transversal (raiz, não pertence a nenhum app) que confirma, no CSS **emitido** de um build, que a classe sentinela definida em `packages/ui/src/styles.css` (`.ui-sentinela-nao-remover`) sobreviveu. Ela só sobrevive se o app consumidor tiver `@source '<caminho para packages/ui/src>'` no seu CSS de entrada — sem isso o Tailwind v4 **não quebra o build**, só descarta silenciosamente toda classe exclusiva de `packages/ui` (não só a sentinela).

```
node scripts/check-tailwind-source.mjs <diretório-ou-glob-de-css-emitido>
```

Aceita um diretório (busca recursiva por `*.css`, ex.: `apps/web/.next`) ou um glob de um nível (ex.: `"apps/financas/web/dist/assets/*.css"`) — pensado pra funcionar tanto com o output do Next (`.next/`) quanto do Vite (`dist/assets/`).

- **Amarrado em:** `apps/web/package.json` → scripts `build` **e** `build:ci` (ambos `next build && node ../../scripts/check-tailwind-source.mjs .next`) — roda tanto no CI de PR (`ci.yml` chama `build:ci`) quanto no build de produção da Vercel (`pnpm build`).
- **Reuso:** o plano `docs/superpowers/plans/2026-07-26-financas-ui-design-system.md` reusa este gate pra `apps/financas/web` (Task 4).

### Pre-commit hook (lint-staged)

`.husky/pre-commit` roda **`pnpm exec lint-staged`** — formata/linta só os arquivos staged (antes era `prettier --write "**/*"`, que varria o repo inteiro incluindo `.next/`). Configs em dois níveis (lint-staged usa a mais próxima de cada arquivo, com cwd no diretório dela):

- **Root `package.json`** → `*.{js,ts,tsx,json,md,css}: prettier --write` (arquivos da raiz / fora de apps/web). `prettier` + `prettier-plugin-tailwindcss` estão nas devDeps do root pra resolverem onde o hook roda.
- **`apps/web/package.json`** → `*.{ts,tsx}: [eslint --fix, prettier --write]` e demais assets só prettier. Fica em apps/web (não no root) porque o ESLint 9 flat config (`eslint.config.mjs`) e o plugin tailwind precisam resolver com cwd em apps/web.

Os scripts `prettier:fix` / `lint` seguem pra formatação/lint full manual (e CI).

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

## Environment variables

Fontes separadas por frente — a lista completa de cada uma vive no `CLAUDE.md` do app:

- **Web** (`apps/web/.env.example`) — `NEXT_PUBLIC_*`, `BLOG_REPO_*`, `KEYSTATIC_GITHUB_*`, `ADMIN_TOKEN_SECRET`, `NEXT_PUBLIC_API_URL`. → seção _Environment variables_ em `apps/web/CLAUDE.md`.
- **API** (`apps/api/.env.example`) — `GOOGLE_OAUTH_*`, `SQLITE_PATH`, `CORS_ALLOWED_ORIGINS`, `GSHEETS_*`, `TMDB_API_KEY`, `GDRIVE_*`, `SESSION_COOKIE_SECURE`, `ADMIN_EMAILS`, `WEB_REDIRECT_URL`. → seção _Environment variables_ + _Domínios de prod (same-site cookie)_ em `apps/api/CLAUDE.md`.

## CI / CD

### Workflows GitHub Actions

| Workflow         | Trigger                                          | Faz o quê                                                                                                                                                                                            |
| ---------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`         | PR + push em `main`                              | Em paralelo: web (`lint` + `tsc --noEmit` + `jest` + `next build`), api (`go vet` + `go test -race` + `go build`) e financas (`tsc --noEmit` do Worker e do SPA + build do SPA + `vitest` dos dois). |
| `deploy-api.yml` | push em `main` que toca `apps/api/**` + dispatch | Build da imagem com `apps/api/Dockerfile`, push pra Artifact Registry, deploy no Cloud Run (min=0, max=3, 256Mi, 1 vCPU).                                                                            |
| `trivy.yml`      | push/PR em `main` + cron semanal                 | Scan de filesystem, secrets (estrito) e misconfig — sobe SARIF pra aba Security.                                                                                                                     |

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
