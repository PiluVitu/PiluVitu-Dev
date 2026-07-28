# Spike: shared `packages/ui` (Tailwind 4 + shadcn/ui) across Next.js and Vite

**Type:** measurement spike (no repo changes). All builds/experiments ran in
throwaway scaffolding under
`/private/tmp/claude-501/-Users-piluvitu-WWW-PiluVitu-Dev/c30e9c2f-23e8-41f0-9aa3-b76c947011bf/scratchpad/`
(`ui-spike/`, `real-repro/`, `chart-spike/`). Nothing in the repo was
modified — real repo files were only `Read`/copied, never written.

Versions in play (from the repo's actual lockfiles/package.json, confirmed by
`pnpm install` resolving the same majors in the scratchpad workspaces):
Next 16.2.1, React 19.2.4/19.2.8, Tailwind CSS 4.2.2, `@tailwindcss/postcss`
4.2.2, Vite 7.3.6 (declared `^7.2.0`), `@vitejs/plugin-react` 5.1.0, pnpm
11.1.1.

---

## 1. Current state of `apps/web`'s Tailwind 4 setup

**No `tailwind.config.*` file exists anywhere under `apps/web`** (confirmed —
`find apps/web -maxdepth 2 -iname "tailwind*"` only turns up
`node_modules/{tailwind-merge,tailwindcss,tailwindcss-animate}`). This is a
fully CSS-first v4 setup.

**PostCSS wiring** (`apps/web/postcss.config.mjs`, verbatim):

```js
/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}

export default config
```

Next's own webpack/Turbopack pipeline picks this up automatically (no extra
Next config needed for Tailwind itself).

**Tokens/theme** live entirely in `apps/web/app/globals.css` (277 lines).
Structure:

- `@import 'tailwindcss';` + `@plugin '@tailwindcss/typography';` at the top.
- `@custom-variant dark (&:is(.dark *));` — this is what makes `dark:` work;
  it's a plain descendant-selector variant, not tied to any JS theme library.
- A single `@theme { ... }` block mapping `--color-*`, `--font-*`,
  `--radius-*`, `--animate-*` design tokens onto CSS custom properties (e.g.
  `--color-primary: hsl(var(--primary));`), plus `@keyframes` for accordion
  and a 3D card wobble.
- `@utility container { ... }` — a custom utility override (v4's replacement
  for `theme.container` in a JS config).
- Three `@layer base` blocks: Tailwind v3-compat border-color, the actual
  `:root`/`.dark` HSL variable values (light + "Cloud" dark palette), and the
  `* { @apply border-border }` / `body { @apply bg-background text-foreground font-sans }` resets.
- Below that: hand-written CSS for `rehype-pretty-code` dual-theme shiki
  tokens and `.post-prose` article styling (not Tailwind-generated).

**shadcn deps** (`apps/web/package.json`, confirmed by direct read):
`class-variance-authority ^0.7.1`, `clsx ^2.1.1`, `tailwind-merge ^3.5.0`,
`tailwindcss-animate ^1.0.7`, `next-themes ^0.4.6`, plus
`@tailwindcss/typography ^0.5.19`. 15 components live in
`apps/web/components/ui/` (aspect-ratio, avatar, badge, button, card,
command, dialog, dropdown-menu, form, input, label, separator, skeleton,
sonner, textarea) — confirmed by `find`.

**`apps/financas/web` has no Tailwind at all**: `src/styles.css` is 58 lines
of hand-written CSS (`color-scheme: light dark` reset, table/nav styling, one
`.alerta` class). `vite.config.ts` has no Tailwind plugin. Confirmed by
direct read of both files.

**Conclusion:** matches the brief exactly. Extraction target is a pure
CSS-first v4 theme (no JS config to merge) plus 15 components that already
depend only on `cn()` (clsx + tailwind-merge), CVA, and (for one component)
`next-themes`.

---

## 2. Does `@source` work across a pnpm workspace symlink? (build AND dev, Next AND Vite)

### Setup

Built a real 2-app pnpm workspace in `scratchpad/ui-spike/`:
`packages/ui` (`@spike/ui`, `"exports": {".": "./src/index.ts"}`, no build
step — same shape as `@piluvitu/tools`) exporting a `SpikeButton` whose
`className` uses **arbitrary-value Tailwind utilities that exist nowhere
else**: `p-[137px] bg-[#ff00aa] text-[13.5px] dark:bg-[#00ffaa]`. Two
consumers: `apps/web-mini` (Next 16.2.1 + `@tailwindcss/postcss`, mirrors the
real `apps/web` setup) and `apps/vite-mini` (Vite 7 + `@tailwindcss/vite`).
Each app's own entry component also carries a real local marker utility,
`mt-[271px]`, as a control to prove the scanner works at all for
in-project files.

`pnpm install` confirmed the expected symlink:
`apps/web-mini/node_modules/@spike/ui -> ../../../../packages/ui` (readlink
resolves to `packages/ui`) — genuine pnpm workspace symlink, not a copy.

### Next.js / Turbopack — production build

**Without `@source`** (`globals.css` = just `@import 'tailwindcss';`):

```
$ rm -rf .next && next build
✓ Compiled successfully
```

Emitted CSS (`.next/static/chunks/0jk9fya~o4t9h.css`):

- `271px` (local, `app/page.tsx`'s own `mt-[271px]`): **1 match — present**
- `137px` (from `@spike/ui` via the symlink): **0 matches — absent**
- `ff00aa`: **0 matches — absent**

**With `@source '../../../packages/ui/src';` added to `globals.css`:**

```
✓ Compiled successfully
```

Emitted CSS (`.next/static/chunks/06.7j7.4h8z5o.css`) now contains:

```css
.mt-\[271px\]{margin-top:271px}.bg-\[\#ff00aa\]{background-color:#f0a}.p-\[137px\]{padding:137px}.text-\[13\.5px\]{font-size:13.5px}@media (prefers-color-scheme:dark){.dark\:bg-\[\#00ffaa\]{...
```

All three markers present. **Confirmed: production build silently drops
classes from a symlinked workspace package unless `@source` points at it;
`@source` fixes it.**

### Next.js / Turbopack — dev server

Stripped `@source` again, ran `next dev` on port 4411, waited for it to come
up, fetched `/`, extracted the linked CSS chunk
(`/_next/static/chunks/apps_web-mini_app_globals_0i_x04p.css`):

- `271px`: 2 matches — present
- `137px`: **0 — absent**
- `ff00aa`: **0 — absent**

**Turbopack dev mode fails identically to the production build** — this is
NOT a "looks fine in dev" situation for Next. The failure is visible
immediately in dev, same as prod.

### Vite — production build

Same pattern. Without `@source`: `271px` present, `137px`/`ff00aa` absent in
`dist/assets/index-*.css`. With `@source '../../../packages/ui/src';` in
`src/index.css`: all three present, confirmed byte-for-byte identical rule
text to the Next case (`.p-\[137px\]{padding:137px}` etc.).

### Vite — dev server (the interesting divergence)

Stripped `@source`, cleared `node_modules/.vite` cache, ran `vite --force`
on a fresh port, fetched `/src/index.css` directly:

- `271px`: 1 — present
- `137px`: **1 — present**
- `ff00aa`: **1 — present**

**Vite's dev server DOES pick up the symlinked package's classes without
`@source`** — repeated twice (with and without a forced cache clear) to rule
out a stale-cache artifact; same result both times.

### Conclusion (measured, not assumed)

|                   | Next/Turbopack `build` | Next/Turbopack `dev`                                 | Vite `build`        | Vite `dev`      |
| ----------------- | ---------------------- | ---------------------------------------------------- | ------------------- | --------------- |
| Without `@source` | **classes dropped**    | **classes dropped**                                  | **classes dropped** | classes present |
| With `@source`    | classes present        | (not re-tested; build already proves scanning works) | classes present     | classes present |

The brief's framing ("dev looks fine, production is unstyled") is **true for
Vite** but **false for Next** — Next's Turbopack dev server reproduces the
missing-class bug immediately, so a Next-only team would likely catch this
in local dev. A Vite-only team (i.e. `apps/financas/web`) would NOT catch it
until a production build — this is exactly the trap the spike was
commissioned to check for, confirmed real for the Vite side specifically.

`@source '<relative-path-to-workspace-package>/src'` in each consuming app's
entry CSS file is the fix, and it is required in both bundlers regardless of
this dev/prod asymmetry.

---

## 3. Does shipping raw `.tsx` source work for both consumers?

### Next.js: is `transpilePackages` actually required?

Removed `transpilePackages: ['@spike/ui']` from `next.config.mjs` entirely
(`next.config.mjs` reduced to `{}`) and rebuilt:

```
✓ Compiled successfully
✓ Finished TypeScript
```

Build succeeded. Checked the actual output, not just exit code:
`.next/server/app/index.html` (the prerendered HTML) contains the literal
string `"Spike Button"` — the component fully server-rendered. CSS chunk
still had `137px` present.

**Under Next 16.2.1 with Turbopack (the default bundler), `transpilePackages`
was not necessary for a raw, un-built `.tsx` workspace dependency to compile,
type-check, and SSR correctly.** This is a genuine, measured surprise
against the conventional (webpack-era) guidance. Caveat: **not tested under
webpack** — Next 16 still supports `--webpack`/legacy config, and
`transpilePackages` was originally a webpack-era mechanism (Next assumes
`node_modules` code is pre-compiled unless told otherwise); it's plausible
webpack mode still needs it. Recommend keeping `transpilePackages` in the
real config regardless — it's the documented, forward-compatible way to
declare "this workspace package needs my toolchain" even if Turbopack
happens not to strictly require it today.

### Vite: is `optimizeDeps.exclude` actually required?

This mattered because `apps/financas/web/vite.config.ts` has this exact
comment today:

```ts
// @piluvitu/tools é fonte TS linkada pelo workspace: sem exclude, o
// pre-bundle do Vite tenta tratar como dep publicada e falha no .ts.
optimizeDeps: { exclude: ['@piluvitu/tools'] },
```

**Test A — synthetic package with a real npm dependency.** Added `clsx` (a
real, external npm dependency, matching what a real `packages/ui` would
need) to `@spike/ui`, removed `optimizeDeps.exclude` from `vite-mini`'s
config entirely, cleared `node_modules/.vite`, and ran both `vite build`
(exit 0) and `vite --force` dev server. Fetched the served module chain:
`@spike/ui` resolved via `/@fs/.../packages/ui/src/spike-button.tsx` (never
entered the dep optimizer), while `clsx` itself got pre-bundled normally to
`/node_modules/.vite/deps/clsx.js`. Zero errors, correct output.

**Test B — the actual real files.** To rule out "my synthetic package is too
simple," copied the _real_ `packages/tools` and `apps/financas/web`
(verbatim `rsync`, unmodified) into a fresh scratchpad pnpm workspace,
stripped `optimizeDeps.exclude` from the copied `vite.config.ts`, installed,
and ran both `vite build` (exit 0, 81 modules transformed,
`dist/assets/index-*.js` produced) and `vite dev`. Fetched
`src/pages/new-entry.tsx` (a real page that imports
`{ formatBRL, parseBRL, splitInstallments }` from `@piluvitu/tools/money`)
from the dev server — it resolved cleanly via
`/@fs/.../packages/tools/src/money.ts`, server log showed no errors.

**Conclusion: could not reproduce the failure the code comment describes**,
neither with a minimal synthetic package (JSX + a real dependency) nor with
the exact real `@piluvitu/tools` package as it's actually consumed today, on
the currently-installed Vite 7.3.6 / pnpm 11.1.1. Two honest caveats:

1. `apps/financas/web` today only ever imports the dependency-free
   `@piluvitu/tools/money` subpath — never `qr-encode`/`qr-decode`/`entropy`,
   which pull in `@zxing/browser` and `qrcode`. I did not specifically test
   importing one of _those_ subpaths from the Vite app, which is the closer
   analogue to a `packages/ui` component pulling in `class-variance-authority`
   etc. (my `clsx` test in Test A is the closest proxy I ran, and it also did
   not reproduce a failure).
2. The comment may reflect a real failure on a Vite/pnpm version in use when
   it was written, since fixed upstream. I did not bisect Vite versions.

**Recommendation:** re-verify narrowly before relying on this — try
removing `exclude` in a real branch against the actual `packages/ui` once it
exists with its full dependency set (cva, clsx, tailwind-merge, and whatever
radix packages the extracted components need), rather than assuming either
the old comment or this spike's inability to reproduce it. Keeping
`optimizeDeps.exclude: ['@piluvitu/ui']` costs nothing even if unneeded, so
there's no harm carrying it forward defensively.

---

## 4. Does `next-themes` actually gate the shared components, or is it just `dark:` + a class?

`grep -rl "next-themes" apps/web` (excluding node_modules) returns exactly
three files: `components/theme-provider.tsx`, `components/mode-toggle.tsx`,
and `components/ui/sonner.tsx`.

**Of the 15 components in `components/ui/` (the actual shadcn primitives),
only `sonner.tsx` imports `next-themes`:**

```tsx
import { useTheme } from 'next-themes'
...
const { theme = 'system' } = useTheme()
...
<Sonner theme={theme as ToasterProps['theme']} ... />
```

It uses `useTheme()` for exactly one thing: to read the current theme string
and forward it as a plain `theme` prop to the underlying `sonner` package's
`<Toaster>` — `sonner` itself has no next-themes dependency, it just accepts
`'light' | 'dark' | 'system'` as a prop.

The other 14 (`aspect-ratio`, `avatar`, `badge`, `button`, `card`,
`command`, `dialog`, `dropdown-menu`, `form`, `input`, `label`, `separator`,
`skeleton`, `textarea`) contain **zero** references to `next-themes` or
`useTheme` — their dark-mode styling is entirely `dark:*` Tailwind classes,
which resolve via the plain CSS mechanism in `globals.css`:
`@custom-variant dark (&:is(.dark *));`. That only requires a `.dark` class
somewhere in the ancestor chain — no React context, no provider, nothing
JS-specific.

`theme-provider.tsx` (wraps `next-themes`' `<ThemeProvider>`) and
`mode-toggle.tsx` (the toggle button, calls `useTheme()` to call
`setTheme()`) are **not** in `components/ui/` — they're app-level
orchestration components in `apps/web/components/`, i.e. not part of the "15
shadcn primitives" a `packages/ui` extraction would obviously take verbatim.
`apps/web/app/(site)/layout.tsx` is where `<ThemeProvider defaultTheme="dark">`
actually gets mounted.

**Checked whether `next-themes` itself has a hard `next` dependency** by
reading the real installed package's `package.json`
(`node_modules/.pnpm/next-themes@0.4.6.../package.json`):

```json
"peerDependencies": {
  "react": "^16.8 || ^17 || ^18 || ^19 || ^19.0.0-rc",
  "react-dom": "^16.8 || ^17 || ^18 || ^19 || ^19.0.0-rc"
}
```

No `next` peer or regular dependency at all, despite the package name —
it's a plain React context + `localStorage` library.

`apps/financas/web/src/styles.css` currently has **zero** theme-toggling
logic — just `color-scheme: light dark;`, which only affects native form
control rendering via OS/browser preference, no `.dark` class anywhere.

**Conclusion:** theming is provider-agnostic for 14 of 15 components — they
need only _something_ to toggle a `.dark` class on an ancestor element,
which the Vite SPA could do with a ~10-line vanilla script
(`localStorage` + `classList.toggle`), no library required. For `sonner.tsx`
specifically, the Vite SPA has two real options, both measured-viable: (a)
install `next-themes` directly — confirmed it has no framework lock-in, so
this works outside Next.js too — or (b) fork that one component to accept an
explicit `theme` prop instead of reading React context, decoupling it from
any specific theme-management library.

---

## 5. Chart library: recharts + React 19, real bundle cost, and alternatives

### React 19 compatibility

`npm view recharts version` → `3.10.1`.
`npm view recharts peerDependencies --json`:

```json
{
  "react": "^16.8.0 || ^17.0.0 || ^18.0.0 || ^19.0.0",
  "react-is": "^16.8.0 || ^17.0.0 || ^18.0.0 || ^19.0.0",
  "react-dom": "^16.0.0 || ^17.0.0 || ^18.0.0 || ^19.0.0"
}
```

React 19 is explicitly declared as a supported peer, not just permitted by a
loose range. `pnpm install` in the scratchpad resolved `react@19.2.8` +
`recharts@3.10.1` with no peer-dependency warnings.

**Runtime verification (not just "it installed"):** built a Vite app with a
real `<ResponsiveContainer><LineChart>...</LineChart></ResponsiveContainer>`
(CartesianGrid, XAxis, YAxis, Tooltip, Legend, Line — the shape shadcn's
`chart.tsx` wrapper drives), served the built `dist/` over a static HTTP
server, and drove it with the monorepo's own already-installed Playwright
(1.59.1, reused read-only via its absolute `node_modules/.pnpm` path — no
repo file touched) via headless Chromium:

```json
{
  "svgCount": 2,
  "pathCount": 2,
  "lineCount": 1,
  "errors": []
}
```

The chart genuinely renders (2 `<svg>`, 1 `.recharts-line` element) with
zero console/page errors under React 19 in a real browser.

### Bundle cost — measured, not estimated

All builds: Vite 7.3.6, `minify: 'esbuild'`, single-entry, gzip via Vite's
own reporter.

| Build                                                     | Raw JS        | Gzip JS       |
| --------------------------------------------------------- | ------------- | ------------- |
| Baseline (React 19 + ReactDOM only, no chart)             | 193.38 KB     | 60.72 KB      |
| + recharts 3.10.1 (1 LineChart, grid/axes/tooltip/legend) | 569.13 KB     | 170.76 KB     |
| **Marginal cost of recharts**                             | **375.75 KB** | **110.04 KB** |
| + chart.js 4.5.1 + react-chartjs-2 5.3.1 (1 Line chart)   | 349.80 KB     | 115.69 KB     |
| **Marginal cost of chart.js+react-chartjs-2**             | **156.42 KB** | **54.97 KB**  |

`react-chartjs-2`'s registry metadata (`npm view react-chartjs-2
peerDependencies --json`) also explicitly supports React 19
(`"react": "^16.8.0 || ^17.0.0 || ^18.0.0 || ^19.0.0"`).

**recharts costs about 2× chart.js+react-chartjs-2 in gzip** for an
equivalent single-line chart (110.04 KB vs 54.97 KB marginal gzip).

### "Is there a lighter option that still fits shadcn's chart API?"

Checked this against the live shadcn/ui docs (fetched, not recalled from
training): shadcn's `chart` component is **explicitly built on Recharts, not
library-agnostic**. Direct quotes from
`https://ui.shadcn.com/docs/components/chart`: _"We use Recharts under the
hood,"_ and the component is composed by importing real Recharts pieces
directly in your own code (`import { Bar, BarChart } from "recharts"`) —
shadcn only supplies thin wrapper components (`ChartContainer`,
`ChartTooltip`, `ChartTooltipContent`) around Recharts primitives, not an
abstraction over an arbitrary charting engine.

**So: no, there isn't a lighter option that "fits shadcn's chart API" as
shipped** — chart.js/react-chartjs-2 is lighter, but adopting it would mean
writing (and maintaining) a custom chart wrapper instead of using shadcn's
stock `chart` component/CLI recipe. That's a real trade-off to make
consciously, not a free lunch.

### The Cloudflare Worker 3 MB limit — does it even apply here?

Verified against Cloudflare's own current platform-limits docs (fetched
fresh, not assumed): the 3 MB (Free plan) / 10 MB (Paid plan) **gzip** limit
applies **only to the Worker's own script bundle**. Static assets served via
the Workers Static Assets binding are governed by a **separate** limit (25
MiB per file, 20,000/100,000 files per version) and do **not** count against
the script-size cap.

`apps/financas`'s own `CLAUDE.md` records the Worker script's current real
size: **332.34 KiB gzip / 1926.25 KiB total** (measured in Task 3, with
`better-auth` in the graph) — nowhere near either limit.

**A chart component used only inside client-side SPA components (a static
asset served from `web/dist`) does not count against the Worker's 3 MB
script limit at all.** The real, relevant constraint is the SPA's own
page-weight/load-time budget, not the Cloudflare Workers script cap. The
task's framing conflated the two — worth correcting before anyone budgets a
chart library against "the 3 MB limit."

### What it means for the current SPA bundle

Today: `apps/financas/web/dist/assets/index-L4XCRCIx.js` (a pre-existing
build artifact in the repo, inspected read-only, not created by this spike)
is **238,889 bytes raw / 75,855 bytes gzip** (~76 KB gzip — matches the
brief's figure almost exactly). Adding one recharts LineChart would roughly
**+110 KB gzip on top of the current ~76 KB total** (i.e., bundle size would
roughly triple, to ~186 KB gzip) — a real, non-trivial page-weight increase
for a SPA that currently has none. chart.js+react-chartjs-2 would add ~55 KB
gzip instead (~131 KB gzip total) but requires writing a custom chart
wrapper rather than using shadcn's stock component.

---

## Summary of files/paths referenced

- Real repo (read-only): `apps/web/postcss.config.mjs`,
  `apps/web/app/globals.css`, `apps/web/package.json`,
  `apps/web/components/ui/*.tsx`, `apps/web/components/theme-provider.tsx`,
  `apps/web/components/mode-toggle.tsx`,
  `apps/financas/web/vite.config.ts`, `apps/financas/web/src/styles.css`,
  `apps/financas/web/package.json`, `packages/tools/package.json`,
  `apps/financas/CLAUDE.md` (Worker bundle size figure),
  `apps/financas/web/dist/assets/index-L4XCRCIx.js` (pre-existing, inspected
  for its real gzip size).
- Scratchpad scaffolding (throwaway, not part of the repo):
  `scratchpad/ui-spike/` (`@spike/ui` + `web-mini` Next app + `vite-mini`
  Vite app), `scratchpad/real-repro/` (verbatim copies of
  `packages/tools` + `apps/financas/web` used to re-test `optimizeDeps`
  against the real package), `scratchpad/chart-spike/` (recharts vs.
  chart.js bundle-size comparison + Playwright runtime smoke test).
