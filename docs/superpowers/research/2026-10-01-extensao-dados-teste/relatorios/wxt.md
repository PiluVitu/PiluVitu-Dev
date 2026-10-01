# WXT + MV3 mechanics for `apps/extensao`: research report (2026-10-01)

I built and ran a real scratch extension with the proposed stack (WXT 0.21.4, React 19, Tailwind 4.3.3 and the real `@piluvitu/ui` linked read-only). Everything marked **VERIFIED** below was observed in that probe or read in the installed source, unless it cites a doc. Final run: Vitest 7/7, `tsc --noEmit` exit 0, Playwright 10/10 (E2E build) plus 1/1 (production build), sentinel gate exit 0. **ASSUMED** items are listed in §10.

Nothing in the repo was modified. `git status` shows an untracked `docs/superpowers/design/` created at 01:34 local by another process, not by this run.

Probe: `/private/tmp/claude-501/-Users-piluvitu-WWW-PiluVitu-Dev/8edd1313-ac44-4917-a3ae-1ea4365be1c4/scratchpad/research/wxt-probe/`

---

## 0. Corrections to the brief and traps found

1. **`WxtVitest` is not exported from `'wxt/testing'`.** WXT 0.21.4 only exports `wxt/testing/vitest-plugin` and `wxt/testing/fake-browser` (VERIFIED in the `package.json` exports).
2. **`cssInjectionMode: 'ui'` breaks with `registration: 'runtime'` when there are no `matches`.**
   - WXT emits `web_accessible_resources: [{ resources: ['content-scripts/x.css'], use_dynamic_url: true, matches: [] }]`.
   - Chrome then refuses the CSS: `Denying load of chrome-extension://…/content-scripts/preencher.css. Resources must be listed in the web_accessible_resources manifest key…`.
   - The toast renders unstyled (`position: static`).
   - The fix in §6 was VERIFIED.
3. **Colocated tests at the top level of `entrypoints/` break the build.**
   - `entrypoints/background.test.ts` fails with `ERROR Multiple entrypoints with the same name detected… background: entrypoints/background.test.ts, entrypoints/background.ts` (VERIFIED).
   - WXT discovers every `entrypoints/*.[jt]s?(x)` as an entrypoint, so an unrelated `foo.test.ts` would become an unlisted script inside the extension (read in source).
   - Files inside `entrypoints/<name>/` other than `index.*` are ignored (VERIFIED: `popup/App.test.tsx` builds fine).
   - **Use the directory form for every entrypoint** (`background/index.ts` next to `background/background.test.ts`).
4. **The sentinel gate can pass without measuring anything if `.output/` is not gitignored.**
   - The root `.gitignore` covers neither `.output/` nor `.wxt/` (VERIFIED with `git check-ignore`).
   - The toast CSS is inlined into JS (fix #2), so Tailwind's auto-scan reads a stale `.output/*/content-scripts/preencher.js` that contains the sentinel.
   - Result: a build **without `@source`** passes the gate with exit 0 (VERIFIED). With `.output` gitignored it fails with exit 1 (VERIFIED). `@source not '../.output'` alone also makes it fail correctly (VERIFIED).
   - Use both.
5. **`wxt dev` changes permissions** (VERIFIED in `.output/chrome-mv3-dev/manifest.json`).
   - It adds the `tabs` permission and `host_permissions: ["http://localhost/*"]`, plus the `wxt:reload-extension` (Alt+R) command and a CSP for `localhost:3000`.
   - So in dev, any localhost app can be scripted without the activeTab gesture, which hides activeTab bugs.
   - Test real behaviour with `wxt build` and an unpacked load.
6. **Synthetic keypresses do not fire extension commands.** `page.keyboard.press('Alt+Shift+P')` in Playwright did nothing (VERIFIED). Test the command handler in a unit test.
7. **Nothing new is needed in `allowBuilds`** (§1).
8. **`pnpm-workspace.yaml` lists packages explicitly, not by glob**, so `'apps/extensao'` must be added.

---

## 1. Versions and the pnpm policy

Current time when checked: `2026-10-01T04:28Z`.

| Package                                                                                                   | Pick                            | Published               | Note                                                                                                          |
| --------------------------------------------------------------------------------------------------------- | ------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| `wxt`                                                                                                     | **0.21.4**                      | 2026-08-11              | latest (dist-tag `latest`)                                                                                    |
| `@wxt-dev/module-react`                                                                                   | **1.2.2**                       | 2026-03-14              | latest; adds `@vitejs/plugin-react` and the React import preset (source)                                      |
| `vite` (peer `^6.3.4 \|\| ^7 \|\| ^8`)                                                                    | **8.3.1**                       | 2026-09-24              | resolved by pnpm in the probe; **declare it explicitly** to pin the peer                                      |
| `@vitejs/plugin-react`                                                                                    | 6.1.1 (transitive)              | 2026-08-28              | —                                                                                                             |
| `tailwindcss` / `@tailwindcss/vite`                                                                       | **4.3.3**                       | 2026-07-16              | already in the repo lockfile                                                                                  |
| `@wxt-dev/browser` / `@wxt-dev/storage`                                                                   | 0.3.4 / 1.2.9 (transitive)      | 2026-09-29 / 2026-07-31 | —                                                                                                             |
| `vitest`                                                                                                  | **4.1.10** (same as repo)       | —                       | verified with `WxtVitest`. **5.0.3 was inside the 24h window** (2026-09-30T11:30Z)                            |
| `@playwright/test`                                                                                        | **1.59.1** (same as `apps/web`) | —                       | needs `chromium-1217` (Chromium 147.0.7727.15), already in `~/Library/Caches/ms-playwright`; latest is 1.63.0 |
| `jsdom` 27.4.0, `react` 19.2.4, `typescript` 5.9.3, `@types/node` 25.5.0, `@testing-library/react` 16.3.0 | repo versions                   | —                       | —                                                                                                             |
| `web-ext` (optional peer `>=9.2.0`)                                                                       | **do not install**              | —                       | only needed for auto-opening a browser; 10.7.0 pulls in `addons-linter`, `chrome-launcher`, etc.              |

**Install scripts (VERIFIED).**

- I installed WXT 0.21.4 + Vite 8.3.1 + Tailwind 4.3.3 + Vitest 4 + Playwright with the repo's policy copied in (`minimumReleaseAge: 1440`).
- None of the 234 packages declares `preinstall`/`install`/`postinstall`.
- **esbuild is not in the tree at all**: Vite 8 uses Rolldown/oxc (`pnpm why esbuild` is empty).
- If Vite 7 is chosen instead (to match `apps/financas/web`), esbuild comes back, and `esbuild: true` is already allowed.

What `allowBuilds` already contains: `better-sqlite3: false`, `core-js: false`, `core-js-pure: true`, `esbuild: true`, `protobufjs: false`, `sharp: true`, `unrs-resolver: true`, `workerd: false`.

**The app's own `postinstall: wxt prepare` runs (VERIFIED).** pnpm 11.1.1 runs a _nested workspace project's_ own `postinstall` without any `allowBuilds` entry (tested in a separate 2-package workspace). `wxt prepare` generates `.wxt/tsconfig.json` and the types, so it must run before `tsc`.

Optional: `@wxt-dev/auto-icons` 1.1.2 depends on `sharp ^0.35.3`, which is already allowed.

---

## 2. Layout, config and manifest

### `apps/extensao/wxt.config.ts`

This is the probe config as it ran. The real-repo layout is unchanged.

```ts
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'wxt'

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: () => ({
    name: 'piluvitu · dados de teste', // also becomes the parent of the auto-grouped context menu (1g)
    description:
      'Gera uma pessoa brasileira falsa e coerente e preenche formulários.',
    permissions: ['activeTab', 'scripting', 'contextMenus', 'storage'],
    // E2E only: Playwright cannot produce the user gesture that grants activeTab.
    ...(process.env.WXT_E2E === '1'
      ? { host_permissions: ['http://127.0.0.1/*'] }
      : {}),
    commands: {
      'preencher-pagina': {
        suggested_key: { default: 'Alt+Shift+P' },
        description: 'Preencher esta página',
      },
    },
  }),
  vite: () => ({ plugins: [tailwindcss()] }),
  webExt: { disabled: true },
  outDirTemplate: process.env.WXT_E2E === '1' ? 'chrome-mv3-e2e' : undefined,
})
```

**Generated production manifest (VERIFIED):**

- `permissions: [activeTab, scripting, contextMenus, storage]`
- no `content_scripts`
- no `host_permissions`
- no `web_accessible_resources`
- `action.default_popup: popup.html`
- `background.service_worker: background.js`

**Host permissions are not needed.** activeTab plus `scripting` covers the popup, command and context-menu paths (Chrome docs). `scripting` is required with activeTab to call `executeScript`.

### Tree (directory form everywhere, because of trap #3)

```
apps/extensao/
  .gitignore            # .output  .wxt  web-ext.config.ts  test-results  playwright-report
  package.json  tsconfig.json  wxt.config.ts  vitest.config.ts  playwright.config.ts
  playwright.fixtures.ts            # E2E support module (not a test)
  assets/tailwind.css
  utils/pessoa.ts  utils/pessoa.test.ts
  entrypoints/
    background/index.ts  background/background.test.ts
    popup/index.html  popup/main.tsx  popup/App.tsx  popup/App.test.tsx
    preencher.content/index.tsx  preencher.content/Toast.tsx  preencher.content/preencher.e2e.ts
```

- `tsconfig.json`: `{ "extends": "./.wxt/tsconfig.json", "compilerOptions": { "jsx": "react-jsx" }, "exclude": ["e2e-or-*.e2e.ts", ".output", "node_modules"] }`.
  - It needs `@types/node`; otherwise `process` in `wxt.config.ts` fails with TS2580 (VERIFIED).
  - WXT's generated tsconfig turns on `noUncheckedIndexedAccess`, `verbatimModuleSyntax` and `strict`, and adds aliases `@/*`, `~/*` and `@@/*` that point to the app root.
- **Popup HTML.** `<meta name="manifest.default_title" content="…">` is respected (VERIFIED). The popup bundles to `popup.html`, `chunks/popup-*.js` and `assets/popup-*.css`.
- **Icons.** WXT finds `public/icon/16.png` (also `icon-16.png`, `icons/16.png`, …) automatically (read in source).

### Proposed `package.json` scripts

```json
"version": "0.1.0",
"scripts": {
  "dev": "wxt",
  "build": "wxt build && node ../../scripts/check-tailwind-source.mjs .output/chrome-mv3",
  "build:e2e": "WXT_E2E=1 wxt build",
  "zip": "wxt zip && node ../../scripts/check-tailwind-source.mjs .output/chrome-mv3",
  "postinstall": "wxt prepare",
  "lint": "tsc --noEmit",
  "test": "vitest run",
  "test:e2e": "pnpm build:e2e && playwright test"
}
```

`"version"` is required. Without it the manifest falls back to `0.0.0` with a warning, and the zip is named `<name>-undefined-chrome.zip` (VERIFIED).

---

## 3. On-demand content script (not auto-injected)

```ts
// entrypoints/preencher.content/index.tsx
export default defineContentScript({
  registration: 'runtime', // never written into manifest.content_scripts
  // NO `matches`: with runtime registration WXT copies `matches` into host_permissions
  cssInjectionMode: 'manual', // see §6
  noScriptStartedPostMessage: true, // don't window.postMessage into the site under test
  async main(ctx): Promise<ResultadoPreencher> {
    const p = await pessoaItem.getValue() // content scripts can read chrome.storage.local (VERIFIED)
    /* …fill fields, mount the toast… */
    return { preenchidos, total, naoReconhecidos } // goes back to executeScript
  },
})
```

**Source facts (read in source):**

- Validation requires `matches` only when `registration !== 'runtime'`.
- For runtime scripts, `matches.forEach(addHostPermission)`.
- The type docs say the same: "`runtime`: the content script's `matches` is added to `host_permissions`".

**Injecting from the popup, the background command, or a context-menu click:**

```ts
const [res] = await browser.scripting.executeScript({
  target: { tabId },
  files: ['/content-scripts/preencher.js'],
})
res?.result // VERIFIED: [{documentId, frameId:0, result:{preenchidos:4,total:5,naoReconhecidos:[…]}}]
```

- **The return value of `main()` comes back (VERIFIED).** The bundle ends with `return (async()=>{… return await main(ctx)})()`, and Chrome awaits that promise.
- **Re-injection is safe (VERIFIED).** A second injection fires a document `CustomEvent` (`<extId>:preencher:wxt:content-script-started`). The old context then aborts, the old shadow UI removes itself, and `ctx.setTimeout` timers are cleared. After two injections the page has exactly one toast.
- **`allFrames: true` (VERIFIED with host permission).** Same-origin iframes are included. A cross-origin iframe without access is **silently skipped** (no error, just absent from the results), which matches the "iframe de outro domínio fica de fora" note in 1d.
- **Error strings, useful for state 1e (VERIFIED):**
  - normal page without a grant: `Cannot access contents of the page. Extension manifest must request permission to access the respective host.`
  - `chrome://`: `Cannot access a chrome:// URL`
  - Web Store, even with `<all_urls>`: `The extensions gallery cannot be scripted.`
  - PDF: inconclusive in headless (injection succeeded on a `text/html` document with 0 inputs). Also check `document.contentType`/URL, and treat "0 fields" as 1d.
- **Without a grant, `tab.url` is `undefined` (VERIFIED).** With activeTab (popup click, command or menu), url, title and favicon are readable (Chrome docs).

---

## 4. Keyboard shortcut

- The manifest snippet in §2 is VERIFIED.
- `browser.commands.getAll()` returns `{name:'preencher-pagina', shortcut:'⌥⇧P'}` on macOS (VERIFIED), so the popup footer should show `shortcut` from `getAll()` rather than a hardcoded value.
  - An unassigned or conflicting binding comes back as `shortcut: ""`, which is VERIFIED only for `_execute_action`.
- Docs: "On many macOS keyboards, `Alt` refers to the Option key"; "On macOS `Ctrl` is automatically converted into `Command`"; at most 4 suggested keys; if another extension already uses the key, this one doesn't register; OS and Chrome shortcuts always win.
- **activeTab is granted** by "Executing a keyboard shortcut from the commands API" (Chrome activeTab doc), so the handler can inject:

```ts
browser.commands.onCommand.addListener(async (command, tab) => {
  if (command === 'preencher-pagina' && tab?.id != null)
    await preencherPagina(tab.id)
})
```

- The `tab` argument is optional in the signature (`(command: string, tab?: tabs.Tab)`); the doc fetch gave the version as "Chrome 96+".
- **"alterar" link:** `browser.tabs.create({ url: 'chrome://extensions/shortcuts' })` works from the extension (VERIFIED: the tab opened at that URL).
- **Dev only:** WXT adds the `wxt:reload-extension` Alt+R command (VERIFIED). It counts toward the 4-key limit; disable it with `dev: { reloadCommand: false }` (config type).

---

## 5. Context menus

```ts
export async function criarMenus(p: Pessoa | null) {
  await browser.contextMenus.removeAll()
  browser.contextMenus.create({
    id: 'preencher',
    title: 'Preencher esta página',
    contexts: ['page', 'editable'],
  })
  browser.contextMenus.create({
    id: 'inserir',
    title: 'Inserir',
    contexts: ['editable'],
  })
  for (const tipo of TIPOS_INSERIR)
    browser.contextMenus.create({
      id: `inserir:${tipo}`,
      parentId: 'inserir',
      title: tituloMenu(tipo, p),
      contexts: ['editable'],
    })
  // group separators: { id: 'sep-1', type: 'separator', parentId: 'inserir', contexts: ['editable'] }
  browser.contextMenus.create({
    id: 'nova-pessoa',
    title: 'Nova pessoa',
    contexts: ['page', 'editable'],
  })
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(async () =>
    criarMenus(await pessoaItem.getValue()),
  )
  pessoaItem.watch((p) => {
    void atualizarTitulos(p)
  }) // contextMenus.update(`inserir:cpf`, { title: 'CPF · 384.529.176-19' })
  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (tab?.id == null) return
    const id = String(info.menuItemId)
    if (id === 'preencher') await preencherPagina(tab.id)
    else if (id.startsWith('inserir:'))
      await inserir(tab.id, info.frameId ?? 0, id.slice(8) as TipoInserir)
  })
  /* commands.onCommand … */
})
```

- **Create menus in `onInstalled`** (Chrome guide). Menus persist, so creating them on every service-worker start causes duplicate-id errors.
  - The menus appear **asynchronously** after install, so E2E tests must poll (VERIFIED: without polling the test failed with `Cannot find menu item with id inserir:cpf`).
  - `contextMenus.update()` rejecting with `Cannot find menu item with id X` is a usable existence check (VERIFIED).
- **Dynamic titles:** `pessoaItem.watch` calls `contextMenus.update` (VERIFIED in a unit test). Update `CPF` and `CEP` only.
- **Grouping:** more than one top-level item is automatically collapsed under a parent named after the extension (docs; `ACTION_MENU_TOP_LEVEL_LIMIT = 6`). The "piluvitu · dados de teste ›" item in 1g is therefore the manifest `name`.
- **Activating a menu item grants activeTab** (Chrome docs).
- **Finding the right-clicked element.** `OnClickData` has no element reference, only `frameId`, `frameUrl`, `pageUrl`, `editable`, `menuItemId`, `parentMenuItemId` and `selectionText`. Recording the `contextmenu` target would need a content script on every page (host permissions), which breaks the on-demand model.
  - **Use focus instead (VERIFIED in Chromium 147):** a right-click focuses the field, and `document.activeElement`, drilling through `shadowRoot.activeElement`, returns `input[name=cep]`, `textarea[name=obs]`, `div#ce` (contenteditable) and an input inside an **open** shadow root.
  - Inject into the clicked frame:

```ts
await browser.scripting.executeScript({
  target: { tabId, frameIds: [frameId] },
  func: (valor: string) => {
    let el: Element | null = document.activeElement
    while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(el),
        'value',
      )?.set?.call(el, valor) // React-controlled inputs
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    }
    if (el instanceof HTMLElement && el.isContentEditable) {
      document.execCommand('insertText', false, valor)
      return true
    }
    return false
  },
  args: [valor],
})
```

---

## 6. Tailwind 4, `@piluvitu/ui`, the sentinel gate, and the Shadow DOM toast

### Shared CSS entry

`apps/extensao/assets/tailwind.css`, imported by the popup and inlined into the content script:

```css
@import 'tailwindcss';
@import '@piluvitu/ui/styles.css';
@source '../../../packages/ui/src';
@source not '../.output';
```

- The probe used an absolute `@source` path. The relative path above is my count, not built.
- **Popup (VERIFIED):** `import '@/assets/tailwind.css'` in `main.tsx`; the `Button` from `@piluvitu/ui/button` renders with its real background (`rgb(58,191,248)` with `<html class="dark">`).
- **Gate (VERIFIED):** `node scripts/check-tailwind-source.mjs .output/chrome-mv3` exits 0 with `@source`. Without it, the CSS drops from 31.6 kB to 9.2 kB and the gate exits 1.
- The gate reads only `.css` files. With the toast CSS inlined into JS, it checks the **popup** CSS; that's sufficient because both import the same entry.
- Point the gate at `.output/chrome-mv3`. The dev and e2e outputs are separate directories.

### Content-script UI: the working recipe (VERIFIED)

The toast ends up `position: fixed`, `right: 16px`, radius 14px, dark `--card` background `rgb(15,20,31)`, and the manifest has no `web_accessible_resources`.

```tsx
import css from '@/assets/tailwind.css?inline' // @tailwindcss/vite processes ?inline correctly
const ui = await createShadowRootUi(ctx, {
  name: 'piluvitu-toast',
  css: css.replaceAll(':root', ':host').replace(/\.dark\s*\{/g, ':host(.dark){'),
  position: 'inline', anchor: 'body', append: 'last',
  onMount(container, _shadow, host) {
    host.classList.add('dark')       // theme tokens resolve on :host
    container.classList.add('dark')  // for the dark: variant (&:is(.dark *))
    const root = createRoot(container); root.render(<Toast … />); return root
  },
  onRemove(root) { root?.unmount() },
})
ui.mount()
ctx.setTimeout(() => ui.remove(), 4000) // cleared automatically on invalidation
```

The toast element itself uses `fixed right-4 bottom-4 z-[2147483647] …`.

**Why each part is there:**

- **`'ui'` mode fails** with runtime registration and no `matches` (trap #2). The alternatives are worse: adding `matches` grants host permissions; patching the WAR entry to `<all_urls>` exposes the CSS file to every site.
- **WXT rewrites `:root` → `:host` only for CSS it loads itself in `'ui'` mode, not for `options.css`** (source). The `@piluvitu/ui` tokens live in `:root{}` and `.dark{}`.
- **Tailwind v4 `@theme` variables resolve at `:root, :host`.** For example, `--color-card: hsl(var(--card))` is computed at the host from the light `--card`. A `.dark` class on an inner container left the background **white** (VERIFIED); `:host(.dark)` fixed it.
- **`@property` and `@font-face` rules are moved into the page `<head>`** (`style[wxt-shadow-root-document-styles]`) because they don't work inside a shadow root (VERIFIED). Tailwind's `@property --tw-*` rules land there, which is harmless.
- **WXT adds `:host{all:initial}`.** `rem` still scales with the site's `html` font-size, and the site's custom properties still inherit into the shadow (WXT type docs).
  - `--font-sans` is `var(--font-plus-jakarta, ui-sans-serif, system-ui, …)`, so the toast falls back to the system font.
  - Bundling Plus Jakarta would need `@font-face` in the page document, and loading it would again need web-accessible resources (ASSUMED).

---

## 7. Storage

```ts
import { storage } from '#imports'
export const pessoaItem = storage.defineItem<Pessoa | null>('local:pessoa', {
  fallback: null,
  version: 1,
})
```

All VERIFIED:

- `getValue` returns `null` at first.
- `setValue` writes `chrome.storage.local` under the key `pessoa`.
- `watch(cb)` fires with `(new, old)` and returns an unwatch function.

React popup:

```ts
useEffect(() => {
  void pessoaItem.getValue().then(setPessoa)
  return pessoaItem.watch(setPessoa)
}, [])
```

Re-rendering after "Gerar pessoa" was VERIFIED (jsdom and real Chromium). The background's `watch` updates the menu titles. The content script reads the same item.

`wxt/storage` is a typed wrapper over `chrome.storage` (`local:`, `session:`, `sync:`, `managed:`), with versioning and migrations, and `fakeBrowser` supports it. Prefer it over raw `chrome.storage.local`.

---

## 8. Testing

### Vitest

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import { WxtVitest } from 'wxt/testing/vitest-plugin'
export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    include: ['**/*.test.{ts,tsx}'],
    exclude: ['node_modules', '.output'],
  },
})
```

What the plugin actually registers (source): globals, tsconfig paths, app-config, the extension API mock (`browser`/`chrome` → `fakeBrowser`, `wxt/browser` aliased) and unimport auto-imports.

- It does **not** pull in user Vite plugins (React, Tailwind), despite what the docs say.
- TSX worked under jsdom anyway, via per-file `// @vitest-environment jsdom` (VERIFIED).

`@webext-core/fake-browser` 2.0.1 coverage:

- `storage` and `runtime` are real in-memory implementations (storage VERIFIED by tests). `tabs`, `windows`, `alarms`, `notifications` and `webNavigation` are present in the source.
- **`contextMenus`, `commands` and `scripting` throw `MockNotImplementedError`**, so stub them:

```ts
beforeEach(() => {
  fakeBrowser.reset()
  Object.assign(fakeBrowser.contextMenus, { create: vi.fn(), removeAll: vi.fn(async () => {}), update: vi.fn(async () => {}) })
  Object.assign(fakeBrowser.scripting, { executeScript: vi.fn(async () => [{ frameId: 0, result: {…} }]) })
})
it('atalho injeta na aba do comando', async () => {
  const onCommand = eventoFalso(); Object.assign(fakeBrowser.commands, { onCommand })
  Object.assign(fakeBrowser.contextMenus, { onClicked: eventoFalso() })
  background.main()
  await onCommand.fire('preencher-pagina', { id: 7 })
  expect(fakeBrowser.scripting.executeScript).toHaveBeenCalledWith({ target: { tabId: 7 }, files: ['/content-scripts/preencher.js'] })
})
```

Mutation check (VERIFIED): changing the command name fails exactly that one test.

### Playwright E2E (all VERIFIED, headless)

```ts
// playwright.fixtures.ts
const pathToExtension = path.resolve(
  import.meta.dirname,
  '.output',
  process.env.EXT_DIR ?? 'chrome-mv3-e2e',
)
export const test = base.extend<{
  context: BrowserContext
  sw: Worker
  extensionId: string
}>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium', // bundled Chromium, new headless supports extensions
      headless: process.env.HEADED !== '1',
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
  extensionId: async ({ sw }, use) => use(sw.url().split('/')[2]),
})
```

- Drive Chrome from the service worker: `sw.evaluate(() => chrome.scripting.executeScript(…))`, `chrome.storage.local.set(...)`, `chrome.commands.getAll()`.
- Open the popup as a page: `chrome-extension://${id}/popup.html`.
- Serve fixture pages over real HTTP with `webServer: { command: 'node e2e/serve.mjs', url: 'http://127.0.0.1:4599' }`.

**Limitations:**

- **activeTab can't be granted** from Playwright: there is no toolbar click, no native context menu, and synthetic keys don't fire commands. Hence the `WXT_E2E=1` build with `host_permissions: ['http://127.0.0.1/*']` and `outDirTemplate: 'chrome-mv3-e2e'`.
- The production build is tested separately: it must **refuse** injection (VERIFIED).
- Branded Chrome and Edge removed `--load-extension` (Playwright docs).
- The MV3 service worker sleeps after about 30 s, and in-flight `evaluate` calls throw `Service worker restarted` (docs).
- Context menus are created asynchronously after install, so poll.
- A popup opened as a tab sees itself as the active tab: `tabs.query({active, currentWindow})` returned `url: undefined`. Have the popup take the target tab explicitly, or test the fill path through the service worker.
- `.e2e.ts` files inside `entrypoints/<name>/` are safe from WXT discovery.

---

## 9. Dev mode, output, zip

**`wxt dev` (VERIFIED).**

- With `webExt: { disabled: true }`, or simply without `web-ext` installed (WXT falls back to its manual runner on `ERR_MODULE_NOT_FOUND`), it prints `Load ".output/chrome-mv3-dev" as an unpacked extension manually` and opens no browser.
- The dev server ran on `localhost:3000`. To avoid clashing with an app under test on that port, set `dev: { server: { port: … } }` (option exists in the config types).
- The dev content script is 3.77 MB unminified.
- `@tailwindcss/vite` prints a cosmetic `[SOURCEMAP_BROKEN]` warning in dev.

**Output (VERIFIED).**

- `wxt build` writes `.output/chrome-mv3/{manifest.json, popup.html, background.js, chunks/popup-*.js, content-scripts/preencher.js, assets/popup-*.css}`.
- The dev output goes to `.output/chrome-mv3-dev`.

**`wxt zip` (VERIFIED).**

- It builds first, then writes `.output/{name}-{version}-chrome.zip` containing 6 files (173 kB).
- A sources zip is produced by default only for Firefox and Opera (source).
- `wxt zip` runs WXT's internal build, not the npm `build` script, so chain the gate after it (see §2).

---

## 10. ASSUMED / not verified

- **activeTab and iframes.** I assume the grant covers only the tab's top-level origin, so cross-origin iframes are skipped as in the host-permission test (§3). Playwright can't produce a real grant.
- **`tab.url` on `chrome://` pages after an action click.** From memory of Chromium's activeTab code, the tab permission is granted even when the host pattern isn't, so the URL would be visible. Check by hand. Fallback: `url == null` means a protected page, and the pill shows a generic label.
- **PDF viewer** behaviour in headed Chrome; see the error-strings bullet in §3.
- **Alt+Shift+P conflicts.** I assume it's free in Chrome; I found no conflict but didn't do an exhaustive search. On macOS it shadows typing "∏" in Chrome while the extension is installed.
- **Filling technique.** The native value setter plus `input`/`change` events is the standard technique for React-controlled inputs; it was verified only on plain inputs. `execCommand('insertText')` for contenteditable was not tested.
- **Paths.** The relative `@source '../../../packages/ui/src'` path is counted, not built (the probe used an absolute path).
- **`@piluvitu/tools` in dev.** It may need `optimizeDeps.exclude: ['@piluvitu/tools']` in the WXT `vite()` hook, by analogy with `apps/financas/web`; the probe didn't use tools.
- **`session:` storage** isn't readable from content scripts by default (Chrome's `TRUSTED_CONTEXTS` default), so keep the "last fill result" (1c) in the popup or background.

## Sources

- npm registry (`npm view … time`)
- installed source under the probe's `node_modules/wxt/dist/**`
- https://wxt.dev/guide/essentials/content-scripts.html
- https://wxt.dev/guide/essentials/unit-testing.html
- https://wxt.dev/guide/essentials/config/browser-startup.html
- https://playwright.dev/docs/chrome-extensions
- https://developer.chrome.com/docs/extensions/develop/concepts/activeTab
- https://developer.chrome.com/docs/extensions/reference/api/commands
- https://developer.chrome.com/docs/extensions/reference/api/contextMenus
- https://developer.chrome.com/docs/extensions/develop/ui/context-menu

## Files in the probe root

- `wxt.config.ts`
- `assets/tailwind.css`
- `utils/pessoa.ts`, `utils/pessoa.test.ts`
- `entrypoints/background/index.ts`, `entrypoints/background/background.test.ts`
- `entrypoints/popup/{index.html,main.tsx,App.tsx,App.test.tsx}`
- `entrypoints/preencher.content/{index.tsx,Toast.tsx}`
- `vitest.config.ts`, `playwright.config.ts`
- `e2e/{fixtures.ts,serve.mjs,extensao.e2e.ts,mecanica.e2e.ts,sem-permissao.e2e.ts,proibidas.e2e.ts}`
