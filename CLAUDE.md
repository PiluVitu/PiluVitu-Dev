# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Monorepo.** Este arquivo cobre só o que é **transversal** (orquestração, segurança de deps, colocation, CI/CD). Cada workspace tem seu próprio `CLAUDE.md` com os detalhes — quando mexer num app, o Claude Code carrega este + o do app. Não duplicar: cada fato mora num único arquivo.
>
> | Workspace            | `CLAUDE.md`                    | Cobre                                                                                                                                                                                                                                                                                                                                                                  |
> | -------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
> | `apps/web`           | `apps/web/CLAUDE.md`           | Next.js/React frontend, conteúdo (Keystatic), tema, blog, `/tasks`, `/tools`, `/pilulabs`, `/admin`, votação **UI**, deploy Vercel                                                                                                                                                                                                                                     |
> | `apps/api`           | `apps/api/CLAUDE.md`           | Go API (chi), votação **backend**, auth Google, Sheets/TMDb/Drive, envelope, logging, hosting (Cloudflare Tunnel)                                                                                                                                                                                                                                                      |
> | `apps/financas`      | `apps/financas/CLAUDE.md`      | Worker Cloudflare (Hono + D1 + Static Assets), SPA Vite/React no design system compartilhado, dívidas, parcelas, comprometido, login Google (Better Auth), deploy `wrangler`                                                                                                                                                                                           |
> | `apps/ramielle`      | `apps/ramielle/CLAUDE.md`      | Worker Cloudflare (Hono + D1), substituindo a API Go fatia a fatia: as 9 rotas de `/votacao` (Sheets, sorteio, TMDb inclusos, fatia ③) + as 3 de `/admin` + o proxy da transcrição (`/admin/transcrever` → promeia), auth Google (Better Auth, votação **LIVRE** — oposto do finanças), CORS, deploy `wrangler`                                                        |
> | `apps/promeia`       | `apps/promeia/CLAUDE.md`       | Serviço Python local (FastAPI): o que exige GPU, modelo local ou arquivo em disco. Insight financeiro, transcrição de áudio; PDF depois                                                                                                                                                                                                                                |
> | `apps/botai`         | `apps/botai/CLAUDE.md`         | **Botaí** (`@pilutech/botai`), extensão MV3 para Chrome, Edge, Opera e Firefox (WXT + React 19 + `@piluvitu/ui`): gera a pessoa de teste e preenche formulários (atalho `Ctrl+Shift+Y`/`⌥⇧P`, popup, menu `Inserir`), content script sob demanda, aviso na página, 3 builds e o zip de fontes reproduzível da AMO, Vitest + Storybook próprio (6018) + Playwright      |
> | `apps/botai-site`    | `apps/botai-site/CLAUDE.md`    | Landing do Botaí em `botai.pilutech.com.br` (Next 16 + Tailwind 4 + `@piluvitu/ui`): `/`, `/privacidade` e `/termos`, e-mails com `[Botaí]` no assunto, lojas e fase lidas do CMS do `apps/web` no build, tema do sistema com alternância, SEO (metadata, OG, JSON-LD, sitemap, robots, manifest), Jest + Storybook (6019) + Playwright (3020), projeto Vercel próprio |
> | `apps/pilutech-site` | `apps/pilutech-site/CLAUDE.md` | Landing da PiluTech em `pilutech.com.br` (Next 16 + Tailwind 4 + `@piluvitu/ui`): uma página estática fiel ao design, WhatsApp por mensagem, e-mail com `[PiluTech]` no assunto, selo do Botaí lido do CMS do `apps/web`, SEO (metadata, OG, JSON-LD, sitemap, robots, manifest), Jest + Storybook (6020) + Playwright (3021), projeto Vercel próprio                  |
> | `packages/tools`     | `packages/tools/CLAUDE.md`     | `@piluvitu/tools` — lógica pura (TS, sem React/DOM) compartilhada pelo `/tools`                                                                                                                                                                                                                                                                                        |
> | `packages/ui`        | `packages/ui/CLAUDE.md`        | `@piluvitu/ui` — design system compartilhado: tokens, `cn()`, 14 componentes shadcn/ui (New York/Radix), consumidos por `apps/web`, `apps/financas/web`, `apps/botai`, `apps/botai-site` e `apps/pilutech-site`; publicado no npm (`publicar-ui.yml`)                                                                                                                  |

> **Regra de manutenção (global):** sempre que implementar uma nova tecnologia ou mudar um fluxo, atualize o `CLAUDE.md` **do workspace onde mexeu** (ou este, se for transversal) pra mantê-lo sempre atualizado.

## Tech Stack (visão geral)

Monorepo **pnpm** (workspaces) + **Go workspace** (`go.work`) com dez frentes:

- **`apps/web`** — **Next.js 16** (App Router), **React 19**, **TypeScript** strict, **Tailwind CSS 4** + **shadcn/ui**. Consome os tokens **e os componentes** do design system compartilhado de **`packages/ui`** (`@piluvitu/ui`) via `@import`/`@source` em `app/globals.css` + imports `@piluvitu/ui/<componente>`. **Storybook 10**. Hospedado na **Vercel** com ISR. → detalhes em `apps/web/CLAUDE.md`.
- **`apps/api`** — **Go 1.23**, **chi v5**, **SQLite** (`modernc.org/sqlite`, puro Go, sem CGo). Exposto hoje via **Cloudflare Tunnel**; destino futuro **Google Cloud Run** (`deploy-api.yml` pronto, fica skipado até `GCP_PROJECT_ID` ser cadastrado em Variables). Stack local LLM co-hospeda **Ollama** (nativo, GPU/Metal) + API + túnel via `process-compose` (`make stack`). → detalhes em `apps/api/CLAUDE.md`.
- **`apps/financas`** — **Cloudflare Worker** (Hono + D1 SQLite) servindo uma **SPA Vite + React 19** por Static Assets, em `financas.piluvitu.com.br`, protegida por login Google (**Better Auth** — o Cloudflare Access saiu do módulo). SPA no **Tailwind CSS 4** + **`packages/ui`** (`@piluvitu/ui`, mesmo design system do `apps/web`), via plugin Vite. Testes com `@cloudflare/vitest-pool-workers` (Worker) e Vitest/jsdom (SPA). → detalhes em `apps/financas/CLAUDE.md`.
- **`apps/ramielle`** — **Cloudflare Worker** (Hono + D1 SQLite), substituindo a API Go (`apps/api`) fatia a fatia — hoje: as **9** rotas de `/votacao` (sessões, votos, apuração, desempate e, desde a fatia ③, o sorteio via Google Sheets + enriquecimento TMDb) e as **3** de `/admin` (usuários, backups), todas com paridade de shape/código/mensagem contra a Go, com login Google (**Better Auth**, mesma lib do finanças, mas votação **LIVRE**: sem allowlist de acesso, oposto do finanças que é fail-closed de usuário único). Vai morar em `ramielle.piluvitu.com.br`; CORS explícito com credenciais porque `apps/web` mora em outra origem (`piluvitu.com.br`). Testes com `@cloudflare/vitest-pool-workers`. Nada em produção depende dele ainda — `apps/web` segue na Go. → detalhes em `apps/ramielle/CLAUDE.md`.
- **`apps/promeia`** — **Python 3.13** (FastAPI + uv), serviço local no MacBook do dono, atrás de túnel, para o que exige GPU/modelo local/disco — hoje o insight financeiro (lê agregados do ramielle, gera texto via **Ollama** local, publica de volta) e a transcrição de áudio (Whisper via `mlx-whisper`). **Segunda linguagem no monorepo** (a primeira além de TS/Go): custo aceito de propósito — segundo toolchain (`uv`), segundo runner de CI, segunda política de dependência (ver _Dependency security policy_ abaixo) — porque Whisper/pdfplumber/OCR são Python de referência, e Go foi descartado por ser a linguagem que está saindo do monorepo (ver `project-migrar-go-para-ts-worker` na memória). → detalhes em `apps/promeia/CLAUDE.md`.
- **`apps/botai`** — **Botaí** (`@pilutech/botai`), **extensão MV3 para Chrome, Edge, Opera e Firefox**, com o mesmo código (o Edge usa o build do Chrome; o Opera sai sem minificar), com **WXT 0.21.4** (Vite 7 + `@vitejs/plugin-react` 5, sem `@wxt-dev/module-react`), **React 19** e o design system **`@piluvitu/ui`** no popup. Gera uma pessoa brasileira de teste coerente (geradores e classificador de campo em `@piluvitu/tools`) e preenche o formulário da aba por `activeTab` + `scripting`, sem `host_permissions` em produção. Testes: **Vitest** (`WxtVitest` + `fakeBrowser`), **Storybook react-vite** próprio (porta 6018) e **Playwright** com a extensão desempacotada (`channel: 'chromium'`, build `--mode e2e`). Licença MIT, só nela e nos pacotes que ela empacota. Publicada nas 4 lojas pela PiluTech a partir da 1.0.0: tag `botai-v*` → GitHub Release + `wxt submit` com aprovação (ver "Publicação" em `apps/botai/CLAUDE.md`). → detalhes em `apps/botai/CLAUDE.md`.
- **`apps/botai-site`** — **Next.js 16** (App Router), **React 19**, **Tailwind CSS 4** e `@piluvitu/ui`: a landing do Botaí em `botai.pilutech.com.br`, todas as rotas estáticas, lojas e fase lidas do YAML do CMS do `apps/web` no build, regras de `@piluvitu/tools/pilulabs`. Projeto Vercel próprio (Root Directory `apps/botai-site`). → detalhes em `apps/botai-site/CLAUDE.md`.
- **`apps/pilutech-site`** — **Next.js 16** (App Router), **React 19**, **Tailwind CSS 4** e `@piluvitu/ui`: a landing da PiluTech em `pilutech.com.br`, uma página estática fiel ao design, com o selo do Botaí lido do YAML do CMS do `apps/web` no build e o e-mail com o projeto no assunto (`@piluvitu/tools/contato`). Projeto Vercel próprio (Root Directory `apps/pilutech-site`). → detalhes em `apps/pilutech-site/CLAUDE.md`.
- **`packages/tools`** — **`@piluvitu/tools`**, biblioteca de lógica pura em TS consumida pelo web, pela extensão e pelas landings do Botaí e da PiluTech (geradores, classificador de campos, `valorPara`). → detalhes em `packages/tools/CLAUDE.md`.
- **`packages/ui`** — **`@piluvitu/ui`**, design system compartilhado (tokens + `cn()` + 14 componentes shadcn/ui, um export por subpath, sem barrel; no monorepo os apps leem o código-fonte, e o npm recebe o build do `dist` pelo `publishConfig`), consumido por `apps/web` (webpack/Turbopack), `apps/financas/web` (Vite), o popup de `apps/botai` (WXT/Vite), `apps/botai-site` e `apps/pilutech-site` (Next). → detalhes em `packages/ui/CLAUDE.md`.
- **GitHub Actions** — CI (`ci.yml`) bloqueia PR; `deploy-api.yml` aguarda credenciais GCP; `trivy.yml` para scan de segurança; `botai-e2e.yml` e `botai-release.yml` para a extensão; `publicar-ui.yml` publica o `@piluvitu/ui` no npm por tag `ui-v*`.

## Dependency security policy

This section is about the **pnpm** side of the monorepo (`apps/web`, `apps/financas`, `apps/botai`, `apps/botai-site`, `apps/pilutech-site`, `packages/*`). The Python side (`apps/promeia`) has its own rules, listed separately below — the two toolchains don't share a policy.

- **pnpm ≥ 11 required.** pnpm 11 blocks lifecycle scripts by default (supply-chain defense).
- **Adding a dependency that needs install scripts:** add it explicitly to `allowBuilds` in `pnpm-workspace.yaml`. Never set `dangerouslyAllowAllBuilds: true`.
- **`minimumReleaseAge: 1440`** (set in `pnpm-workspace.yaml`): pnpm skips versions published less than 24 h ago, giving the community time to detect and report malicious releases.
- Run `pnpm audit` periodically and before releases.
- ⚠️ **`pnpm update -r <pkg>` leaves the TRANSITIVE copies of `<pkg>` untouched when `<pkg>` is also a direct dependency of some workspace** — exit 0, nothing changes. One such name in the list turns the whole command into a no-op: `pnpm update -r lodash nanoid` didn't update `lodash` either (measured during the Trivy remediation, 2026-10-01, with `nanoid` direct in `apps/web`). What worked: drop the direct entry from that `package.json`, run `pnpm update -r <pkg>`, put the entry back, `pnpm install`. Always check the result in `pnpm-lock.yaml`, not in pnpm's output.
- ⚠️ **The flip side of the trap above: a bump can leave TWO copies of a package that must be a singleton.** `pnpm update -r` in the Trivy PR (#46) raised `@codemirror/state`/`@codemirror/view` for the transitive consumers (`@codemirror/search`, `theme-one-dark`) while the direct `@codemirror/view` stayed old: two instances, and the `/admin/posts` editor broke at runtime ("Unrecognized extension value in extension set") with every check green, because CI doesn't run the web E2E. Fix: `pnpm dedupe` (only collapses duplicates onto versions already in the lock; check the diff). Guard: `apps/web/components/admin/posts/mdx-editor.codemirror.test.ts` fails the Jest run when the lockfile has more than one version of either package. After any dependency bump, run `pnpm dedupe --check`; and after a dedupe, delete `apps/web/.next` before trusting `next dev` (its cache kept serving the old copies and made the fixed lock look broken).

**Python (`apps/promeia`):** `uv.lock` is committed, and CI/reproducible installs always use `uv sync --locked` (errors out if the lock is stale instead of silently resolving a new version — the exact equivalent of `pnpm install --frozen-lockfile`; `--frozen` is weaker, see gotcha below). **There IS a Python equivalent of `minimumReleaseAge`, and it's on:** `exclude-newer = "24 hours"` under `[tool.uv]` in `apps/promeia/pyproject.toml` — same friendly-duration cooldown window as pnpm's `minimumReleaseAge: 1440`, just spelled differently because `uv` takes a duration string instead of minutes. `uv lock`/`uv sync` refuse to resolve any version published in the last 24h; this was proven to bite for real once already (`fastapi` had to be pinned down from `0.140.7` to `0.140.0` because `0.140.7` fell inside the window — see the comment above `fastapi` in `apps/promeia/pyproject.toml`).

⚠️ **`uv sync --frozen` vs `--locked`:** `--frozen` installs from the lock as-is, with no check that it still matches `pyproject.toml` — an edited dependency without a re-lock passes silently. `--locked` errors instead. Use `--locked` wherever the intent is "reproducible install, fail if the lock drifted" (CI, this policy); `--frozen` is only for the rare case of deliberately installing a lockfile you know is stale.

## Commands

Todos os comandos rodam da raiz do monorepo usando **pnpm** ou **make**.

| Comando                                 | Propósito                                                                                                               |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `make dev`                              | Dev server web + Go API + Storybook em paralelo (`-j3`)                                                                 |
| `make dev-web`                          | Só o Next.js em http://localhost:3333                                                                                   |
| `make dev-api`                          | Go API com **hot reload** (air)                                                                                         |
| `make storybook`                        | Só o Storybook em http://localhost:6017                                                                                 |
| `make stack`                            | Sobe **Ollama + Go API + Cloudflare Tunnel** via `process-compose` (stack local LLM)                                    |
| `make stop`                             | Libera as portas 8081/8082/3333/6017/3018/6018/3020/6019/3021/6020 se travarem                                          |
| `make build-api`                        | Compila binário Go API em bin/api                                                                                       |
| `make build-cli`                        | Compila CLI Go em bin/piluvitu                                                                                          |
| `make dev-ramielle`                     | Worker ramielle (Hono + D1) via `wrangler dev` em http://localhost:8788                                                 |
| `make test-ramielle`                    | `pnpm --filter @piluvitu/ramielle test`                                                                                 |
| `make dev-promeia`                      | Serviço Python (FastAPI) local com `--reload` em http://localhost:8082                                                  |
| `make promeia-servico`                  | LaunchAgent: promeia sobe no login e reinicia se cair (+ OrbStack/túnel no login)                                       |
| `make test-promeia`                     | `cd apps/promeia && uv run pytest`                                                                                      |
| `make lint-promeia`                     | `uv run ruff check .` + `uv run ruff format --check .` (apps/promeia)                                                   |
| `make insight`                          | Gera e publica o insight financeiro (`promeia-insight`) — exige Ollama + tokens                                         |
| `make dev-botai`                        | `wxt dev` (servidor 3018); carregue `apps/botai/.output/chrome-mv3-dev` sem empacotar. O dev esconde bug de `activeTab` |
| `make build-botai`                      | `wxt build` + gate do `@source` em `.output/chrome-mv3`                                                                 |
| `make test-botai`                       | Vitest da extensão                                                                                                      |
| `make test-e2e-botai`                   | builds de Chrome, Firefox e Opera + build `--mode e2e` + Playwright com a extensão desempacotada                        |
| `make zip-botai`                        | Os 3 pacotes do Botaí (Chrome e Edge, Firefox, Opera) + o zip de fontes da AMO em apps/botai/.output/                   |
| `make versao-botai V=x.y.z`             | PR de versão do Botaí (branch da `origin/main`, bump sem tag, `gh pr create`)                                           |
| `make release-botai`                    | Na `main`, depois do merge: tag anotada `botai-v<versão>` + push (dispara o `botai-release.yml`)                        |
| `make capturas-botai`                   | Imagens das lojas do Botaí + cópias para o `apps/web` e o `apps/botai-site` (rode no Mac)                               |
| `make storybook-botai`                  | Storybook da extensão em http://localhost:6018                                                                          |
| `make dev-botai-site`                   | `next dev` em http://localhost:3020                                                                                     |
| `make build-botai-site`                 | `next build` + gate do `@source` + conferência das rotas estáticas                                                      |
| `make test-botai-site`                  | Jest + `node --test`                                                                                                    |
| `make test-e2e-botai-site`              | 2 builds de produção (YAML de teste, depois o CMS real) + `next start` na 3020 + Playwright (com `CI=1`)                |
| `make storybook-botai-site`             | Storybook em http://localhost:6019                                                                                      |
| `make dev-pilutech-site`                | `next dev` em http://localhost:3021                                                                                     |
| `make build-pilutech-site`              | `next build` + gate do `@source` + conferência das rotas estáticas                                                      |
| `make test-pilutech-site`               | Jest + `node --test`                                                                                                    |
| `make test-e2e-pilutech-site`           | build de produção + `next start` na 3021 + Playwright (com `CI=1`), em duas passadas: loja publicada e CMS real         |
| `make storybook-pilutech-site`          | Storybook em http://localhost:6020                                                                                      |
| `make test`                             | Todos os testes (pnpm -r test + go test + **uv run pytest** do promeia)                                                 |
| `make lint`                             | ESLint + go vet + **ruff** (check + format --check) do promeia                                                          |
| `pnpm --filter @piluvitu/web dev`       | Dev Next.js direto                                                                                                      |
| `pnpm --filter @piluvitu/web build`     | Build Next.js                                                                                                           |
| `pnpm --filter @piluvitu/web storybook` | Storybook em 6017                                                                                                       |
| `pnpm --filter @piluvitu/web test:e2e`  | Playwright E2E                                                                                                          |
| `pnpm -r test`                          | Testes de todos os workspaces                                                                                           |

> ⚠️ **`pnpm -r <script>` (test/lint/etc.) pula silenciosamente qualquer workspace cujo `package.json` não declare esse script** — sem erro, sem aviso, só ausente do output (`Scope: N of 6 workspace projects` mostra menos que o total). Ao criar um workspace novo (ou copiar um `package.json` de outro), conferir se `lint`/`test` estão de fato declarados — não assumir que "não apareceu erro" significa "passou". Esse foi exatamente o defeito achado e corrigido no fix round 1 da Task 3 do design system (`packages/ui` migrou 14 componentes React sem nenhum `lint` script por um tempo, e `pnpm -r lint` seguia saindo verde).

**Type checking without full build:** `pnpm exec tsc --noEmit` (from `apps/web/`)

**Recommended order before commit/PR:** `pnpm prettier:fix` → `pnpm lint` → `make test` → `pnpm --filter @piluvitu/web build`

> Gotchas/comandos específicos de cada frente: **web** (incl. a pegadinha do `implicit-any` da Vercel) em `apps/web/CLAUDE.md`; **Go hot reload (air)** em `apps/api/CLAUDE.md`.

### Gate do design system: `scripts/check-tailwind-source.mjs`

Script transversal (raiz, não pertence a nenhum app) que confirma, no CSS **emitido** de um build, que a classe sentinela definida em `packages/ui/src/styles.css` (`.ui-sentinela-nao-remover`) sobreviveu. Ela só sobrevive se o app consumidor tiver `@source '<caminho para packages/ui/src>'` no seu CSS de entrada — sem isso o Tailwind v4 **não quebra o build**, só descarta silenciosamente toda classe exclusiva de `packages/ui` (não só a sentinela).

```
node scripts/check-tailwind-source.mjs <diretório-ou-glob-de-css-emitido>
```

Aceita um diretório (busca recursiva por `*.css`, ex.: `apps/web/.next`) ou um glob de um nível (ex.: `"apps/financas/web/dist/assets/*.css"`) — pensado pra funcionar tanto com o output do Next (`.next/`) quanto do Vite (`dist/assets/`).

- **Amarrado em:** `apps/web/package.json` → scripts `build` **e** `build:ci` (ambos `next build && node ../../scripts/check-tailwind-source.mjs .next`) — roda tanto no CI de PR (`ci.yml` chama `build:ci`) quanto no build de produção da Vercel (`pnpm build`). Também em `apps/financas/web/package.json` → script `build` (`vite build && node ../../../scripts/check-tailwind-source.mjs "dist/assets/*.css"` — reuso do mesmo script/sentinela, Task 4 do plano `docs/superpowers/plans/2026-07-26-financas-ui-design-system.md`). E em `apps/botai/package.json` → `build` (`wxt build && node ../../scripts/check-tailwind-source.mjs .output/chrome-mv3`): a pasta exata, nunca `.output` inteira, porque um `chrome-mv3-e2e` antigo carrega o CSS de outro build e dá falso positivo. Os scripts `build:firefox`, `build:opera` e `zip`/`zip:*` do Botaí rodam o mesmo gate em `.output/firefox-mv3` e `.output/opera-mv3`. E em `apps/botai-site/package.json` → `build` (`next build && node ../../scripts/check-tailwind-source.mjs .next && node scripts/conferir-rotas-estaticas.mjs`). E em `apps/pilutech-site/package.json` → `build`, igual ao do `apps/botai-site`.
- **Amarrado no `build`, nunca no `dev`, de propósito**: o Vite `dev` server mente sobre `@source` quebrado (mostra as classes certas mesmo sem ele; só o `build` real usa os content roots declarados), o Next `dev` não mente. Ver "Gate do design system: `@source`, o sentinela, e a assimetria dev/prod" em `packages/ui/CLAUDE.md` pra a história completa, com evidência medida dos dois lados.
- ⚠️ **M4 (fix final, achado da revisão pré-deploy do branch de finanças): a varredura recursiva de `.css` excluía `node_modules`/`cache` mas não `dev`.** `.next/dev/static/css/app/...` guarda CSS de uma sessão `next dev` ANTERIOR (persiste entre execuções — não é limpo por `next build`). PROVADO por reprodução: um `.next/dev/.../layout.css` remanescente contendo a sentinela, somado a um `.next/static/.../layout.css` real (do build atual) SEM ela — simulando `@source` quebrado —, dava `exit 0` (falso positivo), porque a checagem é `cssFiles.some(...)` e bastava UM arquivo bater. CI/Vercel não eram afetados (checkout limpo, sem `.next/dev` de sessão anterior nenhuma); o alvo era o run LOCAL, exatamente o que um dev roda logo depois de mexer em `@source` achando que está confirmando o build atual. Corrigido filtrando qualquer segmento de path `dev`, mesmo padrão de `node_modules`/`cache` — confirmado que o mesmo cenário agora sai com `exit 1`, apontando só pro CSS real.

### Imagens do Botaí nos sites

`apps/web/public/pilulabs/botai/icone-128.png` (o logo do card da PiluLabs) e, no `apps/botai-site`, `public/icone-128.png`, `app/icon.png`, `app/apple-icon.png` e `public/capturas/<NN>-<cena>-<tema>.png` são gerados por `make capturas-botai`, no `apps/botai` (o mesmo gerador das imagens das lojas, `apps/botai/loja/`, lista `COPIAS` de `loja/pecas.ts`), e versionados. Os sites só os leem. Não edite esses PNG à mão; o `apps/botai/loja/imagens.test.ts` falha se alguma cópia divergir da da loja. O `/favicon.ico` do `apps/botai-site` não é cópia: ele empacota no build os ícones de 16, 32 e 48 px da extensão (`apps/botai/public/icon/`).

### Pre-commit hook (lint-staged)

`.husky/pre-commit` roda **`pnpm exec lint-staged`** — formata/linta só os arquivos staged (antes era `prettier --write "**/*"`, que varria o repo inteiro incluindo `.next/`). Configs em seis níveis (lint-staged usa a mais próxima de cada arquivo, com cwd no diretório dela — comportamento documentado do próprio pacote, não algo amarrado à mão: "the directory of each config file will be used as the working directory for those tasks"):

- **Root `package.json`** → `*.{js,ts,tsx,json,md,css}: prettier --write` (arquivos da raiz / fora de apps/web e apps/promeia). `prettier` + `prettier-plugin-tailwindcss` estão nas devDeps do root pra resolverem onde o hook roda.
- **`apps/web/package.json`** → `*.{ts,tsx}: [eslint --fix, prettier --write]` e demais assets só prettier. Fica em apps/web (não no root) porque o ESLint 9 flat config (`eslint.config.mjs`) e o plugin tailwind precisam resolver com cwd em apps/web.
- **`apps/botai/package.json`** → mesma config do `apps/web` (`*.{ts,tsx}: [eslint --fix, prettier --write]`, demais assets só prettier), e pelo mesmo motivo: o `eslint.config.mjs` flat da extensão só resolve com cwd em `apps/botai`.
- **`apps/botai-site/package.json`** → a mesma config do `apps/web` (`*.{ts,tsx}: [eslint --fix, prettier --write]`), pelo mesmo motivo: o ESLint flat do app só resolve com cwd nele.
- **`apps/pilutech-site/package.json`** → a mesma config do `apps/botai-site`, pelo mesmo motivo.
- **`apps/promeia/.lintstagedrc.json`** → `*.py: [uv run ruff check --fix, uv run ruff format]`. Arquivo `.lintstagedrc.json` avulso, não uma entrada em `package.json` — `apps/promeia` não tem (nem precisa de) `package.json`. Fica ali, e não na raiz, pelo mesmo motivo do apps/web: `uv run` resolve o projeto Python a partir do cwd, então rodar com cwd na raiz não acharia o `pyproject.toml`/venv de `apps/promeia`. Provado rodando de verdade: um `.py` mal formatado, `git add` + `git commit`, teve o hook reformatando-o antes do commit fechar.

Os scripts `prettier:fix` / `lint` seguem pra formatação/lint full manual (e CI).

## Comentários: raros, e só onde o código não alcança (lei do projeto)

**Comentário em código de PRODUÇÃO é exceção.** O teste é o lugar de explicar intenção e travar comportamento; produção é o lugar de o código falar por si. Nome bom, função pequena e teste com nome descritivo substituem quase todo comentário.

Escreva um comentário só quando as **três** forem verdadeiras:

1. registra um **porquê** que o código não consegue mostrar — uma armadilha medida, uma divergência deliberada de um padrão vizinho, um limite externo imposto por terceiro;
2. **sua ausência levaria alguém a "consertar" o código e quebrá-lo**;
3. não cabe melhor num nome, num teste, neste arquivo ou na mensagem do commit.

**Não escreva:** o que o código já diz; narrativa da sessão ("antes era X, aí medi Y"); tabelas e números medidos (vão para o `CLAUDE.md` do workspace); aviso decorativo; repetição do que já está no commit.

**Tamanho:** uma a três linhas. Se virou parágrafo, o fato pertence ao `CLAUDE.md` — o código no máximo aponta para a seção (`ver "Nome da seção" no CLAUDE.md`).

⚠️ é reservado para **a armadilha que corrompe dado sem dar erro**. Usado em tudo, para de significar qualquer coisa — que foi exatamente o que aconteceu com o módulo do Pluggy antes desta regra existir (43–49% de linhas de comentário em `lib/pluggy.ts`, `routes/pluggy.ts` e `web/src/lib/pluggy.ts`; 116 marcadores ⚠️).

O teste segue livre: lá o comentário explica o cenário e por que a asserção existe, e isso é desejável.

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

## Testes de carga e concorrência (lei do projeto)

A máquina de dev é um MacBook Air M4 com **24 GB e 10 núcleos**, e roda workflows de subagentes sem supervisão. Em 2026-10-06 um stress test de subagente subiu ~2.400 `node` ao mesmo tempo (~130 MB cada) e o Mac travou até ser desligado no botão.

Todo teste que dispara processos em paralelo (stress de pipe/`EPIPE`, fuzz, benchmark, `for … &`) segue três limites:

1. **No máximo 10 processos vivos ao mesmo tempo, somando tudo.** Os `&` do shell multiplicam o paralelismo de dentro do script. Use um pool de verdade (N workers puxando de uma fila). `Promise.all(Array.from({ length: 8 }, f))` dentro de um loop **não** é lote: `Array.from` chama `f` na hora, e os N filhos sobem juntos.
2. **Meça um processo antes de escalar.** O "peak memory footprint" de `/usr/bin/time -l <cmd>`, vezes a concorrência, tem que ficar abaixo de ~12 GB (metade da RAM).
3. **Escale em degraus de ×2**, conferindo a memória (`memory_pressure`) a cada degrau. Nunca ×12 de uma vez.

⚠️ **O macOS não se defende sozinho:** sem memória, o kernel só suspende **apps** (Chrome, Warp, Terminal…). Um processo de CLI filho de terminal nunca é suspenso, então a máquina para tudo menos o culpado e trava.

## Environment variables

Fontes separadas por frente — a lista completa de cada uma vive no `CLAUDE.md` do app:

- **Web** (`apps/web/.env.example`) — `NEXT_PUBLIC_*`, `BLOG_REPO_*`, `KEYSTATIC_GITHUB_*`, `ADMIN_TOKEN_SECRET`, `NEXT_PUBLIC_API_URL`. → seção _Environment variables_ em `apps/web/CLAUDE.md`.
- **API** (`apps/api/.env.example`) — `GOOGLE_OAUTH_*`, `SQLITE_PATH`, `CORS_ALLOWED_ORIGINS`, `GSHEETS_*`, `TMDB_API_KEY`, `GDRIVE_*`, `SESSION_COOKIE_SECURE`, `ADMIN_EMAILS`, `WEB_REDIRECT_URL`. → seção _Environment variables_ + _Domínios de prod (same-site cookie)_ em `apps/api/CLAUDE.md`.

## CI / CD

### Workflows GitHub Actions

| Workflow            | Trigger                                                                                                                                                                                                                      | Faz o quê                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`            | PR + push em `main`                                                                                                                                                                                                          | Em paralelo, **sete** jobs: web (`lint` + `lint`/`test` de `packages/ui` + `lint` (`tsc --noEmit`)/`jest` de `packages/tools` + `tsc --noEmit` + `jest` + `next build:ci`, gate do `@source` incluso), financas (`tsc --noEmit` do Worker e do SPA + build do SPA — os dois gates, `@source` e lazy-chart, inclusos — + `vitest` dos dois), ramielle (`tsc --noEmit` + `vitest` — Worker sem SPA, sem gate de build), promeia (`uv sync --locked` + `ruff check` + `ruff format --check` + `pytest`), botai (`wxt prepare` + `tsc --noEmit` + `eslint` + `vitest` + `wxt build` de Chrome, Firefox e Opera, cada um com o gate do `@source`, + `web-ext lint` no Firefox) e botai-site (`eslint` + `tsc --noEmit` + Jest + `node --test` + `next build` com o gate do `@source` e a conferência das rotas estáticas; o E2E roda local) e pilutech-site (os mesmos passos do botai-site; o E2E roda local). O E2E da extensão roda fora do `CI`, no workflow `botai-e2e.yml`. O job `api` (Go) saiu em 2026-08-14. |
| `botai-e2e.yml`     | push/PR em `main` que toca `apps/botai/**`, `packages/tools/**` ou o próprio workflow + dispatch                                                                                                                             | Instala o Chromium do Playwright (`--with-deps --no-shell`) e roda o `test:e2e` da extensão: builds de produção de Chrome, Firefox e Opera, build `--mode e2e` e Playwright com a extensão desempacotada. Fica fora do `CI` de propósito: o deploy do finanças espera o `CI` passar, e este E2E não pode segurá-lo.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `botai-release.yml` | PR em `main` que toca `apps/botai/**`, `packages/tools/**`, `packages/ui/**`, os arquivos da raiz do zip de fontes ou o próprio workflow; tag `botai-v*`; dispatch (`lojas`: `nenhuma`/`dry-run`/`submeter`, `adiar_chrome`) | `pacotes` (`ubuntu-24.04`): lint + Vitest + `zip` dos 3 navegadores com os gates + `web-ext lint` + reprodução do pacote do Firefox a partir do zip de fontes no Node 24.14.0 (`cmp` byte a byte), artifact `botai-zips`; na tag, confere tag = `botai-v<versão>` e commit na `main`. `release` (só na tag, único com `contents: write`): GitHub Release com os 4 zips, `--latest=false`. `lojas`: `wxt submit` para Chrome (API v2), AMO e Edge atrás do environment `lojas-botai` (aprovação manual), só as lojas com secrets; no PR roda sem environment, só imprime os comandos e roda o `actionlint`. Fora do `CI` para não segurar o deploy do finanças.                                                                                                                                                                                                                                                                                                                                                    |
| `publicar-ui.yml`   | push de tag `ui-v*`                                                                                                                                                                                                          | `pacote`: confere tag = `ui-v<versão de packages/ui/package.json>` e commit na `main`, `lint` + `test` do `@piluvitu/ui` (build e conferência do pacote inclusos), `pnpm pack`, artifact `pacote-ui`. `publicar` (environment `npm`, aprovação do dono, único com `id-token: write`): extrai o tarball e roda `npm publish <pasta> --access public --provenance` no Node 24.14.0 (trusted publishing, sem token).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `deploy-api.yml`    | push em `main` que toca `apps/api/**` + dispatch                                                                                                                                                                             | Build da imagem com `apps/api/Dockerfile`, push pra Artifact Registry, deploy no Cloud Run (min=0, max=3, 256Mi, 1 vCPU).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `trivy.yml`         | push/PR em `main` + cron semanal                                                                                                                                                                                             | Scan de filesystem, secrets (estrito) e misconfig — sobe SARIF pra aba Security.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

### Secrets/Vars necessários no GitHub (Settings → Secrets and variables → Actions)

**Variables** (não são secretas, ficam em "Variables"):

- `GCP_PROJECT_ID` — ID do projeto GCP (ex.: `piluvitu-prod`)
- `GCP_REGION` — região do Cloud Run (ex.: `southamerica-east1`)
- `AR_REPOSITORY` — nome do repositório Artifact Registry (ex.: `api`)
- `CLOUD_RUN_SERVICE` — nome do serviço Cloud Run (ex.: `piluvitu-api`)

**Secrets**:

- `GCP_WORKLOAD_IDENTITY_PROVIDER` — recurso completo do provider WIF (`projects/NNN/locations/global/workloadIdentityPools/POOL/providers/PROVIDER`)
- `GCP_DEPLOY_SA_EMAIL` — e-mail da service account de deploy (ex.: `deployer@PROJECT.iam.gserviceaccount.com`)

**Environment `lojas-botai`** (Settings → Environments; revisor obrigatório = o dono; branches e tags: `main` e `botai-v*`), usado só pelo job `lojas` do `botai-release.yml`:

- Secrets: `CHROME_SERVICE_ACCOUNT_PRIVATE_KEY` (PEM da chave JSON da service account), `FIREFOX_JWT_ISSUER`, `FIREFOX_JWT_SECRET`, `EDGE_CLIENT_ID`, `EDGE_API_KEY` (expira; a data aparece no Partner Center)
- Variables: `BOTAI_CHROME_EXTENSION_ID`, `CHROME_PUBLISHER_ID`, `CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL`, `BOTAI_EDGE_PRODUCT_ID`

**Environment `npm`** (revisor obrigatório = o dono, sem "Prevent self-review"; branches e tags: só a regra de tag `ui-v*`), usado só pelo job `publicar` do `publicar-ui.yml`. Sem secrets: no npmjs.com, pacote `@piluvitu/ui` → Settings → Trusted publisher → GitHub Actions com `PiluVitu` / `PiluVitu-Dev` / `publicar-ui.yml` / environment `npm`; depois, "Require two-factor authentication and disallow tokens".

### Vercel

- **Root Directory:** `apps/web`
- **Install Command:** `pnpm install --frozen-lockfile` (Vercel detecta `pnpm-workspace.yaml` na raiz automaticamente)
- **Build Command:** `pnpm build` (runs `next build`)
- **Output Directory:** `.next` (default)
- **Node version:** 22.x
- **Env vars:** copiar de `apps/web/.env.example` (todas as `NEXT_PUBLIC_*`, `BLOG_REPO_*`, `KEYSTATIC_GITHUB_REPO`, `KEYSTATIC_GITHUB_CLIENT_ID`, `KEYSTATIC_GITHUB_CLIENT_SECRET`, `ADMIN_TOKEN_SECRET`; apenas `KEYSTATIC_SECRET` e `NEXT_PUBLIC_KEYSTATIC_GITHUB_APP_SLUG` foram removidos no slice ⑤)
- **NEXT_PUBLIC_API_URL:** apontar pra URL do Cloud Run depois do primeiro deploy
- **Landing do Botaí:** desde 2026-10-06 o projeto `botai-site` publica a partir do repo `PiluVitu/Botai` (Root Directory `site`; passo C9 do plano da fase 0). O `apps/botai-site` daqui não gera mais deploy e sai do monorepo na Parte D desse plano.
- **Landing da PiluTech:** projeto à parte (`pilutech-site`), Root Directory `apps/pilutech-site`, com o "Skip deployments" desligado e o `ignoreCommand` do `apps/pilutech-site/vercel.json`; domínios `pilutech.com.br` e `www` (308 para o apex), que saíram do projeto do `apps/web` (ver "Deploy" em `apps/pilutech-site/CLAUDE.md`).
