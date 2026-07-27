# CLAUDE.md — `packages/ui` (`@piluvitu/ui`)

Guidance for the **shared design system package**. O Claude Code carrega este arquivo **junto** com o `CLAUDE.md` da raiz. Consumido por `apps/web` (Task 3 do plano `docs/superpowers/plans/2026-07-26-financas-ui-design-system.md`) e, desde a Task 4, por `apps/financas/web` (SPA Vite) — ver `apps/financas/CLAUDE.md` § _SPA_ para os detalhes do lado Vite.

## Propósito

`@piluvitu/ui` centraliza o **design system** compartilhado: tokens (cores, radius, fontes, keyframes — `src/styles.css`), o helper `cn()`, e os **14 componentes shadcn/ui** (New York style, sobre Radix primitives) que eram exclusivos de `apps/web/components/ui/`.

## Estrutura

- **Sem barrel `index.ts` — um export por arquivo.** Um barrel forçaria qualquer bundler a puxar os 14 componentes pra usar 1 só; o `apps/financas/web` (Task 4) vai consumir poucos. `package.json` → `exports` mapeia cada subpath (`@piluvitu/ui/button`, `/card`, `/badge`, …) direto pro `.tsx` cru em `src/` — nada é pré-compilado/emitido (`"noEmit": true` no `tsconfig.json`; o bundler de cada app consumidor faz a transpilação).
- **`src/cn.ts`** — `cn()` (clsx + tailwind-merge). Guarda o comentário-sentinela do gate (`scripts/check-tailwind-source.mjs`, raiz) — nunca apagar, nunca copiar o literal pra dentro de nenhum `apps/*` (nem em doc): ver `SENTINEL_SELECTOR` no script.
- **`src/styles.css`** — tokens do Design System V2 (`@theme`, `:root`/`.dark`) + a `@utility` da sentinela.
- **Os 14 componentes** (`aspect-ratio`, `avatar`, `badge`, `button`, `card`, `command`, `dialog`, `dropdown-menu`, `form`, `input`, `label`, `separator`, `skeleton`, `textarea`) — imports internos entre eles são **relativos** (`./cn`, `./dialog`, `./label`), nunca via `@piluvitu/ui/...` (evita resolver o próprio pacote via `node_modules`).
- ⚠️ **`button.tsx` — `cursor-pointer` (fix round 1, achado da Task 9 do financas) faltava na string base do `buttonVariants` (`cva`).** As antigas 58 linhas de CSS à mão de `apps/financas/web` (`button { cursor: pointer }`) escondiam essa lacuna; quando essa SPA migrou pro componente `Button` de verdade, o cursor default do navegador (não a mãozinha de clique) apareceu em todo botão — e como o componente é **compartilhado**, `apps/web` também estava exposto, só que ninguém tinha notado porque nenhuma das telas de lá dependia de um `button` cru pra comparar. Corrigido acrescentando `cursor-pointer` à string base — `disabled:pointer-events-none` (já presente) continua bloqueando o clique no estado desabilitado independente do ícone do cursor. `apps/web` (jest + tsc) reexecutado depois da mudança — verde, sem teste dependente do cursor.
- **`sonner.tsx` NÃO mora aqui** — fica em `apps/web/components/ui/sonner.tsx` porque é o único componente acoplado a `next-themes` (`useTheme()`); trazê-lo obrigaria o pacote a carregar um provider que a SPA do finanças (Vite, sem `next-themes`) não tem como suprir. Ele importa `cn` de `@piluvitu/ui/cn` como os demais.

## Dependências

`react` é **peerDependency** (`^19.2.4` — cada app consumidor traz sua própria cópia). Os Radix primitives, `class-variance-authority`, `clsx`, `cmdk`, `react-hook-form` e `tailwind-merge` são **dependencies** diretas do pacote, nas mesmas versões que `apps/web` já usava antes da migração (conferir contra `apps/web/package.json` ao bumpar). `@types/react` é **devDependency** — necessário pro `tsc` de qualquer consumidor conseguir checar os `.tsx` crus deste pacote (sem isso, `React.HTMLAttributes`/JSX ficam `any` silenciosamente em quem importa).

## Testes

Só `cn.test.ts` hoje (`jest` + `jest-environment-jsdom`, config em `jest.config.ts`). Os 14 componentes **nunca tiveram** `.test.tsx`/`.stories.tsx` próprios em `apps/web/components/ui/` — a migração não criou nenhum (lei de colocation não foi violada: não havia o que colocar). Se algum componente ganhar teste/story no futuro, colocation vale aqui também (`button.tsx` → `button.test.tsx`/`button.stories.tsx` dentro de `src/`).

- **Rodar:** `pnpm --filter @piluvitu/ui test` ou `pnpm -r test` / `make test` na raiz.
- **Não roda no `ci.yml`** hoje (só `apps/web` e `packages/tools` têm step de teste dedicado) — gap conhecido, não fechado nesta task; ver "Concerns" do report da Task 3.

## Lint

`eslint.config.mjs` **próprio** do pacote — não estende o de `apps/web` (que é Next-specific: `@next/eslint-plugin-next`, `@tanstack/eslint-plugin-query`, `eslint-plugin-storybook`, nenhum dos quais faz sentido aqui). Cobre `eslint-plugin-react` + `eslint-plugin-react-hooks` (`rules-of-hooks`, `exhaustive-deps`) + `@typescript-eslint/no-unused-vars` + um subconjunto de `eslint-plugin-jsx-a11y`.

**Por que um subconjunto de a11y, não o `recommended` inteiro do plugin:** o `recommended` completo inclui `jsx-a11y/heading-has-content`, que dá falso positivo em componentes `forwardRef` cujo `children` só chega via props/spread (`CardTitle`, `<h3 {...props} />`) — nunca aparece como filho JSX literal. O subconjunto usado (`alt-text`, `aria-props`, `aria-proptypes`, `aria-unsupported-elements`, `role-has-required-aria-props`, `role-supports-aria-props`) e o override `react/no-unknown-property: off` (o atributo customizado `cmdk-input-wrapper` de `command.tsx`) são **exatamente** os que `eslint-config-next/index.js` já aplicava a estes arquivos antes do move — o objetivo é restaurar a cobertura que existia, não inventar regra nova que os arquivos já existentes nunca passaram por.

**Antes desta correção, `pnpm -r lint` pulava `packages/ui` silenciosamente** (workspace sem script `lint` → `pnpm -r` simplesmente não roda nada nele, sem erro, sem aviso — a mesma armadilha que o `CLAUDE.md` da raiz já documenta pra outros contextos). Os 14 componentes ficaram sem `react-hooks/rules-of-hooks`, `exhaustive-deps`, `no-unused-vars` ou a11y verificados por um tempo depois da Task 3 até este fix. Prova de que a regra pega de verdade (não é um script que "passa" porque não linta nada): um import não usado (`@typescript-eslint/no-unused-vars`) e um hook chamado condicionalmente (`react-hooks/rules-of-hooks`) foram introduzidos de propósito num componente, confirmados como `error`/exit 1, e revertidos.

- **Rodar:** `pnpm --filter @piluvitu/ui lint` ou `pnpm -r lint` / `make lint` na raiz.
- **Amarrado em `ci.yml`:** step "Lint (ui package)" no job `web`.

## Consumo pelos apps

- **`apps/web`** — `app/globals.css` importa `@piluvitu/ui/styles.css` + declara `@source '../../../packages/ui/src'` (obrigatório pro Tailwind v4 enxergar as classes exclusivas do pacote — ver "Gate do design system" no `CLAUDE.md` da raiz). Imports de componente: `@piluvitu/ui/<nome>` (ex.: `import { Button } from '@piluvitu/ui/button'`). **Medido:** Next/Turbopack consome os `.tsx` crus do pacote (incl. `'use client'` e JSX) sem precisar de `transpilePackages: ['@piluvitu/ui']` em `next.config.mjs` — testado com build real (Task 3).
- **`apps/financas/web`** (Task 4) — mesmo padrão de import por subpath, mas via **plugin Vite** (`@tailwindcss/vite`), não PostCSS (é uma SPA Vite, não Next). `src/styles.css` importa `@piluvitu/ui/styles.css` + `@source '../../../../packages/ui/src'` (4 `../`, um a mais que o `apps/web` — o arquivo de entrada mora um nível mais fundo). Gate amarrado no `build` (`vite build && node .../scripts/check-tailwind-source.mjs "dist/assets/*.css"`) — roda tanto no `build:web` direto quanto via `pretest`/`deploy` de `@piluvitu/financas`. **Medido, não presumido:** o par falha (build com `@source` comentado passa em silêncio, gate falha)/passa (`@source` restaurado, os dois passam) foi provado real antes do commit; `optimizeDeps.exclude` do `vite.config.ts` **não** precisou incluir `@piluvitu/ui` (testado com um componente de verdade, `@piluvitu/ui/button`, contra o dev server — resolve via `/@fs/...` como fonte, deps transitivas pré-bundleiam normalmente). Na Task 4, nenhum dos 14 componentes ainda era consumido (só os tokens/CSS). **A Task 9 mudou isso**: `Card`/`CardHeader`/`CardTitle`/`CardContent`, `Button`, `Input` e `Label` passaram a ser importados de verdade pelas 5 telas antigas + `App.tsx`/`Gate.tsx` (ver `apps/financas/CLAUDE.md` § _Task 9_) — o pacote não tem `Select` nem `Table` (nenhum dos 14), então `<select>`/`<table>` nativos continuam sendo estilizados à mão com as classes Tailwind de `Input` copiadas (mesmo padrão que `BlocoCategorias.tsx`, Task 8, já usava pro `<input type="month">`); decisão da Task 9 foi não adicionar os dois ao pacote compartilhado só por causa desses 4 arquivos.

## Dependency policy

Adição de deps segue a política da raiz (pnpm ≥ 11, `allowBuilds`, `minimumReleaseAge`). Ao trocar a versão de um Radix primitive ou do `react-hook-form` aqui, sincronizar com `apps/web/package.json` (hoje as duas árvores de deps são independentes — nada garante que fiquem em sync automaticamente).
