# PiluVitu Design System

Design system for **PiluVitu** — the personal site and dev-tooling monorepo of Paulo Victor Torres Silva (SRE / DevOps / Cloud & Platform Engineer, Brazil). Built from the real product source in `PiluVitu/PiluVitu-Dev` (GitHub), specifically:

- `apps/web` — the Next.js personal site: bio, career history, projects, blog/article feed, a small `/tools` dashboard, a Kanban board (`/tasks`), and a movie-voting app (`/votacao`). This is the product the UI kit here recreates.
- `packages/ui` (`@piluvitu/ui`) — the shared design system package: design tokens (`styles.css`) + a shadcn/Radix component set, consumed by `apps/web` and the finance app's SPA.

Other workspaces in the monorepo (`apps/api` — Go backend, `apps/financas` — a Cloudflare Worker + SPA finance tracker, `apps/promeia` — a Python AI-insight service) share the same design tokens but weren't the focus of this pass. Anyone with repo access can browse the original source at `https://github.com/PiluVitu/PiluVitu-Dev` for more detail than is captured here — read the READMEs and `CLAUDE.md` files in each workspace, and `packages/ui/src` for the exact component internals.

## Content fundamentals

- **Language & voice**: all UI copy is Brazilian Portuguese (pt-BR). The bio/profile copy is written in a factual, third-person-flavored register — it states role and experience directly ("DevOps Engineer com 3 anos de experiência focado em garantir que sistemas em nuvem operem com alta disponibilidade...") rather than a chatty first-person "eu" voice. Form labels and helper text, by contrast, address the reader directly with "você" ("Insira como você gostaria de se identificar").
- **Casing**: section headers (Carreira, Projetos, Artigos) render as tracked, uppercase mono labels via CSS — the copy source itself is written in normal sentence case. Card titles and body copy use sentence case throughout; nothing is written in ALL CAPS by hand.
- **A dev-terminal accent layered on a resume site**: short mono-font labels borrow shell/Unix vocabulary as flavor — `~/dev`, `~/blog`, `post 01`, `detalhes →`, `ler →`. This is deliberate texture for a DevOps audience, not applied to headings or body copy.
- **Emoji**: essentially absent from persistent UI. The one exception is transient feedback — a success toast reads "✅ Muito obrigado por entrar em contato, irei retornar em breve". Don't add emoji to headings, cards, or nav.
- **Numbers as texture**: section counts are zero-padded mono digits next to a hairline rule (`04 ───────`), echoing a CLI listing rather than a badge/counter UI.
- **Directness over marketing language**: no taglines, no "supercharge your..." copy. Project and job descriptions state what a thing is and who made it, plainly.

## Visual foundations

- **Color**: a cool, desaturated blue-gray neutral base (`--background`) with one saturated accent — a deep petrol/sky blue `--primary` (dark teal-blue on light theme, bright cyan on dark theme). Status colors are a separate semantic set used sparingly (mostly in the voting app): `--ok` (green, "your vote"/success), `--warn` (amber, tie/attention), `--win` (purple, winner). Light-theme luminosity values are WCAG 2.1-measured (see the comments in `tokens/colors.css`) — don't lighten `--primary`/`--destructive`/`--success`/`--warn` back down. `--chart-1..5` are a deliberately _neutral_ data-viz palette, not a brand palette.
- **Typography**: two families only. **Plus Jakarta Sans** for everything humans read as prose (display, headings, body, buttons) at weights 400–800 with tight (-0.02em) tracking at display sizes. **JetBrains Mono** exclusively for labels, timestamps, section overlines, and kbd-style chips — always with wide tracking (`0.2em`) and uppercase when used as a section header.
- **Backgrounds**: flat surface colors, no photography or illustration as background. The one atmospheric touch on the homepage is a large, soft radial glow of the brand accent color pinned to the top of the viewport (`radial-gradient(60% 60% at 50% 0%, accent-soft, transparent)`) — subtle, never a hard gradient block.
- **Animation**: minimal and functional. Hover/press are plain `background-color` transitions (~200ms ease). Menus/dialogs fade + zoom-in-95%/slide slightly on open (Radix defaults, ~150–300ms), reversed on close. The one showcase animation in the whole product is an Easter egg: triple-click the avatar to open a business-card dialog that slowly wobbles in 3D (`rotateY`/`rotateX`, 7s ease-in-out loop). No bounce/spring easing, no scroll-triggered reveals, no page-transition choreography.
- **Hover / press states**: hover tints the background toward `--accent` (a light wash of the primary hue) — never darkens/lightens via opacity, never swaps text color. Directional link affordances (`ler →`, `detalhes →`) nudge their arrow glyph right on hover (`translate-x-0.5`), otherwise text stays put. There is no press/active "shrink" or scale-down state anywhere; only the browser's native `:active` and an explicit `cursor: pointer` on every clickable.
- **Borders & shadows**: thin (1px) low-contrast borders are the primary way surfaces separate from the page — cards, chips, avatars, and icon tiles are almost all bordered. Shadows are mostly restrained (`shadow-xs`/`sm` — barely-there elevation on buttons/inputs/cards). Exactly one bespoke, dramatic shadow exists — `--shadow-ds` (`0 18px 40px rgb(0 0 0 / 0.45)`) — reserved for the floating 3D visit card, nothing else.
- **Corner radii**: soft and generous throughout — the base dial is `--radius: 18px` (`rounded-lg`), scaling down to ~16px/14px for nested elements. Avatars and status dots go fully round (`rounded-full`); icon tiles and bento cells go further, to `rounded-2xl`/`rounded-3xl` (24–32px) — a squircle-like friendliness deliberately at odds with the technical subject matter.
- **Cards**: `--card` surface, 1px `--border`, `rounded-lg` or `rounded-xl`, `shadow-sm`, generous internal padding (20–24px). No colored left-border accent strips anywhere in the source — avoid that pattern.
- **Layout**: a sticky left profile column + independently-scrolling right content column on desktop (`xl:` breakpoint), collapsing to a single stacked column on mobile. Content is organized as labeled sections (bento-style), each with a mono overline + count + hairline rule.
- **Transparency & blur**: dialog/sheet overlays are flat `rgb(0 0 0 / 0.8)` — no `backdrop-blur` anywhere in the source. The brand's only translucency use is `--accent-soft`/`--accent-line` (13%/32%-alpha washes of the accent hue) for soft chip backgrounds and glow effects.
- **Imagery**: no stock photography or hero images. The only photograph in the product is the owner's own headshot. Everything else visual is flat-color UI, Font Awesome icons, or small brand-logo PNGs.

## Iconography

- **Font Awesome Free** (`@fortawesome/free-solid-svg-icons`, `@fortawesome/free-brands-svg-icons` via `@fortawesome/react-fontawesome`) is the icon system for essentially everything — social links, contact info, tool-dashboard glyphs, job/location metadata. This design system links the equivalent Font Awesome Free CDN build (same glyph set, `fa-solid`/`fa-brands`) since the npm packages can't be vendored here.
- Icons render inside bordered, rounded "squircle" tiles (44–48px) in the visit-card grid and social strip — never bare, never inside a colored circle.
- A handful of third-party brand icons (GitHub, Instagram, LinkedIn, Bluesky, Twitter/X, WhatsApp, plus each project's own logo) are small PNGs rather than FA glyphs when a CMS entry supplies an explicit image — copied into `assets/icons/` and `assets/logos/` here.
- Emoji is not used as iconography (see Content Fundamentals — it appears once, in a toast). The Unicode arrow `→` is used as a plain-text directional affordance inside links, not as an icon.
- **No dedicated logo file exists in the source repo.** The only brand mark found anywhere in the codebase is a small inline SVG — three rounded squares forming an L-tromino — drawn directly inside `profile-visit-card.tsx` for the business-card Easter egg. That exact mark is copied to `assets/brand/piluvitu-mark.svg`; treat the wordmark ("PiluVitu" in Plus Jakarta Sans Bold) as the primary identity elsewhere.

## Fonts

Plus Jakarta Sans and JetBrains Mono are already Google Fonts in the source (loaded via `next/font/google`, which self-hosts them at build time inside the Next.js app). No local font files exist to copy, so `tokens/typography.css` links the same two families from the Google Fonts CDN — no substitution was needed.

## Components

All 17 primitives below are 1:1 in scope with `packages/ui/src` (the source's shadcn/Radix set). Since design-system components here can only use React (no Radix/cva/cmdk packages), Dialog/Sheet/DropdownMenu/Command/Ajuda are reimplemented as small self-contained React components with equivalent visuals and interaction (click-to-open, click-outside-to-close, focus styles) rather than being Radix passthroughs — expect simpler focus-trapping/keyboard nav than the source. `Chart` is a minimal SVG bar/line stand-in for the source's recharts-based component. `Form`'s field-group pieces are framework-agnostic (no react-hook-form/zod wiring).

- **`components/core/`** — Button, Badge, Card (+ CardHeader/Title/Description/Content/Footer), Separator, Skeleton, AspectRatio
- **`components/forms/`** — Input, Textarea, Label, Form (+ FormItem/FormLabel/FormControl/FormDescription/FormMessage)
- **`components/overlay/`** — Dialog, Sheet, DropdownMenu, Command, Ajuda (tap-to-open "?" help popover — a brand-specific primitive, deliberately not a hover tooltip)
- **`components/data/`** — Avatar, Chart

### Intentional additions

- **`Form`** (the bare `<form>` wrapper) — the source's `form.tsx` only exports the field-group pieces (react-hook-form is expected to own the `<form>` element); added here so the group is usable standalone.

## Index

```
styles.css              → entry point (imports tokens/*)
tokens/colors.css        → light + dark HSL tokens, semantic aliases
tokens/typography.css    → font links + type scale
tokens/spacing.css       → spacing scale
tokens/shape.css         → radius + shadow tokens
tokens/motion.css        → durations, easing, keyframes
guidelines/               → 15 foundation specimen cards (Colors, Type, Spacing, Brand)
components/core/          → Button, Badge, Card, Separator, Skeleton, AspectRatio
components/forms/         → Input, Textarea, Label, Form
components/overlay/       → Dialog, Sheet, DropdownMenu, Command, Ajuda
components/data/          → Avatar, Chart
ui_kits/portfolio/        → click-through recreation of the apps/web homepage
assets/brand/             → the one coded SVG mark found in-repo
assets/photos/            → owner headshot
assets/logos/              → project logos (git-fav, live-prs, octopost, petdex)
assets/icons/              → social-network PNG icons + pr-live-dark.svg
SKILL.md                  → Claude Code-compatible skill wrapper for this system
github.md                  → source repo sync record
```

## Caveats

- Only `apps/web` + `packages/ui` were built into a UI kit. `apps/financas`, `apps/ramielle` (votação), `apps/promeia`, and `apps/api` share the same design tokens but have their own screens not recreated here.
- Interactive primitives that wrap Radix UI in the source (Dialog, Sheet, DropdownMenu, Command, Ajuda) are reimplemented in plain React — visually equivalent, behaviorally simpler.

**Help make this better**: if you can share the actual logo/favicon file (none was found in the repo), the Figma file for `apps/web` if one exists, or point out anything in this system that doesn't match production — that's exactly the kind of feedback that lets me tighten this up.
