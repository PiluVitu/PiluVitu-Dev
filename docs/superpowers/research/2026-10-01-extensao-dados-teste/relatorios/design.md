# @piluvitu/ui implementation map for the popup, page toast and icons

I built a throwaway WXT probe from the real `packages/ui` source and rendered it in Chromium 147 (Playwright `playwright-core@1.59.1`). I then compared it with the real design. I took the design measurements from the Claude Design preview of `Popup Dados de Teste.dc.html`, which is the same file as `scratchpad/design/popup.dc.html`.

- **State 1b:** header, middle and footer match the design to the pixel (47 / 512 / 41 px, 600 px total). Element positions are within 1 px.
- **States 1a, 1c, 1d, 1e:** 1a matches exactly. 1c, 1d and 1e come out 2.5–4 px shorter (see §5).

No repo file was modified. `git status` now shows an untracked `docs/superpowers/design/` folder. It was not there at session start and I did not write it, so another process created it during this session.

Every claim is tagged:

- **[V]** verified, with the source or measurement given.
- **[A]** assumed or inferred.

---

## 0. Findings that change the implementation (read first)

1. **[V] Chrome changes `body` font in extension pages.** It applies `body{font-family:system-ui,sans-serif;font-size:12px}` (75%) through a stylesheet that does not appear in `document.styleSheets`.
   - It beats Tailwind's `@layer base` body rule, because rules outside a layer win over rules inside one.
   - Measured: the body computed to `system-ui, sans-serif` / 12px even though the CSS had `@apply font-sans` in `@layer base`.
   - **Fix (verified):** an unlayered `body{font-family:var(--font-sans);font-size:1rem;line-height:normal}` after the imports.
   - The exact Chromium source file name is [A]. I could not find it.
2. **[V] The real `Button` has no `gap`.** The design's DS Button has `gap: 8px`, but `packages/ui/src/button.tsx` cva has no gap class, so an icon and its text would touch. Add `gap-2` at every call site.
   - The design's `sm` is 13px / radius 14px; the real `sm` is `text-xs` (12px) / `rounded-md` (16px).
   - Override with `text-[13px] rounded-[14px]`. Measured after the override: lg 40×348 r16, sm 32×170 r14, the same as the design.
3. **[V] Line height differs from the design.** Tailwind preflight sets `html{line-height:1.5}`, while the design canvas uses `normal`. Header and footer came out 48.8 / 43.5 px until the body got `line-height: normal`; after that they were 47 / 41, matching the design.
4. **[V] The toast (1f) must not use `packages/ui` or Tailwind inside its Shadow DOM.** Measured in Chromium on a hostile host page (`html{font-size:10px}`, `:root{--primary:0 100% 50%}`, `*{font-family:Comic Sans!important}`), a Button-like element using `packages/ui` CSS inside a shadow root got:
   - a **red** background: the host's `--primary` leaked in, because `packages/ui` declares its tokens on `:root` and `.dark`, never `:host`;
   - a **25px** height instead of 40: `h-10` is in rem, which follows the host's root size;
   - a **0px** radius: `--radius` was undefined in the shadow;
   - **no shadow:** `@property` registrations do not apply inside shadow roots.
   - WXT's `createShadowRootUi` also moves every `@property` and `@font-face` rule into a `<style>` in the host page's `<head>` ([V] from the source, regex `/@(property|font-face)…/`). That can break the site under test ([wxt#1955](https://github.com/wxt-dev/wxt/issues/1955), open).
   - **Fix:** about 50 lines of hand-written CSS in px with its own `--pv-*` variables (§9). I tested it on the same hostile page and it renders correctly.
5. **[V] Correction to the brief: the extension CSP does not block Google Fonts.** The MV3 default for extension pages is `script-src 'self'; object-src 'self';`, with no `font-src` or `style-src` ([Chrome docs](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy)). Bundle the fonts locally anyway: it works offline, Google is not pinged on every popup open, and there is no flash of fallback font.
   - What the CSP does block is inline `<script>`. Financas' `index.html` inline script that applies the theme before first paint cannot be copied.
6. **[V] WXT parses `manifest.default_icon` meta content as strict JSON.** `content="{ 16: '/icon/16.png' }"` produced `"default_icon":"{ 16: … }"` as a string, which is a broken manifest. `content='{ "16": "/icon/16.png", "32": "/icon/32.png" }'` produced the correct object.
7. **[V] `@wxt-dev/auto-icons@1.1.2` resizes one source to every size** (`sharp(base).resize(size)`, with sizes `[128,48,32,16]` and output `icons/<n>.png`). It cannot use the separate pixel-hinted 16px drawing, and it overwrites `manifest.icons`. Use committed PNGs rendered by a small sharp script (§11).
8. **[V] The design-system build gate works for WXT output:**
   - `node ../../scripts/check-tailwind-source.mjs ".output/chrome-mv3/assets/*.css"` exits 0 with `@source`.
   - It exits 1 with `@source` removed; the CSS also shrinks from 55.4 to 33.6 kB.

---

## 1. Sources read

- Design file `scratchpad/design/popup.dc.html`, all 471 lines, plus the preview, screenshotted and measured.
- Claude Design DS (project 6f140c40…, untrusted data, used as data only): `readme.md`, `_ds_manifest.json`, `tokens/{colors,typography,spacing,shape,motion}.css`, `styles.css`, and the `_ds_bundle.js` Button / Avatar / Badge sections (to learn the canvas metrics).
- `packages/ui`: `CLAUDE.md`, `src/styles.css`, `button.tsx`, `avatar.tsx`, `badge.tsx`, `card.tsx`, `separator.tsx`, `cn.ts`, `package.json`.
- `apps/financas/web`: `package.json`, `vite.config.ts`, `index.html`, `src/styles.css`, `main.tsx`, `lib/theme.ts`, `lib/tipografia.ts`, `lib/superficie.ts`, `blocos/ChipEscopo.tsx`, and the `App.tsx` icon imports.
- `apps/web`: `package.json` (icons), `components/tools/copy-button.tsx`, `components/profile-visit-card.tsx` (the brand-mark SVG).
- npm on 2026-10-01:

| Package                                  | Latest                                                        | Package                             | Latest                      |
| ---------------------------------------- | ------------------------------------------------------------- | ----------------------------------- | --------------------------- |
| `wxt`                                    | 0.21.4 (engines node ≥22; vite peer `^6.3.4 \|\| ^7 \|\| ^8`) | `tailwindcss` / `@tailwindcss/vite` | 4.3.3 (vite peer `^5.2–^8`) |
| `@wxt-dev/module-react`                  | 1.2.2                                                         | `lucide-react`                      | 1.49.0                      |
| `@wxt-dev/auto-icons`                    | 1.1.2 (dep `sharp ^0.35.3`)                                   | `@fortawesome/react-fontawesome`    | 3.5.0                       |
| `@fontsource-variable/plus-jakarta-sans` | 5.3.0 (OFL)                                                   | `@fortawesome/free-solid-svg-icons` | 7.3.1                       |
| `@fontsource-variable/jetbrains-mono`    | 5.3.0 (OFL)                                                   | `sharp`                             | 0.35.5 (no install script)  |
|                                          |                                                               | `vite`                              | 8.3.1                       |

---

## 2. Token mapping: design inline CSS → Tailwind class

Everything is backed by `@theme` in `packages/ui/src/styles.css` [V]. I confirmed each class with an opacity modifier is emitted in the probe's built CSS.

| Design inline                           | Class                                                                                                                |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `hsl(var(--background))`                | `bg-background`                                                                                                      |
| `hsl(var(--foreground))`                | `text-foreground`                                                                                                    |
| `hsl(var(--muted-foreground))`          | `text-muted-foreground`                                                                                              |
| `hsl(var(--primary))`                   | `text-primary`, `bg-primary`                                                                                         |
| `hsl(var(--primary-foreground) / 0.14)` | `bg-primary-foreground/[0.14]`                                                                                       |
| `hsl(var(--border))`                    | `border` (default colour comes from the base rule copied from financas), `bg-border` for a hairline, `border-border` |
| `hsl(var(--card))`                      | `bg-card`                                                                                                            |
| `hsl(var(--accent))` (hover)            | `hover:bg-accent`                                                                                                    |
| `hsl(var(--ok))`                        | `bg-ok`, `text-ok`                                                                                                   |
| `hsl(var(--ok) / .10)`                  | `bg-ok/10`                                                                                                           |
| `hsl(var(--ok) / .12)`                  | `bg-ok/12`                                                                                                           |
| `hsl(var(--ok) / .4)`                   | `border-ok/40`                                                                                                       |
| `hsl(var(--warn))`                      | `text-warn`, `bg-warn`, `border-warn`                                                                                |
| `hsl(var(--warn) / .35)`                | `border-warn/35`                                                                                                     |
| `hsl(var(--warn) / .08)`                | `bg-warn/[0.08]`                                                                                                     |
| `hsl(var(--warn) / .5)`                 | `border-warn/50`                                                                                                     |
| `var(--accent-soft)`                    | `bg-accent-soft`                                                                                                     |
| `var(--accent-line)`                    | `border-accent-line`                                                                                                 |
| `var(--font-mono)` / `var(--font-sans)` | `font-mono` / `font-sans`                                                                                            |
| `999px`                                 | `rounded-full`                                                                                                       |

Notes:

- **[V] `var(--accent-soft)` and `var(--accent-line)` do not exist as raw variables in `packages/ui`.** Only `--color-accent-soft` and `--color-accent-line` exist, as theme variables. Use the classes.
- **[V] Radius scale in this DS:**

  | Class         | Value                   |
  | ------------- | ----------------------- |
  | `rounded-sm`  | 14px                    |
  | `rounded-md`  | 16px                    |
  | `rounded-lg`  | 18px                    |
  | `rounded-xl`  | 12px (Tailwind default) |
  | `rounded-2xl` | 16px                    |

  Design radii map to `rounded-[6px]` (kbd), `rounded-[8px]` (copy button), `rounded-[10px]` (row), `rounded-xl` (notice and dashed items, 12px) and `rounded-[14px]` (panels, tiles, toast). Prefer explicit values, as financas does (`superficie.ts` warns about this mismatch).

- **[V] Shadows:** the design's `var(--shadow-lg)` = `0 12px 24px rgb(0 0 0/.14)` is a Claude Design token and is not in `packages/ui`. In the popup it only belongs to the canvas frame, so do not draw it; Chrome draws its own popup frame [A]. The toast uses it as a literal.
- **[V] Odd sizes** (9.5 / 10.5 / 12.5 / 13 / 17 px) are arbitrary values: `text-[10.5px]`, `tracking-[0.2em]`, `tracking-[0.12em]`, `tracking-[-0.01em]`, `tracking-[-0.02em]`. Tailwind's named sizes (`text-xs`, `text-sm`, `text-base`) also set a line-height; arbitrary sizes do not. Where the design gives a line-height, pass it explicitly (`leading-[1.55]`, `leading-normal`, `leading-[1.4]`, `leading-[1.25]`, `leading-[1.2]`).
- **[V] `cn()` / tailwind-merge 3.5.0 resolves the overrides used here:**
  - `bg-muted` → `bg-accent-soft`
  - `text-xs` → `text-[13px]`
  - `border-input` → `border-accent-line`
  - `rounded-xl shadow-sm` → `rounded-[14px] shadow-none`

---

## 3. Design-system components: what to use, and the gaps

| Visual element                                                      | Component                                                                                                        | Notes                                                                                                                                                                                |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Primary CTA ("Gerar pessoa", "Preencher esta página")               | `Button size="lg"` + `className="w-full gap-2"`                                                                  | [V] 40px tall, radius 16, 14px font. Variants available: default, destructive, outline, secondary, ghost, link. Sizes available: default (h-9), sm (h-8), lg (h-10), icon (h-9 w-9). |
| "Nova pessoa", "Caixa de entrada", "Ver os dados", "Tentar de novo" | `Button size="sm"` + `variant` outline / default / ghost + `className="w-full gap-2 rounded-[14px] text-[13px]"` | [V] measured 32×170 r14 13px. Disabled state: `disabled` gives opacity .5 and no pointer events (1e).                                                                                |
| Avatar with initials                                                | `Avatar` + `AvatarFallback className="bg-accent-soft text-primary font-sans text-[13px] font-bold"`              | [V] 40px, round. The design DS fallback is 13px/600, with the design overriding to 700.                                                                                              |
| Info panels (1a list, 1d breadcrumb, 1e person)                     | `Card` + `className="rounded-[14px] px-3.5 py-3 shadow-none …"`                                                  | [V] merges correctly. Do not use CardHeader / CardContent (`p-6`).                                                                                                                   |
| Hairlines (group header, "Não reconhecidos")                        | `<span className="h-px flex-1 bg-border" />`, or `Separator className="flex-1"`                                  | `Separator` renders `h-[1px] w-full bg-border`; both work.                                                                                                                           |
| Filter chips, host pill, breadcrumb pills, kbd                      | Local components                                                                                                 | **Gap:** `Badge` does not fit (`rounded-md`, `text-xs font-semibold`, a non-interactive `div`).                                                                                      |
| Icon tile 40×40 (1c ok, 1d / 1e neutral)                            | Local `IconeTile`                                                                                                | Gap.                                                                                                                                                                                 |
| Progress segments, toast                                            | Local                                                                                                            | Gap.                                                                                                                                                                                 |
| Typography constants                                                | Local `tipografia.ts`                                                                                            | Financas' `ROTULO_SECAO` is 10px/600; the design here uses 10.5px/500. Do not reuse it; keep extension-local constants.                                                              |

**Icons.** apps/web uses Font Awesome (`@fortawesome/react-fontawesome ^3.3.0`, `@fortawesome/free-solid-svg-icons ^7.2.0`, `@fortawesome/fontawesome-svg-core ^7.2.0`). Financas uses `lucide-react ^1.33.0`. The design, and the DS readme ("Font Awesome Free is the icon system"), use FA solid.

- **Recommendation: Font Awesome, with the same ranges as apps/web.** This was verified in the probe:
  - `config.autoAddCss = false`;
  - `@import '@fortawesome/fontawesome-svg-core/styles.css'` in the popup CSS;
  - no runtime `<style>` injected (only one stylesheet in the document).
- [V] All 13 glyphs exist in FA 7.2.0: `faUserPlus faBolt faShuffle faInbox faArrowUpRightFromSquare faCheck faCopy faEye faCrosshairs faMagnifyingGlass faRotateRight faLock faXmark`. FA 7 glyphs differ slightly from the FA 6.5.2 CDN build the design used (for example `copy`).
- Lucide fallback, all present in 1.33.0 [V]: UserPlus, Zap, Shuffle, Inbox, ExternalLink, Check, Copy, Eye, Crosshair, Search, RotateCw, Lock, X. Lucide is outline-stroke, so it looks lighter than the design at 10–13px.
- The content-script toast uses inline SVG paths, with no icon library (§9).

---

## 4. Popup base files (repo paths as proposed)

### `apps/extensao/entrypoints/popup/style.css`

[V] Compiled and rendered. The only change for the repo is the relative path: from this file, `../../../../packages/ui/src`.

```css
@import 'tailwindcss';
@import '@fontsource-variable/plus-jakarta-sans/wght.css';
@import '@fontsource-variable/jetbrains-mono/wght.css';
@import '@fortawesome/fontawesome-svg-core/styles.css';
@import '@piluvitu/ui/styles.css';
@source '../../../../packages/ui/src';

@layer base {
  :root {
    --font-plus-jakarta: 'Plus Jakarta Sans Variable';
    --font-jetbrains: 'JetBrains Mono Variable';
    color-scheme: light;
  }
  .dark {
    color-scheme: dark;
  }
  *,
  ::after,
  ::before,
  ::backdrop,
  ::file-selector-button {
    border-color: hsl(var(--border));
  }
  html,
  body {
    width: 380px;
  }
  body {
    margin: 0;
    @apply bg-background text-foreground font-sans antialiased;
  }
}

/* fora de @layer: o Chrome injeta body{font-family:system-ui;font-size:75%} em páginas de extensão — vence qualquer @layer */
body {
  font-family: var(--font-sans);
  font-size: 1rem;
  line-height: normal;
}
```

- **[V] Font family names.** Fontsource-variable registers `'Plus Jakarta Sans Variable'` and `'JetBrains Mono Variable'`, not the plain names financas uses. `packages/ui` resolves `--font-sans: var(--font-plus-jakarta, …)` and `--font-mono: var(--font-jetbrains, …)`, which is why the two variables are set here. Verified loaded: `document.fonts` showed both families.
- **[V] Font files emitted:** about 145 kB of woff2 (latin 27 kB + 40 kB; the cyrillic-ext files are under 4 kB and get inlined).
  - Optional slimming: write custom `@font-face` rules pointing only at the `files/*-latin-wght-normal.woff2` files (exports allow `./files/*`). pt-BR accents are all in U+0000–00FF.
  - `→` (U+2192, used in "abrir caixa →") and `⌥⇧` are in no Google subset, so they render from a system fallback font. apps/web has the same behaviour.
- **Copy the financas `border-color` base rule** [V]. Without it, `border` uses `currentColor` in Tailwind 4.

### `entrypoints/popup/index.html`

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <title>piluvitu · dados de teste</title>
    <!-- vira action.default_title (tooltip) [V] -->
    <meta
      name="manifest.default_icon"
      content='{ "16": "/icon/16.png", "32": "/icon/32.png" }'
    />
    <!-- JSON estrito [V] -->
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

### `entrypoints/popup/tema.ts`

This must be the **first import** of `main.tsx`; no inline script is possible.

```ts
const media = window.matchMedia('(prefers-color-scheme: dark)')
const aplicar = () =>
  document.documentElement.classList.toggle('dark', media.matches)
aplicar()
media.addEventListener('change', aplicar)
```

### `main.tsx` head

```ts
import './tema' // primeiro: ESM avalia na ordem
import { config } from '@fortawesome/fontawesome-svg-core'
import './style.css'
config.autoAddCss = false
```

---

## 5. Component tree

Files in the probe:

- `scratchpad/research/ui/wxt-probe/components/{PopupShell.tsx,Dados.tsx,Estados.tsx,Marca.tsx,tipografia.ts}`
- `entrypoints/popup/{main.tsx,tema.ts,style.css}`

### Rendered vs design

| State | Shell height (probe) | Design              | Difference                   |
| ----- | -------------------- | ------------------- | ---------------------------- |
| 1a    | 422.8                | 422.8               | exact                        |
| 1b    | 600 (47 / 512 / 41)  | 600 (47 / 512 / 41) | ≤1 px on chips and first row |
| 1c    | 434                  | 438                 | −4 px                        |
| 1d    | 434.7                | 437.6               | −2.9 px                      |
| 1e    | 395.9                | 398.4               | −2.5 px                      |

- **Why 1c–1e are short [A]:** text using `normal` line-height in Plus Jakarta, because the fontsource variable files have different vertical metrics from the Google static files the design loaded. Fix with explicit `leading-*` if pixel parity matters.
- **Chip widths:** 48 / 75 / 62 px (Tudo / Pessoais / E-mail), the same as the design [V].
- **Copy rows:** 38 px tall. Clicking copy does not change row tops or heights (measured before and after); the label reverts after 1.4 s [V].

```
<PopupApp>  (estado: '1a'|'1b'|'1c'|'1d'|'1e'; dados via chrome.storage)
└─ <PopupShell host status rodape>            flex max-h-[600px] flex-col
   ├─ <header> (flex-none)                    flex items-center gap-2 border-b py-3 pr-3 pl-3.5 leading-[normal]
   │   ├─ <Marca> 18px text-primary           (SVG viewBox 0 0 22 22 — igual apps/web profile-visit-card.tsx [V])
   │   ├─ "piluvitu" text-sm font-bold tracking-[-0.01em]
   │   │  + "dados de teste" font-mono text-[9.5px] font-medium tracking-[0.12em] uppercase text-muted-foreground
   │   └─ <HostPill status: ok|warn|lock>     ml-auto min-w-0 rounded-full border px-2 py-[3px] font-mono text-[10.5px] font-medium
   │        dot size-1.5 rounded-full bg-ok|bg-warn  •  lock: faLock text-[9px]  •  host <span class="truncate"> (+title=URL completa [A])
   ├─ <main> (rolável)                        min-h-0 flex-1 overflow-y-auto overscroll-contain
   │   ├─ 1a <PrimeiroUso>
   │   ├─ 1b <PersonHeader> <ActionBar> <FilterChips sticky> <GroupSection>×N{ <GroupHeader> <CopyRow>×n [<PublicInboxNotice>|<CardSandboxNote>] }
   │   ├─ 1c <FillResult> { IconeTile ok, título, meta, <SegmentosProgresso>, <ListaNaoReconhecidos>, dica, 2 botões }
   │   ├─ 1d <NenhumCampo> { IconeTile, h2, p, Card(breadcrumb), 2 botões }
   │   └─ 1e <PaginaProibida> { IconeTile lock, h2, p, Button disabled, Card(pessoa) }
   └─ <Rodape atalho texto onAlterar?>  (ausente em 1e)
        flex-none flex items-center gap-2 border-t px-4 py-2.5 font-mono text-[11px] leading-[normal] font-medium text-muted-foreground
        <kbd> rounded-[6px] border px-1.5 py-0.5 text-foreground   • "alterar": <button> ml-auto text-primary hover:underline underline-offset-[3px]
```

### Key components (verified code, condensed)

```tsx
// tipografia.ts
export const OVERLINE = 'font-mono text-[10.5px] font-medium uppercase tracking-[0.2em]'
export const META_MONO = 'font-mono text-[11px] font-medium text-muted-foreground'

// PersonHeader: px-4 pt-4 pb-3.5 flex items-center gap-3
<Avatar><AvatarFallback className="bg-accent-soft text-primary font-sans text-[13px] font-bold">{iniciais}</AvatarFallback></Avatar>
<div className="flex min-w-0 flex-col gap-[3px]">
  <div className="text-base font-bold tracking-[-0.01em]">{nome}</div>
  <div className={META_MONO}>{idade} anos · {cidade}, {uf}</div>
</div>
// iniciais = (partes[0][0] + partes.at(-1)[0]).toUpperCase()  → "MS"

// ActionBar: flex flex-col gap-2 px-4 pb-4
<Button size="lg" className="w-full gap-2">
  <FontAwesomeIcon icon={faBolt} className="text-[13px]" />Preencher esta página
  <kbd className="bg-primary-foreground/[0.14] ml-1 rounded-[6px] px-1.5 py-0.5 font-mono text-[10.5px] font-medium">{atalho}</kbd>
</Button>
<div className="grid grid-cols-2 gap-2">
  <Button variant="outline" size="sm" className={BOTAO_SM}><FontAwesomeIcon icon={faShuffle} className="text-xs" />Nova pessoa</Button>
  <Button variant="outline" size="sm" className={BOTAO_SM}><FontAwesomeIcon icon={faInbox} className="text-xs" />Caixa de entrada
    <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="text-muted-foreground text-[10px]" /></Button>
</div>
// BOTAO_SM = 'w-full gap-2 rounded-[14px] text-[13px]'

// FilterChips: sticky top-0 z-10 bg-background border-t px-4 pt-3 pb-2.5 flex flex-wrap gap-1.5
<button type="button" aria-pressed={on} className={cn(
  'cursor-pointer rounded-full border px-2.5 py-1.5 font-mono text-[11px] leading-none font-medium transition-colors duration-200',
  on ? 'bg-accent-soft text-primary border-accent-line' : 'text-muted-foreground border-border bg-transparent')}>{rotulo}</button>

// GroupHeader: flex items-center gap-2.5 px-2 pt-3.5 pb-1.5
<span className={cn(OVERLINE,'text-muted-foreground')}>{rotulo}</span>
<span className="text-primary font-mono text-[10.5px] font-medium">{String(n).padStart(2,'0')}</span>
<span className="bg-border h-px flex-1" />
// list wrapper around groups: px-2 pb-3

// CopyRow (no layout shift: fixed 92px column; the 28px button sets row height)
<div className={cn('grid grid-cols-[92px_minmax(0,1fr)_28px] items-center gap-2.5 rounded-[10px] py-[5px] pr-1 pl-2 transition-colors duration-200', copiado && 'bg-ok/10')}>
  <span className="text-muted-foreground text-xs" aria-live="polite">
    {copiado ? <span className="text-ok font-mono text-[11px] font-semibold">copiado</span> : rotulo}</span>
  <span className="font-mono text-[12.5px] leading-[1.4] font-medium [overflow-wrap:anywhere]">{valor}</span>
  <button type="button" aria-label={`Copiar ${rotulo}`} title="Copiar" className={cn(
    'hover:bg-accent flex size-7 cursor-pointer items-center justify-center rounded-[8px] transition-colors duration-200',
    copiado ? 'text-ok' : 'text-muted-foreground')}><FontAwesomeIcon icon={copiado ? faCheck : faCopy} className="text-xs" /></button>
</div>
// useCopiado(1400): one key at a time; clearTimeout on re-copy, on unmount and on "Nova pessoa"

// PublicInboxNotice (after the rows of group "email")
<div className="border-warn/35 bg-warn/[0.08] mx-2 mt-1.5 mb-0.5 flex gap-2.5 rounded-xl border px-3 py-2.5 text-xs leading-normal">
  <FontAwesomeIcon icon={faEye} className="text-warn mt-1 text-[11px]" />
  <span className="text-pretty"><strong className="text-warn font-semibold">Caixa pública.</strong> Quem souber o endereço lê os e-mails. Só para teste, nunca para conta real.{' '}
    <button type="button" className="text-primary cursor-pointer underline-offset-[3px] hover:underline">abrir caixa →</button></span>
</div>

// CardSandboxNote (after group "cartao")
<p className="text-muted-foreground mx-2 mt-1.5 mb-0.5 text-xs leading-normal text-pretty">Número de sandbox: passa no Luhn e é recusado por qualquer adquirente real.</p>
```

**Accessibility additions not in the design [A]:**

- Add `focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring` to the local buttons (chips, copy, crosshair, "alterar").
- Keep `aria-pressed` on the chips.
- Give "Mostrar na página" a `size-7 -my-1` button. In the design it is an `<i>` with only a pointer cursor.

---

## 6. States 1a, 1c, 1d, 1e (verified render, `components/Estados.tsx`)

Shared constants:

```
H2_ESTADO = 'm-0 text-[17px] leading-[1.25] font-bold tracking-[-0.01em]'
CORPO     = 'm-0 text-[13px] leading-[1.55] text-muted-foreground text-pretty'
CODIGO    = 'font-mono text-xs'
PAINEL    = Card + 'rounded-[14px] px-3.5 py-3 shadow-none'
IconeTile = 'size-10 flex-none rounded-[14px] border flex items-center justify-center'
            + ok:     'border-ok/40 bg-ok/12 text-ok'
            + neutro: 'bg-card text-muted-foreground'
```

- **1a PrimeiroUso.** Container `flex flex-col gap-3.5 px-5 pt-7 pb-5`.
  - Overline `OVERLINE text-primary`.
  - h2 `text-[20px] leading-[1.2] font-bold tracking-[-0.02em]`.
  - Paragraph `CORPO`.
  - PAINEL with `gap-2`; each row `grid grid-cols-[72px_1fr] gap-2.5 text-[12px] leading-[1.4]` (key `font-mono text-primary`, value `text-muted-foreground`).
  - `Button lg w-full gap-2` with `faUserPlus`.
  - Footer: "preenche sem abrir o popup", no "alterar".
- **1b.** As in §5. Footer "preenche sem abrir" plus "alterar".
- **1c FillResult.** Container `px-4 pt-[18px] pb-4 gap-3.5`.
  - IconeTile ok with `faCheck`.
  - Title `text-[16px] font-bold tracking-[-0.01em]`; meta line `META_MONO` "{pathname} · com {nome}".
  - Segments: `flex gap-[3px]`, `role="img"` with an aria-label. Filled: `h-1.5 flex-1 rounded-[3px] bg-ok`. Unrecognised: `… border border-dashed border-warn`.
  - "Não reconhecidos" header: `mt-1`, count `text-warn` zero-padded.
  - List items: `rounded-xl border border-dashed border-warn/50 px-3 py-[9px] flex items-center gap-2.5`. Label `text-[13px] font-semibold`; selector `font-mono text-[11px] text-muted-foreground [overflow-wrap:anywhere]`; crosshair button.
  - Hint `text-xs leading-normal text-muted-foreground` with `<span class="font-mono text-foreground">piluvitu › Inserir</span>`.
  - Buttons: `Button sm` (default) "Caixa de entrada" with `faInbox`, and outline sm "Ver os dados".
  - Footer: "preenche de novo".
  - [A] With many fields the segments get thin. Above about 40, switch to two proportional segments.
- **1d NenhumCampo.** Container `px-4 pt-5 pb-4 gap-3.5`.
  - IconeTile neutral with `faMagnifyingGlass`; `H2_ESTADO`; `CORPO` with `CODIGO` spans for `name`, `id`, `autocomplete`.
  - PAINEL `gap-2.5`: intro `text-[12px] text-muted-foreground`; pills `rounded-full border px-2 py-[3px] font-mono text-[11px] font-medium` separated by `›` (`text-muted-foreground`); the last pill "CPF" is `border-accent-line bg-accent-soft text-primary`.
  - Buttons: outline sm "Tentar de novo" (`faRotateRight`), ghost sm "Ver os dados".
  - Footer "preenche sem abrir". Host dot = **warn**.
- **1e PaginaProibida.** Same layout.
  - IconeTile `faLock`; host pill shows a lock icon instead of the dot.
  - `Button lg disabled w-full gap-2` with `faBolt`.
  - PAINEL `flex items-center gap-3`: name `text-[13px] font-semibold`, line `text-[12px] text-muted-foreground`, `Button outline sm ml-auto rounded-[14px] text-[13px]`.
  - **No footer.**
- **Host-status semantics [A, inferred from the design]:**
  - `ok` = page can be scripted (1a, 1b, 1c);
  - `warn` = last fill recognised nothing (1d);
  - `lock` = forbidden page (1e).
  - The forbidden check should rely on `scripting.executeScript` failing, not only the URL. The PDF viewer is not detectable from `tab.url`.

---

## 7. Dark and light

- **[V] `packages/ui` dark mode is class-based:** `@custom-variant dark (&:is(.dark *))`, plus `.dark{…}` overriding the `:root` tokens.
- **[V] Financas:** `.dark` on `<html>`, with `'claro'|'escuro'|'sistema'` in `localStorage` and an inline `<head>` script. That script is not possible here (MV3 CSP).
- **Recommendation:** follow `prefers-color-scheme` with `tema.ts` as the first import (§4). Ship no theme toggle in v1: the design's `tema` Tweak is a canvas control only.
  - If a toggle is wanted later, store it in `localStorage` of the extension origin, which is synchronous. `chrome.storage` is asynchronous and would flash.
- [V] Both themes render correctly (Playwright `colorScheme` dark and light). Light-mode screenshots: `popup-1b-light.png`.
- In light mode the brand washes `accent-soft` / `accent-line` stay sky-400 at 13% / 32% under dark `--primary` text, as documented in `packages/ui/CLAUDE.md`.
- [A] Whether Chrome's own Light/Dark appearance setting drives `prefers-color-scheme` in extension pages is unverified; on the OS default it follows the system.
- The toast follows the same media query inside its own CSS (§9).

---

## 8. Popup sizing

- **[V] Size limits:** Chrome clamps popups to between 25×25 and 800×600 px ([chrome.action docs](https://developer.chrome.com/docs/extensions/reference/api/action)). The popup takes the size of its content; avoid `vh` / `vw`, which create circular sizing ([extension.js popup sizing](https://extension.js.org/docs/implementation-guide/popup-sizing)).
- **Implementation [V in a tab at 380×600]:**
  - `html, body{width:380px}`;
  - shell `flex max-h-[600px] flex-col`;
  - header and footer `flex-none`;
  - middle `min-h-0 flex-1 overflow-y-auto overscroll-contain`;
  - chips `sticky top-0 z-10 bg-background` inside the middle region.
  - 1b reaches exactly 600; the other states are content height.
- **Do not draw** the canvas frame (1px border, 10px radius, `shadow-lg`) [A]. Chrome draws the popup bubble.
- [A] Windows classic scrollbars take about 15px from the middle region. The row grid's `minmax(0,1fr)` absorbs it. Optionally add `[scrollbar-width:thin]`.
- [A] On short screens Chrome may cap the popup below 600, which is the reason the middle region scrolls.

---

## 9. In-page toast 1f (Shadow DOM)

Tested: `scratchpad/research/ui/shadow-probe/toast-final.css`, `run3.mjs`.

**[V] Results on the hostile page:**

- Width 300px at right 16 / bottom 16.
- Title 13px in the system font, correct colours.
- Hovering pauses the timer: no `animationend` after 4.5 s with the pointer over it; it ended after the pointer left.

**[V] CSP and style injection (`csp-ext/`):**

- From a content script (isolated world) under a page CSP `style-src 'self'`, both a `<style>` inside the shadow root and `adoptedStyleSheets` apply.
- From the main world, a `<style>` inside a shadow root **is** blocked.
- `el.style.setProperty(...,'important')` on page fields works under strict CSP.

**[V] Which rule wins:**

- A host page rule `*{font-family:X!important}` matches the shadow host and beats a plain `:host{font:…}`.
- Use `:host{all:initial!important}`, which WXT already adds [V, from source], and set the font and colour on the inner `.toast`.

```css
:host {
  all: initial !important;
  position: fixed !important;
  right: 16px !important;
  bottom: 16px !important;
  z-index: 2147483647 !important;
}
.toast {
  --pv-card: hsl(0 0% 100%);
  --pv-fg: hsl(222 36% 9%);
  --pv-muted: hsl(215 18% 35%);
  --pv-border: hsl(216 30% 88%);
  --pv-primary: hsl(198 93% 26%);
  --pv-warn: hsl(38 92% 31%);
  box-sizing: border-box;
  width: 300px;
  overflow: hidden;
  background: var(--pv-card);
  color: var(--pv-fg);
  border: 1px solid var(--pv-border);
  border-radius: 14px;
  box-shadow: 0 12px 24px rgb(0 0 0/0.14);
  font:
    400 13px/1.4 ui-sans-serif,
    system-ui,
    -apple-system,
    'Segoe UI',
    Roboto,
    sans-serif;
  letter-spacing: normal;
  text-align: left;
  -webkit-font-smoothing: antialiased;
}
@media (prefers-color-scheme: dark) {
  .toast {
    --pv-card: hsl(222 36% 9%);
    --pv-fg: hsl(215 33% 93%);
    --pv-muted: hsl(216 17% 64%);
    --pv-border: hsl(205 40% 18%);
    --pv-primary: hsl(198 93% 60%);
    --pv-warn: hsl(43 96% 56%);
  }
}
.toast *,
.toast *::before,
.toast *::after {
  box-sizing: border-box;
  margin: 0;
}
.linha1 {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 12px 8px 14px;
}
.marca {
  width: 14px;
  height: 14px;
  flex: none;
  color: var(--pv-primary);
}
.titulo {
  font-size: 13px;
  font-weight: 600;
}
.fechar {
  margin-left: auto;
  display: flex;
  padding: 4px;
  border: 0;
  background: none;
  color: var(--pv-muted);
  cursor: pointer;
  border-radius: 6px;
}
.fechar svg {
  width: 12px;
  height: 12px;
}
.linha2 {
  padding: 0 14px 12px 38px;
  font:
    500 11px/1.4 ui-monospace,
    SFMono-Regular,
    Menlo,
    Consolas,
    monospace;
  color: var(--pv-muted);
}
.warn {
  all: unset;
  color: var(--pv-warn);
  cursor: pointer;
}
.warn:hover {
  text-decoration: underline;
  text-underline-offset: 3px;
}
.trilho {
  height: 2px;
  background: var(--pv-border);
}
.barra {
  height: 2px;
  background: var(--pv-primary);
  transform-origin: left;
  animation: pv-tempo 4s linear forwards;
}
.toast:hover .barra {
  animation-play-state: paused;
}
@keyframes pv-tempo {
  from {
    transform: scaleX(1);
  }
  to {
    transform: scaleX(0);
  }
}
```

Markup and behaviour:

- **Markup:** `<div class="toast" role="status">`, then `.linha1` (mark SVG 22-viewBox, `.titulo`, `<button class="fechar" aria-label="Fechar">` with an xmark SVG), then `.linha2` (`<button class="warn">{k} não reconhecidos</button> · contorno tracejado`), then `.trilho > .barra`.
- **xmark path (FA 7.2.0 `faXmark`, viewBox `0 0 384 512`):**
  `M55.1 73.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L147.2 256 9.9 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192.5 301.3 329.9 438.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.8 256 375.1 118.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192.5 210.7 55.1 73.4z`
- **Dismissal:** remove the toast and all field outlines on the bar's `animationend` or on "Fechar".
- **Font [V reasoning]:** use the system font stack only. A custom `@font-face` does not work inside a shadow root ([Rob Dodson](https://robdodson.me/at-font-face-doesnt-work-in-shadow-dom)), and WXT would hoist it into the host `<head>`. Hoisting would also need `web_accessible_resources`.
- **Mounting:** use WXT `createShadowRootUi(ctx, { name: 'piluvitu-aviso', position: 'inline', anchor: 'html', css: toastCss })`, where `toastCss` comes from `import toastCss from './toast.css?inline'`.
  - [V] `options.css` is supported by WXT 0.21.4.
  - Do **not** use `cssInjectionMode: 'ui'` with Tailwind.
  - [A] Anchor to `html` rather than `body`, so a `transform` on `body` cannot capture the fixed position.
- **Design artefact:** at 300px the second line wraps ("…contorno / tracejado") in both the design and the probe. [A] Accept it, or use `white-space: nowrap`.
- **[A] Gaps in the design:**
  - copy when k = 0 (suggest hiding `.linha2`);
  - singular "1 de 1 campo preenchido".

---

## 10. Field outlines on the host page

- **Values (from the design):**
  - filled: `outline: 2px solid #38bdf8; outline-offset: 1px`;
  - not recognised: `outline: 2px dashed #f5b82e; outline-offset: 1px`.
  - These are fixed literals, independent of theme. `#f5b82e` is not exactly the dark `--warn` (≈`#fbbd23`); keep the design value.
- **Applying them:** use `el.style.setProperty('outline', …, 'important')` [V, works under strict CSP]. Save the previous inline `outline` and `outline-offset` values and restore them.
- **Removing them:** with the toast, or on the first `pointerdown` / `focusin` inside a filled field.
- **Scrolling:** clicking the amber text scrolls with `scrollIntoView({block:'center'})` to the first unrecognised field.
- **[V by arithmetic] Contrast on white is low:** cyan is 2.14:1 and amber 1.78:1, below WCAG 1.4.11's 3:1. This is a design decision for the owner, not a bug.

---

## 11. Icons, 1h vs 1i

Files: `scratchpad/research/ui/icons/`, with the rendered PNGs and SVGs.

### Verbatim from the design (viewBox 0 0 16 16)

```xml
<!-- 1h smooth (32/48/128) -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="3.5" fill="#0a0f1a"/><rect x="3" y="8.5" width="4.5" height="4.5" rx="0.9" fill="#38bdf8"/><rect x="8.5" y="8.5" width="4.5" height="4.5" rx="0.9" fill="#38bdf8"/><rect x="8.5" y="3" width="4.5" height="4.5" rx="0.9" fill="#38bdf8"/></svg>
<!-- 1h 16px, pixel-hinted -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges"><rect width="16" height="16" fill="#0a0f1a"/><rect x="3" y="8" width="5" height="5" fill="#38bdf8"/><rect x="9" y="8" width="5" height="5" fill="#38bdf8"/><rect x="9" y="2" width="5" height="5" fill="#38bdf8"/></svg>
<!-- 1i smooth -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="3.5" fill="#38bdf8"/><rect x="3" y="8.5" width="4.5" height="4.5" rx="0.9" fill="#0a0f1a"/><rect x="8.5" y="8.5" width="4.5" height="4.5" rx="0.9" fill="#0a0f1a"/><rect x="8.5" y="3" width="4.5" height="4.5" rx="0.9" fill="#0a0f1a"/><rect x="4.6" y="3" width="1.3" height="4.5" rx="0.3" fill="#0a0f1a"/></svg>
<!-- 1i 16px, pixel-hinted -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges"><rect width="16" height="16" fill="#38bdf8"/><rect x="3" y="8" width="5" height="5" fill="#0a0f1a"/><rect x="9" y="8" width="5" height="5" fill="#0a0f1a"/><rect x="9" y="2" width="5" height="5" fill="#0a0f1a"/><rect x="5" y="2" width="1" height="5" fill="#0a0f1a"/></svg>
```

### Measured rendering with sharp 0.35.2 [V]

| Size  | Result                                                                                                              |
| ----- | ------------------------------------------------------------------------------------------------------------------- |
| 16px  | Hinted variants have 0 blended pixels: two colours, fully sharp.                                                    |
| 32px  | 1h lands on whole pixels (×2), so only the rounded corners blend. 1i's cursor (x 4.6 / w 1.3 → 9.2 / 2.6 px) blurs. |
| 48px  | ×3 puts 8.5 → 25.5, a half pixel, so every inner edge blurs.                                                        |
| 128px | Fine.                                                                                                               |

### Proposed pixel-snapped variants (new; [A] design-faithful, [V] sharp edges)

```xml
<!-- 1i 32px: only the cursor moves (x9 w3, centred in its quadrant) -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#38bdf8"/><rect x="6" y="17" width="9" height="9" rx="1.8" fill="#0a0f1a"/><rect x="17" y="17" width="9" height="9" rx="1.8" fill="#0a0f1a"/><rect x="17" y="6" width="9" height="9" rx="1.8" fill="#0a0f1a"/><rect x="9" y="6" width="3" height="9" rx="0.6" fill="#0a0f1a"/></svg>
<!-- 1h 48px: 13px squares, 3px gaps -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="10.5" fill="#0a0f1a"/><rect x="9" y="25" width="13" height="13" rx="2.5" fill="#38bdf8"/><rect x="25" y="25" width="13" height="13" rx="2.5" fill="#38bdf8"/><rect x="25" y="9" width="13" height="13" rx="2.5" fill="#38bdf8"/></svg>
<!-- 1i 48px -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="10.5" fill="#38bdf8"/><rect x="9" y="25" width="13" height="13" rx="2.5" fill="#0a0f1a"/><rect x="25" y="25" width="13" height="13" rx="2.5" fill="#0a0f1a"/><rect x="25" y="9" width="13" height="13" rx="2.5" fill="#0a0f1a"/><rect x="14" y="9" width="3" height="13" rx="1" fill="#0a0f1a"/></svg>
```

### Pros and cons

|      | 1h (dark tile)                                                                                                                             | 1i (cyan tile + text cursor)                                                                                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pros | Unchanged site mark; very high contrast on a light toolbar (tile vs #f1f3f4 ≈ 17:1); 16px is clean and two-colour.                         | Stands out on both toolbars; the cursor says "fill a field" and separates it from the site mark; dark squares on cyan ≈ 8.9:1.                                                   |
| Cons | On a dark toolbar (#35363a) the tile edge almost vanishes (≈1.6:1), leaving three cyan squares; easy to mistake for other dark-tile icons. | Cyan tile on a light toolbar ≈ 1.9:1 (the dark squares carry it); at 16px the cursor is a single pixel; louder colour mass; the 32 and 48 sizes need the snapped variants above. |

**Retina note [V/A]:** the toolbar icon is 16 DIP ([chrome.action](https://developer.chrome.com/docs/extensions/reference/api/action)). On the owner's Retina Mac Chrome uses the **32px** file [A], so the hinted 16px drawing only shows on 1× displays. Unpacked extensions require PNG; SVG is not supported [V].

### Generating the PNGs (recommended)

- Commit `apps/extensao/assets/icon/{16,32,48,128}.svg` plus a script `scripts/gerar-icones.mjs` that writes `public/icon/<n>.png`:

  ```js
  sharp(Buffer.from(svg), { density: (72 * n) / viewBoxW })
    .resize(n, n)
    .png()
  ```

- Commit the PNGs as well.
- `sharp` is already `allowBuilds: true` in `pnpm-workspace.yaml`, and 0.35.x has no install script [V].
- WXT auto-discovers `public/icon/<n>.png` into `manifest.icons` [V, probe manifest]. `action.default_icon` is **not** set automatically [V]; use the popup meta tag (§4, strict JSON).
- Use `@wxt-dev/auto-icons` only if the owner gives up the per-size drawings.

---

## 12. User-visible strings (verbatim pt-BR)

Uppercase overlines are written in sentence case in the source and uppercased with CSS.

**Header (all states):** `piluvitu` · `dados de teste` · host pill shows the tab host (`localhost:3000`, `staging.app.dev`, `chrome://settings`).

**1a**

- `Primeiro uso`
- `Ainda não há pessoa de teste`
- `Gere uma pessoa brasileira falsa e coerente. CPF, CNPJ, CEP e cartão passam na validação. Ela fica guardada até você pedir outra.`
- Rows: `CPF/CNPJ` / `dígito verificador correto`; `CEP` / `existe, e rua, bairro e cidade batem`; `cartão` / `faixa de sandbox, Luhn válido`
- `Gerar pessoa`
- Footer: `{kbd}` `preenche sem abrir o popup`

**1b**

- `{nome}`; `{idade} anos · {cidade}, {uf}`
- `Preencher esta página` + `{kbd}`; `Nova pessoa`; `Caixa de entrada`
- Chips: `Tudo` `Pessoais` `E-mail` `Endereço` `Empresa` `Cartão` `Documentos`
- Group counts are zero-padded (`06` `01` `07` `03` `05` `02`). Row labels:
  - Pessoais: `Nome` `Nascimento` `CPF` `RG` `Celular` `Senha`
  - E-mail: `E-mail`
  - Endereço: `CEP` `Rua` `Número` `Complemento` `Bairro` `Cidade` `UF`
  - Empresa: `Razão social` `Fantasia` `CNPJ`
  - Cartão: `Bandeira` `Número` `Nome impresso` `Validade` `CVV`
  - Documentos: `PIS/NIS` `Título`
- `copiado`; tooltip `Copiar`
- `Caixa pública.` + `Quem souber o endereço lê os e-mails. Só para teste, nunca para conta real.` + `abrir caixa →`
- `Número de sandbox: passa no Luhn e é recusado por qualquer adquirente real.`
- Footer: `{kbd}` `preenche sem abrir` `alterar`

**1c**

- `{n} de {total} campos preenchidos`; `{pathname} · com {nome}`
- `Não reconhecidos` `{NN}`; items `{label}` + `{selector}` (example `Código de indicação` / `input[name="ref_code"]`, `Como nos conheceu?` / `select#origem`)
- Tooltip `Mostrar na página`
- `Para esses, clique com o botão direito no campo e use ` `piluvitu › Inserir` `.`
- `Caixa de entrada`; `Ver os dados`
- Footer: `{kbd}` `preenche de novo`

**1d**

- `Nenhum campo reconhecido nesta página`
- `Encontrei {n} campos, mas nenhum com ` `name` `, ` `id` `, label ou ` `autocomplete` ` que eu conheça. Formulários dentro de iframe de outro domínio também ficam de fora.`
- `Dá para inserir campo a campo:` then `botão direito` › `piluvitu` › `Inserir` › `CPF`
- `Tentar de novo`; `Ver os dados`
- Footer: `{kbd}` `preenche sem abrir`

**1e**

- `O Chrome não deixa extensões mexerem nesta página`
- `Vale para páginas ` `chrome://` `, a Chrome Web Store e o leitor de PDF, e para qualquer extensão. Abra o formulário numa aba comum e tente de novo.`
- `Preencher esta página` (disabled)
- `{nome}` / `Os dados continuam aqui para copiar.` / `Ver os dados`
- No footer.

**1f**

- `{n} de {total} campos preenchidos`; `{k} não reconhecidos` + ` · contorno tracejado`
- [A] Close button aria-label `Fechar`.

**1g (context menu)**

- Parent: `piluvitu · dados de teste`. [V] Chrome groups more than one item under the extension name automatically ([contextMenus](https://developer.chrome.com/docs/extensions/reference/api/contextMenus)), so the manifest `name` must be this string.
- Level 2: `Preencher esta página` | sep | `Inserir ›` | sep | `Nova pessoa`, `Abrir caixa de entrada`
- Inserir (only for `contexts:['editable']`):
  - `Nome completo` `Data de nascimento` `CPF · {cpf}` `RG` `Celular` `E-mail` `Senha` | sep |
  - `CEP · {cep}` `Rua` `Número` `Complemento` `Bairro` `Cidade` `UF` | sep |
  - `Razão social` `Nome fantasia` `CNPJ` | sep |
  - `Cartão: número` `Cartão: nome impresso` `Cartão: validade` `Cartão: CVV` | sep |
  - `PIS/NIS` `Título de eleitor`
- Menu labels differ from popup labels on purpose (Nome vs Nome completo, Fantasia vs Nome fantasia, Título vs Título de eleitor). Copy each surface as written.

**1j**

- Command description `Preencher esta página`; default `Alt+Shift+P` (shown on Mac as `⌥⇧P`).
- Alternatives: `Ctrl+Shift+Y`, `Alt+Shift+F`.
- "alterar" opens `chrome://extensions/shortcuts` through `chrome.tabs.create` [A].
- Read the real shortcut string from `chrome.commands.getAll()` [A].

**Test fixture (design P0):** Maria Eduarda Souza, 14/03/1991, 35, `384.529.176-19`, `38.452.917-8`, `(11) 98734-2156`, `Ur$a-7kQ!pm2Lx`, `maria.souza.4821@tuamaeaquelaursa.com`, `01310-100` Avenida Paulista 402 Apto 81 Bela Vista São Paulo/SP, `Souza & Ribeiro Tecnologia Ltda` / `Ribeiro Dev` / `47.508.213/0001-92`, Visa `4000 0000 0000 3188` `MARIA E SOUZA` 08/29 731, PIS `127.48391.05-7`, título `1047 3826 0108`. The design's `gen()` is a sketch; its check digits are unverified here.

---

## 13. Proposed `apps/extensao` dependencies

Rule from the repo: copy ranges already in the tree; resolve new versions only for new packages.

- **Same ranges as existing apps:**
  - `react` / `react-dom` `^19.2.0` (financas)
  - `@piluvitu/ui` `workspace:*`, `@piluvitu/tools` `workspace:*`
  - `tailwindcss` / `@tailwindcss/vite` `^4.2.2` (financas)
  - `@fortawesome/react-fontawesome` `^3.3.0`, `@fortawesome/fontawesome-svg-core` `^7.2.0`, `@fortawesome/free-solid-svg-icons` `^7.2.0` (apps/web)
  - `vite` `^7.2.0` (financas). [A] Pinning it keeps WXT off Vite 8, which it would otherwise pull in; WXT accepts `^7`. The probe ran on Vite 8.3.1 with no warnings.
- **New:**
  - `wxt` `0.21.4` (2026-08-11, outside the 24 h window)
  - `@wxt-dev/module-react` `1.2.2`
  - `@fontsource-variable/plus-jakarta-sans` `^5.3.0`, `@fontsource-variable/jetbrains-mono` `^5.3.0`
- **[V] No new install scripts:** the WXT 0.21.4 tree has no pre/post-install scripts, and sharp is already allowed.
- **Build script:** `"build": "wxt build && node ../../scripts/check-tailwind-source.mjs \".output/chrome-mv3/assets/*.css\""` [V].
- **Test entry points [V]:** `wxt/testing/vitest-plugin` and `wxt/testing/fake-browser` (the paths changed from older `wxt/testing`).
- Declare the `lint` and `test` scripts; `pnpm -r` skips them silently otherwise.
- [A] Set `imports: false` in `wxt.config.ts` so WXT does not auto-import `components/`, keeping the monorepo's explicit-import style.

---

## 14. Gaps and open questions for the owner

1. **Storybook vs. financas precedent.** The global CLAUDE.md asks for a `.stories.tsx` per new visual component, but Storybook only exists in apps/web. Financas uses Vitest + RTL with no stories. Decide: add Storybook to apps/extensao, or follow financas.
2. **Copy missing from the design:**
   - singular forms ("1 de 1 campo preenchido", "Encontrei 1 campo");
   - 1d when 0 fields exist;
   - toast with k = 0;
   - 1e when no person exists;
   - the footer when the shortcut is unset (`getAll()` returns an empty string);
   - the close button's label;
   - the 1a footer promising "preenche sem abrir o popup" when there is no person yet (does the shortcut generate one, then fill?).
3. **"Ver os dados" from 1c, 1d and 1e** presumably switches to the 1b view [A]. From 1e, should the 1b view keep the fill button disabled?
4. **Theme:** follow the system only (recommended), or add a toggle?
5. **Icon:** 1h or 1i, and whether to accept the snapped 32 and 48 variants.
6. **Outline contrast** on white sites (cyan 2.1:1, amber 1.8:1).
7. **CEP copy:** 1a says the CEP "existe, e rua, bairro e cidade batem". That commits the generator to a real CEP dataset (generator topic).

---

## 15. Scratch artefacts

All under `/private/tmp/claude-501/-Users-piluvitu-WWW-PiluVitu-Dev/8edd1313-ac44-4917-a3ae-1ea4365be1c4/scratchpad/research/ui/`:

- `wxt-probe/`: a working WXT popup consuming the real `packages/ui` (`components/*.tsx`, `entrypoints/popup/*`, `wxt.config.ts`; build with `npx wxt build`; `?e=1a|1c|1d|1e` selects the state).
- `popup-{1a,1b,1c,1d,1e}-dark.png`, `popup-1b-light.png`, `popup-1b-copied-*.png`: probe renders.
- `design-shots/1{a..f,h,i}.png`: design renders.
- `shadow-probe/{toast-final.css,run*.mjs,page.html,csp.html}`: toast and hostile-page tests.
- `csp-ext/`: content-script vs page-CSP test extension.
- `icons/`: design and snapped SVGs, rendered PNGs, `gen.mjs`, `snap.mjs`, `aa.mjs`.
- `measure-popup.mjs`, `states-probe.mjs`, `pos-probe.mjs`, `dbg.mjs`: measurement scripts.
