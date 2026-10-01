# apps/extensao: monorepo integration, test stack and CI (research report)

**Scope.** No repo file was modified. I built a working copy of the proposed setup in the scratchpad and ran it end to end. It mirrors the repo layout, with `packages/ui` and `packages/tools` copied in as workspaces and `scripts/check-tailwind-source.mjs` copied over. The working copy is at `/private/tmp/claude-501/-Users-piluvitu-WWW-PiluVitu-Dev/8edd1313-ac44-4917-a3ae-1ea4365be1c4/scratchpad/research/mono/apps/extensao`.

Starting from a clean state (no `.wxt` or `.output` folders), this all passed:

- **Install:** pnpm 11.1.1 installed everything with the repo's `allowBuilds` and `minimumReleaseAge`.
- **Typecheck and lint:** `wxt prepare && tsc --noEmit && eslint .` exited 0.
- **Unit tests:** Vitest 4.1.11 with `WxtVitest` and jsdom ran 3 files and 5 tests, all green.
- **Build:** `wxt build` plus the Tailwind gate exited 0.
- **Storybook:** a react-vite Storybook 10.3.1 build completed.
- **E2E:** Playwright headless loaded the unpacked MV3 extension and passed 3 of 3, on Playwright 1.59.1 and 1.63.0.

Five things to know before starting:

1. **Don't use the `postinstall: wxt prepare` hook that WXT recommends.** Put `wxt prepare &&` in front of `lint`, `test` and `storybook` instead (details in 1.3).
2. **Skip `@wxt-dev/module-react` and use `@vitejs/plugin-react@^5.1.0` directly.** The module pulls a React plugin version that needs Vite 8 and breaks the build on Vite 7 (details in 1.2).
3. **Add `noUncheckedIndexedAccess: false` to the extension's tsconfig.** Without it, `tsc` fails on `packages/tools/src/cpf.ts` (details in 1.2).
4. **A test file directly inside `entrypoints/` breaks `wxt build`.** Use folder-style entrypoints so tests can sit next to the code (details in 5).
5. **Headless E2E needs `channel: 'chromium'`.** The fill flow also needs a test-only build that grants access to the test site (details in 4).

---

## 1. Registering the workspace

### 1.1 Facts found in the repo (VERIFIED)

- **Workspace list:** `pnpm-workspace.yaml` lists each package explicitly (`apps/web`, `apps/financas`, `apps/financas/web`, `apps/ramielle`, `packages/tools`, `packages/ui`). There is **no `apps/*` glob**, so `apps/extensao` must be added by hand.
- **Workspace postinstall runs without approval:** in a test workspace, pnpm 11.1.1 ran a workspace package's own `postinstall` with no `allowBuilds` entry. `allowBuilds` only applies to installed dependencies.
- **WXT adds no blocked install scripts:** a fresh install of `wxt@0.21.4` + `vite@^7.2.0` + `vitest@^4.1.10` + `@tailwindcss/vite` ran only esbuild's postinstall, which is already `esbuild: true`.
  - The full test install did fail with `ERR_PNPM_IGNORED_BUILDS: @parcel/watcher@2.6.0`. That came from **jest 30.5.x** (`jest-haste-map@30.5.1`), which the test install re-resolved without a lockfile.
  - The repo lockfile pins `jest@30.4.2` / `jest-haste-map@30.4.1`, so the real repo won't hit it. If Jest is ever bumped to 30.5, add `'@parcel/watcher': false` to `allowBuilds`.
- **Version-age gate:** `wxt@0.21.4` was published 2026-08-11 and passes the 24h `minimumReleaseAge` rule. It requires Node ≥22 (CI and Vercel already use 22). Its `vite` peer range is `^6.3.4 || ^7 || ^8`.
- **Versions already in the lockfile:** vite 7.3.6 (financas-web) and 8.1.5 (transitive), `@vitejs/plugin-react` 5.2.0, vitest 4.1.10, storybook 10.3.1, playwright-core 1.59.1, jsdom 27.4.0.

### 1.2 Files to add

**`pnpm-workspace.yaml`:** add `- 'apps/extensao'`.

**`apps/extensao/package.json`** (scripts exactly as verified):

```json
{
  "name": "@piluvitu/extensao",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wxt",
    "build": "wxt build && node ../../scripts/check-tailwind-source.mjs .output/chrome-mv3",
    "build:e2e": "wxt build --mode e2e",
    "zip": "wxt zip",
    "lint": "wxt prepare && tsc --noEmit && eslint .",
    "test": "wxt prepare && vitest run",
    "test:watch": "wxt prepare && vitest",
    "test:e2e": "pnpm run build:e2e && playwright test",
    "storybook": "wxt prepare && storybook dev -p 6018",
    "build-storybook": "wxt prepare && storybook build",
    "prettier:fix": "prettier --write \"**/*.{js,ts,tsx,json,md,css}\""
  },
  "dependencies": {
    "@piluvitu/tools": "workspace:*",
    "@piluvitu/ui": "workspace:*",
    "react": "^19.2.4",
    "react-dom": "^19.2.4"
  },
  "devDependencies": {
    "@playwright/test": "1.59.1",
    "@storybook/react-vite": "10.3.1",
    "storybook": "10.3.1",
    "@tailwindcss/vite": "^4.2.2",
    "tailwindcss": "^4.2.2",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.0",
    "@testing-library/user-event": "^14.6.1",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^5.1.0",
    "jsdom": "^27.0.0",
    "prettier": "^3.8.1",
    "typescript": "^5.9.3",
    "vite": "^7.2.0",
    "vitest": "^4.1.10",
    "wxt": "0.21.4",
    "eslint": "^9.39.4",
    "eslint-config-prettier": "^10.1.8",
    "eslint-plugin-jsx-a11y": "^6.10.2",
    "eslint-plugin-react": "^7.37.5",
    "eslint-plugin-react-hooks": "^7.0.1",
    "globals": "^16.4.0",
    "typescript-eslint": "^8.57.1"
  }
}
```

**Why some versions are pinned exactly:**

- **Storybook (VERIFIED):** `@storybook/react-vite@10.6.1` requires `storybook ^10.6.1`. A loose `^10.3.1` could resolve react-vite to 10.6.1 while Storybook core stays at 10.3.1, which is a mismatch. Pin both to 10.3.1, or bump them together with apps/web.
- **Playwright (VERIFIED):** with a loose `^1.59.1`, the test install resolved 1.63.0. That version uses Chromium build 1243, while 1.59.1 uses 1217, so the two apps would need different browser downloads. Pin it to the same version apps/web uses.

**`apps/extensao/wxt.config.ts`** (verified):

```ts
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'wxt'

export default defineConfig({
  srcDir: 'src',
  imports: false,
  manifest: ({ mode }) => ({
    name: '…',
    permissions: ['activeTab', 'contextMenus', 'storage', 'scripting'],
    host_permissions: mode === 'e2e' ? ['http://teste.local/*'] : [],
    commands: {
      _execute_action: { suggested_key: { default: 'Alt+Shift+P' } },
    },
  }),
  vite: () => ({ plugins: [react(), tailwindcss()] }),
})
```

Notes on this config:

- **Why not `@wxt-dev/module-react@1.2.2` (VERIFIED):** its dependency range `@vitejs/plugin-react: ^4.4.1 || ^5 || ^6` resolved to 6.1.1. That version imports `vite/internal`, and the build fails on Vite 7.3.6 with `ERR_PACKAGE_PATH_NOT_EXPORTED ... './internal'`. The module's whole source is `addViteConfig(react())` plus a React auto-import preset, so calling plugin-react 5.x directly is equivalent. That also matches financas-web (plugin-react 5.2.0 on Vite 7.3.6).
- **`imports: false` (VERIFIED working):** with auto-imports off, everything is imported explicitly:
  - `import { browser } from 'wxt/browser'`
  - `import { defineBackground } from 'wxt/utils/define-background'`
  - `import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script'`
  - `import { storage } from 'wxt/utils/storage'`

  Build, tsc, Vitest and E2E all stayed green. This is a recommendation for readability and searchability, not a requirement.

- **Optional, for personal use:** `webExt: { disabled: true }` stops `wxt dev` from launching its own Chrome. You then load `.output/chrome-mv3-dev` yourself (VERIFIED: dev server on `http://localhost:3000`, output in `.output/chrome-mv3-dev`).

**`apps/extensao/tsconfig.json`** (verified):

```json
{
  "extends": "./.wxt/tsconfig.json",
  "compilerOptions": { "jsx": "react-jsx", "noUncheckedIndexedAccess": false }
}
```

- **Why the override (VERIFIED):** the tsconfig WXT generates turns on `noUncheckedIndexedAccess: true` and `verbatimModuleSyntax: true`. Because `@piluvitu/tools` and `@piluvitu/ui` export raw `.ts`/`.tsx`, the extension's `tsc` type-checks their imported files under the extension's options. The result was `../../packages/tools/src/cpf.ts(2,54): error TS2532: Object is possibly 'undefined'`. The override fixed it; no other repo tsconfig enables that flag.
- **Side note:** `packages/tools` has no `lint` or tsc script of its own. Its code is only type-checked by the apps that import it, and `pnpm -r lint` skips it.

**`apps/extensao/src/styles.css`** (verified; 3 levels of `../`, one fewer than financas-web):

```css
@import 'tailwindcss';
@import '@piluvitu/ui/styles.css';
@source '../../../packages/ui/src';
```

- **Fonts:** add the same `--font-plus-jakarta` / `--font-jetbrains` block financas has. There is no `next/font` here. Financas loads Google Fonts through `<link>`. For an extension, bundling the font files locally is probably better (privacy, no network on popup open). ASSUMED; not tested.

### 1.3 `wxt prepare`: run it in scripts, not as a postinstall

**What happens without it (VERIFIED):**

- `.wxt/` is generated and gitignored, so a fresh clone has none.
- Without it, **Vitest** fails (`TSConfckParseError: failed to resolve "extends":"./.wxt/tsconfig.json"`), **tsc** fails (`TS5083`) and **Storybook build** fails (`[vite:esbuild] failed to resolve "extends"`).
- `wxt build` generates `.wxt` by itself.

**Why the prefix instead of a postinstall hook:**

- WXT's own example uses `"postinstall": "wxt prepare"`, and pnpm 11 would run it.
- But when `wxt prepare` fails, `pnpm install` aborts with ELIFECYCLE exit 1. I triggered this with no `entrypoints/` folder: `ERROR No entrypoints found`.
- Every CI job (web, financas, ramielle) runs `pnpm install --frozen-lockfile`, so a broken extension config would turn all of them red.
- It probably also affects the Vercel install of apps/web (ASSUMED: Vercel installs the whole workspace from the root).
- And `deploy-financas.yml` only deploys when the whole CI workflow succeeds (VERIFIED, `conclusion == 'success'`).
- So: keep the `wxt prepare &&` prefix (it takes about 200 ms).

### 1.4 `.gitignore` (root): add these in the same commit as the first build

Today none of these are ignored (VERIFIED with `git check-ignore`; only `test-results/` already is):

```gitignore
# extensão (WXT)
apps/extensao/.output/
apps/extensao/.wxt/
apps/extensao/storybook-static/
apps/extensao/playwright-report/
apps/extensao/stats.html
apps/extensao/stats-*.json
apps/extensao/web-ext.config.ts
```

- **Why this is part of correctness, not tidiness (VERIFIED):** Tailwind v4 scans every file in the app folder that isn't gitignored.
  - With `.output/` not ignored, `@source` removed, and an old `.output/chrome-mv3-e2e` lying around, the build produced 27.85 kB of CSS including `bg-primary`. Tailwind had harvested the design-system classes from the stale build's JS.
  - With `.output/` ignored inside a git repo, the same broken build produced 6.71 kB with no design-system classes.
- The extension's `apps/extensao/CLAUDE.md` is also scanned. It must not contain the gate's sentinel class name written out; refer to `SENTINEL_SELECTOR` instead. This rule comes from `packages/ui/CLAUDE.md`.
- Unrelated finding: the root `storybook-static/` folder is committed to git (`git ls-files` lists its bundles).

### 1.5 Tailwind `@source` gate: point it at `.output/chrome-mv3` exactly

- **The gate works (VERIFIED pair):**
  - With `@source`: CSS is 31.03 kB, gate exits 0.
  - Without `@source`: CSS is 6.71 kB, gate exits 1 with its diagnostic.
- **WXT empties the output folder on each build (VERIFIED):** only one CSS file remains after repeated builds.
- **Don't point the gate at the whole `.output` folder (VERIFIED false pass):**
  - `.output` holds `chrome-mv3`, `chrome-mv3-dev` and `chrome-mv3-e2e` side by side.
  - The script's folder walk skips only path segments literally named `node_modules`, `cache` or `dev`.
  - Pointed at `.output`, it exited 0 with `@source` broken, because the stale e2e CSS contained the sentinel. This is the same problem as the M4 fix in the root CLAUDE.md.

### 1.6 Makefile

```make
# --- extensao (Chrome MV3, WXT) ---
dev-extensao:
	pnpm --filter @piluvitu/extensao dev
build-extensao:
	pnpm --filter @piluvitu/extensao build
test-extensao:
	pnpm --filter @piluvitu/extensao test
test-e2e-extensao:
	pnpm --filter @piluvitu/extensao test:e2e
storybook-extensao:
	pnpm --filter @piluvitu/extensao storybook
zip-extensao:
	pnpm --filter @piluvitu/extensao zip
```

- Add these to `.PHONY`.
- Optionally add ports 3000 (WXT dev) and 6018 (extension Storybook) to the `stop` loop. Today it covers 8081, 8082, 3333 and 6017.
- `make test` (`pnpm -r test && …pytest`) and `make lint` (`pnpm -r lint && …`) pick the extension up automatically, because it declares `test` and `lint`.
- **Existing bug (VERIFIED):** the `lint:` recipe does `cd ../promeia` from the repo root. `/Users/piluvitu/WWW/promeia` does not exist, so `make lint` always fails after `pnpm -r lint`. It should be `cd apps/promeia`.

### 1.7 `.github/workflows/ci.yml`: new job

Use explicit `--filter`, following the existing comment in the workflow.

```yaml
extensao:
  name: Extensão (typecheck + test + build + e2e)
  runs-on: ubuntu-latest
  timeout-minutes: 15
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
    - uses: actions/setup-node@v4
      with:
        node-version: '22'
        cache: pnpm
    - name: Install dependencies
      run: pnpm install --frozen-lockfile
    - name: Typecheck + lint
      run: pnpm --filter @piluvitu/extensao run lint
    - name: Test (vitest)
      run: pnpm --filter @piluvitu/extensao run test
    - name: Build (+ gate do @source)
      run: pnpm --filter @piluvitu/extensao run build
    - name: Chromium do Playwright (sem headless-shell)
      run: pnpm --filter @piluvitu/extensao exec playwright install --with-deps --no-shell chromium
    - name: E2E (extensão desempacotada)
      run: pnpm --filter @piluvitu/extensao run test:e2e
```

- **`--no-shell`:** the flag exists in 1.59.1 (VERIFIED via `install --help`). The headless shell can't load extensions (see 4), so there's no point downloading it.
- **Placement:** a red job here also blocks the financas auto-deploy (see 1.3). If E2E turns out flaky on Linux, move only the E2E step to its own workflow.
- **Package tests:** tests for the new generators in `packages/tools` already run in the `web` job ("Test (tools package)").
- **Doc drift:** the root CLAUDE.md says ci.yml has "cinco jobs", including `api`. The file actually has four: web, financas, ramielle, promeia. The `api` job was removed on 2026-08-14. Fix that while updating the table.

### 1.8 lint-staged and Prettier

- **Which lint-staged config applies (VERIFIED from configs):**
  - If `apps/extensao/package.json` has no `lint-staged` key, its files fall back to the **root** config: `*.{js,ts,tsx,json,md,css}: prettier --write`, run from the repo root.
  - The root `.prettierrc` applies (single quotes, no semicolons, `prettier-plugin-tailwindcss`). The plugin resolves from root devDeps.
- **If ESLint is added (recommended), add a package-level config**, like apps/web does, so ESLint runs with the extension folder as its working directory:
  ```json
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{js,mjs,json,md,css,html}": "prettier --write"
  }
  ```
- **ESLint config:** copying `packages/ui/eslint.config.mjs` works (VERIFIED exit 0) with two additions:
  ```js
  { files: ['**/*.e2e.ts', '**/*.fixture.ts'], rules: { 'react-hooks/rules-of-hooks': 'off' } },
  globalIgnores(['node_modules/**', '.output/**', '.wxt/**', 'storybook-static/**', 'test-results/**', 'playwright-report/**']),
  ```
  Without the override, `react-hooks/rules-of-hooks` flags Playwright's fixture `use(...)` callback (VERIFIED: 3 errors).

---

## 2. Test stack: Vitest for the extension, Jest stays for packages/tools

| Layer                                           | Runner                                                             | Why                                                               |
| ----------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `packages/tools` (new generators)               | **Jest + ts-jest** (existing `jest.config.ts`, jsdom, `*.test.ts`) | Matches the owner's "Jest for logic" rule and what already exists |
| `apps/extensao` lib/hooks/services + components | **Vitest 4 + jsdom + `WxtVitest`**                                 | See below                                                         |
| `apps/extensao` UI states                       | **Storybook 10 (react-vite)**, its own instance                    | Section 3                                                         |
| Critical flow (popup + injection)               | **Playwright**, `*.e2e.ts` next to the code                        | Section 4                                                         |

**Why Vitest for the extension:**

- WXT builds with Vite.
- `WxtVitest` gives an in-memory `browser.*` via `@webext-core/fake-browser`. Storage works without mocks, and `fakeBrowser.reset()` goes in `beforeEach`. It also applies WXT's Vite config, path aliases and `import.meta.env.BROWSER`/`MANIFEST_VERSION` (WXT docs, VERIFIED).
- With Jest you'd hand-mock `chrome.*` and duplicate the transforms.
- The repo already uses Vitest for every Vite or Worker app (financas, financas-web, ramielle). apps/extensao/CLAUDE.md should say why, the same way financas does.

**VERIFIED setup:** a test using `@piluvitu/tools/cpf`, a WXT `storage.defineItem('local:pessoa')` with a reset between tests, and a React test rendering `@piluvitu/ui/button` all passed. No `optimizeDeps.exclude` was needed, either under Vitest or `wxt dev` (the dev server served `@piluvitu/tools/cpf.ts` as source via `/@fs`).

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import { WxtVitest } from 'wxt/testing/vitest-plugin'
export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
```

`src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
beforeEach(() => fakeBrowser.reset())
afterEach(() => cleanup())
```

No `globals: true`, same as financas-web, which is why `cleanup()` is registered by hand.

---

## 3. Storybook

**What exists today (VERIFIED):**

- **apps/web:** uses `@storybook/nextjs` 10.3.1, which is webpack 5 based. Its stories globs are `../components/**/*.mdx`, `../components/**/*.stories.*` and `../app/**/*.stories.*`, so nothing outside apps/web is picked up. The preview imports `../app/globals.css` and wraps every story in `.dark`.
- **packages/ui:** has zero stories.
- **financas:** has no Storybook (no `.storybook`, zero mentions in its CLAUDE.md).

**Option A, widening the apps/web globs to `../../extensao/src/**`, is not recommended:\*\*

- apps/web's Tailwind entry doesn't scan `apps/extensao/src`, so classes only the extension uses would be missing.
- Fixing that means adding `@source '../../extensao/src'` to `apps/web/app/globals.css`, which puts extension classes into the website's production CSS.
- Components that import `wxt/browser` wouldn't resolve under webpack either. (ASSUMED; not run, because it would require modifying the repo.)

**Option B, a separate Storybook in apps/extensao, is recommended (VERIFIED):** `storybook build` completed, the story index lists the colocated stories, and the built iframe CSS contains the gate's sentinel, so `@source` resolves there too.

`.storybook/main.ts`:

```ts
import type { StorybookConfig } from '@storybook/react-vite'
import tailwindcss from '@tailwindcss/vite'
const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: [],
  framework: { name: '@storybook/react-vite', options: {} },
  async viteFinal(cfg) {
    cfg.plugins = [...(cfg.plugins ?? []), tailwindcss()]
    return cfg
  },
}
export default config
```

`.storybook/preview.tsx`:

```tsx
import type { Preview } from '@storybook/react-vite'
import '../src/styles.css'
const preview: Preview = {
  decorators: [
    (Story) => (
      <div className="dark bg-background text-foreground p-4">
        <Story />
      </div>
    ),
  ],
}
export default preview
```

Notes:

- Storybook doesn't load `wxt.config`, which is why Tailwind is added again in `viteFinal`.
- Keep story-covered components presentational (props in, no `browser.*`). That suits states 1a through 1e and 1j: first use, person ready, after fill, nothing recognized, forbidden page.
- The in-page toast (1f) is a Shadow DOM component. A story would render it outside a shadow root. ASSUMED, untested risk to check when building the toast: `packages/ui` tokens live on `:root`/`.dark`, and `:root` doesn't match inside a shadow root. Tailwind v4's `@property` rules are also ignored inside shadow roots.

---

## 4. Playwright E2E for the unpacked MV3 extension

**What exists today (VERIFIED):**

- apps/web has `@playwright/test` 1.59.1, `testMatch: ['**/*.e2e.ts']`, a `webServer` on `pnpm dev` port 3333, and the Desktop Chrome project.
- **No Playwright runs in CI today**: ci.yml has no e2e step.
- financas used ad-hoc `playwright-core` with the system Chrome, never committed.

**Official recipe (Playwright docs, VERIFIED):**

- Extensions only load with `launchPersistentContext`.
- "Google Chrome and Microsoft Edge removed the command-line flags needed to side-load extensions", so use the Chromium bundled with Playwright.
- `channel: 'chromium'` enables headless mode with extensions.
- WXT's docs point at `.output/chrome-mv3` and at WXT's own example, which uses `headless: false`.

**Measured locally, Playwright 1.59.1 on macOS, headless:**

| Setup                                         | Result                                                                                                                                          |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `channel: 'chromium'`                         | ✅ 3/3 tests pass                                                                                                                               |
| Default (no channel, uses the headless shell) | ❌ 3/3 time out after 30 s: `browserContext.waitForEvent: Target page, context or browser has been closed`. The service worker never registers. |

Linux CI wasn't run. ASSUMED to behave the same, per the docs.

`src/test/extensao.fixture.ts` (verified):

```ts
import {
  test as base,
  chromium,
  type BrowserContext,
  type Worker,
} from '@playwright/test'
import path from 'node:path'
const pathToExtension = path.resolve(
  import.meta.dirname,
  '../../.output/chrome-mv3-e2e',
)
export const test = base.extend<{
  context: BrowserContext
  sw: Worker
  extensionId: string
}>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
      ],
    })
    await use(context)
    await context.close()
  },
  sw: async ({ context }, use) => {
    let [sw] = context.serviceWorkers()
    if (!sw) sw = await context.waitForEvent('serviceworker')
    await use(sw)
  },
  extensionId: async ({ sw }, use) => {
    await use(sw.url().split('/')[2])
  },
})
export const expect = test.expect
```

`playwright.config.ts`:

```ts
export default defineConfig({
  testMatch: ['**/*.e2e.ts'],
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  use: { trace: 'on-first-retry' },
})
```

There is no `webServer`. The test page is served by `context.route(...).fulfill`, with no network involved.

**The `activeTab` limitation (VERIFIED):**

- On the production build, `chrome.scripting.executeScript` from the service worker fails with `Error: Cannot access contents of the page. Extension manifest must request permission to access the respective host.`
- `activeTab` is only granted by a user gesture on browser UI (toolbar button, keyboard command, context menu). Playwright can't produce that gesture (ASSUMED, consistent with what I observed).
- Fix (VERIFIED): `wxt build --mode e2e` writes to `.output/chrome-mv3-e2e/`, and `manifest: ({mode}) => …` adds `host_permissions: ['http://teste.local/*']` only in that mode. With it, injecting `/preencher.js` filled the input.
- The script path must be typed with a leading slash. WXT's types reject `'preencher.js'` (TS2820: `Did you mean '"/preencher.js"'`).
- Add a test proving the production manifest has no `host_permissions` (suggested, not written).

Typing `chrome` inside `sw.evaluate` (VERIFIED, tsc green):

```ts
import type { browser } from 'wxt/browser'
declare const chrome: typeof browser
```

**More ASSUMED E2E limits (not tested):**

- Opening `popup.html` as a tab makes the popup itself the active tab. Popup code that asks "which tab is active?" gets its own tab, so route the target `tabId` through a seam (background message, or a query parameter).
- `Alt+Shift+P` and the native right-click menu can't be driven from Playwright. Test the `contextMenus.onClicked` handler and the command handler as exported functions in Vitest.

---

## 5. Devcontainer, comment rule and colocation

**Devcontainer:** the repo has none (VERIFIED: `find -maxdepth 4` found no `.devcontainer` or `devcontainer.json`). Every other workspace runs tests on the host, so the owner's devcontainer rule doesn't apply here.

**Comment rule (root CLAUDE.md, "Comentários: raros, e só onde o código não alcança"):**

- In production code, a comment is allowed only when all three are true:
  1. It records a _why_ the code can't show.
  2. Removing it would lead someone to "fix" the code and break it.
  3. It doesn't fit better in a name, a test, the CLAUDE.md or the commit message.
- Keep it to one to three lines; anything longer belongs in the CLAUDE.md, with the code pointing to the section.
- ⚠️ is reserved for traps that corrupt data silently.
- No session narrative and no measurement tables in code.
- Tests are free to explain scenarios.

**Colocation rule:** tests and stories sit in the same folder as the source; never in `stories/` or `e2e/` folders. E2E files use the `.e2e.ts` extension next to what they test.

**WXT conflict with colocation (VERIFIED):** every file placed directly in `src/entrypoints/` is treated as an entrypoint. Adding `entrypoints/background.test.ts` broke `wxt build` with a duplicate-entrypoint error (`background → background.test.ts, background.ts`). Folder-style entrypoints fix it:

```
src/entrypoints/background/index.ts            (+ background.test.ts alongside: VERIFIED ok)
src/entrypoints/popup/{index.html,main.tsx,App.tsx,App.test.tsx,popup.e2e.ts}   (VERIFIED ok)
src/entrypoints/preencher.ts                   (unlisted script → /preencher.js)
src/components/linha-copiavel.tsx + .stories.tsx (+ .test.tsx)
src/lib/pessoa.ts + pessoa.test.ts
src/test/setup.ts, src/test/extensao.fixture.ts  (same convention as financas-web src/test/)
```

Vitest's `include` (`*.test.*`) and Playwright's `testMatch` (`*.e2e.ts`) don't overlap. The generated tsconfig covers all of these (`"include": ["../**/*"]`) except `.storybook/`, because dot-folders are skipped.

---

## 6. packages/tools: adding exports, and who imports it today

**Adding a module:**

1. Create `src/<nome>.ts` and `src/<nome>.test.ts` (Jest).
2. Add `"./<nome>": "./src/<nome>.ts"` to `exports` in `packages/tools/package.json`.
3. Optionally re-export it from `src/index.ts`. Precedent: `import/csv` and `import/id` are deliberately subpath-only.
4. Name the subpath exactly like the file path. apps/web's `jest.config.ts` maps `^@piluvitu/tools/(.*)$` to `<rootDir>/../../packages/tools/src/$1`, so a subpath that doesn't match the file path breaks apps/web's Jest.
5. Document the module in `packages/tools/CLAUDE.md`.

**Barrel import:** no consumer imports the `@piluvitu/tools` barrel; all imports use subpaths (VERIFIED by grep). The barrel pulls in `qr-encode` and its `qrcode` package, so the extension should keep using subpaths, especially in the service worker.

**Consumers (VERIFIED):**

- **apps/web:** 8 component files, 1 hook, and the Jest mapper.
- **apps/financas Worker** (`src/`): 6 files, plus `vitest.scripts.config.ts`.
- **apps/financas/web:** 34 files, mostly `/money`, `/import*` and `/regras`.
- **`gerarCPF`/`validarCPF`:** used only by `apps/web/components/tools/cpf-tool.tsx`, which calls `gerarCPF()` with no arguments and `validarCPF(string)`. `gerarCNPJ`/`validarCNPJ` likewise only by `cnpj-tool.tsx`.

**Compatibility constraints for changing `gerarCPF`:**

- Any new parameter must be optional, and calling `gerarCPF()` with no arguments must still return a formatted `000.000.000-00` string.
- Three things assert that format:
  - `packages/tools/src/cpf.test.ts` (regex check plus 500 validity runs);
  - `apps/web/app/(site)/tools/tools.e2e.ts` ("gera CPF no formato…" regex, then generate-and-validate);
  - `cpf-tool.stories.tsx`.
- A compatible shape: `gerarCPF(opts?: { prng?: Prng; formatado?: boolean })`, using the existing `Prng` from `./prng` (it has `int(n)`), with `Math.random` as the default.

**Test vectors (VERIFIED against the repo's validators):**

| Value                | Validator result |
| -------------------- | ---------------- |
| `529.982.247-25`     | true             |
| `529.982.247-00`     | false            |
| `11.222.333/0001-81` | true             |

---

## 7. Docs to update (owner's rule: CLAUDE.md of each workspace touched)

- **Root `CLAUDE.md`:** add an `apps/extensao` row to the workspace table and a Tech Stack bullet; list the new Make targets in Commands; update the CI/CD table (job count and its contents, including the existing "cinco"/api drift); explain why Vitest and a second Storybook, and the `.output/chrome-mv3` gate target.
- **New `apps/extensao/CLAUDE.md`:** cover the `wxt prepare` prefix, the tsconfig override, plugin-react instead of module-react, folder entrypoints, the e2e mode and its host permission, and `channel: 'chromium'`. **Don't write the sentinel name in it.**
- **`packages/tools/CLAUDE.md`:** document the new generator modules and subpaths.
- **`packages/ui/CLAUDE.md`, "Consumo pelos apps":** add the third consumer (WXT/Vite), with its `@source` depth of 3.

---

## 8. Verified vs assumed

**Verified (local runs; sources: npm registry, playwright.dev/docs/chrome-extensions, wxt.dev unit-testing and TypeScript pages, the wxt-dev/examples Playwright example):**

- Every item marked VERIFIED above.
- npm versions as of 2026-10-01: wxt 0.21.4; @wxt-dev/module-react 1.2.2; storybook / @storybook/react-vite 10.6.1 (repo on 10.3.1); vitest 5.0.3 (repo on 4.1.10); vite 8.3.1; @playwright/test 1.63.0 (repo on 1.59.1); tailwindcss 4.3.3.

**Assumed (not run):**

- Linux CI headless behaves like macOS.
- The Vercel install runs workspace lifecycle scripts.
- The `activeTab` user-gesture mechanism, the popup-as-tab active-tab problem, and keyboard/context-menu not being drivable from Playwright.
- Shadow DOM token and `@property` behaviour for the toast.
- Whether pnpm reuses lockfile versions for loose ranges (hence the exact pins).
- Local font bundling being preferable.

## Checklist

- [ ] `pnpm-workspace.yaml`: add `- 'apps/extensao'`
- [ ] `apps/extensao/package.json` (scripts and pins from 1.2; no `postinstall`)
- [ ] `apps/extensao/wxt.config.ts` (plugin-react 5 + `@tailwindcss/vite`; no module-react; e2e-mode `host_permissions`)
- [ ] `apps/extensao/tsconfig.json` (extends `.wxt`; `jsx`; `noUncheckedIndexedAccess: false`)
- [ ] `apps/extensao/src/styles.css` (`@source '../../../packages/ui/src'` + font variables)
- [ ] `apps/extensao/vitest.config.ts` + `src/test/setup.ts`
- [ ] `apps/extensao/playwright.config.ts` + `src/test/extensao.fixture.ts` (`channel: 'chromium'`)
- [ ] `apps/extensao/.storybook/{main.ts,preview.tsx}` (react-vite 10.3.1, port 6018)
- [ ] `apps/extensao/eslint.config.mjs` (copy of ui's, plus e2e/fixture override and ignores) + package-level `lint-staged`
- [ ] Root `.gitignore`: `.output/ .wxt/ storybook-static/ playwright-report/ stats*.json/html web-ext.config.ts`, in the same commit as the first build
- [ ] `Makefile`: the new targets + `.PHONY`; fix `lint:` (`cd apps/promeia`)
- [ ] `.github/workflows/ci.yml`: `extensao` job (lint → test → build+gate → `playwright install --with-deps --no-shell chromium` → e2e)
- [ ] `packages/tools`: new `src/<gen>.ts` + `.test.ts` (Jest), `exports` subpaths, `gerarCPF()` stays backward compatible
- [ ] CLAUDE.md updates: root, `apps/extensao` (new), `packages/tools`, `packages/ui`
