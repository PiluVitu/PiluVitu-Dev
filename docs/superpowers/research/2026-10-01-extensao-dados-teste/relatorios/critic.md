# Completeness critic: cross-check of the 5 research reports (wxt, geradores, deteccao, design, repo)

I spot-checked the riskiest claims myself on 2026-10-01. Nothing in the repo was modified; my scratch files are in `.../scratchpad/research/critic/`. Tags: **[V]** means I re-checked it myself (source given). **[A]** means assumed or judgement.

## Spot-checks I ran (all passed unless listed under CORRECTIONS)

| Claim                                                             | How I checked                                                                                                                                                                                                       | Result                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Título de eleitor DV rules, including the SP/MG split             | Read the `@brazilian-utils` 2.4.0 source: for codes `01`/`02`, remainder 0 becomes 1, on **both** DVs. Then ran 8 vectors against brazilian-utils and an independent rule without the exception (`critic/tit.mjs`). | **[V]** `0043 5687 0906`, `1935 7592 0124`, `3550 2284 0221`, `6010 3848 2879`, `6080 6730 1600` and `1047 3826 0108` pass both rules. `0000 0014 0108` passes only without the exception; `0000 0014 0116` passes only with it. The generator's "redraw unless both rules agree" approach is correct.                            |
| WXT runtime content-script API names                              | Read `wxt@0.21.4` `dist/types.d.mts` and `dist/utils/content-script-context.mjs`                                                                                                                                    | **[V]** `registration: 'manifest'\|'runtime'` (runtime copies `matches` into `host_permissions`), `cssInjectionMode: 'manifest'\|'manual'\|'ui'`, `noScriptStartedPostMessage?: boolean`, plus `ContentScriptContext` (`onInvalidated`, `setTimeout`, `isValid`, `block()`).                                                      |
| Playwright headless with extensions                               | playwright.dev/docs/chrome-extensions                                                                                                                                                                               | **[V]** "Note the use of the `chromium` channel that allows to run extensions in headless mode." Extensions need `launchPersistentContext`. Chrome and Edge removed the side-load flags.                                                                                                                                          |
| A context-menu click and a commands shortcut both grant activeTab | developer.chrome.com activeTab page                                                                                                                                                                                 | **[V]** Triggers are action, context-menu item, commands shortcut and omnibox. Executing scripts needs `scripting`. activeTab "Get[s] the URL, title, and favicon … via an API that returns a `tabs.Tab`". Access is revoked on navigation or tab close.                                                                          |
| ViaCEP entries                                                    | `curl viacep.com.br/ws/<cep>/json/` for 01310-100, 71936-250, 77020-012, 64000-020, 69301-000, 40170-010                                                                                                            | **[V]** Street, bairro, city, state, DDD and complemento all match the geradores table exactly (e.g. 01310-100 "de 612 a 1510 - lado par"; 69301-000 "de 5373/5374 a 6277/6278"; 64000-020 "lado ímpar").                                                                                                                         |
| Vite peer ranges                                                  | `npm view … peerDependencies`                                                                                                                                                                                       | **[V]** `@vitejs/plugin-react@6.1.1` needs `vite: ^8.0.0`. `@vitejs/plugin-react@5.2.0` accepts `^4…^8`. `@wxt-dev/module-react@1.2.2` depends on `@vitejs/plugin-react: ^4.4.1 \|\| ^5 \|\| ^6`. `@storybook/react-vite@10.3.1` and `vitest@4.1.10` accept Vite 7 and 8. `wxt@0.21.4` peers `vite ^6.3.4 \|\| ^7 \|\| ^8.0.0-0`. |
| Repo facts from the repo report                                   | Read `Makefile` and `ci.yml` directly, not through rtk                                                                                                                                                              | **[V]** `lint:` does `cd ../promeia` (broken path). `ci.yml` has 4 jobs (web, financas, ramielle, promeia), not 5.                                                                                                                                                                                                                |

---

## CONTRADICTIONS (and which side should win)

| #   | Topic                                             | Positions                                                                                                                                                                                                                                                                                                                               | Resolution                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | **How the content script is packaged and called** | **wxt:** `defineContentScript({registration:'runtime'})` at `/content-scripts/preencher.js`; `main()` fills immediately and returns the result. **repo:** `defineUnlistedScript` at `/preencher.js`. **deteccao:** mode B and "mostrar" run through `func` + `args` against an isolated-world registry.                                 | Use `defineContentScript` with runtime registration, because `createShadowRootUi` needs a `ctx` and so does invalidation on re-inject. But `main()` should only **install** an idempotent `globalThis.__pv` API (`preencher()`, `inserir(kind)`, `mostrar(frameIdx)`, `limpar()`), not fill. Then:<br>1. The background probes with `func: () => !!globalThis.__pv`.<br>2. If that returns false, it injects the file.<br>3. It calls actions with `func` + `args`.<br>This is the only shape that serves mode A, mode B and "mostrar" from one bundle, since `files` injection can't take arguments. |
| C2  | **Toast styling**                                 | **wxt:** inline Tailwind plus `@piluvitu/ui`, rewrite `:root` to `:host`, React, `anchor:'body'`. **design:** about 50 lines of hand-written px CSS with `--pv-*` variables, no Tailwind or design system, `anchor:'html'`.                                                                                                             | **Design wins.** Measured evidence: rem sizes collapse on sites with `html{font-size:10px}` (25px instead of 40px). The wxt report concedes that "rem still scales with the site's html font-size". WXT also hoists `@property` rules into the host `<head>` ([wxt#1955](https://github.com/wxt-dev/wxt/issues/1955)). Build the toast with plain DOM APIs (`createElement`, `textContent`): no React in the content script, which keeps the bundle small and avoids `innerHTML` and Trusted Types issues [A]. The `:root` to `:host` trick is then unnecessary.                                      |
| C3  | **React plugin and Vite version**                 | **wxt:** module-react + Vite 8.3.1 (verified). **design §13:** module-react + `vite ^7.2.0`. **repo:** `@vitejs/plugin-react ^5.1.0` + Vite 7 (verified, including Storybook).                                                                                                                                                          | The **design combination is broken**: module-react resolves plugin-react 6.1.1, which peers `vite ^8.0.0` [V npm]. The repo report reproduced the failure as `ERR_PACKAGE_PATH_NOT_EXPORTED './internal'`. Choose one of the two verified stacks. I recommend the repo's (Vite 7.3.x like financas-web, plugin-react 5.2.0 already in the lockfile, Storybook verified). Do not mix them.                                                                                                                                                                                                             |
| C4  | `wxt prepare`                                     | **wxt:** `"postinstall": "wxt prepare"`. **repo:** prefix it in the `lint`, `test` and `storybook` scripts instead.                                                                                                                                                                                                                     | **Repo wins.** A failing postinstall makes `pnpm install` exit 1 in **every** CI job, which then blocks the financas auto-deploy (verified by the repo report).                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| C5  | **Keyboard shortcut**                             | **wxt:** named command `preencher-pagina` handled in `commands.onCommand`. **repo:** `_execute_action` with `Alt+Shift+P`.                                                                                                                                                                                                              | **wxt wins.** `_execute_action` only opens the popup, and `onCommand` doesn't fire for it. Design 1a and 1b promise "preenche sem abrir o popup". The repo config needs fixing.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| C6  | **E2E harness**                                   | **wxt:** `WXT_E2E=1` + `outDirTemplate` + `host_permissions http://127.0.0.1/*` + a `webServer serve.mjs` + an `e2e/` folder + root `playwright.fixtures.ts`. **repo:** `wxt build --mode e2e` (outputs `chrome-mv3-e2e`) + `http://teste.local/*` + `context.route().fulfill` + `src/test/extensao.fixture.ts` + colocated `*.e2e.ts`. | **Repo wins.** The root CLAUDE.md colocation law forbids `e2e/` folders, and the repo version needs no env var and no server. Keep the wxt idea of an E2E test that proves the production build **refuses** injection, plus a test that the production manifest has no `host_permissions`.                                                                                                                                                                                                                                                                                                            |
| C7  | **Folder layout, and therefore `@source` depth**  | **repo:** `srcDir:'src'`, `src/styles.css` → `../../../packages/ui/src`. **wxt:** root `assets/tailwind.css` → `../../../`. **design:** `entrypoints/popup/style.css` → `../../../../`.                                                                                                                                                 | Pick `srcDir:'src'` (matches financas-web) with **one** CSS entry at `src/styles.css`, which gives `@source '../../../packages/ui/src'`. All three reports are internally consistent but describe different trees; the plan has to fix one.                                                                                                                                                                                                                                                                                                                                                           |
| C8  | Gate target and gitignore                         | **wxt/repo:** `.output/chrome-mv3`. **design:** `".output/chrome-mv3/assets/*.css"`. **wxt:** app-level `.gitignore`. **repo:** root `.gitignore`.                                                                                                                                                                                      | Both gate forms work, because WXT empties the output folder on each build. Use the folder form, and never point the gate at `.output` itself (the repo report verified a false pass). Use belt and braces: root `.gitignore` entries **plus** `@source not '../.output'` (wxt verified that the `@source not` line alone also makes the broken build fail correctly).                                                                                                                                                                                                                                 |
| C9  | Vitest environment                                | **wxt:** a `// @vitest-environment jsdom` comment per file. **repo:** `environment:'jsdom'` globally + `setupFiles` with `fakeBrowser.reset()` + `cleanup()`.                                                                                                                                                                           | **Repo wins** (matches financas-web, no `globals`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| C10 | WXT auto-imports                                  | **wxt:** `#imports` auto-imports. **design/repo:** `imports:false` with explicit `wxt/utils/storage`, `wxt/browser`.                                                                                                                                                                                                                    | Use `imports:false` (verified green by the repo report).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| C11 | `gerarCPF` signature                              | **geradores:** `gerarCPF(rng = rngPadrao, uf?)`, same rng-first shape as every new generator. **repo:** `gerarCPF(opts?: {prng, formatado})`.                                                                                                                                                                                           | **Geradores wins.** It was verified against the 21 existing tests unchanged, and it is consistent across all 15 modules. Both are backward compatible.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| C12 | **Mode B value formatting**                       | **wxt:** the background computes a raw `valor` string and passes it to `func`. **deteccao:** `valorPara(kind, pessoa, descriptor)` honours the target's `maxLength`, `type=date`, `type=number` and `pattern`.                                                                                                                          | **Deteccao wins.** Format inside the frame (`__pv.inserir(kind)`). Otherwise "Data de nascimento" into a `type=date` field writes `''` (deteccao lab: `'14/03/1991'` becomes `''`).                                                                                                                                                                                                                                                                                                                                                                                                                   |
| C13 | Where the classifier lives, and the test runner   | **deteccao:** `packages/tools/src/campos*.ts` with Jest. The brief scoped only _generators_ to tools. **repo/wxt:** Vitest for the extension. The owner's global rule says "Jest for logic/utils/hooks/services".                                                                                                                       | Put pure logic (generators **and** the classifier/formatter, all DOM-free) in `packages/tools` with Jest. That satisfies the owner's rule and puts no extra load on the extension's Vitest. Extension glue (background handlers, storage, React) goes in Vitest, justified in `apps/extensao/CLAUDE.md` the same way financas does it. **Flag to owner** that this is a deliberate deviation from "Jest everywhere".                                                                                                                                                                                  |
| C14 | Password length                                   | **geradores:** default 14 (12–16 allowed). **deteccao:** ≤12, to fit common `maxLength` limits, and never truncate.                                                                                                                                                                                                                     | Default to **12**. The generator already supports it, and a truncated password breaks the later login.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| C15 | Card copy                                         | **design:** 1b says "recusado por qualquer adquirente real"; 1a says "faixa de sandbox". **geradores:** a fixed catalog of documented test numbers; "refused by real acquirers" is confirmed only for Stripe.                                                                                                                           | Owner decision on copy. Suggested: "Número de teste documentado ({gateway}). Passa no Luhn; só aprova em sandbox." For 1a: "número de teste documentado".                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| C16 | Test fixture                                      | **design §12:** proposes the design's sample person (`P0`) as the fixture. **geradores:** P0 is invalid (RG DV 8 should be 3; CPF region 6 = MG for a person in SP; address number outside the CEP range).                                                                                                                              | Use the golden person `gerarPessoa(sfc32(1,2,3,4),'2026-10-01')` for stories and E2E. Never use P0.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| C17 | "Cidade / UF" combined field                      | Design 1f fills it with "São Paulo / SP". Deteccao test 77 classifies it as `cidade` and writes only the city.                                                                                                                                                                                                                          | Add a `cidadeUf` composite kind when both tokens are in one label, or accept the difference and update the mock.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| C18 | Context menu contents                             | **deteccao:** "21 menu items match 1g". **wxt:** `criarMenus` has no "Abrir caixa de entrada" and no top-level separators.                                                                                                                                                                                                              | The design has **23** Inserir items (7+7+3+4+2, read in `popup.dc.html` lines 294–301), and the second level is `Preencher \| sep \| Inserir › \| sep \| Nova pessoa, Abrir caixa de entrada`. The deteccao taxonomy does list all 23; only the count is wrong. wxt's menu code must add the missing item and separators.                                                                                                                                                                                                                                                                             |

---

## CORRECTIONS (with evidence)

1. **`ACTION_MENU_TOP_LEVEL_LIMIT` (6) applies to the toolbar-icon (action) context menu, not the page menu.** The wxt §5 and deteccao §13 reports cite it for page grouping.
   - Chrome docs: "The maximum number of top level extension items that can be added to an extension _action_ context menu."
   - The automatic grouping is a separate documented behaviour: "If more than one from your extension is visible at once, Google Chrome automatically collapses them into a single parent menu."
   - So the conclusion still holds: the parent title is the manifest `name`, so `name` must be exactly `piluvitu · dados de teste`.
2. **The repo report's `commands: { _execute_action: … }` is wrong for this design** (C5). Use a named command plus `onCommand`.
3. **Design §13's `vite ^7.2.0` + `@wxt-dev/module-react` doesn't build** (C3, npm peer evidence).
4. **`tab.url` on `chrome://` pages after an action click is now VERIFIED from Chromium source.** The wxt report had it as ASSUMED.
   - In `extensions/browser/permissions/active_tab_permission_granter.cc` (main), `GrantIfRequested` always inserts `APIPermissionID::kTab`, which makes the tab's URL and title visible. It adds a host grant only for `UserScript::ValidUserScriptSchemes()` and non-opaque origins. `file://` is dropped unless the user enabled "Allow access to file URLs".
   - Consequences:
     - the popup can show `chrome://settings` in the 1e pill;
     - **no `tabs` permission is needed**;
     - `file://` pages get the URL but no scripting unless the user flips that toggle.
   - Chrome's docs say "Access is not granted to restricted pages, such as chrome://"; that refers to host and scripting access. The tabs reference only says `url` needs "tabs" or host permissions, which is why I went to the source.
5. **Cross-origin iframes under activeTab: now VERIFIED from Chromium source.** The deteccao lab only simulated this with narrow `host_permissions`. The same granter adds only `GetLastCommittedURL()` of the WebContents (the main-frame origin). So `allFrames` silently skipping cross-origin frames, and `frameIds:[crossOrigin]` throwing, are the real activeTab behaviour.
6. **The generator prototypes don't type-check under the tsconfig WXT generates.** Geradores says "tsc strict OK", but that run did not use `noUncheckedIndexedAccess`.
   - [V] With `--noUncheckedIndexedAccess --verbatimModuleSyntax`, `gen/src` has 18 errors: `aleatorio.ts`, `cartao.ts:273-274`, `cpf.ts:5`, `cnpj.ts:7`, `nome.ts:138`, `pis.ts:6`, `prng.ts:51-78`, `titulo-eleitor.ts:25`.
   - The repo's own `cpf.ts`, `cnpj.ts` and `prng.ts` fail the same way.
   - `verbatimModuleSyntax` produced 0 errors (they use `import { type X }`).
   - Resolution: the repo report's `noUncheckedIndexedAccess: false` override in `apps/extensao/tsconfig.json`. Optional follow-up: make `packages/tools` index-safe and give it its own `typecheck` script, since today `pnpm -r lint` never type-checks it.
7. **Time bombs in proposed code and tests:**
   - Deteccao's `classificarFormulario(ds, anoAtual = 2026)` defaults to a hard-coded year. Pass the year derived from `hoje` instead.
   - Geradores' PagBank catalog fixes the expiry at **12/26**, which is past from 2027-01-01, while the extension uses the real today. Store `expiraEm` per catalog entry, skip expired entries when drawing a card, and keep tests on an injected `hojeISO`.
8. **The wxt probe layout breaks the colocation law:** the `e2e/` folder and root `playwright.fixtures.ts` (C6).
9. **Repo-report findings I confirmed:**
   - Makefile `lint:` has `cd ../promeia` and should be `cd apps/promeia`.
   - Root CLAUDE.md says CI has "cinco jobs"; `ci.yml` has 4.
   - These are pre-existing bugs, worth fixing in the same pass that adds the `extensao` job.

---

## GAPS (no report covered these) and recommended resolutions

**G1. One fill orchestrator, and how the popup gets the result back.**

- Put `preencherPagina(tabId)` in the **background**, called from:
  - the command,
  - the menu,
  - the popup, via `runtime.sendMessage({tipo:'preencher', tabId})`.
- Why the background: if the popup awaits `executeScript` itself, it loses the result when it closes, which happens on any outside click.
- The background:
  1. probes or injects (C1);
  2. calls `func: () => __pv.preencher()` with `allFrames:true`;
  3. **aggregates** the per-frame `InjectionResult[]`: `total = Σ`, and every list row tagged `{frameId, documentId, idx}`;
  4. returns the aggregate to the popup as the `sendMessage` response.
- Later calls ("mostrar", outline cleanup) should target `documentIds:[…]` rather than `frameIds`, because frame IDs are reused after navigation [A: `documentId`/`documentIds` from Chrome 106, from memory].

**G2. Multi-frame toast.**

- If each frame's `preencher()` mounted its own toast, every same-origin iframe would show one.
- Resolution: frames only fill and outline. After aggregating, the background calls `__pv.toast(agregado)` on **frame 0 only**.
- Each frame clears its own outlines after 4 s or on the first `focusin`/`pointerdown`. Hover-pause in the top frame won't extend outlines inside iframes; accept that for v1.
- "Click the amber text to scroll to the first unrecognized field": if that field is in an iframe, go through the background (`runtime.sendMessage`, then `executeScript` in that `documentId`).

**G3. Re-fill semantics. Mode A overwrites, then:**

- skip any field whose value already equals the target, to avoid re-triggering CEP lookups;
- on `ctx.onInvalidated`, restore the saved `outline` and `outline-offset`;
- never save _our own_ outline as the field's "previous" value. Keep a WeakMap of originals, filled only on first touch.

WXT re-injection already replaces the toast; wxt verified exactly one toast after two injections.

**G4. Where the "last fill result" (1c) lives.**

- Nothing defined when the popup shows 1c if the fill came from the shortcut or menu.
- v1 recommendation: 1c only right after a popup-initiated fill (in memory); the toast covers shortcut and menu fills.
- If the owner wants 1c on a later popup open: background writes `session:ultimoResultado` = `{tabId, documentId, at}`. Content scripts can't read `session:` by default, but they don't need to. The popup shows it only if it is fresh and the tab still has the same document.

**G5. Shortcut or menu used with no person yet.**

- The 1a footer promises it works. Resolution: if `pessoaItem` is null, the background generates and persists a person first, using `hoje` in `America/Sao_Paulo` and `seedFromBytes(cryptoRandomBytes(16))`.
- Same for "Inserir" and "Abrir caixa de entrada".

**G6. Storage schema and versioning.**

- There are two version markers: `Pessoa.versao: 1` (geradores) and WXT `defineItem(..., { version: 1 })`. Keep **only** the WXT item version.
- Migration policy: any future bump migrates to `null`, and the user simply generates a new person. It's fake data, so there is nothing to preserve.
- Keys:
  - `local:pessoa` (the whole person, not just the seed, as geradores says);
  - optional `local:preferencias` (`{gateway, tamanhoSenha}`);
  - nothing in `sync:`, which would push fake cards and passwords to the Google account.

**G7. Showing the shortcut.**

- Read it with `commands.getAll()`. [V by wxt] It returns `⌥⇧P` on macOS and presumably `Alt+Shift+P` elsewhere.
- An empty string means unassigned or in conflict. Show "definir atalho" in the footer (design copy gap) and open `chrome://extensions/shortcuts` (wxt verified `tabs.create` to that URL works).
- `suggested_key` applies only on first install, so changing the default later doesn't reach existing installs [A].

**G8. Host pill and forbidden-page (1e) detection.**

- Use `tabs.query({active:true, currentWindow:true})` in the popup. The URL is visible thanks to activeTab's `kTab` grant (Correction 4), with no `tabs` permission.
- Decide "forbidden" from two inputs:
  1. URL scheme or host: `chrome:`, `chrome-extension:`, `edge:`, `about:`, `view-source:`, `devtools:`, `chromewebstore.google.com`, `chrome.google.com/webstore`, `data:`;
  2. the `executeScript` error strings, which wxt verified.
- **`file://` is missing from the design.** Scripting there requires the user to enable "Allow access to file URLs" (Chromium source). It needs its own 1e variant: "ative 'Permitir acesso a URLs de arquivo' em chrome://extensions".
- PDF viewer: treat as forbidden if the injection fails, or if `document.contentType === 'application/pdf'` / the URL ends in `.pdf` with 0 fields.

**G9. Mode B feedback when no popup is open.**

- Failure cases: cross-origin iframe (it throws), no focused editable field, restricted page. None of these has anywhere to show an error today.
- Resolution: `action.setBadgeText({tabId, text:'!'})` + `setTitle` (no permission needed), or a one-line toast in frame 0.
- Don't add the `notifications` permission.

**G10. Context menu lifecycle and contexts.**

- Call `removeAll()` then create on **both** `runtime.onInstalled` and `runtime.onStartup`. wxt's `criarMenus` already does `removeAll` first, so it's idempotent. The docs I fetched don't state that menus persist across browser restarts [A].
- Add `'frame'` to the contexts of "Preencher", "Nova pessoa" and "Abrir caixa" so they appear inside iframes [A].
- Keep the dynamic `CPF · …` / `CEP · …` titles updated by `pessoaItem.watch`, registered synchronously at the top level of the service worker.

**G11. Race with the site's own CEP lookup.**

- Forms often call ViaCEP on the CEP field's `input` or `blur`, and asynchronously overwrite rua, bairro and cidade. Many also set **complemento = ViaCEP's `complemento`**: "de 612 a 1510 - lado par" for 01310-100 [V curl], or `""`. That clobbers the person's "Apto 81".
- Resolution: a reconciliation pass about 1 s later, in the same `__pv` instance. Re-write only fields **we** wrote whose value diverged, and fields that were disabled in pass 1 and are now enabled and empty.
- Cover this with a Playwright fixture page that simulates the lookup.

**G12. Filling while the popup has focus.** [A, untested by every report]

- With the popup open, `document.hasFocus()` on the page is false. `el.focus()` and `el.blur()` may not fire `focus`, `blur` or `focusout`, so blur-triggered validators, Angular `touched` and jQuery Validate wouldn't run.
- Deteccao's lab drove fills from the service worker, not from an open popup.
- Resolution: also dispatch synthetic `focus`, `focusin`, `blur` and `focusout` events (Bitwarden dispatches its own focus and key events). Add a manual check to the release checklist, because Playwright can't open a real popup.

**G13. Field kinds the generator can't fill yet.**

- `usuario` has no field in `Pessoa`. Suggest `email.usuario`, e.g. `vinicius.costa.6607`.
- "Telefone fixo" is mapped to `celular` (deteccao test 67). Strict landline validators reject a 9-digit number. Add `telefoneFixo` with `(DD) [2-5]XXX-XXXX`, or accept the mismatch.
- `cidadeUf` composite: see C17.
- `sexo` select matching needs candidates such as `F`, `Feminino`, `Mulher`, `Female`.
- RG is always `SSP/SP` even for a person in Natal. Acceptable, but the RG órgão emissor and UF fields stay unrecognized by design.
- `primeiroNome` may be a compound first name ("Maria Eduarda"); that's fine.

**G14. Minimum Chrome version.**

- Set `minimum_chrome_version` to cover:
  - `checkVisibility({opacityProperty, visibilityProperty, contentVisibilityAuto})` [A: these option names are Chrome 121+; older ones are `checkOpacity` / `checkVisibilityCSS`, so pass both sets];
  - `documentIds` (106) [A];
  - `chrome.dom.openOrClosedShadowRoot` (88).
- Suggest `"121"`.

**G15. Stories (owner's global rule).**

- The design report left Storybook open. Adopt the repo report's verified Option B: a separate react-vite 10.3.1 Storybook on port 6018.
- Stories for the presentational states 1a–1e and 1j, with props in and no `browser.*` calls.
- The vanilla toast gets a story through a decorator that mounts it inside a real shadow root on a "hostile" host page (`html{font-size:10px}`, `:root{--primary:red}`), so the isolation design is exercised in review.

**G16. Clipboard in the popup** [A]

- `navigator.clipboard.writeText` should work in the focused popup without the `clipboardWrite` permission, but no report verified the clipboard contents.
- Add a Vitest test that mocks `navigator.clipboard`, plus one E2E test with `context.grantPermissions(['clipboard-read'])` against `popup.html`.

**G17. Privacy and the future Web Store listing.**

- The CWS Privacy practices tab requires [V developer.chrome.com/docs/webstore/cws-dashboard-privacy]:
  - a single-purpose description;
  - a justification **per permission**;
  - a remote-code declaration;
  - the data-usage disclosure checkboxes;
  - a privacy-policy link.
- Draft now:
  - single purpose: "gera dados de teste brasileiros e preenche formulários";
  - `activeTab` + `scripting`: fill the page the user invoked it on;
  - `contextMenus`: Inserir;
  - `storage`: keep the generated test person locally;
  - remote code: none;
  - data collected: none, since everything stays on the device. Publish a short policy page, e.g. `piluvitu.com.br/extensao/privacidade`.
- Keep that claim true:
  - fonts bundled, never Google Fonts (design report);
  - no analytics;
  - the only network action is opening the public inbox in a new tab.
- Mention the public inbox in the listing.
- Whether this applies to unlisted items: [A] assume yes, since unlisted items still go through review.

**G18. Team distribution details.**

- An unlisted Web Store item gives auto-update.
- `wxt zip` + "Load unpacked" means manual updates and Chrome's developer-mode warning.
- The extension ID differs per path when unpacked. That's harmless here, since nothing is allowlisted by ID.
- Document both routes in `apps/extensao/CLAUDE.md`.

**G19. Devcontainer rule.** The owner's global rule says to run tests in the devcontainer, but there is none in the repo (repo report, [V]). State in `apps/extensao/CLAUDE.md` that tests run on the host, like every other workspace.

**G20. Inconsistent numbers in the 1f mock.** It shows "12 de 14" but lists 13 labels (11 data fields plus 2 unrecognized). Build the E2E fixture so the toast assertion is internally consistent, e.g. 13 fields giving "11 de 13".

**G21. Page-visible traces.**

- WXT announces re-injection with a `document` `CustomEvent` named `<extId>:preencher:wxt:content-script-started`, which the page can observe. That's harmless.
- Set `noScriptStartedPostMessage: true` (an option that exists, [V]) so no `window.postMessage` reaches the site under test.
- Never write `data-*` attributes into the site's DOM. Deteccao's WeakRef registry already avoids that.

---

## Decisions to put to the owner

1. Vite 7 + plugin-react 5 (recommended) or Vite 8 + module-react (C3).
2. Classifier in `packages/tools` with Jest (recommended), and Vitest in the extension as a documented exception to "Jest everywhere" (C13).
3. Card copy (C15) and default password length 12 (C14).
4. Whether 1c appears after a shortcut fill (G4).
5. `cidadeUf` and `telefoneFixo` kinds (C17, G13).
6. Icon (1h or 1i) and the low outline contrast. These are already raised in the design report and still open.

## Scratch artefacts

- `/private/tmp/claude-501/-Users-piluvitu-WWW-PiluVitu-Dev/8edd1313-ac44-4917-a3ae-1ea4365be1c4/scratchpad/research/critic/tit.mjs` — título cross-validation
- `/private/tmp/claude-501/-Users-piluvitu-WWW-PiluVitu-Dev/8edd1313-ac44-4917-a3ae-1ea4365be1c4/scratchpad/research/critic/atpg.cc` — Chromium `active_tab_permission_granter.cc`, main branch

## Sources

- [Chrome activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)
- [Chrome contextMenus](https://developer.chrome.com/docs/extensions/reference/api/contextMenus)
- [Chrome tabs](https://developer.chrome.com/docs/extensions/reference/api/tabs)
- [CWS privacy practices](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [Playwright chrome-extensions](https://playwright.dev/docs/chrome-extensions)
- [Chromium active_tab_permission_granter.cc](https://raw.githubusercontent.com/chromium/chromium/main/extensions/browser/permissions/active_tab_permission_granter.cc)
- [wxt#1955](https://github.com/wxt-dev/wxt/issues/1955)
- [flaviocopes: identify the active page](https://flaviocopes.com/courses/browser-extensions/identify-the-active-page/) — a search result, superseded by the Chromium source
- `https://viacep.com.br/ws/<cep>/json/`
- npm registry (`npm view … peerDependencies`)
